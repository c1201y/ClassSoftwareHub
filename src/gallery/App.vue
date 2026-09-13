<template>
  <!-- 应用壳：标题栏 + 左侧 WinUI 导航（首页 / 各分类软件 / 设置） -->
  <WinToolTipService />
  <!-- 欢迎弹窗（进入网站时弹出一次） -->
  <WelcomeDialog v-model:open="welcomeDialogOpen" />
  <Teleport to="body">
    <div v-if="isNavigationFrozen" class="gallery-navigation-freeze" aria-hidden="true"></div>
  </Teleport>
  <!-- 窄标题栏（放不下搜索框）时点放大镜弹出的搜索框 -->
  <Teleport to="body">
    <div
      v-if="compactSearchOpen"
      ref="compactSearchRef"
      class="gallery-compact-search-popup"
      role="search">
      <WinAutoSuggestBox
        ref="compactSearchBoxRef"
        v-model:Text="searchQuery"
        :ItemsSource="searchResults"
        TextMemberPath="title"
        :PlaceholderText="t('search.placeholder')"
        QueryIcon="Find"
        :OpenOnFocus="false"
        :UpdateTextOnSelect="false"
        class="gallery-compact-search"
        @QuerySubmitted="onSearchQuerySubmitted" />
    </div>
  </Teleport>
  <WinTitleBar
    ref="titleBarRef"
    class="gallery-titlebar"
    :class="{ 'is-uwp-webview': isHostedInUwpWebView }"
    :Title="t('app.title')"
    PreferredHeightOption="Tall"
    :IsBackButtonVisible="canGoBack"
    IsPaneToggleButtonVisible
    TitleBarContentHorizontalAlignment="Stretch"
    :IconSource="appIcon"
    @BackRequested="onBackRequested"
    @PaneToggleRequested="onTopBarToggle">
    <!-- 标题栏搜索框：搜索范围 = 软件名称/简介/详细介绍；窄窗口自动收成右侧放大镜按钮 -->
    <WinAutoSuggestBox
      ref="searchBoxRef"
      v-model:Text="searchQuery"
      :ItemsSource="searchResults"
      TextMemberPath="title"
      :PlaceholderText="t('search.placeholder')"
      QueryIcon="Find"
      :OpenOnFocus="false"
      :UpdateTextOnSelect="false"
      class="gallery-titlebar-search"
      @QuerySubmitted="onSearchQuerySubmitted" />
    <button
      type="button"
      class="gallery-titlebar-search-button"
      :aria-label="t('text.search')"
      v-bind="{ 'tooltipservice.tooltip': t('text.search') }"
      @click="onCompactSearchButtonClick">
      <span class="gallery-titlebar-search-button-icon" aria-hidden="true">&#xE721;</span>
    </button>
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
import WinAutoSuggestBox from '../components/WinAutoSuggestBox.vue';
import WinToolTipService from '../components/WinToolTipService.vue';
import WelcomeDialog from './WelcomeDialog.vue';
import { syncHolidayTheme, isHolidaySeason, type HolidayTheme } from './holidayTheme';
import appIcon from '../assets/AppIcon.ico';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from '../components/i18n/index';
import { apps, categories, dataLoadIssues } from './data';
import { searchSoftware } from './searchIndex';
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
const readStoredSetting = (key: string, fallback: string, allowedValues: string[]) => {
  const value = localStorage.getItem(key);
  return allowedValues.includes(value as string) ? (value as string) : fallback;
};
const persistSetting = (key: string, source: Ref<string>) => {
  watch(source, (value) => {
    localStorage.setItem(key, value);
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

// ── 标题栏搜索框（范围 = 名称/简介/详细介绍，见 searchIndex.ts）─────────
interface SearchSuggestion {
  title: string;
  id: string;
  noResults?: boolean;
  [key: string]: unknown;
}
type AsbChosenSuggestion = string | number | Record<string, unknown> | null;
const titleBarRef = ref<{ isCompact?: boolean; isNarrow?: boolean } | null>(null);
const searchBoxRef = ref<{ $el?: HTMLElement } | null>(null);
const compactSearchBoxRef = ref<{ $el?: HTMLElement } | null>(null);
const compactSearchRef = ref<HTMLElement | null>(null);
const compactSearchOpen = ref(false);
const searchQuery = ref('');
const titlebarCompact = computed(() => Boolean(titleBarRef.value?.isCompact));
const titlebarNarrow = computed(() => Boolean(titleBarRef.value?.isNarrow));
const searchResults = computed<SearchSuggestion[]>(() => {
  const query = searchQuery.value.trim();
  if (!query) return [];
  const hits = searchSoftware(query);
  if (hits.length === 0) {
    return [{ title: t('search.no-results', { query }), id: '', noResults: true }];
  }
  return hits.map((hit) => ({
    title: `${hit.name}（${
      hit.source === 'name' ? t('search.source-name') : t('search.source-intro')
    }）`,
    id: hit.id
  }));
});
/** 点选项 / 回车：跳到该软件详情页（成功跳转后清空搜索词） */
const onSearchQuerySubmitted = (args: { QueryText: string; ChosenSuggestion: AsbChosenSuggestion }) => {
  compactSearchOpen.value = false;
  const query = String(args.QueryText ?? '').trim();
  if (!query) return;
  const chosen = args.ChosenSuggestion;
  const chosenId = chosen !== null && typeof chosen === 'object'
    ? String((chosen as { id?: unknown }).id ?? '')
    : '';
  const targetId = chosenId || searchSoftware(query)[0]?.id;
  if (!targetId) return;
  void navigateToRoute({ name: 'download-detail', params: { id: targetId } }).then((ok) => {
    if (ok) searchQuery.value = '';
  });
};
const onCompactSearchButtonClick = () => {
  compactSearchOpen.value = !compactSearchOpen.value;
  if (compactSearchOpen.value) {
    void nextTick(() => {
      compactSearchRef.value?.querySelector('input')?.focus({ preventScroll: true });
    });
  }
};
const onDocumentPointerDownForCompactSearch = (event: PointerEvent) => {
  const target = event.target as Node | null;
  if (target instanceof Element && target.closest?.('.gallery-titlebar-search-button')) return;
  if (!compactSearchOpen.value) return;
  if (compactSearchRef.value?.contains(target)) return;
  if (target instanceof Element && target.closest?.('.win-asb-popup, .win-menu-flyout-wrap')) return;
  // 先让选项的点击事件跑完，再收起弹出框（否则点击会先被吞掉）
  window.setTimeout(() => {
    compactSearchOpen.value = false;
  }, 0);
};
const onDocumentKeydownForCompactSearch = (event: KeyboardEvent) => {
  if (event.key === 'Escape') compactSearchOpen.value = false;
};
const onWindowBlurForCompactSearch = () => {
  compactSearchOpen.value = false;
};
const focusSearchBox = () => {
  if (titlebarNarrow.value || titlebarCompact.value) {
    if (!compactSearchOpen.value) compactSearchOpen.value = true;
    void nextTick(() => {
      compactSearchRef.value?.querySelector('input')?.focus({ preventScroll: true });
    });
  } else {
    searchBoxRef.value?.$el?.querySelector('input')?.focus({ preventScroll: true });
  }
};
const onWindowKeydown = (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    focusSearchBox();
  }
};
const onWindowResize = () => {
  void nextTick(() => {
    const titleBarElement = (titleBarRef.value as { $el?: HTMLElement } | null)?.$el;
    const searchElement = titleBarElement?.querySelector('.gallery-titlebar-search');
    const searchVisible = searchElement && getComputedStyle(searchElement).display !== 'none';
    if ((!titlebarNarrow.value && !titlebarCompact.value) || searchVisible) {
      compactSearchOpen.value = false;
    }
  });
};
// 导航窗格固定左侧停靠（已按需求砍掉“导航窗格位置”设置项；Auto = 宽屏展开在左，窄屏收成左侧汉堡）
const isPaneOpen = ref(true);
const themeSetting = ref(readStoredSetting('winui-theme-setting', 'system', ['system', 'light', 'dark']));
const materialSetting = ref(readStoredSetting('winui-material-setting', 'mica', ['mica', 'acrylic']));

// ── 节日皮肤（补丁模块，见 ./holidayTheme.ts）────────────────────────
// 规则：暗色模式 → 中秋主题（青 + 中秋海报）；亮色模式 → 国庆主题（红 + 国庆海报）。
// 开关默认值 = 是否在档期内（档期内默认开，档期外默认关）；用户手动改过就一直听他的。
// 关掉 = 背景海报 + 节日配色一起撤，回默认蓝。
const storedHolidaySkin = localStorage.getItem('winui-holiday-skin');
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
// 深浅色切换 → 换对应节日皮肤；用户拨动开关 → 刷新并记住他的选择
// （注意：不能把持久化写在“深浅色变化”那次 watch 里，否则用户只是切了一下主题
//   就会被记成“手动关/开”，把档期的默认值覆盖掉）
watch(isDarkMode, refreshActiveHoliday);
watch(holidaySkinEnabled, (enabled) => {
  refreshActiveHoliday();
  localStorage.setItem('winui-holiday-skin', enabled ? 'on' : 'off');
});
refreshActiveHoliday();
provide('holidaySkinEnabled', holidaySkinEnabled);
provide('activeHoliday', activeHoliday);
// ── 界面动画 ─────────────────────────────────────────────────────
// 按需求：动画常驻开启，不提供开关。组件 CSS 里也不再写 prefers-reduced-motion
// 降级分支，即使系统设置了“减少动态效果”，本站动画仍照常播放。

// 页面过渡固定使用默认动画（已按需求砍掉“页面过渡”设置项）
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

const pageTags = new Set(['home', 'settings', 'submit']);

// ── 底部导航：提交软件（#/submit，与设置齿轮同区的 Footer 菜单项）──────
const footerMenuItems = computed<NavItem[]>(() => [
  { Tag: 'submit', Icon: '\uE11C', Content: t('nav.submit') }
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
      .map((app) => ({ Tag: `app:${app.id}`, Content: app.name, Icon: app.icon ?? '' }))
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
    if (currentPage.value === 'submit') return footerMenuItems.value[0] ?? null;
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
  syncNavigationFreezeState(isNavigationFrozen.value);
  postUwpSetting('theme', themeSetting.value);
  postUwpSetting('material', materialSetting.value);
  // 搜索框（Ctrl+F 聚焦 / 点别处收起窄窗口弹出框 / 窗口拉宽自动收起）
  window.addEventListener('keydown', onWindowKeydown);
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('blur', onWindowBlurForCompactSearch);
  document.addEventListener('pointerdown', onDocumentPointerDownForCompactSearch);
  document.addEventListener('keydown', onDocumentKeydownForCompactSearch);
});

onBeforeUnmount(() => {
  if (navigationReleaseFrame) cancelAnimationFrame(navigationReleaseFrame);
  removeNavigationBeforeEach();
  removeNavigationAfterEach();
  removeNavigationErrorHandler();
  document.getElementById('app')?.removeAttribute('inert');
  document.getElementById('app')?.removeAttribute('aria-busy');
  systemThemeQuery.removeEventListener('change', onSystemThemeChange);
  window.removeEventListener('keydown', onWindowKeydown);
  window.removeEventListener('resize', onWindowResize);
  window.removeEventListener('blur', onWindowBlurForCompactSearch);
  document.removeEventListener('pointerdown', onDocumentPointerDownForCompactSearch);
  document.removeEventListener('keydown', onDocumentKeydownForCompactSearch);
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

  /* ── 标题栏搜索框（同 WinUIonWeb 方案）────────────────────────── */
  .gallery-titlebar-search {
    width: 100%;
    max-width: 350px;
  }

  /* 搜索框在标题右侧的内容列内；内容列会随窗口收缩，不会盖住左侧图标/标题 */
  .gallery-titlebar .win-titlebar-content {
    position: static;
    overflow: visible;
  }

  /* 标题栏实际宽度过窄时优先保留标题，隐藏搜索框（WinTitleBar 按自身宽度
     打 is-narrow/is-compact，不依赖视口媒体查询，PWA/WebView2 下同样生效） */
  .gallery-titlebar.is-narrow .gallery-titlebar-search,
  .gallery-titlebar.is-compact .gallery-titlebar-search {
    display: none !important;
  }

  /* 窄标题栏时标题后的搜索按钮：样式与返回/汉堡按钮保持一致 */
  .gallery-titlebar-search-button {
    display: none;
    box-sizing: border-box;
    width: 40px;
    margin: 2px;
    padding: 0;
    border: 0;
    border-radius: var(--ControlCornerRadius, 4px);
    flex: 0 0 auto !important;
    align-self: stretch;
    align-items: center;
    justify-content: center;
    color: var(--TitleBarForegroundBrush, var(--text-primary));
    background: var(--TitleBarBackButtonBackground, transparent);
    cursor: pointer;
    font-family: var(--SymbolThemeFontFamily, 'WinUIOnWebIcons');
    font-size: 16px;
    transition: background var(--fast-duration) var(--fast-out-slow-in), color var(--fast-duration) var(--fast-out-slow-in);
  }

  .gallery-titlebar.is-narrow .gallery-titlebar-search-button,
  .gallery-titlebar.is-compact .gallery-titlebar-search-button {
    display: flex;
  }

  .gallery-titlebar-search-button:hover {
    background: var(--TitleBarBackButtonBackgroundPointerOver, var(--subtle-secondary));
  }

  .gallery-titlebar-search-button:active {
    background: var(--TitleBarBackButtonBackgroundPressed, var(--subtle-tertiary));
    color: var(--text-secondary);
  }

  .gallery-titlebar-search-button-icon {
    width: 16px;
    height: 16px;
    font-size: 16px;
    line-height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* 窄标题栏时内容列左对齐，让搜索按钮紧跟标题 */
  .gallery-titlebar.is-narrow .win-titlebar-content,
  .gallery-titlebar.is-compact .win-titlebar-content {
    justify-content: flex-start;
    padding: var(--TitleBarCompactContentMargin, 0 16px 0 0);
  }

  /* 窄窗口点放大镜弹出的搜索框：标题栏下方、距视口左侧 16px */
  .gallery-compact-search-popup {
    position: fixed;
    top: max(env(titlebar-area-height, 0px), 48px);
    left: 16px;
    width: min(350px, calc(100vw - 32px));
    z-index: 10000;
  }

  .gallery-compact-search {
    width: 100%;
  }

  /* 弹出式搜索框浮在页面上，输入框换成 Acrylic 填充，避免两层半透明叠在一起 */
  .gallery-compact-search.win-auto-suggest-box .win-textbox {
    --textbox-background: var(--AcrylicInAppFillColorDefaultBrush);
    --textbox-background-pointer-over: var(--AcrylicInAppFillColorDefaultBrush);
    --textbox-background-pressed: var(--AcrylicInAppFillColorDefaultBrush);
    --textbox-background-focused: var(--AcrylicInAppFillColorDefaultBrush);
    isolation: isolate;
  }

  .gallery-compact-search.win-auto-suggest-box .win-textbox-border {
    -webkit-backdrop-filter: var(--flyout-backdrop);
    backdrop-filter: var(--flyout-backdrop);
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
