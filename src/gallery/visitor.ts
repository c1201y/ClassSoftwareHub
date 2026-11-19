import { reactive } from 'vue';
const API_BASE =
  import.meta.env.VITE_CSH_STATS_BASE ?? 'https://service.132614.xyz';

/** 全站共享的访问量状态：由 trackVisit() 写入，设置页的 VisitorCounter 只负责读它显示。 */
export const visitorState = reactive<{
  pv: number | null;
  uv: number | null;
  online: number | null;
  offline: boolean;
}>({
  pv: null,
  uv: null,
  online: null,
  offline: false,
});

// 同一页面连续只计一次：根组件挂载与路由钩子可能都会触发一次，用它去重，避免重复计数。
// 用「稳定页面标识」而非路径：`/` 会重定向到 `/home`，若按路径去重会被算成两页。
let lastKey = '';

/** 是否已经有任意一次成功上报（供根组件判断是否需要首屏兜底）。 */
export function hasTracked(): boolean {
  return lastKey !== '';
}
declare global {
  interface Window {
    _hmt?: unknown[];
  }
}
let baiduFirstView = true;
export function trackVisit(key: string, page: string): void {
  const pageKey = key || page || '/';
  if (pageKey === lastKey) return;
  lastKey = pageKey;

  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  // 百度统计：首次进站那次 PV 由 hm.js 加载时自动记录，不重复推；
  // 本地开发（localhost）不上报，避免污染线上数据。
  if (!isLocal) {
    if (baiduFirstView) {
      baiduFirstView = false;
    } else if (Array.isArray(window._hmt)) {
      window._hmt.push(['_trackPageview', page || '/']);
    }
  }
  const endpoint = isLocal ? '/api/stats' : '/api/hit';
  const params = new URLSearchParams({ host: location.hostname, page: page || '/', _: String(Date.now()) });
  const url = API_BASE + endpoint + '?' + params.toString();

  let ok = false;
  const loadOnce = async () => {
    try {
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      visitorState.pv = typeof data.pv === 'number' ? data.pv : null;
      visitorState.uv = typeof data.uv === 'number' ? data.uv : null;
      if (typeof data.online === 'number') visitorState.online = data.online;
      visitorState.offline = false;
      ok = true;
    } catch (e) {
      // 将完整错误输出到控制台，便于排查（含请求地址与错误类型）
      console.warn('[VisitorCounter] 统计接口请求失败：', e, '\n请求地址：', url);
      visitorState.offline = true;
    }
  };
  void loadOnce();
  // 首次失败：4 秒后重试一次（应对 Worker 冷启动 / 偶发网络抖动）。
  // 期间若用户已切到别的页面（lastKey 变了）则不再重试，避免把计数补到错误的页面上。
  window.setTimeout(() => {
    if (!ok && lastKey === pageKey) void loadOnce();
  }, 4000);
}
