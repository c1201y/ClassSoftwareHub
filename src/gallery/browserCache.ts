
const CACHE_PREFIX = 'csh-sw-';

export const browserCacheSupported =
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  (window.location.protocol === 'https:' || window.location.hostname === 'localhost');

let registering: Promise<void> | null = null;

async function register(): Promise<void> {
  if (!browserCacheSupported) return;
  if (registering) return registering;
  registering = (async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none'
      });
      // 新版本安装后立即接管，避免用户停留在旧缓存上
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            worker.postMessage({ type: 'skip-waiting' });
          }
        });
      });
    } catch (error) {
      // SW 注册失败（权限/浏览器策略/隐私模式）不影响页面功能
      console.warn('[browser-cache] register failed:', error);
    } finally {
      registering = null;
    }
  })();
  return registering;
}

/** 清除本 SW 创建的全部缓存（不动用户其它站点/域下缓存），SW 保持注册；返回是否全部清除成功 */
export async function clearBrowserCaches(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  let cleared = true;
  try {
    const keys = await caches.keys();
    const results = await Promise.all(
      keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key))
    );
    cleared = results.every(Boolean);
  } catch {
    cleared = false;
  }
  const controller = navigator.serviceWorker?.controller;
  controller?.postMessage({ type: 'clear' });
  return cleared;
}

/** 页面加载后调用一次 */
export function initBrowserCache(): void {
  void register();
}
