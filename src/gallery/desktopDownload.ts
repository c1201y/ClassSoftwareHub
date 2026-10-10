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

import { fetchSelfSignedUrl, mirrorUrl, orderedChannels } from './githubMirror';
import type { MirrorChannel } from './githubMirror';

/** 桌面版仓库（安装包由该仓库发布，与本站主仓库相互独立） */
const REPO = 'c1201y/ClassSoftwareHub-Desktop';

/** 桌面版仓库的 Releases 页 —— 卡片「全部版本」链接及镜像全部不可用时的兜底跳转目标 */
export const DESKTOP_RELEASES_URL = `https://github.com/${REPO}/releases`;

/**
 * 取 Release 清单的接口入口，按顺序试，第一个成功的胜出。
 * 两个入口都带 CORS 头，浏览器能直接读 JSON。
 */
const API_BASES = [
  // 本站统计 Worker 的反代：国内可达、Cloudflare 服务端代调，固定排最前
  `https://service.132614.xyz/api/gh/repos/${REPO}/releases`,
  `https://gh-proxy.com/https://api.github.com/repos/${REPO}/releases`
];

/** 单次接口请求超时（毫秒） */
const REQUEST_TIMEOUT = 12000;

/** 镜像可用性探测超时（毫秒）：国内镜像握手通常在 1 秒内完成，3 秒已足够 */
const PROBE_TIMEOUT = 3000;

/** 版本解析的最大等待时间；超时后直接采用兜底版本返回，避免用户长时间等待 */
const RESOLVE_GRACE = 2500;

/** 桌面版发版频率低，版本信息缓存 30 分钟，减少首页接口请求 */
const CACHE_KEY = 'csh-desktop-builds';
const CACHE_TTL = 30 * 60 * 1000;

/** 两个下载通道 */
export type DesktopChannel = 'stable' | 'insider';

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
}

export interface DesktopBuilds {
  stable: DesktopBuild;
  insider: DesktopBuild;
}

/** 构造 DesktopBuild（tag 与文件名均由仓库约定决定） */
function buildOf(channel: DesktopChannel, tag: string, name: string): DesktopBuild {
  return {
    channel,
    tag,
    name,
    url: `https://github.com/${REPO}/releases/download/${tag}/${name}`,
    releaseUrl: `https://github.com/${REPO}/releases/tag/${tag}`
  };
}

/**
 * 兜底版本 —— 接口全部不可用时使用（静态写入当前已发布的版本）。
 * 正常情况下版本为动态获取，无需随桌面版发版更新此处；
 * 仅当接口长期不可用时，用户才会下载到旧版本安装包。
 */
const FALLBACK: DesktopBuilds = {
  stable: buildOf('stable', 'dv1.0.0', 'ClassSoftwareHub-Setup-dv1.0.0-stable.exe'),
  insider: buildOf('insider', 'dv1.0.0-insider1.3', 'ClassSoftwareHub-Setup-dv1.0.0-insider1.3.exe')
};

/* ── 接口返回结构（只声明用得到的字段）──────────────────────────── */

interface RawAsset {
  name: string;
  browser_download_url: string;
}

interface RawRelease {
  tag_name: string;
  prerelease: boolean;
  draft: boolean;
  assets?: RawAsset[];
}

/* ── 取版本 ─────────────────────────────────────────────────────── */

/** 从一个 Release 列表里挑出指定通道的安装包 */
function pickBuild(releases: RawRelease[], channel: DesktopChannel): DesktopBuild | null {
  const wantPrerelease = channel === 'insider';
  for (const release of releases) {
    if (release.draft || release.prerelease !== wantPrerelease) continue;
    const exe = (release.assets ?? []).find((asset) => /\.exe$/i.test(asset.name));
    if (!exe || !release.tag_name) continue;
    return {
      channel,
      tag: release.tag_name,
      name: exe.name,
      url: exe.browser_download_url,
      releaseUrl: `https://github.com/${REPO}/releases/tag/${release.tag_name}`
    };
  }
  return null;
}

/** 依次尝试各接口入口，获取 Release 列表 */
async function fetchReleases(): Promise<RawRelease[]> {
  let lastError: unknown = null;
  for (const base of API_BASES) {
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
    if (!parsed.builds?.stable?.url || !parsed.builds?.insider?.url) return null;
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
  const builds: DesktopBuilds = { stable: FALLBACK.stable, insider: FALLBACK.insider };
  try {
    const releases = await fetchReleases();
    builds.stable = pickBuild(releases, 'stable') ?? builds.stable;
    builds.insider = pickBuild(releases, 'insider') ?? builds.insider;
    writeCache(builds);
  } catch {
    /* 接口全部不可用：本次会话使用兜底版本，刷新页面后会重试 */
  }
  memoryBuilds = builds;
  return builds;
}

/**
 * 获取两个通道的可下载版本。
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

export type DesktopDownloadResult = 'mirror' | 'release';

/**
 * 下载指定通道的桌面版安装包。
 *
 * 优先走镜像；镜像一条都不通就跳到该版本的 Release 页。
 * 返回值只用于调用方判断走的是哪条路（不产出文案）。
 */
export async function downloadDesktopBuild(channel: DesktopChannel): Promise<DesktopDownloadResult> {
  const build = (await resolveDesktopBuilds())[channel];

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
