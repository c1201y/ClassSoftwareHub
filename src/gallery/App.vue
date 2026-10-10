<template>
  <!-- 应用壳：标题栏 + 左侧 WinUI 导航（首页 / 各分类软件 / 设置） -->
  <WinToolTipService />
  <!-- 欢迎弹窗（进入网站时弹出一次） -->
  <WelcomeDialog v-model:open="welcomeDialogOpen" />
  <!-- 全站搜索结果下拉：贴在标题栏搜索框下方（输入框在标题栏，Ctrl + K / Ctrl + F 聚焦） -->
  <GlobalSearch
    ref="searchRef"
    v-model:open="searchOpen"
    :query="searchQuery"
    :anchor="searchContainerRef" />
  <Teleport to="body">
    <div v-if="isNavigationFrozen" class="gallery-navigation-freeze" aria-hidden="true"></div>
  </Teleport>
  <WinTitleBar
    ref="titleBarRef"
    class="gallery-titlebar"
    :class="{ 'is-uwp-webview': isHostedInUwpWebView, 'is-search-open': searchOpen }"
    :Title="t('app.title')"
    PreferredHeightOption="Tall"
    :IsBackButtonVisible="canGoBack"
    IsPaneToggleButtonVisible
    TitleBarContentHorizontalAlignment="Stretch"
    :IconSource="appIcon"
    @BackRequested="onBackRequested"
    @PaneToggleRequested="onTopBarToggle">
    <!-- 搜索框：标题栏里唯一、可直接输入的真输入框，结果就地下拉
         （软件 / 内置工具 / AI 站点 / 页面），快捷键 Ctrl + K 聚焦 -->
    <div
      ref="searchContainerRef"
      class="gallery-titlebar-search"
      :class="{ 'is-open': searchOpen }"
      @click="onSearchContainerClick">
      <span class="gallery-titlebar-search-icon" aria-hidden="true">&#xE721;</span>
      <input
        ref="searchInputRef"
        class="gallery-titlebar-search-input"
        type="text"
        role="searchbox"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        :value="searchQuery"
        :placeholder="t('search.titlebar')"
        :aria-label="t('text.search')"
        @input="onSearchInput"
        @focus="onSearchFocus"
        @keydown="onSearchKeydown" />
      <button
        v-if="searchQuery"
        type="button"
        class="gallery-titlebar-search-clear"
        :aria-label="t('search.clear')"
        v-bind="{ 'tooltipservice.tooltip': t('search.clear') }"
        @click="clearSearch">
        <span aria-hidden="true">&#xE711;</span>
      </button>
      <span v-else class="gallery-titlebar-search-kbd" aria-hidden="true">Ctrl K</span>
    </div>
  </WinTitleBar>
  <div class="gallery-app-content" :class="{ 'has-titlebar': isHostedInUwpWebView, 'wco-titlebar': !isHostedInUwpWebView }">
    <div class="gallery-nav-host">
      <WinNavigationView
        :SelectedItem="selectedNavigationItem"
        PaneDisplayMode="Auto"
        :MenuItems="navMenuItems"
        :FooterMenuItems="footerMenuItems"
        v-model:IsPaneOpen="isPaneOpen"
        IsBackButtonVisible="Collapsed"
        :IsPaneToggleButtonVisible="false"
        :IsBackEnabled="canGoBack"
        :IsNavigationPending="isNavigationFrozen"
        @ItemInvoked="onNavigationItemInvoked"
        @BackRequested="onBackRequested">
        <router-view v-slot="{ Component }">
          <Transition
            appear
            :enter-active-class="pageTransitionEnter"
            :leave-active-class="pageTransitionLeave">
            <div v-if="Component" :key="route.fullPath" class="page-view active">
              <component :is="Component" />
            </div>
          </Transition>
        </router-view>
      </WinNavigationView>
    </div>
  </div>

  <!-- 数据文件出错提示条（某个软件 JSON 写坏时出现，不影响其它软件） -->
  <div v-if="showDataIssueBanner && dataLoadIssues.length > 0" class="data-issue-banner" role="alert">
    <div class="data-issue-banner-body">
      <span class="data-issue-banner-title">
        ⚠️ 有 {{ dataLoadIssues.length }} 个数据文件没读进来（已自动跳过，其余软件不受影响）：
      </span>
      <ul class="data-issue-banner-list">
        <li v-for="issue in dataLoadIssues" :key="issue.file + issue.message" :title="issue.detail ?? ''">
          <span class="data-issue-file">{{ issue.file }}</span>
          <template v-if="issue.line">第 {{ issue.line }} 行附近：</template>
          {{ issue.message }}
        </li>
      </ul>
    </div>
    <button type="button" class="data-issue-banner-close" aria-label="关闭提示" @click="showDataIssueBanner = false">✕</button>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch, provide, computed, onMounted, onBeforeUnmount } from 'vue';
import type { Ref } from 'vue';
import WinTitleBar from '../components/WinTitleBar.vue';
import WinNavigationView from '../components/WinNavigationView.vue';
import WinToolTipService from '../components/WinToolTipService.vue';
import WelcomeDialog from './WelcomeDialog.vue';
import GlobalSearch from './GlobalSearch.vue';
import { syncHolidayTheme, isHolidaySeason, type HolidayTheme } from './holidayTheme';
import { appIconUrl } from './appIcons';
import { trackVisit, hasTracked } from './visitor';
import appIcon from '../assets/AppIcon.ico';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from '../components/i18n/index';
import { apps, categories, dataLoadIssues } from './data';
import {
  DefaultNavigationTransitionInfo,
  NavigationTrigger_NavigatingAway,
  NavigationTrigger_NavigatingTo,
  getNavigationTransitionInfoClassName
} from '../utils/navigationTransitionInfo';

const { t } = useI18n();
// 数据文件出错提示条：默认显示，可点 ✕ 关闭
const showDataIssueBanner = ref(true);

// ── 设置项（读写 localStorage，供 SettingsPage 修改）──────────────────
// 读写必须整段包 try/catch：浏览器禁用存储时（关闭 Cookie、无痕模式、部分 WebView），
// localStorage.setItem 会抛 QuotaExceededError；persistSetting 带 { immediate: true }
// 在 setup 阶段同步执行，异常会中断整个应用壳的初始化。
const readStoredSetting = (key: string, fallback: string, allowedValues: string[]) => {
  try {
    const value = localStorage.getItem(key);
    return allowedValues.includes(value as string) ? (value as string) : fallback;
  } catch {
    // 存储不可用时返回默认值，仅当次不保留用户选择
    return fallback;
  }
};
const persistSetting = (key: string, source: Ref<string>) => {
  watch(source, (value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // 隐私模式、配额已满或存储被禁时写入失败：忽略错误，设置当次仍生效
    }
  }, { immediate: true });
};

const route = useRoute();
const router = useRouter();
const currentPage = computed(() => (typeof route.name === 'string' ? route.name : 'home'));
// 欢迎弹窗：进入网站（初始落在首页）时弹出一次；#/download/xxx 等直达链接不弹
const welcomeDialogOpen = ref(false);
router.isReady().then(() => {
  if (currentPage.value === 'home') welcomeDialogOpen.value = true;
}).catch(() => {});

// ── 全站搜索（标题栏真输入框 + 就地下拉；Ctrl + K / Ctrl + F 聚焦；匹配逻辑见 searchIndex.ts）──
const titleBarRef = ref<{ isCompact?: boolean; isNarrow?: boolean } | null>(null);
/** 搜索下拉组件句柄：标题栏输入框的 ↑↓ / Enter 转发给它 */
const searchRef = ref<{
  moveActive: (step: number) => void;
  activateActive: () => boolean;
} | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
/** 搜索框容器（输入框 + 图标 + 清空按钮外包的那块）：下拉面板锚定到它，
 *  这样面板左右边缘与搜索框对齐，而不是锚定到被内缩的输入框。 */
const searchContainerRef = ref<HTMLElement | null>(null);
const searchQuery = ref('');
const searchOpen = ref(false);

const openSearch = () => {
  searchOpen.value = true;
};
const onSearchFocus = () => openSearch();
// 点容器任意处（放大镜图标 / 内边距）都聚焦到输入框
const onSearchContainerClick = () => searchInputRef.value?.focus();
const onSearchInput = (event: Event) => {
  searchQuery.value = (event.target as HTMLInputElement).value;
  searchOpen.value = true;
};
const clearSearch = () => {
  searchQuery.value = '';
  searchInputRef.value?.focus();
  openSearch();
};
const onSearchKeydown = (event: KeyboardEvent) => {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      searchRef.value?.moveActive(1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      searchRef.value?.moveActive(-1);
      break;
    case 'Enter':
      // 有选中项时打开并拦截回车；无结果时不拦截
      if (searchRef.value?.activateActive()) event.preventDefault();
      break;
    case 'Escape':
      event.preventDefault();
      searchOpen.value = false;
      searchInputRef.value?.blur();
      break;
    default:
      break;
  }
};
// 下拉关闭后清空关键词并收回焦点，下次点进来回到「页面快捷入口」的初始状态
watch(searchOpen, (open) => {
  if (open) return;
  if (searchQuery.value) searchQuery.value = '';
  searchInputRef.value?.blur();
});
const onWindowKeydown = (event: KeyboardEvent) => {
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && (key === 'k' || key === 'f')) {
    event.preventDefault();
    searchInputRef.value?.focus();
    searchInputRef.value?.select();
    openSearch();
    return;
  }
  if (key === 'escape' && searchOpen.value) {
    searchOpen.value = false;
  }
};
// 导航窗格固定左侧停靠（“导航窗格位置”设置项已按需求移除；Auto = 宽屏展开在左，窄屏收为汉堡按钮）
const isPaneOpen = ref(true);
const themeSetting = ref(readStoredSetting('winui-theme-setting', 'system', ['system', 'light', 'dark']));
const materialSetting = ref(readStoredSetting('winui-material-setting', 'mica', ['mica', 'acrylic']));

// ── 节日皮肤（补丁模块，见 ./holidayTheme.ts）────────────────────────
// 规则：暗色模式 → 中秋主题（青 + 中秋海报）；亮色模式 → 国庆主题（红 + 国庆海报）。
// 开关默认值取决于是否在档期内（档期内默认开启，档期外默认关闭）；用户手动修改后以用户设置为准。
// 关闭后同时移除背景海报与节日配色，恢复默认主题色。
// 读取同样需要 try/catch 兜底：存储被禁时此处也在 setup 阶段执行，异常同样会白屏
const storedHolidaySkin = (() => {
  try {
    return localStorage.getItem('winui-holiday-skin');
  } catch {
    return null;
  }
})();
const holidaySkinEnabled = ref(storedHolidaySkin ? storedHolidaySkin === 'on' : isHolidaySeason());
const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
const systemDark = ref(systemThemeQuery.matches);
// 当前实际是不是深色：用户显式选的优先，否则跟随系统
const isDarkMode = computed(() => {
  const setting = themeSetting.value;
  if (setting === 'dark') return true;
  if (setting === 'light') return false;
  return systemDark.value;
});
const activeHoliday = ref<HolidayTheme | null>(null);
const refreshActiveHoliday = () => {
  activeHoliday.value = syncHolidayTheme(holidaySkinEnabled.value, isDarkMode.value);
};
// 深浅色切换时换对应节日皮肤；用户切换开关时刷新并持久化其选择。
// 持久化不能写在深浅色变化的 watch 里，否则仅切换主题也会被记成手动开关，
// 覆盖档期的默认值。
watch(isDarkMode, refreshActiveHoliday);
watch(holidaySkinEnabled, (enabled) => {
  refreshActiveHoliday();
  try {
    localStorage.setItem('winui-holiday-skin', enabled ? 'on' : 'off');
  } catch {
    // 同上：写入失败时仅当次生效，不影响节日皮肤的显示
  }
});
refreshActiveHoliday();
provide('holidaySkinEnabled', holidaySkinEnabled);
provide('activeHoliday', activeHoliday);
// ── 界面动画 ─────────────────────────────────────────────────────
// 按需求约定：动画常驻开启，不提供开关。组件 CSS 不编写 prefers-reduced-motion
// 降级分支，即使系统开启“减少动态效果”，本站动画仍照常播放。

// 页面过渡固定使用默认动画（“页面过渡”设置项已按需求移除）
const navigationTransitionInfo = DefaultNavigationTransitionInfo;
const pageTransitionEnter = ref(getNavigationTransitionInfoClassName(navigationTransitionInfo, NavigationTrigger_NavigatingTo));
const pageTransitionLeave = ref(getNavigationTransitionInfoClassName(navigationTransitionInfo, NavigationTrigger_NavigatingAway));
const isHostedInUwpWebView = ref(
  typeof window !== 'undefined' && Boolean((window as unknown as { __WINUI_ON_WEB_UWP_APP__?: boolean }).__WINUI_ON_WEB_UWP_APP__)
);
const canGoBack = ref(Boolean(router.options.history.state?.back));
const isNavigationFrozen = ref(false);
let navigationReleaseSequence = 0;
let navigationReleaseFrame: number | null = null;

// ── 页面切换期间冻结导航（防止连点）──────────────────────────────────
const freezeNavigation = () => {
  navigationReleaseSequence += 1;
  if (navigationReleaseFrame) cancelAnimationFrame(navigationReleaseFrame);
  navigationReleaseFrame = null;
  isNavigationFrozen.value = true;
};
const releaseNavigation = () => {
  const sequence = ++navigationReleaseSequence;
  if (navigationReleaseFrame) cancelAnimationFrame(navigationReleaseFrame);
  void nextTick(() => {
    navigationReleaseFrame = requestAnimationFrame(() => {
      if (sequence === navigationReleaseSequence) {
        isNavigationFrozen.value = false;
        navigationReleaseFrame = null;
      }
    });
  });
};
const syncNavigationFreezeState = (frozen: boolean) => {
  const appRoot = document.getElementById('app');
  if (!appRoot) return;
  appRoot.toggleAttribute('inert', frozen);
  if (frozen) appRoot.setAttribute('aria-busy', 'true');
  else appRoot.removeAttribute('aria-busy');
};
watch(isNavigationFrozen, syncNavigationFreezeState, { flush: 'post' });
const removeNavigationBeforeEach = router.beforeEach(() => {
  freezeNavigation();
});
const removeNavigationAfterEach = router.afterEach((to, from, failure) => {
  if (failure) {
    releaseNavigation();
    return;
  }
  const historyState = router.options.history.state;
  canGoBack.value = Boolean(historyState?.back);
  releaseNavigation();
});
const removeNavigationErrorHandler = router.onError(() => releaseNavigation());
// ── 访问量统计：每次路由切换上报一次（含首屏），覆盖全站所有页面 ────────
// 计数动作放在应用根组件，而非设置页组件 —— 否则只有打开设置页才会累加访问量。
// 去重键 = 路由名 + 详情页 id：`/` 会重定向到 `/home`，按路径去重会被算成两页。
const visitKey = (r: { name?: unknown; params?: unknown }) => {
  const name = typeof r.name === 'string' ? r.name : '';
  const params = (r.params ?? {}) as Record<string, unknown>;
  const id = String(params.id ?? '');
  return id ? `${name}:${id}` : name;
};
const removeVisitTrackingAfterEach = router.afterEach((to, _from, failure) => {
  if (!failure) trackVisit(visitKey(to), to.fullPath);
});

provide('themeSetting', themeSetting);
provide('materialSetting', materialSetting);
provide('currentPage', currentPage);
provide('isHostedInUwpWebView', isHostedInUwpWebView);

// ── 导航菜单：首页 + 每个分类（分类下挂该分类的软件）────────────────
interface NavItem {
  Tag: string;
  Content: string;
  Icon?: string;
  SelectsOnInvoked?: boolean;
  MenuItems?: NavItem[];
}

const pageTags = new Set(['home', 'settings', 'submit', 'tools', 'ai', 'feedback']);

// ── 底部导航：AI 导航 + 内置工具 + 提交软件 + 反馈中心 ──────────────
// 反馈中心与「提交软件」同属用户操作类入口，不是浏览内容的入口；
// 与分类菜单混排会被误认为又一个软件分类，因此归入 Footer。
const footerMenuItems = computed<NavItem[]>(() => [
  // 图标 E99A(Robot)：AI 导航
  { Tag: 'ai', Icon: '\uE99A', Content: 'AI 导航' },
  // 图标用 EC7A(DeveloperTools)：E90F(Repair) 与左侧「系统工具」分类图标重复
  { Tag: 'tools', Icon: '\uEC7A', Content: '内置工具' },
  { Tag: 'submit', Icon: '\uE11C', Content: t('nav.submit') },
  // 图标 E7BA(警告三角)：反馈中心。SEGOEICONS.TTF 是重映射过的子集，
  // 码点与标准 Segoe MDL2 不同，E7BA 实测对应警告三角（见 src/gallery/feedback.ts）
  { Tag: 'feedback', Icon: '\uE7BA', Content: t('nav.feedback') }
]);

const navMenuItems = computed<NavItem[]>(() => [
  { Tag: 'home', Icon: '\uE80F', Content: t('nav.home') },
  ...categories.map((category) => ({
    Tag: `category:${category.key}`,
    Icon: category.icon,
    Content: category.name,
    SelectsOnInvoked: false,
    MenuItems: apps
      .filter((app) => app.category === category.key)
      // 图标走 appIconUrl（本地 64px 优先，无本地文件时回退数据里的外链），
      // 与首页卡片、详情页保持一致；直接使用 app.icon 会使本地兜底在导航栏不生效，
      // 导致同一软件在不同位置的图标来源不一致。
      .map((app) => ({ Tag: `app:${app.id}`, Content: app.name, Icon: appIconUrl(app) }))
  }))
]);

const selectedNavigationItem = computed<NavItem | null>({
  get: () => {
    if (currentPage.value === 'settings') {
      return { Tag: 'settings', Content: t('text.settings'), Icon: '\uE713' };
    }
    if (currentPage.value === 'download-detail') {
      const appId = String(route.params.id ?? '');
      for (const item of navMenuItems.value) {
        const child = item.MenuItems?.find((entry) => entry.Tag === `app:${appId}`);
        if (child) return child;
      }
    }
    if (currentPage.value === 'home') return navMenuItems.value[0] ?? null;
    // 内置工具及其所有子工具页（tool-xxx）→ 高亮 Footer 里的「内置工具」
    if (currentPage.value === 'tools' || (currentPage.value ?? '').startsWith('tool-')) {
      return footerMenuItems.value.find((item) => item.Tag === 'tools') ?? null;
    }
    if (currentPage.value === 'ai') return footerMenuItems.value.find((item) => item.Tag === 'ai') ?? null;
    if (currentPage.value === 'submit') return footerMenuItems.value.find((item) => item.Tag === 'submit') ?? null;
    if (currentPage.value === 'feedback') return footerMenuItems.value.find((item) => item.Tag === 'feedback') ?? null;
    return null;
  },
  set: (item) => {
    if (item?.Tag) void navigate(item.Tag);
  }
});

// ── 导航执行 ────────────────────────────────────────────────────────
const navigateToRoute = async (location: Parameters<typeof router.push>[0], prepareTransition: (() => void) | null = null) => {
  if (isNavigationFrozen.value) return false;
  let target;
  try {
    target = router.resolve(location);
  } catch (error) {
    console.error('Unable to resolve navigation target.', error);
    return false;
  }
  if (target.fullPath === route.fullPath) return false;

  const previousTransition = {
    enter: pageTransitionEnter.value,
    leave: pageTransitionLeave.value
  };
  prepareTransition?.();
  freezeNavigation();
  try {
    const failure = await router.push(location);
    if (failure) {
      pageTransitionEnter.value = previousTransition.enter;
      pageTransitionLeave.value = previousTransition.leave;
      return false;
    }
    return true;
  } catch (error) {
    pageTransitionEnter.value = previousTransition.enter;
    pageTransitionLeave.value = previousTransition.leave;
    console.error('Navigation failed.', error);
    return false;
  } finally {
    releaseNavigation();
  }
};

/** tag 约定：home / settings / submit = 页面；app:<id> = 软件详情 */
const navigate = async (tag: string) => {
  if (!tag) return false;
  if (pageTags.has(tag)) {
    if (tag === currentPage.value) return false;
    return navigateToRoute({ name: tag });
  }
  if (tag.startsWith('app:')) {
    const id = tag.slice(4);
    if (currentPage.value === 'download-detail' && String(route.params.id ?? '') === id) return false;
    return navigateToRoute({ name: 'download-detail', params: { id } });
  }
  return false;
};
provide('navigate', navigate);

const onNavigationItemInvoked = (args: { InvokedItemContainer?: NavItem | null }) => {
  const item = args?.InvokedItemContainer;
  if (!item || item.SelectsOnInvoked === false) return;
  if (item.Tag) void navigate(item.Tag);
};
const onBackRequested = () => {
  if (!canGoBack.value || isNavigationFrozen.value) return;
  freezeNavigation();
  router.back();
};
const onTopBarToggle = () => {
  isPaneOpen.value = !isPaneOpen.value;
};

// ── 主题 / 配色 ─────────────────────────────────────────────────────
function applyTheme(mode: string) {
  const html = document.documentElement;
  html.classList.remove('theme-light', 'theme-dark');
  if (mode === 'light') html.classList.add('theme-light');
  else if (mode === 'dark') html.classList.add('theme-dark');
}
watch(themeSetting, (val) => applyTheme(val), { immediate: true });
persistSetting('winui-theme-setting', themeSetting);
persistSetting('winui-material-setting', materialSetting);

const updateThemeColor = () => {
  const color = isDarkMode.value ? '#202020' : '#f3f3f3';
  let meta: HTMLMetaElement | null = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', color);
};
// 系统深浅色变化 → systemDark 变 → isDarkMode 变 → 节日皮肤 / 主题色一起刷新
const onSystemThemeChange = () => {
  systemDark.value = systemThemeQuery.matches;
};
watch(isDarkMode, () => updateThemeColor(), { immediate: true });
systemThemeQuery.addEventListener('change', onSystemThemeChange);

function postUwpSetting(key: string, value: string) {
  if (!isHostedInUwpWebView.value) return;
  const chromeWebView = (window as unknown as { chrome?: { webview?: { postMessage?: (msg: unknown) => void } } }).chrome?.webview;
  if (!chromeWebView?.postMessage) return;
  chromeWebView.postMessage({
    source: 'WinUIonWeb',
    type: 'appSettingChanged',
    key,
    value
  });
}

onMounted(() => {
  isHostedInUwpWebView.value = Boolean(
    (window as unknown as { __WINUI_ON_WEB_UWP_APP__?: boolean }).__WINUI_ON_WEB_UWP_APP__
  );
  // 首屏兜底：路由 afterEach 通常已上报；若极端情况下没报，等路由解析完再补一次。
  // 用 setTimeout 延后，确保此时路由已解析（否则 route.name 为空会和真实 key 对不上、重复计数）。
  window.setTimeout(() => {
    if (hasTracked()) return;
    const current = router.currentRoute.value;
    trackVisit(visitKey(current), current.fullPath);
  }, 300);
  syncNavigationFreezeState(isNavigationFrozen.value);
  postUwpSetting('theme', themeSetting.value);
  postUwpSetting('material', materialSetting.value);
  // 搜索快捷键：Ctrl + K（也支持 Ctrl + F）打开全站搜索面板
  window.addEventListener('keydown', onWindowKeydown);
});

onBeforeUnmount(() => {
  if (navigationReleaseFrame) cancelAnimationFrame(navigationReleaseFrame);
  removeNavigationBeforeEach();
  removeNavigationAfterEach();
  removeNavigationErrorHandler();
  removeVisitTrackingAfterEach();
  document.getElementById('app')?.removeAttribute('inert');
  document.getElementById('app')?.removeAttribute('aria-busy');
  systemThemeQuery.removeEventListener('change', onSystemThemeChange);
  window.removeEventListener('keydown', onWindowKeydown);
});

watch(themeSetting, (value) => postUwpSetting('theme', value));
watch(materialSetting, (value) => postUwpSetting('material', value));
</script>

<style>
  @import '../styles/theme.css';
  @import '../styles/animations.css';
  /* 节日皮肤主题色（补丁样式，须排在 theme.css 之后） */
  @import '../styles/holiday.css';

  /* 页面切换期间的全屏“忙”遮罩，防止连点 */
  .gallery-navigation-freeze {
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    cursor: progress;
    touch-action: none;
  }

  .gallery-app-content {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .gallery-nav-host {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    display: flex;
  }

  .gallery-nav-host > .win-nav-shell {
    width: 100%;
    height: 100%;
  }

  .gallery-app-content.has-titlebar {
    /* WebView2 宿主：标题栏由原生窗口提供 */
    --gallery-titlebar-height: max(env(titlebar-area-height, 0px), 46px);
    height: calc(100% - var(--gallery-titlebar-height));
    margin-top: var(--gallery-titlebar-height);
  }

  .gallery-app-content.wco-titlebar {
    box-sizing: border-box;
    padding-top: max(env(titlebar-area-height, 0px), 48px);
  }

  /* UWP WebView 宿主不暴露标题栏右侧按钮内边距，保留标准 138px */
  .gallery-titlebar.is-uwp-webview {
    --TitleBarRightPaddingWidth: 138px;
  }

  /* ── 标题栏搜索框（可直接输入，结果就地弹出下拉；窄标题栏收成放大镜）────── */
  .gallery-titlebar-search {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 auto;
    width: 100%;
    max-width: 350px;
    min-width: 0;
    height: 30px;
    margin: 0 8px 0 0;
    padding: 0 8px 0 10px;
    border: 1px solid var(--ctrl-border, rgba(0, 0, 0, 0.06));
    border-bottom-color: var(--ctrl-strong-stroke, rgba(0, 0, 0, 0.45));
    border-radius: var(--ControlCornerRadius, 4px);
    background: var(--ctrl-fill-default, rgba(255, 255, 255, 0.7));
    color: var(--text-primary);
    font-family: inherit;
    font-size: 13px;
    cursor: text;
    transition: background var(--fast-duration, 150ms) linear,
      border-color var(--fast-duration, 150ms) linear,
      width var(--normal-duration, 200ms) var(--fast-out-slow-in, cubic-bezier(0, 0, 0, 1)),
      height var(--normal-duration, 200ms) var(--fast-out-slow-in, cubic-bezier(0, 0, 0, 1)),
      max-width var(--normal-duration, 200ms) var(--fast-out-slow-in, cubic-bezier(0, 0, 0, 1)),
      margin var(--normal-duration, 200ms) var(--fast-out-slow-in, cubic-bezier(0, 0, 0, 1)),
      padding var(--normal-duration, 200ms) var(--fast-out-slow-in, cubic-bezier(0, 0, 0, 1));
  }

  .gallery-titlebar-search:hover {
    background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.04));
  }

  /* 聚焦 / 下拉打开时用强调色描边，明确“正在搜索” */
  .gallery-titlebar-search.is-open {
    border-color: var(--accent-base, #0067C0);
    border-bottom-color: var(--accent-base, #0067C0);
  }

  .gallery-titlebar-search-icon {
    flex: 0 0 auto;
    font-family: var(--SymbolThemeFontFamily, 'WinUIOnWebIcons');
    font-size: 13px;
    line-height: 1;
    color: var(--text-secondary);
  }

  /* 输入框：铺满剩余空间，去除浏览器默认外观 */
  .gallery-titlebar-search-input {
    flex: 1 1 auto;
    min-width: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 13px;
    cursor: text;
  }

  .gallery-titlebar-search-input::placeholder {
    color: var(--text-secondary);
  }

  /* 有内容时的“清空”按钮 */
  .gallery-titlebar-search-clear {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--SymbolThemeFontFamily, 'WinUIOnWebIcons');
    font-size: 11px;
    cursor: pointer;
  }

  .gallery-titlebar-search-clear:hover {
    background: var(--subtle-secondary);
    color: var(--text-primary);
  }

  /* 快捷键提示标签 */
  .gallery-titlebar-search-kbd {
    flex: 0 0 auto;
    padding: 1px 5px;
    border: 1px solid var(--ctrl-border, rgba(0, 0, 0, 0.12));
    border-radius: 4px;
    background: var(--subtle-secondary);
    color: var(--text-tertiary, var(--text-secondary));
    font-size: 10px;
    line-height: 14px;
  }

  /* 标题栏实际宽度过窄 / 内容放不下时（WinTitleBar 按自身宽度打 is-narrow/is-compact
     标记，不依赖视口媒体查询，PWA/WebView2 下同样生效）收成 40px 的图标按钮 */
  .gallery-titlebar.is-narrow .gallery-titlebar-search,
  .gallery-titlebar.is-compact .gallery-titlebar-search {
    position: relative;
    flex: 0 0 40px !important;
    width: 40px;
    max-width: 40px;
    height: 40px;
    margin: 2px;
    padding: 0;
    justify-content: center;
    border-color: transparent;
    background: var(--TitleBarBackButtonBackground, transparent);
  }

  /* 收成图标时：输入框透明铺满整块，点击任意位置均可聚焦 */
  .gallery-titlebar.is-narrow .gallery-titlebar-search-input,
  .gallery-titlebar.is-compact .gallery-titlebar-search-input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    transition: opacity var(--faster-duration, 83ms) linear;
  }

  .gallery-titlebar.is-narrow .gallery-titlebar-search-kbd,
  .gallery-titlebar.is-compact .gallery-titlebar-search-kbd,
  .gallery-titlebar.is-narrow .gallery-titlebar-search-clear,
  .gallery-titlebar.is-compact .gallery-titlebar-search-clear {
    display: none;
  }

  .gallery-titlebar.is-narrow .gallery-titlebar-search:hover,
  .gallery-titlebar.is-compact .gallery-titlebar-search:hover {
    background: var(--TitleBarBackButtonBackgroundPointerOver, var(--subtle-secondary));
  }

  /* 聚焦 / 打开后，图标态展开回正常搜索框 */
  /* 展开态：脱离布局流，absolute 相对标题栏锚定右缘（与放大镜原位重合，无跳变），
     宽度从 40px 平滑向左展开并覆盖标题区；每帧只重排自身，移动端不卡顿。 */
  .gallery-titlebar.is-narrow .gallery-titlebar-search.is-open,
  .gallery-titlebar.is-compact .gallery-titlebar-search.is-open {
    position: absolute;
    top: 50%;
    right: 12px;
    transform: translateY(-50%);
    width: calc(100% - 24px);
    max-width: none;
    flex: none !important;
    height: 40px;
    margin: 0;
    padding: 0 8px 0 12px;
    justify-content: flex-start;
    border-color: var(--accent-base, #0067C0);
    background: var(--flyout-bg, rgba(252, 252, 252, 0.92));
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    z-index: 10;
    transition: width 250ms var(--fast-out-slow-in, cubic-bezier(0, 0, 0, 1)),
      background var(--fast-duration, 150ms) linear,
      border-color var(--fast-duration, 150ms) linear;
  }

  /* 展开后恢复清空按钮（图标态被隐藏）；kbd 快捷键提示在触屏无意义，保持隐藏 */
  .gallery-titlebar.is-narrow .gallery-titlebar-search.is-open .gallery-titlebar-search-clear,
  .gallery-titlebar.is-compact .gallery-titlebar-search.is-open .gallery-titlebar-search-clear {
    display: flex;
  }

  .gallery-titlebar.is-narrow .gallery-titlebar-search.is-open .gallery-titlebar-search-input,
  .gallery-titlebar.is-compact .gallery-titlebar-search.is-open .gallery-titlebar-search-input {
    position: static;
    opacity: 1;
    cursor: text;
    transition: opacity var(--fast-duration, 150ms) linear 100ms;
  }

  /* 展开时隐藏标题文字：窄标题栏下标题会挤占搜索框宽度，导致输入区只剩一小条 */
  .gallery-titlebar.is-search-open.is-narrow .win-titlebar-title,
  .gallery-titlebar.is-search-open.is-compact .win-titlebar-title {
    display: none;
  }

  /* 窄标题栏时内容列左对齐，让搜索按钮紧跟标题 */
  .gallery-titlebar.is-narrow .win-titlebar-content,
  .gallery-titlebar.is-compact .win-titlebar-content {
    justify-content: flex-start;
    padding: var(--TitleBarCompactContentMargin, 0 16px 0 0);
  }

  @font-face {
    font-family: 'WinUIOnWebIcons';
    src: url('../assets/Fonts/SEGOEICONS.TTF') format('truetype');
    font-display: block;
  }

  body .icon,
  body .icon-btn,
  body .ptr-icon-wrapper,
  body .symbol-icon,
  body .win-symbol-icon,
  body .win-asb-icon,
  body .picker-icon,
  body .checkbox-glyph,
  body .win-combo-chevron,
  body .win-cbf-icon,
  body .win-cbf-overflow-icon,
  body .win-expander-header-icon,
  body .win-expander-arrow,
  body .infobadge-icon,
  body .close-icon,
  body .win-menu-flyout-icon,
  body .win-menu-flyout-check,
  body .win-menu-flyout-check-placeholder,
  body .win-menu-flyout-chevron,
  body .win-number-spin-button span,
  body .win-number-compact-indicator span,
  body .win-number-popup-button span,
  body .win-password-reveal span,
  body .win-rating-glyph,
  body .scrollbar-button,
  body .win-settings-card-icon,
  body .win-settings-card-action-icon,
  body .win-teaching-tip-icon,
  body .win-teaching-tip-close,
  body .win-textbox-delete-glyph,
  body .font-icon,
  body .icon-glyph,
  body .icon-preview-glyph,
  body .group-icon,
  body .tree-icon {
    font-family: 'WinUIOnWebIcons';
  }

  .page-view {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    flex: 1 1 auto;
    overflow: hidden;
  }

  .page-view.active {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    gap: 4px;
  }

  .page-view.active > .gallery-page-scroll,
  .page-view.active > .gallery-home-scroll {
    flex: 1 1 auto;
    min-height: 0;
  }

  .win-nav-content-inner {
    position: relative;
  }

  /* ── 数据文件出错提示条（某软件 JSON 写坏时置顶显示）────────────── */
  .data-issue-banner {
    position: fixed;
    top: calc(var(--gallery-titlebar-height, 46px) + 8px);
    left: 12px;
    right: 12px;
    z-index: 99;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 12px;
    border-radius: 8px;
    background: #c42b1c;
    color: #fff;
    font-size: 13px;
    line-height: 1.5;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
    max-height: 46vh;
    overflow: auto;
  }
  .data-issue-banner-body {
    flex: 1 1 auto;
    min-width: 0;
  }
  .data-issue-banner-title {
    font-weight: 600;
  }
  .data-issue-banner-list {
    margin: 6px 0 0;
    padding-left: 18px;
  }
  .data-issue-banner-list li {
    margin: 2px 0;
    word-break: break-all;
  }
  .data-issue-file {
    font-family: Consolas, 'Courier New', monospace;
    font-weight: 600;
    background: rgba(255, 255, 255, 0.22);
    border-radius: 4px;
    padding: 0 5px;
    margin-right: 4px;
  }
  .data-issue-banner-close {
    flex: 0 0 auto;
    border: none;
    background: transparent;
    color: #fff;
    font-size: 14px;
    line-height: 1;
    padding: 4px 6px;
    border-radius: 4px;
    cursor: pointer;
  }
  .data-issue-banner-close:hover {
    background: rgba(255, 255, 255, 0.25);
  }
</style>
