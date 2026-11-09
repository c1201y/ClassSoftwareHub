// ════════════════════════════════════════════════════════════════════
// desktopDownload.ts —— 首页「桌面应用版」的安装包直接下载
//
// 国内直连 github.com 下载 Release 常常只有几十 KB/s 甚至断流，本文件提供
// 「点击即下载安装包」的能力：
//
//   1. 版本号动态获取 —— 桌面版仓库发布新版后按钮自动更新，无需改代码。
//      接口入口：本站 Worker 反代（国内可达）→ gh-proxy.com 兜底。
//   2. 下载走镜像 —— 复用 githubMirror.ts 的加速通道（自建节点优先，公益镜像兜底）。
//   3. 镜像全部不可用时，自动跳转到该版本的 Release 页，用户仍可自行下载。
//
// 实现约束（均经实测验证，不可回退）：
//   · 镜像对文件路径不返回 CORS 头，可用性探测只能用 no-cors + HEAD：
//     读不到状态码，但「域名失效 / 连不上 / 超时」都会使 fetch reject，足以判定。
//     不可改为 GET 探测，否则会把整个安装包真实下载下来。
//   · ghfast.top 能代理文件，但不能代理 api.github.com（返回 403），
//     因此接口入口中不包含它（它仅出现在镜像清单中，负责下载，不负责取版本）。
//   · Worker 的 /api/gh 反代只放行固定路径：`/releases` 可用，`/releases/latest`
//     会被拦截返回 {"error":"forbidden"}。因此此处取列表后自行筛选最新版本。
//
// 本文件不产出界面文字 —— 按钮文案在 HomePage.vue 的 desktopPromo 中。
// ════════════════════════════════════════════════════════════════════

import { fetchSelfSignedUrl, mirrorUrl, orderedChannels, rememberChannel, usableChannels } from './githubMirror';
import type { MirrorChannel } from './githubMirror';

/** 桌面版仓库（安装包由该仓库发布，与本站主仓库相互独立） */
const REPO = 'c1201y/ClassSoftwareHub-Desktop';
/** Win7 移植版仓库：Avalonia 重做 UI，独立发布、独立更新，安装包文件名带 win7 */
const WIN7_REPO = 'c1201y/ClassSoftwareHub-windows7';
/** 安卓客户端仓库：原生 Android，产物是 app-release.apk */
const ANDROID_REPO = 'c1201y/ClassSoftwareHub-Android';

/** 桌面版仓库的 Releases 页 —— 卡片「全部版本」链接及镜像全部不可用时的兜底跳转目标 */
export const DESKTOP_RELEASES_URL = `https://github.com/${REPO}/releases`;
/** Win7 移植版仓库的 Releases 页（下载页「全部版本」入口用） */
export const WIN7_RELEASES_URL = `https://github.com/${WIN7_REPO}/releases`;
/** 安卓客户端的 Releases 页 */
export const ANDROID_RELEASES_URL = `https://github.com/${ANDROID_REPO}/releases`;
/** 文档站：桌面版的使用说明、安装方式与常见问题都在那里 */
export const DOCS_URL = 'https://docs.classsoftwarehub.cn/download';

/**
 * 取某个仓库 Release 清单的接口入口，按顺序试，第一个成功的胜出。
 * 两个入口都带 CORS 头，浏览器能直接读 JSON。
 */
function apiBases(repo: string): string[] {
  return [
    // 本站统计 Worker 的反代：国内可达、Cloudflare 服务端代调，固定排最前
    `https://service.132614.xyz/api/gh/repos/${repo}/releases`,
    `https://gh-proxy.com/https://api.github.com/repos/${repo}/releases`
  ];
}

/** 单次接口请求超时（毫秒） */
const REQUEST_TIMEOUT = 12000;

/** 镜像可用性探测超时（毫秒）：国内镜像握手通常在 1 秒内完成，3 秒已足够 */
const PROBE_TIMEOUT = 3000;

/** 版本解析的最大等待时间；超时后直接采用兜底版本返回，避免用户长时间等待 */
const RESOLVE_GRACE = 2500;

/** 桌面版发版频率低，版本信息缓存 30 分钟，减少首页接口请求 */
const CACHE_KEY = 'csh-desktop-builds';
const CACHE_TTL = 30 * 60 * 1000;

/** 三个下载通道：稳定版 / Insider 版来自原版仓库，Win7 版来自独立的移植仓库 */
export type DesktopChannel = 'stable' | 'insider' | 'win7';

/**
 * 下载页（#/desktop）用的通道。
 *
 * 比 HomePage 的三个通道更细：同一个仓库里「安装版」和「便携版」是两条独立产物，
 * 用户需要按需选（便携版给没有安装权限的机器）。安卓单独一条。
 * 与 DesktopChannel 分开，是因为首页那张卡只需要「一个平台一个按钮」的粗粒度，
 * 混成一个联合类型会让首页的 switch 变得难读。
 */
export type DownloadId =
  | 'stable'
  | 'insider'
  | 'win7-setup'
  | 'win7-portable'
  | 'win7-insider-setup'
  | 'win7-insider-portable'
  | 'android';

/** 一条可下载的桌面版安装包 */
export interface DesktopBuild {
  channel: DesktopChannel;
  /** Release 的 tag，如 dv1.0.0 / dv1.0.0-insider1.3 */
  tag: string;
  /** 安装包文件名 */
  name: string;
  /** GitHub 官方直链（镜像就是在它前面拼前缀） */
  url: string;
  /** 该版本的 Release 页（镜像不可用时的兜底） */
  releaseUrl: string;
  /** 文件体积（字节），用于按「MB」显示 */
  size?: number;
  /** 该版本 Release 的更新说明（Markdown 原文，可能为空） */
  changelog?: string;
  /** 发布日期（ISO 串，可能为空） */
  publishedAt?: string;
}

export interface DesktopBuilds {
  stable: DesktopBuild;
  insider: DesktopBuild;
  win7: DesktopBuild;
}

/**
 * 下载页（#/desktop）需要的全部产物。
 *
 * 与 DesktopBuilds 的区别：那个是首页三按钮的粗粒度（一个平台一条），
 * 这个按「安装版 / 便携版」拆开，并补上安卓。接口不可用时为 null ——
 * 下载页会退化成「只显示『去 Releases 页』链接」，绝不显示一个点不动的按钮。
 */
export interface DownloadEntries {
  stable: DesktopBuild | null;
  insider: DesktopBuild | null;
  win7Setup: DesktopBuild | null;
  win7Portable: DesktopBuild | null;
  win7InsiderSetup: DesktopBuild | null;
  win7InsiderPortable: DesktopBuild | null;
  android: DesktopBuild | null;
}

/** 通道对应的 GitHub 仓库 */
function repoOf(channel: DesktopChannel): string {
  return channel === 'win7' ? WIN7_REPO : REPO;
}

/** 构造 DesktopBuild（tag 与文件名均由仓库约定决定） */
function buildOf(channel: DesktopChannel, tag: string, name: string, repo?: string): DesktopBuild {
  const owner = repo ?? repoOf(channel);
  return {
    channel,
    tag,
    name,
    url: `https://github.com/${owner}/releases/download/${tag}/${name}`,
    releaseUrl: `https://github.com/${owner}/releases/tag/${tag}`
  };
}

/**
 * 兜底版本 —— 接口全部不可用时使用（静态写入当前已发布的版本）。
 * 正常情况下版本为动态获取，无需随桌面版发版更新此处；
 * 仅当接口长期不可用时，用户才会下载到旧版本安装包。
 */
const FALLBACK: DesktopBuilds = {
  stable: buildOf('stable', 'dv1.0.0', 'ClassSoftwareHub-Setup-dv1.0.0-stable.exe'),
  insider: buildOf('insider', 'dv1.0.0-insider1.3', 'ClassSoftwareHub-Setup-dv1.0.0-insider1.3.exe'),
  win7: buildOf('win7', 'dv1.1.0', 'ClassSoftwareHub-Setup-win7-dv1.1.0.exe')
};

/* ── 接口返回结构（只声明用得到的字段）──────────────────────────── */

interface RawAsset {
  name: string;
  size: number;
  browser_download_url: string;
}

interface RawRelease {
  tag_name: string;
  name: string;
  published_at: string;
  body: string;
  prerelease: boolean;
  draft: boolean;
  assets?: RawAsset[];
}

/* ── 取版本 ─────────────────────────────────────────────────────── */

/** 从一个 Release 列表里挑出指定通道的安装包 */
function pickBuild(releases: RawRelease[], channel: DesktopChannel): DesktopBuild | null {
  // Win7 移植版只有正式通道，取最新正式版；不跟随原版的 Insider 预览
  const wantPrerelease = channel === 'insider';
  const repo = repoOf(channel);
  for (const release of releases) {
    if (release.draft || release.prerelease !== wantPrerelease) continue;
    const exe = (release.assets ?? []).find((asset) => /\.exe$/i.test(asset.name));
    if (!exe || !release.tag_name) continue;
    return {
      channel,
      tag: release.tag_name,
      name: exe.name,
      url: exe.browser_download_url,
      releaseUrl: `https://github.com/${repo}/releases/tag/${release.tag_name}`
    };
  }
  return null;
}

/**
 * 在 Release 列表里找到「满足条件的那个 asset」所在的那个 release。
 *
 * 与 pickBuild 的区别：这里不按通道（正式/预览）过滤，而是由调用方传进来两个判定 ——
 * 一个决定「要不要看这个 release」，一个决定「要它的哪个 asset」。
 * 下载页要在一份 Release 列表里同时取出安装版和便携版（同一 tag、不同文件），
 * 所以不能沿用 pickBuild 那种「一个通道一个 exe」的写法。
 */
function pickAsset(
  releases: RawRelease[],
  allowRelease: (release: RawRelease) => boolean,
  matchAsset: (name: string) => boolean,
  channel: DesktopChannel,
  repo: string
): DesktopBuild | null {
  for (const release of releases) {
    if (release.draft || !release.tag_name || !allowRelease(release)) continue;
    const asset = (release.assets ?? []).find((item) => matchAsset(item.name));
    if (!asset) continue;
    return {
      channel,
      tag: release.tag_name,
      name: asset.name,
      url: asset.browser_download_url,
      releaseUrl: `https://github.com/${repo}/releases/tag/${release.tag_name}`,
      size: asset.size,
      changelog: release.body || '',
      publishedAt: release.published_at || ''
    };
  }
  return null;
}

/** 只要正式版（GitHub 上未勾 Pre-release） */
const isStable = (release: RawRelease) => !release.prerelease;
/** 只要预览版（GitHub 上勾了 Pre-release） */
const isInsider = (release: RawRelease) => release.prerelease;

/** Win7 安装版：ClassSoftwareHub-Setup-win7-<tag>.exe */
const isWin7Setup = (name: string) => /^ClassSoftwareHub-Setup-win7-.*\.exe$/i.test(name);
/** Win7 便携版：ClassSoftwareHub-Portable-win7-<tag>.zip */
const isWin7Portable = (name: string) => /^ClassSoftwareHub-Portable-win7-.*\.zip$/i.test(name);
/** 安卓：CI 固定输出 app-release.apk */
const isApk = (name: string) => /\.apk$/i.test(name);

/** 依次尝试各接口入口，获取指定仓库的 Release 列表 */
async function fetchReleases(repo: string): Promise<RawRelease[]> {
  let lastError: unknown = null;
  for (const base of apiBases(repo)) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      // 不带自定义请求头，保证是「简单请求」、不触发 CORS 预检
      const response = await fetch(`${base}?per_page=10`, {
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error('接口返回的不是列表');
      return data as RawRelease[];
    } catch (error) {
      lastError = error;
    } finally {
      window.clearTimeout(timer);
    }
  }
  throw lastError ?? new Error('接口入口全部不可用');
}

function readCache(): DesktopBuilds | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; builds?: DesktopBuilds };
    if (!parsed.builds?.stable?.url || !parsed.builds?.insider?.url || !parsed.builds?.win7?.url) return null;
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > CACHE_TTL) return null;
    return parsed.builds;
  } catch {
    /* 无痕模式等读不到 localStorage，忽略即可 */
    return null;
  }
}

function writeCache(builds: DesktopBuilds): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), builds }));
  } catch {
    /* 忽略 */
  }
}

let memoryBuilds: DesktopBuilds | null = null;
let inFlight: Promise<DesktopBuilds> | null = null;

/** 执行一次版本获取；无论成败均以 resolve 结束（失败时返回兜底版本） */
async function loadBuilds(): Promise<DesktopBuilds> {
  const builds: DesktopBuilds = { ...FALLBACK };
  // 两个仓库并行取；任一仓库失败都不影响另一个仓库的版本更新
  const [desktop, win7] = await Promise.all([
    fetchReleases(REPO).catch(() => null),
    fetchReleases(WIN7_REPO).catch(() => null)
  ]);
  if (desktop) {
    builds.stable = pickBuild(desktop, 'stable') ?? builds.stable;
    builds.insider = pickBuild(desktop, 'insider') ?? builds.insider;
  }
  if (win7) builds.win7 = pickBuild(win7, 'win7') ?? builds.win7;
  // 接口全部不可用时不写缓存：本次会话用兜底版本，刷新页面后会重试
  if (desktop || win7) writeCache(builds);
  memoryBuilds = builds;
  return builds;
}

/**
 * 获取三个通道的可下载版本。
 *
 * - 命中内存 / 本地缓存 → 立即返回（首页 onMounted 会预热一次，点击按钮时通常命中此路径）
 * - 均未命中 → 向接口获取，最多等待 RESOLVE_GRACE 后改用兜底版本返回
 */
export async function resolveDesktopBuilds(): Promise<DesktopBuilds> {
  if (memoryBuilds) return memoryBuilds;
  const cached = readCache();
  if (cached) {
    memoryBuilds = cached;
    return cached;
  }
  inFlight ??= loadBuilds();
  const grace = new Promise<DesktopBuilds>((resolve) => {
    window.setTimeout(() => resolve(FALLBACK), RESOLVE_GRACE);
  });
  return Promise.race([inFlight, grace]);
}

/* ── 下载页（#/desktop）用的完整产物清单 ────────────────────────── */

/** 下载页产物的缓存键与 TTL —— 与首页分开，避免互相把对方的缓存冲掉 */
const ENTRIES_KEY = 'csh-download-entries';
const ENTRIES_TTL = 30 * 60 * 1000;

/**
 * 取下载页需要的全部产物。
 *
 * 与 resolveDesktopBuilds 的关键差异：**失败就是 null，不回退到写死的旧版本**。
 * 首页那张卡是「推广位」，显示个稍旧的版本号无伤大雅；下载页是用户专门来下东西的，
 * 给他一个对不上号的文件名、点下去 404，比明确告诉他「暂时取不到，去 Releases 页」糟糕得多。
 * 所以这里宁可空着，也不猜。
 */
let memoryEntries: DownloadEntries | null = null;
let entriesInFlight: Promise<DownloadEntries> | null = null;

const EMPTY_ENTRIES: DownloadEntries = {
  stable: null,
  insider: null,
  win7Setup: null,
  win7Portable: null,
  win7InsiderSetup: null,
  win7InsiderPortable: null,
  android: null
};

async function loadEntries(): Promise<DownloadEntries> {
  // 三个仓库并行取；任一失败只让它自己那几条留空，不牵连同行的其它平台
  const [desktop, win7, android] = await Promise.all([
    fetchReleases(REPO).catch(() => null),
    fetchReleases(WIN7_REPO).catch(() => null),
    fetchReleases(ANDROID_REPO).catch(() => null)
  ]);

  const entries: DownloadEntries = { ...EMPTY_ENTRIES };

  if (desktop) {
    entries.stable = pickAsset(desktop, isStable, (n) => /\.exe$/i.test(n), 'stable', REPO);
    entries.insider = pickAsset(desktop, isInsider, (n) => /\.exe$/i.test(n), 'insider', REPO);
  }
  if (win7) {
    entries.win7Setup = pickAsset(win7, isStable, isWin7Setup, 'win7', WIN7_REPO);
    entries.win7Portable = pickAsset(win7, isStable, isWin7Portable, 'win7', WIN7_REPO);
    entries.win7InsiderSetup = pickAsset(win7, isInsider, isWin7Setup, 'win7', WIN7_REPO);
    entries.win7InsiderPortable = pickAsset(win7, isInsider, isWin7Portable, 'win7', WIN7_REPO);
  }
  if (android) {
    entries.android = pickAsset(android, () => true, isApk, 'stable', ANDROID_REPO);
    // 安卓仓库不区分预览通道，最新一条 release 就是它；改标签只为让类型对得上
    if (entries.android) entries.android = { ...entries.android, channel: 'stable' };
  }

  // 一条都没取到就不写缓存：本次会话空着，刷新后会重试
  const gotSomething = Object.values(entries).some(Boolean);
  if (gotSomething) {
    try {
      localStorage.setItem(ENTRIES_KEY, JSON.stringify({ at: Date.now(), entries }));
    } catch {
      /* 无痕模式等读不到 localStorage，忽略即可 */
    }
  }
  memoryEntries = entries;
  return entries;
}

function readEntriesCache(): DownloadEntries | null {
  try {
    const raw = localStorage.getItem(ENTRIES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at?: number; entries?: DownloadEntries };
    if (!parsed.entries) return null;
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > ENTRIES_TTL) return null;
    return parsed.entries;
  } catch {
    return null;
  }
}

/**
 * 获取下载页的全部产物。
 *
 * 注意没有 RESOLVE_GRACE 竞速：这里不像首页那样「超时了就先用兜底版本」——
 * 兜底版本对这个页面没有意义（见 loadEntries 的注释）。调用方应展示加载态。
 */
export async function resolveDownloadEntries(): Promise<DownloadEntries> {
  if (memoryEntries) return memoryEntries;
  const cached = readEntriesCache();
  if (cached) {
    memoryEntries = cached;
    return cached;
  }
  entriesInFlight ??= loadEntries();
  return entriesInFlight;
}

/** 下载页某一行对应的产物（id → DesktopBuild），取不到返回 null */
export function entryOf(entries: DownloadEntries, id: DownloadId): DesktopBuild | null {
  switch (id) {
    case 'stable':
      return entries.stable;
    case 'insider':
      return entries.insider;
    case 'win7-setup':
      return entries.win7Setup;
    case 'win7-portable':
      return entries.win7Portable;
    case 'win7-insider-setup':
      return entries.win7InsiderSetup;
    case 'win7-insider-portable':
      return entries.win7InsiderPortable;
    case 'android':
      return entries.android;
    default:
      return null;
  }
}

/**
 * 下载下载页的某一条产物（走镜像；镜像全不通则跳该版本的 Release 页）。
 * 返回 'missing' 表示这条产物没取到 —— 调用方应提示用户去 Releases 页。
 */
export async function downloadEntry(entries: DownloadEntries, id: DownloadId): Promise<DesktopDownloadResult | 'missing'> {
  const build = entryOf(entries, id);
  if (!build) return 'missing';
  return downloadBuild(build);
}

/* ── 镜像探测 + 触发下载 ─────────────────────────────────────────── */

/**
 * 探测单个镜像是否可用。
 *
 * 只能使用 no-cors：镜像对文件路径不返回 CORS 头，正常模式的 fetch 会直接 reject。
 * no-cors 下响应是不透明的（读不到状态码），但网络层失败（域名失效 / 连不上 /
 * 超时）仍会 reject，以此作为不可用信号。使用 HEAD 方法，不会真实下载文件。
 */
function probeMirror(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(ok);
    };
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      controller.abort();
      finish(false);
    }, PROBE_TIMEOUT);
    fetch(url, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal
    })
      .then(() => finish(true))
      .catch(() => finish(false));
  });
}

/**
 * 候选通道：用户上次选择的排最前，其余按清单顺序。
 *
 * 使用 orderedChannels() 而非自行排序 —— 它会先过滤掉当前页面下不可用的通道
 * （典型是仅有 http 的自建节点：https 页面上浏览器按混合内容规则拦截下载，
 * 探测必然失败，纳入候选只会多等待一次超时）。
 */
function candidateChannels(): MirrorChannel[] {
  const all = orderedChannels();
  const self = all.find((channel) => channel.self);
  // 自建节点固定排最前 —— 即使用户上次选择了其他通道并存储在 localStorage，默认仍走自建节点
  return self ? [self, ...all.filter((channel) => channel !== self)] : all;
}

/**
 * 并发探测所有候选通道，按「偏好顺序」取第一条可用的。
 *
 * 自建节点不走 HEAD 探测：其防盗链策略为「无签名一律 403」，而 no-cors
 * 探测读不到状态码，403 也会被误判为可用，选中后必然无法下载。正确做法是
 * 直接向 Worker 请求限时签名链接，签名结果即为可直接下载的地址；获取失败
 * 则视为不可用，由公益镜像兜底。
 */
async function pickWorkingMirror(target: string): Promise<string | null> {
  const self = candidateChannels().find((channel) => channel.self);
  if (self) {
    const signed = await fetchSelfSignedUrl(target);
    if (signed) return signed;
  }
  const channels = candidateChannels().filter((channel) => !channel.self);
  const probed = await Promise.all(
    channels.map(async (channel) => ({
      channel,
      ok: await probeMirror(mirrorUrl(target, channel))
    }))
  );
  const hit = probed.find((item) => item.ok);
  return hit ? mirrorUrl(target, hit.channel) : null;
}

/** 用一个隐藏的 <a> 触发下载（不导航、不留 DOM） */
function triggerDownload(url: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/* ── 下载页：让用户自己选线路 ────────────────────────────────────── */

/**
 * 「自建节点」在选择器里的固定 id。
 *
 * 复用 githubMirror.ts 的 SELF_CHANNEL_ID，页面只认这一个常量，
 * 不要在各处重复写字符串 'self'。
 */
export { SELF_CHANNEL_ID } from './githubMirror';

/**
 * 下载页可选的线路清单（自建节点排最前，其余按 githubMirror 的顺序）。
 *
 * 与首页/详情页的「自动挑一条能用」不同：下载页把选择权交给用户 ——
 * 文档站就是这么做的，而且用户往往比自动探测更清楚自己这边哪条通。
 * 但**候选范围仍然只来自 MIRROR_CHANNELS**，不另开一套清单，
 * 否则通道增删时两处会漂移。
 */
export function mirrorChoices(): MirrorChannel[] {
  const usable = usableChannels();
  const self = usable.find((channel) => channel.self);
  return self ? [self, ...usable.filter((channel) => channel !== self)] : usable;
}

/**
 * 「GitHub 官方」这条线的虚拟 id。
 *
 * 它不在 MIRROR_CHANNELS 里 —— 那是个「加前缀转发」的清单，
 * 官方直链是原样的 url，前缀为空，放进去会和 mirrorUrl() 的语义打架。
 * 因此单独作为一个选项 id，下载时走 downloadBuildDirect()。
 */
export const OFFICIAL_CHANNEL_ID = 'github';

/**
 * 按用户**明确选定**的线路下载某个产物。
 *
 * 与 downloadBuild 的差别：那条路会自动探测、失败就换下一条；
 * 这条路尊重用户的选择 —— 选了哪条就下哪条，不通就是不通（由页面提示换一条）。
 *
 * 自建节点要签名（防盗链），签名失败时回退到该线路前缀直拼，
 * 让用户至少看到一次真实的 403，而不是静默跳到别的线路。
 */
export async function downloadBuildVia(
  build: DesktopBuild,
  channelId: string
): Promise<DesktopDownloadResult | 'failed'> {
  const channel =
    mirrorChoices().find((item) => item.id === channelId) ??
    mirrorChoices()[0];
  if (!channel) return 'failed';

  let href = '';
  if (channel.self) {
    href = (await fetchSelfSignedUrl(build.url)) || mirrorUrl(build.url, channel);
  } else {
    href = mirrorUrl(build.url, channel);
  }
  if (!href) return 'failed';
  triggerDownload(href);
  rememberChannel(channel.id);
  return 'mirror';
}

/** 直接走 GitHub 官方源下载（不走任何镜像） */
export function downloadBuildDirect(build: DesktopBuild): void {
  triggerDownload(build.url);
}

export type DesktopDownloadResult = 'mirror' | 'release';

/**
 * 下载一个已知的产物（走镜像；镜像全不通就跳该版本的 Release 页）。
 *
 * 抽出来是因为首页点和下载页点走的是同一条路 —— 镜像探测、签名、兜底跳转
 * 这套逻辑只能有一份，否则两处的降级行为迟早会不一致。
 */
async function downloadBuild(build: DesktopBuild): Promise<DesktopDownloadResult> {
  const working = await pickWorkingMirror(build.url);
  if (working) {
    triggerDownload(working);
    return 'mirror';
  }

  // 镜像全部不可用：退到该版本的 Release 页。新标签页被拦截时改为当前页跳转，确保到达。
  // 同时携带 noopener —— releaseUrl 虽为内部拼接的 GitHub 地址，但不依赖 open() 的返回值做隔离。
  const opened = window.open(build.releaseUrl, '_blank', 'noopener,noreferrer');
  if (opened) opened.opener = null;
  else window.location.href = build.releaseUrl;
  return 'release';
}

/**
 * 下载指定通道的桌面版安装包（首页三个按钮用）。
 *
 * 优先走镜像；镜像一条都不通就跳到该版本的 Release 页。
 * 返回值只用于调用方判断走的是哪条路（不产出文案）。
 */
export async function downloadDesktopBuild(channel: DesktopChannel): Promise<DesktopDownloadResult> {
  return downloadBuild((await resolveDesktopBuilds())[channel]);
}
