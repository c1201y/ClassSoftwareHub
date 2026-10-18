// ════════════════════════════════════════════════════════════════════
// 滚动位置记忆 —— 从详情页退回列表时，列表回到原来的位置
//
// 为什么需要它：本站的滚动不在 window 上，而在各页面的 WinScrollViewer
// 内部容器（.win-scroll-viewer-viewport，见 src/components/WinScrollViewer.vue）。
// vue-router 自带的 scrollBehavior 只会动 window.scrollTo，在这里毫无作用；
// 而 App.vue 的 <router-view> 用 route.fullPath 作 key，每次切换都重建组件，
// 于是「列表 → 详情 → 返回」必然回到顶部。用户要连续看多个软件时，
// 每退一次就得重新往下划一遍（GitHub Issue #117）。
//
// 做法：
//   · 离开页面前（router.beforeEach）把当前滚动位置按路由 key 记下来；
//   · 到达页面后（router.afterEach）把记下的位置恢复回去；
//   · 存 sessionStorage：同标签页内刷新 / 用浏览器前进后退也认，
//     关掉标签页即失效，不会把位置泄漏到下一次访问。
//
// 只认「页面自己的滚动容器」，不碰 window —— 本站没有 window 级滚动，
// 强行同步 window.scrollTo 反而会在某些浏览器里引发地址栏抖动。
// ════════════════════════════════════════════════════════════════════

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

/**
 * 只记本站页面的位置。
 *
 * 首屏渲染前（history 还是 about:blank / 空 hash）路由 name 是空的，
 * 这时记一条 key 为 "" 的记录没有意义，还会让存储里多出一项垃圾。
 * 另外 detail 类路由必须有 id，否则 `download-detail:` 这种残缺 key
 * 会跟所有详情页共用同一个位置。
 */
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

/**
 * 找到目标页面的滚动容器。
 *
 * ⚠️ 必须限定在 .page-view 里找：整页还有另外两个 WinScrollViewer ——
 *    左侧导航窗格本身可滚（win-nav-left-scrollable），以及部分页面嵌套的
 *    二级滚动区。直接 document.querySelector 会先抓到导航窗格那个，
 *    于是记下来 / 恢复上去的都是导航 pane 的位置（Issue #117 首版就这样，
 *    实测同页三个 .win-scroll-viewer-viewport，第一个不是页面内容）。
 *
 * 过渡动画期间新旧两个 .page-view 会同时在 DOM 里（约 300ms），
 * 而 Vue 的 Transition 总是把新节点插在旧节点之后，所以取「最后一个」
 * 就是正在进入的页面；取第一个会拿到已经离开、马上被移除的那个。
 */
const findViewport = (): HTMLElement | null => {
  const views = document.querySelectorAll<HTMLElement>('.page-view');
  if (!views.length) return null;
  const view = views[views.length - 1];
  return view.querySelector<HTMLElement>(SCROLL_VIEWPORT_SELECTOR);
};

/**
 * 记住当前页面的滚动位置（在路由离开前调用）。
 * 位置为 0 时也照样记 —— 用户刻意滚回顶部，返回时就不该被拽回中间。
 */
export const rememberScroll = (route: { name?: unknown; params?: unknown }): void => {
  if (!shouldRemember(route)) return;
  const viewport = findViewport();
  if (!viewport) return;
  const top = Math.round(viewport.scrollTop);
  const store = readStore();
  store[routeKey(route)] = top;
  writeStore(store);
};

/**
 * 恢复目标页面的滚动位置（在路由到达后调用）。
 *
 * 时机是关键：页面是异步组件 + 过渡动画，DOM 要等下一帧才稳定，
 * 而 WinScrollViewer 的 scrollHeight 要等内容布局完才正确 —— 提前设
 * scrollTop 会被浏览器按「内容还不够高」截断，看起来像没恢复。
 * 所以这里连续等两帧，并对最后一次尝试做校验。
 */
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
