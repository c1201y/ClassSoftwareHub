import { reactive } from 'vue';

// 自托管访问统计：Cloudflare Worker + KV（见 stats-worker/worker.js）。
// 三个域名共用同一 Worker 地址，后台 KV 自动把各域名的访问累加成一个总数，
// 解决不蒜子(busuanzi)按域名分别统计、各域名数字对不上的问题。
// 国内 .workers.dev 被墙，故使用自定义域名 service.132614.xyz。
const API_BASE = 'https://service.132614.xyz';

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

// 同一路径连续只计一次：根组件挂载与路由钩子可能都会触发一次，用它去重，避免重复计数。
let lastTrackedPath = '';

/**
 * 上报一次页面浏览（PV +1），并把最新数字写进共享状态。
 * 在应用根组件挂载时、以及每次路由切换后调用，从而覆盖全站所有页面。
 * @param path 站内路由路径（如 `/`、`/settings`、`/download/xxx`）
 */
export function trackVisit(path: string): void {
  const page = path || '/';
  if (page === lastTrackedPath) return;
  lastTrackedPath = page;

  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  // 本地预览走只读 /api/stats，避免把开发访问算进线上计数；线上走 /api/hit 正常 +1。
  // 用 query 参数把「真实来源域名 + 真实页面」带给统计端，否则 Worker 会把统计接口自己当成来源
  // （请求实际发往 service.132614.xyz/api/hit）。用 query 而非自定义请求头，避免跨域预检。
  // credentials: 'include' 用于携带 Worker 域下的去重 Cookie（跨域 UV / 在线去重需要）。
  const endpoint = isLocal ? '/api/stats' : '/api/hit';
  const params = new URLSearchParams({ host: location.hostname, page });
  const url = API_BASE + endpoint + '?' + params.toString();

  let ok = false;
  const loadOnce = async () => {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      visitorState.pv = typeof data.pv === 'number' ? data.pv : null;
      visitorState.uv = typeof data.uv === 'number' ? data.uv : null;
      if (typeof data.online === 'number') visitorState.online = data.online;
      visitorState.offline = false;
      ok = true;
    } catch (e) {
      // 把完整错误打到控制台，方便排查（地址 / 错误类型）
      console.warn('[VisitorCounter] 统计接口请求失败：', e, '\n请求地址：', url);
      visitorState.offline = true;
    }
  };
  void loadOnce();
  // 首次失败：4 秒后重试一次（应对 Worker 冷启动 / 偶发网络抖动）。
  // 期间若用户已切到别的页面（lastTrackedPath 变了）则不再重试，避免把计数补到错误的页面上。
  window.setTimeout(() => {
    if (!ok && lastTrackedPath === page) void loadOnce();
  }, 4000);
}
