
import { fetchSelfSignedUrl, mirrorUrl, orderedChannels, rememberChannel, usableChannels } from './githubMirror';
import type { MirrorChannel } from './githubMirror';
import { noteAcceleratedDownload } from './downloadFeedback';

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
    releaseUrl: `https://github.com/${owner}/releases/tag/${tag}`
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
      releaseUrl: `https://github.com/${repo}/releases/tag/${release.tag_name}`
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
export function mirrorChoices(): MirrorChannel[] {
  const usable = usableChannels();
  const self = usable.find((channel) => channel.self);
  return self ? [self, ...usable.filter((channel) => channel !== self)] : usable;
}
export const OFFICIAL_CHANNEL_ID = 'github';
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
    const signed = await fetchSelfSignedUrl(build.url);
    href = signed || mirrorUrl(build.url, channel);
    if (signed) noteAcceleratedDownload({ target: build.url });
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
export async function downloadDesktopBuild(channel: DesktopChannel): Promise<DesktopDownloadResult> {
  return downloadBuild((await resolveDesktopBuilds())[channel]);
}
