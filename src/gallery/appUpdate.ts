// ════════════════════════════════════════════════════════════════════
// appUpdate.ts —— 检测「浏览器里缓存的版本」是否落后于服务器
//
// 站点常驻 Service Worker，静态资源缓存优先，因此一次部署之后，浏览器
// 可能还在用旧 bundle。这里用构建时注入的 __BUILD_ID__（提交号）与服务器
// 根目录的 version.json 比对：不一致就说明当前页面来自旧缓存。
//
// 检测只在页面空闲时做，失败（离线 / 文件缺失 / 旧部署）一律静默。
// ════════════════════════════════════════════════════════════════════

import { clearBrowserCaches } from './browserCache';

export interface UpdateInfo {
  /** 当前页面实际运行的构建标识 */
  running: string;
  /** 服务器上最新构建标识 */
  latest: string;
}

/** 当前页面 bundle 的构建标识（构建时写入） */
export const runningBuild = __BUILD_ID__;

let pending: Promise<UpdateInfo | null> | null = null;
let lastCheck = 0;
const CHECK_INTERVAL_MS = 60 * 1000;

const versionUrl = (): string =>
  new URL(`${import.meta.env.BASE_URL}version.json`, window.location.href).href;

/**
 * 与服务器比对版本。返回 null 表示「一致」或「无法判断」。
 * 结果缓存 1 分钟，避免设置页反复进出时刷接口。
 */
export function checkForUpdate(force = false): Promise<UpdateInfo | null> {
  const now = Date.now();
  if (!force && pending && now - lastCheck < CHECK_INTERVAL_MS) return pending;
  lastCheck = now;
  pending = (async () => {
    try {
      const response = await fetch(versionUrl(), { cache: 'no-store' });
      if (!response.ok) return null;
      const data = (await response.json()) as { build?: unknown };
      if (typeof data.build !== 'string' || !data.build) return null;
      return data.build === runningBuild ? null : { running: runningBuild, latest: data.build };
    } catch {
      return null;
    }
  })();
  return pending;
}

/**
 * 应用更新：清掉本站缓存 → 让 SW 立即检查新版本 → 重载。
 * 只清本站 csh-sw-* 缓存，不动用户其它站点数据（与设置页「清除缓存」同一套）。
 */
export async function applyUpdate(): Promise<void> {
  try {
    await clearBrowserCaches();
  } catch {}
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {}
  // 带上时间戳强制绕过 index.html 的 HTTP 缓存（SW 缓存上面已经清掉）
  const url = new URL(window.location.href);
  url.searchParams.set('_', String(Date.now()));
  window.location.replace(url.href);
}
