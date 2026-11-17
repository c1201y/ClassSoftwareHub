// ════════════════════════════════════════════════════════════════════
// appUpdate.ts —— 检测「浏览器里缓存的版本」是否落后于服务器
//
// 站点常驻 Service Worker，静态资源缓存优先，因此一次部署之后，浏览器
// 可能还在用旧 bundle。这里用构建时注入的 __BUILD_ID__（提交号）与服务器
// 根目录的 version.json 比对：不一致就说明当前页面来自旧缓存。
//
// 三种结果分开返回（current / stale / unknown），设置页才能像 Windows
// 「Windows 更新」那样显示「当前已是最新版本」而不是沉默。
// ════════════════════════════════════════════════════════════════════

import { clearBrowserCaches } from './browserCache';

/** 版本检查结果 */
export type UpdateCheck =
  | { state: 'current'; running: string }
  | { state: 'stale'; running: string; latest: string }
  | { state: 'unknown' };

/** 当前页面 bundle 的构建标识（构建时写入） */
export const runningBuild = __BUILD_ID__;

let pending: Promise<UpdateCheck> | null = null;
let lastCheck = 0;
const CHECK_INTERVAL_MS = 60 * 1000;

const versionUrl = (): string =>
  new URL(`${import.meta.env.BASE_URL}version.json`, window.location.href).href;

/**
 * 与服务器比对版本。
 * 结果缓存 1 分钟，避免设置页反复进出时刷接口；force=true 忽略缓存。
 */
export function checkForUpdate(force = false): Promise<UpdateCheck> {
  const now = Date.now();
  if (!force && pending && now - lastCheck < CHECK_INTERVAL_MS) return pending;
  lastCheck = now;
  pending = (async (): Promise<UpdateCheck> => {
    try {
      const response = await fetch(versionUrl(), { cache: 'no-store' });
      if (!response.ok) return { state: 'unknown' };
      const data = (await response.json()) as { build?: unknown };
      if (typeof data.build !== 'string' || !data.build) return { state: 'unknown' };
      return data.build === runningBuild
        ? { state: 'current', running: runningBuild }
        : { state: 'stale', running: runningBuild, latest: data.build };
    } catch {
      return { state: 'unknown' };
    }
  })();
  return pending;
}

/**
 * 应用更新：清掉本站缓存 → 让 SW 立即检查新版本 → 重载。
 * 只清本站 csh-sw-* 缓存，不动用户其它站点数据。
 */
export async function applyUpdate(): Promise<void> {
  try {
    await clearBrowserCaches();
  } catch {}
  // SW 自检可能受网络影响要等好几秒；不要在它上面阻塞重载（用户点了没反应最糟）
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    void reg?.update().catch(() => {});
  } catch {}
  // 带上时间戳强制绕过 index.html 的 HTTP 缓存（SW 缓存上面已经清掉）
  const url = new URL(window.location.href);
  url.searchParams.set('_', String(Date.now()));
  window.location.replace(url.href);
}
