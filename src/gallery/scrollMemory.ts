
const STORAGE_KEY = 'csh-scroll-memory';

/** 各页面滚动容器的选择器（WinScrollViewer 真正发生滚动的那个 div） */
const SCROLL_VIEWPORT_SELECTOR = '.win-scroll-viewer-viewport';

/** 路由 key：详情页要按 id 分开记（每个软件的阅读位置各自独立） */
const routeKey = (route: { name?: unknown; params?: unknown }): string => {
  const name = typeof route.name === 'string' ? route.name : '';
  const params = (route.params ?? {}) as Record<string, unknown>;
  const id = String(params.id ?? '');
  return id ? `${name}:${id}` : name;
};
const shouldRemember = (route: { name?: unknown; params?: unknown }): boolean => {
  const name = route.name;
  if (typeof name !== 'string' || !name) return false;
  const params = (route.params ?? {}) as Record<string, unknown>;
  if (name === 'download-detail' && !params.id) return false;
  return true;
};

/** 读档：存储被禁 / 内容损坏时一律当空处理，绝不让站点打不开 */
const readStore = (): Record<string, number> => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      // 只收有限数字，防止旧版本或手改过的脏数据把 scrollTop 设成 NaN
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
};

const writeStore = (store: Record<string, number>) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // 隐私模式 / 配额满：这次不记，不影响使用
  }
};
const findViewport = (): HTMLElement | null => {
  const views = document.querySelectorAll<HTMLElement>('.page-view');
  if (!views.length) return null;
  const view = views[views.length - 1];
  return view.querySelector<HTMLElement>(SCROLL_VIEWPORT_SELECTOR);
};
export const rememberScroll = (route: { name?: unknown; params?: unknown }): void => {
  if (!shouldRemember(route)) return;
  const viewport = findViewport();
  if (!viewport) return;
  const top = Math.round(viewport.scrollTop);
  const store = readStore();
  store[routeKey(route)] = top;
  writeStore(store);
};
export const restoreScroll = (route: { name?: unknown; params?: unknown }): void => {
  if (!shouldRemember(route)) return;
  const store = readStore();
  const saved = store[routeKey(route)];
  if (typeof saved !== 'number' || saved <= 0) return; // 0 / 没记过 → 保持默认（顶部）

  let attempts = 0;
  const apply = () => {
    attempts += 1;
    const viewport = findViewport();
    // 内容还没铺开（scrollHeight 不够）时再等一帧；最多等 10 帧，避免死循环
    if (viewport && viewport.scrollHeight - viewport.clientHeight < saved && attempts < 10) {
      requestAnimationFrame(apply);
      return;
    }
    if (viewport) {
      viewport.scrollTop = saved;
      // 平滑滚动动画期间用户可能已经开始操作，直接落位更稳
      viewport.style.scrollBehavior = 'auto';
    }
  };
  requestAnimationFrame(apply);
};

/** 清空记忆（供设置页「重置」或调试用；正常浏览不需要调用） */
export const clearScrollMemory = (): void => {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // 存储不可用时无事可做
  }
};
