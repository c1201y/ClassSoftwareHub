// classsoftwarehub.cn 可选浏览器缓存 Service Worker
// 范围（scope）为站点根：/assets/* 哈希静态资源、/api/icon 图标、页面导航。
// 不缓存任何其它 /api/ 接口（提交、签名、统计等必须实时）。
const VERSION = 'csh-sw-v1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const ICONS = `${VERSION}-icons`;
const CACHE_PREFIX = 'csh-sw-';

const ICON_LIMIT = 500;
const ASSET_LIMIT = 240;
const NAV_TIMEOUT = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(SHELL);
        await cache.add(new Request('/', { cache: 'reload' }));
      } catch {
        /* 首次安装离线也允许，后续导航再填充 */
      }
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

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NAV_TIMEOUT);
  try {
    const response = await fetch(request, { signal: controller.signal });
    if (response.ok) {
      await cache.put(new Request('/'), response.clone());
      await cache.put(new Request('/index.html'), response.clone());
    }
    return response;
  } catch {
    const hit = (await cache.match(new Request('/'))) || (await cache.match(new Request('/index.html')));
    if (hit) return hit;
    return new Response('offline', { status: 503, statusText: 'Offline', headers: { 'content-type': 'text/plain; charset=utf-8' } });
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }
  if (url.pathname === '/api/icon') {
    event.respondWith(staleWhileRevalidate(request, ICONS, ICON_LIMIT));
    return;
  }
  if (/^\/(favicon\.ico|apple-touch-icon\.png|og-cover\.png|BingSiteAuth\.xml|da15f3394d7ab9b0701c2e8f4db9cc40\.txt)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, ASSETS));
  }
});
