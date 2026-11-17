// ClassSoftwareHub 浏览器缓存 Service Worker（scope = 站点根）
//
// 缓存范围：
//   · 页面外壳（index.html）与其中引用的哈希静态资源 —— 安装时预缓存，离线可开
//   · /assets/* 其它哈希资源（图标、字体、图片）—— 用后即缓存
//   · /api/icon 图标、/legal.json —— stale-while-revalidate
//   · /offline.html —— 导航失败时的兜底页
// 不缓存：/version.json（必须实时，用于版本检测）、/api/ 的其它接口、
// 以及所有跨域请求（下载节点等）。
const VERSION = 'csh-sw-v2';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const ICONS = `${VERSION}-icons`;
const OFFLINE = `${VERSION}-offline`;
const CACHE_PREFIX = 'csh-sw-';

const ICON_LIMIT = 800;
const ASSET_LIMIT = 600;
const NAV_TIMEOUT = 4000;

/** 站点根（兼容子目录部署） */
const SCOPE = self.registration.scope;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      await precache().catch(() => {
        /* 首次安装离线也允许，后续导航再填充 */
      });
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && !key.startsWith(VERSION)).map((key) => caches.delete(key))
      );
      // 导航预加载：SW 启动的同时就发出网络请求，减少一次往返
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable().catch(() => {});
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  const type = event.data && event.data.type;
  if (type === 'skip-waiting') self.skipWaiting();
  if (type === 'clear') {
    event.waitUntil(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX)).map((key) => caches.delete(key)));
      })()
    );
  }
});

/** 安装时预缓存外壳及其引用的哈希资源 */
async function precache() {
  const shellCache = await caches.open(SHELL);
  const response = await fetch(new Request(SCOPE, { cache: 'reload' }));
  if (!response.ok) return;
  const html = await response.clone().text();
  await shellCache.put(new Request(SCOPE), response.clone());

  const assets = await caches.open(ASSETS);
  const urls = new Set();
  for (const match of html.matchAll(/(?:src|href)="([^"]*\/assets\/[^"]+)"/g)) {
    try {
      urls.add(new URL(match[1], SCOPE).href);
    } catch {
      /* 忽略畸形地址 */
    }
  }
  await Promise.all(
    [...urls].map((url) =>
      fetch(new Request(url, { cache: 'reload' }))
        .then((res) => (res.ok ? assets.put(url, res) : null))
        .catch(() => null)
    )
  );

  // 离线兜底页与法务文本：失败不影响安装
  const offlineCache = await caches.open(OFFLINE);
  await fetch(new Request(new URL('offline.html', SCOPE).href, { cache: 'reload' }))
    .then((res) => (res.ok ? offlineCache.put(new URL('offline.html', SCOPE).href, res) : null))
    .catch(() => null);
  await fetch(new Request(new URL('legal.json', SCOPE).href, { cache: 'reload' }))
    .then((res) => (res.ok ? assets.put(new URL('legal.json', SCOPE).href, res) : null))
    .catch(() => null);
}

async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)));
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    void trim(cacheName, ASSET_LIMIT);
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        await cache.put(request, response.clone());
        void trim(cacheName, limit);
      }
      return response;
    })
    .catch(() => null);
  if (hit) {
    void network;
    return hit;
  }
  const response = await network;
  if (response) return response;
  return new Response('', { status: 504, statusText: 'Gateway Timeout' });
}

function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function networkFirstNavigation(event) {
  const cache = await caches.open(SHELL);
  try {
    // navigationPreload 已启用时直接用预发的请求，省一次等待
    const preload = await event.preloadResponse;
    const response = preload || (await fetchWithTimeout(event.request, NAV_TIMEOUT));
    if (response.ok) {
      await cache.put(new Request(SCOPE), response.clone());
    }
    return response;
  } catch {
    const hit = await cache.match(SCOPE);
    if (hit) return hit;
    const offline = await caches.open(OFFLINE);
    const page = await offline.match(new URL('offline.html', SCOPE).href);
    if (page) return page;
    return new Response('offline', {
      status: 503,
      statusText: 'Offline',
      headers: { 'content-type': 'text/plain; charset=utf-8' }
    });
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/version.json')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event));
    return;
  }
  if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }
  if (url.pathname === '/api/icon') {
    event.respondWith(staleWhileRevalidate(request, ICONS, ICON_LIMIT));
    return;
  }
  if (url.pathname.endsWith('/legal.json')) {
    event.respondWith(staleWhileRevalidate(request, ASSETS, ASSET_LIMIT));
    return;
  }
  if (url.pathname.endsWith('/offline.html')) {
    event.respondWith(cacheFirst(request, OFFLINE));
    return;
  }
  const name = url.pathname.split('/').pop() || '';
  if (/^(favicon\.ico|apple-touch-icon\.png|og-cover\.png|BingSiteAuth\.xml|da15f3394d7ab9b0701c2e8f4db9cc40\.txt)$/.test(name)) {
    event.respondWith(cacheFirst(request, ASSETS));
  }
});
