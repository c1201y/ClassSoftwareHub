// AtomGit 分发通道：本站三端（桌面版 / Win7 版 / 安卓）的安装包在 AtomGit 另有一份镜像仓库，
// 由发布流程推送，文件名与 GitHub 完全一致。国内访问 AtomGit 的下载域名比 GitHub 直链快得多
// （实测 20–30 MB/s，GitHub 直链常常连不上），因此下载页把它排在第一位并作为默认线路。
//
// 关键设计：直链是**按约定拼出来的**，不依赖接口。
//   https://atomgit.com/<owner>/<repo>/releases/download/<tag 前缀><GitHub tag>/<文件名>
// 接口（releases 列表）只用来回答一个问题：「这个版本推到 AtomGit 了吗」。
// 它取不到时按「有」处理 —— 接口有限流（实测会 429），不能让它把整条线路连坐掉。
//
// 分发仓库缺某个版本时（新版本刚在 GitHub 发布、还没推过去），调用方回退到本站自建节点，
// 见 desktopDownload.ts 的 downloadViaSource()。

import { ref } from 'vue';

/** 分发仓库（与本站主仓库不是同一个） */
const OWNER = '2501_93857730';
const REPO = 'ClassSoftwareHub';
const API_BASE = `https://api.atomgit.com/api/v5/repos/${OWNER}/${REPO}`;

/**
 * GitHub 仓库 slug → AtomGit release tag 前缀。
 * 三端产物放在同一个分发仓库里，靠前缀隔离命名空间，避免各端 tag 撞名
 * （桌面版与 Win7 版都用 dv 开头的 tag）。新增一端时只改这里。
 */
const TAG_PREFIX: Record<string, string> = {
  'c1201y/ClassSoftwareHub-Desktop': 'desktop-',
  'c1201y/ClassSoftwareHub-windows7': 'win7-',
  'c1201y/ClassSoftwareHub-Android': 'android-'
};

/** 接口超时：取不到就按「有镜像」处理，不让用户等 */
const REQUEST_TIMEOUT = 8000;

/** 一次请求取多少条（AtomGit 的 per_page 上限是 100） */
const PER_PAGE = 100;

/**
 * 最多翻几页。
 * ⚠️ 这里曾经写死 `per_page=30` 且不翻页。回填历史版本后分发仓库已经有 49 个 release，
 * 前 30 条之外的（也就是更早的正式版）全被当成「AtomGit 上没有」，历史版本那一栏
 * 会退回到 GitHub 直链 —— 而回填的意义正是让它们走 AtomGit。
 * 现在取满上限并翻页，页数上限只是防御（49 条远未到）。
 */
const MAX_PAGES = 10;

/** 版本清单小时级变化，缓存 30 分钟，减少对接口的调用（接口有全局限流） */
const CACHE_KEY = 'csh-atomgit-index';
const CACHE_TTL = 30 * 60 * 1000;

/** AtomGit 通道在下载线路下拉框里的标识 */
export const ATOM_GIT_CHANNEL_ID = 'atomgit';

/** 一个 release 的可下载附件（文件名 → 直链） */
export type AtomGitIndex = Record<string, Record<string, string>>;

/** 索引状态：仅用于「已知缺版本」的判断与调试 */
export type AtomGitState = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * 版本在 AtomGit 的可用性。
 * yes     = 接口确认有
 * no      = 接口确认没有（该回退）
 * unknown = 接口没取到，按有处理（直链是拼出来的，接口挂了不影响下载）
 */
export type AtomGitAvailability = 'yes' | 'no' | 'unknown';

let memoryIndex: AtomGitIndex | null = null;
let state: AtomGitState = 'idle';
let inFlight: Promise<AtomGitIndex | null> | null = null;

/**
 * 清单版本号：每次清单落地（来自缓存或接口）自增。
 * 清单是模块级普通变量，页面里的 computed 读不到它的变化；
 * 让它同时成为一个 ref，页面才能在「清单到了」之后重新计算提示条与校验值链接。
 */
const indexRevision = ref(0);

/** 清单版本号（响应式）：在 computed 里读一下就会随清单更新而重算 */
export function atomgitRevision(): number {
  return indexRevision.value;
}

interface RawAsset {
  name?: string;
  browser_download_url?: string;
  /** AtomGit 把源码包也列在 assets 里，标记为 source */
  type?: string;
}

interface RawRelease {
  tag_name?: string;
  draft?: boolean;
  assets?: RawAsset[];
}

/** GitHub 的一个版本对应到 AtomGit 的 tag；不认识的仓库返回 null */
export function atomgitTagOf(repo: string | undefined, tag: string): string | null {
  if (!repo || !tag) return null;
  const prefix = TAG_PREFIX[repo];
  if (!prefix) return null;
  return prefix + tag;
}

/** 拼出 AtomGit 直链（不等接口，立刻可用） */
export function atomgitDownloadUrl(
  repo: string | undefined,
  tag: string,
  name: string
): string | null {
  const atomgitTag = atomgitTagOf(repo, tag);
  if (!atomgitTag || !name) return null;
  return (
    `https://atomgit.com/${OWNER}/${REPO}/releases/download/` +
    `${encodeURIComponent(atomgitTag)}/${encodeURIComponent(name)}`
  );
}

/** 某个 release 在 AtomGit 的页面 */
export function atomgitReleaseUrl(atomgitTag: string): string {
  return `https://atomgit.com/${OWNER}/${REPO}/releases/tag/${atomgitTag}`;
}

function parseIndex(data: unknown): AtomGitIndex {
  const index: AtomGitIndex = {};
  if (!Array.isArray(data)) return index;
  for (const item of data as RawRelease[]) {
    const tag = item.tag_name;
    if (!tag || item.draft) continue;
    const assets: Record<string, string> = {};
    for (const asset of item.assets ?? []) {
      // 跳过 AtomGit 自动附带的源码包，只留发布流程推上去的产物
      if (asset.type === 'source') continue;
      if (!asset.name || !asset.browser_download_url) continue;
      assets[asset.name] = asset.browser_download_url;
    }
    if (Object.keys(assets).length) index[tag] = assets;
  }
  return index;
}

function readCache(): AtomGitIndex | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; index?: AtomGitIndex };
    if (!parsed.index || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > CACHE_TTL) return null;
    return parsed.index;
  } catch {
    /* 无痕模式等读不到 localStorage，忽略即可 */
    return null;
  }
}

function writeCache(index: AtomGitIndex): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), index }));
  } catch {
    /* 忽略 */
  }
}

/** 打接口取一次版本清单；失败返回 null 并记下状态 */
async function loadIndex(): Promise<AtomGitIndex | null> {
  state = 'loading';
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const merged: AtomGitIndex = {};
    for (let page = 1; page <= MAX_PAGES; page++) {
      // 不带自定义请求头，保持「简单请求」，不触发 CORS 预检
      const response = await fetch(`${API_BASE}/releases?per_page=${PER_PAGE}&page=${page}`, {
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const batch = await response.json();
      if (!Array.isArray(batch) || !batch.length) break;
      Object.assign(merged, parseIndex(batch));
      // 不满一页就是最后一页
      if (batch.length < PER_PAGE) break;
    }
    if (!Object.keys(merged).length) throw new Error('清单为空');
    writeCache(merged);
    memoryIndex = merged;
    state = 'ready';
    indexRevision.value += 1;
    return merged;
  } catch {
    // 限流 / 断网 / CORS：不写缓存，下次进页面重试
    state = 'failed';
    memoryIndex = null;
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * 取版本清单（内存 → 缓存 → 接口），永不 reject。
 * 返回 null 表示「接口没取到」，此时直链照用、不判缺失。
 *
 * ⚠️ inFlight 用完必须清空。曾经写成 `inFlight ??= loadIndex()` 之后不再置 null，
 * 于是**一次失败会被永久记住**：整页生命周期内所有后续调用都拿到同一个已完成的
 * Promise（结果仍是 null），用户在网络恢复后重进下载页也只能看到回退提示。
 * 这是「一次性失败」被放大成「本次会话永远失败」的典型写法。
 */
export function ensureAtomGitIndex(): Promise<AtomGitIndex | null> {
  if (memoryIndex) return Promise.resolve(memoryIndex);
  const cached = readCache();
  if (cached) {
    memoryIndex = cached;
    state = 'ready';
    indexRevision.value += 1;
    return Promise.resolve(cached);
  }
  if (!inFlight) {
    inFlight = loadIndex().finally(() => {
      // 无论成败都放开，让下一次调用能重新尝试
      inFlight = null;
    });
  }
  return inFlight;
}

export function atomgitIndexState(): AtomGitState {
  return state;
}

/**
 * 这个文件在 AtomGit 的可用性。
 * 只有「接口取到了清单、且清单里确实没有」才判 no —— 其余一律 unknown 并照常使用直链。
 */
export function atomgitAvailability(
  repo: string | undefined,
  tag: string,
  name: string
): AtomGitAvailability {
  // 读一下版本号：让调用它的 computed 在清单到达后自动重算
  void indexRevision.value;
  const atomgitTag = atomgitTagOf(repo, tag);
  if (!atomgitTag) return 'no';
  if (!memoryIndex) return 'unknown';
  return memoryIndex[atomgitTag]?.[name] ? 'yes' : 'no';
}
