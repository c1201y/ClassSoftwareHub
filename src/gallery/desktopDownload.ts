
import { fetchSelfSignedUrl, mirrorUrl, orderedChannels, rememberChannel, usableChannels } from './githubMirror';
import type { MirrorChannel } from './githubMirror';
import { noteAcceleratedDownload } from './downloadFeedback';
import {
  ATOM_GIT_CHANNEL_ID,
  atomgitAvailability,
  atomgitDownloadUrl,
  atomgitRevision,
  ensureAtomGitIndex
} from './atomgitChannel';
import { gt } from './localize';

/** 桌面版仓库（安装包由该仓库发布，与本站主仓库相互独立） */
const REPO = 'c1201y/ClassSoftwareHub-Desktop';
/** Win7 移植版仓库：Avalonia 重做 UI，独立发布、独立更新，安装包文件名带 win7 */
export const WIN7_REPO = 'c1201y/ClassSoftwareHub-windows7';
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
const STATS_BASE =
  import.meta.env.VITE_CSH_STATS_BASE ?? '';

function apiBases(repo: string): string[] {
  return [
    // 本站统计 Worker 的反代：国内可达、Cloudflare 服务端代调，固定排最前
    `${STATS_BASE}/api/gh/repos/${repo}/releases`,
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
  /** 发布该包的 GitHub 仓库（owner/repo）—— AtomGit 分发通道按它换算 tag 前缀 */
  repo?: string;
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
    releaseUrl: `https://github.com/${owner}/releases/tag/${tag}`,
    repo: owner
  };
}
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
      releaseUrl: `https://github.com/${repo}/releases/tag/${release.tag_name}`,
      repo
    };
  }
  return null;
}
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
      publishedAt: release.published_at || '',
      repo
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

/* ── 历史版本列表 ─────────────────────────────────────────────────── */

/** 历史版本最多展示多少条（再多也没人翻，还拖慢首屏） */
const HISTORY_LIMIT = 30;

/** 一个历史版本的精简描述（只保留页面要显示的东西） */
export interface ReleaseHistoryItem {
  /** Release tag，如 dv1.2.1 */
  tag: string;
  /** 该 tag 下的文件名（用于判断是安装版还是便携版） */
  assetNames: string[];
  /** 该 release 里最大的那个包的体积（字节） */
  size: number;
  /** 发布时间 */
  publishedAt: string;
  /** Release 正文（Markdown） */
  body: string;
  /** 是否是预发布 */
  prerelease: boolean;
}
export async function fetchReleaseHistory(repo: string): Promise<ReleaseHistoryItem[]> {
  const bases = apiBases(repo);
  for (const base of bases) {
    const normalized = base.replace(/\/releases$/, '');
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const response = await fetch(`${normalized}/releases?per_page=${HISTORY_LIMIT}`, {
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error('接口返回的不是列表');

      return (data as RawRelease[])
        .filter((r) => !r.draft && r.tag_name)
        .map((r) => {
          const assets = r.assets ?? [];
          return {
            tag: r.tag_name,
            assetNames: assets.map((a) => a.name),
            size: assets.reduce((max, a) => Math.max(max, a.size || 0), 0),
            publishedAt: r.published_at || '',
            body: r.body || '',
            prerelease: Boolean(r.prerelease)
          };
        });
    } catch (error) {
      // 换下一个入口；全部失败时返回空
      void error;
    } finally {
      window.clearTimeout(timer);
    }
  }
  return [];
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
export async function resolveDesktopBuilds(): Promise<DesktopBuilds> {
  if (memoryBuilds) return memoryBuilds;
  const cached = readCache();
  if (cached) {
    memoryBuilds = cached;
    return cached;
  }
  // 同上：inFlight 用完必须清空。loadBuilds 失败时也 resolve（返回兜底版本），
  // 不清空的话兜底结果会被永久缓存，本次会话内刷新页面都拿不到真实版本。
  if (!inFlight) {
    inFlight = loadBuilds().finally(() => {
      inFlight = null;
    });
  }
  const grace = new Promise<DesktopBuilds>((resolve) => {
    window.setTimeout(() => resolve(FALLBACK), RESOLVE_GRACE);
  });
  return Promise.race([inFlight, grace]);
}

/* ── 下载页（#/desktop）用的完整产物清单 ────────────────────────── */

/** 下载页产物的缓存键与 TTL —— 与首页分开，避免互相把对方的缓存冲掉 */
const ENTRIES_KEY = 'csh-download-entries';
const ENTRIES_TTL = 30 * 60 * 1000;
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

    /**
     * 老缓存没有 `repo` 字段（它是随 AtomGit 通道一起加进来的）。
     * 直接复用的话，atomgitTagOf(undefined) 会返回 null、可用性被判成 'no'，
     * 页面会错误地告诉用户「这个版本还没同步到 AtomGit」并全程走慢线路。
     * 缓存只是加速手段，字段对不上就整份丢弃重取，比逐条修补简单也安全。
     */
    const builds = Object.values(parsed.entries).filter(
      (item): item is DesktopBuild => Boolean(item)
    );
    if (builds.some((build) => !build.repo)) return null;

    return parsed.entries;
  } catch {
    return null;
  }
}
export async function resolveDownloadEntries(): Promise<DownloadEntries> {
  if (memoryEntries) return memoryEntries;
  const cached = readEntriesCache();
  if (cached) {
    memoryEntries = cached;
    return cached;
  }
  // 同 atomgitChannel.ensureAtomGitIndex：inFlight 用完必须清空，
  // 否则一次失败会被永久记住，本次会话内再也没有重试的机会。
  if (!entriesInFlight) {
    entriesInFlight = loadEntries().finally(() => {
      entriesInFlight = null;
    });
  }
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
export async function downloadEntry(entries: DownloadEntries, id: DownloadId): Promise<DesktopDownloadResult | 'missing'> {
  const build = entryOf(entries, id);
  if (!build) return 'missing';
  return downloadBuild(build);
}

/* ── 镜像探测 + 触发下载 ─────────────────────────────────────────── */
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
function candidateChannels(): MirrorChannel[] {
  const all = orderedChannels();
  const self = all.find((channel) => channel.self);
  // 自建节点固定排最前 —— 即使用户上次选择了其他通道并存储在 localStorage，默认仍走自建节点
  return self ? [self, ...all.filter((channel) => channel !== self)] : all;
}
async function pickWorkingMirror(target: string): Promise<string | null> {
  const self = candidateChannels().find((channel) => channel.self);
  if (self) {
    const signed = await fetchSelfSignedUrl(target);
    if (signed) {
      noteAcceleratedDownload({ target });
      return signed;
    }
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
export { SELF_CHANNEL_ID } from './githubMirror';
export { ATOM_GIT_CHANNEL_ID };

/** GitHub 官方源的标识（既不镜像也不中转，直接走 github.com） */
export const OFFICIAL_CHANNEL_ID = 'github';

/** 下载线路下拉框里的一项 */
export interface SourceChoice {
  id: string;
  name: string;
  /** 本站自建节点（换票据下载），文案与提示单独处理 */
  self?: boolean;
}

/**
 * 下载线路清单：AtomGit 固定排第一并作为默认选项。
 * 后面依次是本站自建节点、各公益镜像，最后是 GitHub 官方源。
 * AtomGit 排首位的原因：它托管在国内，实测下载速度是 GitHub 直链的数倍到数十倍，
 * 而且不需要像自建节点那样换票据（少一次接口往返）。
 */
export function sourceChoices(): SourceChoice[] {
  const mirrors = mirrorChoices();
  return [
    { id: ATOM_GIT_CHANNEL_ID, name: gt('mirror.channel-atomgit') },
    ...mirrors.map((channel) => ({ id: channel.id, name: channel.name, self: channel.self })),
    { id: OFFICIAL_CHANNEL_ID, name: 'GitHub' }
  ];
}

export function mirrorChoices(): MirrorChannel[] {
  const usable = usableChannels();
  const self = usable.find((channel) => channel.self);
  return self ? [self, ...usable.filter((channel) => channel !== self)] : usable;
}

/**
 * AtomGit 能不能服务这个版本。
 * 只有接口明确说「没有」才返回 false；接口没取到时返回 true（直链是拼出来的，照用）。
 * 页面据此决定默认线路，以及要不要提示「已改走本站节点」。
 *
 * 这里主动读一次 atomgitRevision()：让任何把它写进 computed 的调用方
 * 都能在清单到达后自动重算，而不是依赖调用方自己记得先读一次。
 */
export function atomGitAvailable(build: DesktopBuild | null): boolean {
  void atomgitRevision();
  if (!build) return false;
  return atomgitAvailability(build.repo, build.tag, build.name) !== 'no';
}

/** 预取 AtomGit 版本清单（进下载页时调用，失败也不影响下载） */
export async function warmUpAtomGit(): Promise<void> {
  await ensureAtomGitIndex();
}

/**
 * 清单版本号（响应式）。
 * 清单本身是模块级普通变量，页面里的 computed 读不到它的变化；
 * 在 computed 开头调一次这个函数，清单到达后提示条与校验值链接才会重算。
 */
export { atomgitRevision };

/**
 * 「校验值」要不要显示。
 *
 * 两条判据叠加：
 *   ① 发布流程的固定约定 —— 桌面版与 Win7 版的每个产物都随包带同名 .md5，安卓 APK 从来没有。
 *      原先只看 AtomGit 清单里「有没有说没有」，于是接口限流（unknown）时安卓也会冒出
 *      一个校验值按钮，点了必然 404。
 *   ② 清单明确说这个版本没有 .md5（同步时漏推了校验文件）时也藏起来，避免死链。
 */
export function hasChecksum(build: DesktopBuild | null): boolean {
  if (!build) return false;
  if (/\.apk$/i.test(build.name)) return false;
  return atomgitAvailability(build.repo, build.tag, `${build.name}.md5`) !== 'no';
}

/**
 * 「校验值」链接的目标：优先 AtomGit，和主下载按钮保持同一条线路
 * —— 主按钮能从 AtomGit 下、校验文件却指向 GitHub 的话，国内用户点校验值就打不开了。
 *
 * 只有清单**明确说 AtomGit 上没有**这个 .md5 时才退回 GitHub 原地址
 * （比如某个版本同步时漏推了校验文件）；清单没取到（unknown）时仍走 AtomGit，
 * 与主按钮在同样情形下的选择保持一致。
 */
export function checksumUrlOf(build: DesktopBuild): string {
  const name = `${build.name}.md5`;
  const atomGit = atomgitDownloadUrl(build.repo, build.tag, name);
  if (!atomGit) return `${build.url}.md5`;
  if (atomgitAvailability(build.repo, build.tag, name) === 'no') return `${build.url}.md5`;
  return atomGit;
}

export interface SourceDownloadOutcome {
  /** 实际用了哪条线路 */
  via: 'atomgit' | 'self' | 'mirror' | 'github' | 'release';
  /** 选的是 AtomGit，但它没有这个文件，于是自动改走本站节点 */
  fellBack?: boolean;
}

/** 走本站自建节点：先换签名直链，换不到就用前缀式地址兜底 */
async function useSelfChannel(build: DesktopBuild): Promise<string | null> {
  const self = mirrorChoices().find((channel) => channel.self);
  if (!self) return null;
  const signed = await fetchSelfSignedUrl(build.url);
  if (signed) {
    noteAcceleratedDownload({ target: build.url });
    return signed;
  }
  return mirrorUrl(build.url, self);
}

/**
 * 按选定的线路下载一个产物。
 * AtomGit 优先；接口明确说「这个版本没推过去」时，自动改走本站节点而不是直接报错
 * —— 用户点「下载」的意图是拿到文件，不是必须走某一条线路。
 */
export async function downloadViaSource(
  build: DesktopBuild,
  sourceId: string
): Promise<SourceDownloadOutcome | null> {
  if (sourceId === OFFICIAL_CHANNEL_ID) {
    downloadBuildDirect(build);
    return { via: 'github' };
  }

  if (sourceId === ATOM_GIT_CHANNEL_ID) {
    await ensureAtomGitIndex();
    const href = atomgitDownloadUrl(build.repo, build.tag, build.name);
    if (href && atomGitAvailable(build)) {
      triggerDownload(href);
      noteAcceleratedDownload({ target: build.url });
      return { via: 'atomgit' };
    }
    const self = await useSelfChannel(build);
    if (self) {
      triggerDownload(self);
      return { via: 'self', fellBack: true };
    }
    // 连本站节点都用不了：AtomGit 直链仍比没有强，照发
    if (href) {
      triggerDownload(href);
      noteAcceleratedDownload({ target: build.url });
      return { via: 'atomgit' };
    }
    return null;
  }

  const channel = mirrorChoices().find((item) => item.id === sourceId);
  if (!channel) return null;
  const href = channel.self
    ? await useSelfChannel(build)
    : mirrorUrl(build.url, channel);
  if (!href) return null;
  triggerDownload(href);
  rememberChannel(channel.id);
  return { via: channel.self ? 'self' : 'mirror' };
}

/** 直接走 GitHub 官方源下载（不走任何镜像） */
export function downloadBuildDirect(build: DesktopBuild): void {
  triggerDownload(build.url);
}

export type DesktopDownloadResult = SourceDownloadOutcome['via'];
async function downloadBuild(build: DesktopBuild): Promise<DesktopDownloadResult> {
  // 1. AtomGit：能下就直接下，最快
  await ensureAtomGitIndex();
  const atomGit = atomgitDownloadUrl(build.repo, build.tag, build.name);
  if (atomGit && atomGitAvailable(build)) {
    triggerDownload(atomGit);
    noteAcceleratedDownload({ target: build.url });
    return 'atomgit';
  }

  // 2. 本站自建节点 / 公益镜像
  const working = await pickWorkingMirror(build.url);
  if (working) {
    triggerDownload(working);
    return 'mirror';
  }

  // 3. 全都不通：退到该版本的 Release 页。新标签页被拦截时改为当前页跳转，确保到达。
  // 同时携带 noopener —— releaseUrl 虽为内部拼接的 GitHub 地址，但不依赖 open() 的返回值做隔离。
  const opened = window.open(build.releaseUrl, '_blank', 'noopener,noreferrer');
  if (opened) opened.opener = null;
  else window.location.href = build.releaseUrl;
  return 'release';
}
export async function downloadDesktopBuild(channel: DesktopChannel): Promise<DesktopDownloadResult> {
  return downloadBuild((await resolveDesktopBuilds())[channel]);
}
