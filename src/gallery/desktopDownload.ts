// ════════════════════════════════════════════════════════════════════
// desktopDownload.ts —— 首页「桌面应用版」的安装包直下
//
// 原来首页那张卡只是跳到 GitHub 的 Release 页，用户还得自己找文件、点下载，
// 而国内直连 github.com 下 Release 常常只有几十 KB/s 甚至断流。这里改成
// 「点一下就下 exe」，并且：
//
//   1. 版本号动态取 —— 桌面版仓库一发新版，按钮自动跟上，不用改代码。
//      接口入口：本站 Worker 反代（国内可达）→ gh-proxy.com 兜底。
//   2. 下载走镜像 —— 复用 githubMirror.ts 里那几条公益加速通道。
//   3. 镜像一条都不通时，自动落到**该版本**的 Release 页，用户仍能自己下。
//
// 三个实现上的坑（都实测过，别再改回去）：
//   · 镜像对**文件**路径不返回 CORS 头，所以探测只能用 no-cors + HEAD：
//     读不到状态码，但「域名失效 / 连不上 / 超时」都会让 fetch reject —— 够用了。
//     ⚠️ 千万别改成 GET 探测，那会把 60MB 的包真下下来。
//   · ghfast.top 能代理文件、但**不能**代理 api.github.com（返回 403），
//     所以接口入口里没有它（它在镜像清单里，负责下载，不负责取版本）。
//   · Worker 的 /api/gh 反代只放行固定路径：`/releases` 可以，`/releases/latest`
//     会被拦成 {"error":"forbidden"}。所以这里取列表再自己筛最新，不用 latest。
//
// 本文件不产出界面文字 —— 按钮上的字在 HomePage.vue 的 desktopPromo 里。
// ════════════════════════════════════════════════════════════════════

import { MIRROR_CHANNELS, mirrorUrl, preferredChannelId } from './githubMirror';
import type { MirrorChannel } from './githubMirror';

/** 桌面版仓库（exe 由它发布，跟本站是两个仓库） */
const REPO = 'c1201y/ClassSoftwareHub-Desktop';

/** 桌面版仓库的 Releases 页 —— 卡片上「全部版本」链接 + 镜像全挂时的兜底去处 */
export const DESKTOP_RELEASES_URL = `https://github.com/${REPO}/releases`;

/**
 * 取 Release 清单的接口入口，按顺序试，第一个成功的胜出。
 * 两个入口都带 CORS 头，浏览器能直接读 JSON。
 */
const API_BASES = [
  // 本站统计 Worker 的反代：国内可达、Cloudflare 服务端代调，永远排最前
  `https://service.132614.xyz/api/gh/repos/${REPO}/releases`,
  `https://gh-proxy.com/https://api.github.com/repos/${REPO}/releases`
];

/** 单次接口请求超时（毫秒） */
const REQUEST_TIMEOUT = 12000;

/** 镜像可用性探测超时（毫秒）：国内镜像握手通常 <1s，给 3s 足够 */
const PROBE_TIMEOUT = 3000;

/** 取版本最多让用户等多久；超了就先拿兜底版本，别让点一下卡十几秒 */
const RESOLVE_GRACE = 2500;

/** 发版不频繁，版本信息缓存半小时就够，别每次开首页都打接口 */
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

/** 拼一个 DesktopBuild（tag 与文件名都由仓库约定决定） */
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
 * 兜底版本 —— 接口全不通时用（写死当前已发布的版本）。
 * ⚠️ 正常情况下版本是动态取的，**不需要**跟着桌面版发版来改这里；
 *    它只是保险丝。真到了长期不更新的地步，接口挂掉时用户会下到旧包。
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

/** 逐个试接口入口，拿回 Release 列表 */
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

/** 真正去拉一次版本；无论成功失败都一定会 resolve（失败则用兜底版本） */
async function loadBuilds(): Promise<DesktopBuilds> {
  const builds: DesktopBuilds = { stable: FALLBACK.stable, insider: FALLBACK.insider };
  try {
    const releases = await fetchReleases();
    builds.stable = pickBuild(releases, 'stable') ?? builds.stable;
    builds.insider = pickBuild(releases, 'insider') ?? builds.insider;
    writeCache(builds);
  } catch {
    /* 接口全不通：本次会话就用兜底版本，刷新页面会再试一次 */
  }
  memoryBuilds = builds;
  return builds;
}

/**
 * 拿两个通道的可下载版本。
 *
 * - 命中内存 / 本地缓存 → 立刻返回（首页 onMounted 会预热一次，点按钮时基本就是这条路）
 * - 都没有 → 去接口取，但最多等 RESOLVE_GRACE 就先用兜底版本，不让用户干等
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
 * 探一条镜像通不通。
 *
 * 只能用 no-cors：镜像对文件路径不带 CORS 头，正常模式的 fetch 会直接 reject。
 * no-cors 下响应是不透明的（读不到状态码），但网络层失败（域名挂 / 连不上 /
 * 超时）仍会 reject —— 这正是我们要的信号。用 HEAD 所以不会真下文件。
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

/** 候选通道：用户上次选的排最前，其余按清单顺序 */
function candidateChannels(): MirrorChannel[] {
  const preferred = preferredChannelId();
  const first = MIRROR_CHANNELS.find((channel) => channel.id === preferred);
  if (!first) return MIRROR_CHANNELS;
  return [first, ...MIRROR_CHANNELS.filter((channel) => channel !== first)];
}

/**
 * 并发探所有候选通道，按「偏好顺序」取第一条能用的。
 * 并发是为了压缩等待（最坏 PROBE_TIMEOUT），按偏好取是为了尊重用户上次的选择 ——
 * 不能用 Promise.any 的「最快者胜」，那会让偏好失效。
 */
async function pickWorkingMirror(target: string): Promise<string | null> {
  const channels = candidateChannels();
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

  // 镜像全挂：退到该版本的 Release 页。新标签页被拦截时就在当前页跳，保证一定能到。
  const opened = window.open(build.releaseUrl, '_blank');
  if (opened) opened.opener = null;
  else window.location.href = build.releaseUrl;
  return 'release';
}
