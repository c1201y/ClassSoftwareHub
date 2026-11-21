<template>
  <WinScrollViewer
    class="gallery-home-scroll"
    VerticalScrollBarVisibility="Auto"
    VerticalScrollMode="Auto">
    <div class="gallery-home-page">
      <!-- 节日皮肤：首页顶部海报（补丁模块，见 src/gallery/holidayTheme.ts）
           图片顶部 = 网页顶部，高度按原比例自动，底部柔和渐隐进页面，不遮挡下方文字 -->
      <div v-if="activeHoliday" class="holiday-hero" aria-hidden="true">
        <img class="holiday-hero-image" :src="activeHoliday.banner" :alt="t(activeHoliday.labelKey)" />
      </div>
      <div class="home-page">
        <!-- 页头：站名 / 副标题 / 模板按钮 -->
        <section class="home-page-header">
          <div class="home-header-copy">
            <WinTextBlock
              class="home-header-title"
              :Text="t('home.title')"
              FontSize="40"
              FontWeight="600"
              LineHeight="52" />
            <WinTextBlock
              class="home-header-subtitle"
              :Text="t('home.subtitle')"
              FontSize="18" />
          </div>
          <div class="home-offline-download">
            <!-- 模板下载：与 软件数据/apps/_模板.json 同源 -->
            <span class="home-download-template-line">
              <button
                type="button"
                class="home-download-html-btn"
                @click="downloadSoftwareTemplate">
                {{ t('home.download-template') }}
              </button>
              <span class="home-download-html-tip">{{ t('home.download-template-tip') }}</span>
              <!-- QQ 群入口：复用 about.qq-group-url -->
              <a
                class="home-download-html-btn home-qq-group-btn"
                :href="t('about.qq-group-url')"
                target="_blank"
                rel="noopener noreferrer">
                {{ t('about.qq-group') }}
              </a>
            </span>
          </div>
        </section>

        <!-- 更新提示：可关闭 InfoBar，单行高度 -->
        <WinInfoBar
          v-if="updateAvailable"
          class="home-update-bar"
          :IsOpen="true"
          IsClosable
          Severity="Informational"
          :Title="t('home.update-title')"
          :Message="updateMessage"
          @CloseButtonClick="dismissUpdate"
          @update:IsOpen="onUpdateBarOpen">
          <!-- @vue-expect-error 上游 WinInfoBar 未导出插槽类型，运行时正常 -->
          <template #ActionButton>
            <WinButton
              FontSize="13"
              Padding="12,0,12,0"
              :Content="t('home.update-action')"
              @Click="runHomeUpdate" />
          </template>
        </WinInfoBar>

        <div class="home-desktop-promo" role="button" tabindex="0" @mouseenter="prefetchRoute('desktop')" @focus="prefetchRoute('desktop')" @click="openDesktopPage" @keydown.enter="openDesktopPage">
          <span class="home-desktop-promo-icon" aria-hidden="true">&#xE977;</span>
          <span class="home-desktop-promo-text">
            <span class="home-desktop-promo-title">{{ desktopPromo.title }}</span>
            <span class="home-desktop-promo-desc">{{ desktopPromo.desc }}</span>
          </span>
          <span class="home-desktop-promo-actions">
            <button
              type="button"
              class="home-desktop-download-btn"
              @click.stop="openDesktopPage">
              {{ desktopPromo.enter }}
            </button>
            <span class="home-desktop-promo-action">
              {{ desktopPromo.allVersions }}
              <span class="home-desktop-promo-link-icon" aria-hidden="true">&#xE8A7;</span>
            </span>
          </span>
        </div>

        <!-- 入口卡片：内置工具 / AI 导航 -->
        <div class="home-jump-row">
          <button
            type="button"
            class="home-jump-card"
            @mouseenter="prefetchRoute('tools')"
            @focus="prefetchRoute('tools')"
            @click="openTools">
            <span class="home-jump-icon" aria-hidden="true">&#xEC7A;</span>
            <span class="home-jump-text">
              <span class="home-jump-title">{{ toolsCard.title }}</span>
              <span class="home-jump-desc">{{ toolsCard.desc }}</span>
            </span>
            <span class="home-jump-arrow" aria-hidden="true">&#xE76C;</span>
          </button>
          <button
            type="button"
            class="home-jump-card"
            @mouseenter="prefetchRoute('ai')"
            @focus="prefetchRoute('ai')"
            @click="openAiNav">
            <span class="home-jump-icon" aria-hidden="true">&#xE99A;</span>
            <span class="home-jump-text">
              <span class="home-jump-title">{{ locale === 'en-US' ? (aiNav.homeTitleEn ?? aiNav.homeTitle) : aiNav.homeTitle }}</span>
              <span class="home-jump-desc">{{ locale === 'en-US' ? (aiNav.homeDescEn ?? aiNav.homeDesc) : aiNav.homeDesc }}</span>
            </span>
            <span class="home-jump-arrow" aria-hidden="true">&#xE76C;</span>
          </button>
        </div>

        <!-- 分类筛选条 + 收录数量 -->
        <div class="filter-row">
          <WinSelectorBar
            class="filter-bar token-filter-bar"
            :class="{ 'is-cjk-locale': locale === 'zh-CN' }"
            HorizontalAlignment="Center"
            :Items="filterItems"
            :SelectedItem="selectedItem"
            @SelectionChanged="onFilterChanged" />
          <div class="filter-meta">
            <WinComboBox
              v-if="platformItems.length > 1"
              class="platform-filter"
              :ItemsSource="platformItems"
              DisplayMemberPath="name"
              v-model:SelectedIndex="platformIndex" />
            <span class="filter-count">{{ countText }}</span>
            <!-- 选择分享：和筛选器放一起 —— 都是「在这堆软件里挑」的动作。
                 进入后卡片右上角出现勾选，选完整条链接发出去。 -->
            <button
              type="button"
              class="home-pick-btn"
              :class="{ 'is-active': pickMode }"
              :title="t('collection.pick-hint')"
              @click="togglePickMode">
              <span class="home-pick-icon" aria-hidden="true">{{ pickMode ? '\uE711' : '\uE72D' }}</span>
              <span>{{ pickMode ? t('collection.exit-pick') : t('collection.enter-pick') }}</span>
            </button>
          </div>
        </div>

        <!-- 软件卡片网格，顶部可含推荐卡 -->
        <div class="switch-presenter">
          <!-- 分类推荐卡：选到「教学课堂」时，在软件列表最上方插一条整页宽的外链卡片
               （文案/网址在根目录 文字设置.ts 的 home.iwb-card-*，title、desc 留空即隐藏） -->
          <a
            v-if="showIwbCard"
            class="category-promo-card"
            :href="t('home.iwb-card-url')"
            target="_blank"
            rel="noopener noreferrer">
            <span class="category-promo-icon" aria-hidden="true">&#xE774;</span>
            <span class="category-promo-text">
              <span class="category-promo-title">{{ t('home.iwb-card-title') }}</span>
              <span class="category-promo-desc">{{ t('home.iwb-card-desc') }}</span>
            </span>
            <span class="category-promo-action">
              {{ t('home.iwb-card-action') }}
              <span class="category-promo-link-icon" aria-hidden="true">&#xE8A7;</span>
            </span>
          </a>
          <p v-if="filteredApps.length === 0" class="filter-empty">{{ t('filter.empty') }}</p>
          <div class="grid-view download-grid">
            <button
              v-for="app in filteredApps"
              :key="app.id"
              type="button"
              class="control-item download-card"
              :class="{ 'is-picked': pickMode && isPicked(app.id) }"
              @mouseenter="prefetchRoute('download-detail')"
              @focus="prefetchRoute('download-detail')"
              @click="onCardClick(app)">
              <span class="control-item-surface">
                <span class="download-app-icon">
                  <!-- 图标：本地优先，失败回退首字 -->
                  <img
                    v-if="appIconUrlSafe(app)"
                    :src="appIconUrlSafe(app)"
                    :alt="appName(app, locale)"
                    loading="lazy"
                    decoding="async"
                    referrerpolicy="no-referrer"
                    @error="markIconBroken(app.id)" />
                  <span v-else class="download-app-icon-fallback" aria-hidden="true">{{ appName(app, locale).slice(0, 1) }}</span>
                </span>
                <span class="control-item-text">
                  <WinTextBlock class="control-item-title" :Text="appName(app, locale)" />
                  <WinTextBlock
                    class="control-item-subtitle"
                    :Text="appTagline(app, locale)"
                    TextWrapping="NoWrap" />
                </span>
                <span class="category-badge">{{ categoryName(app.category, locale) }}</span>
                <!-- 挑选模式下的勾选角标 -->
                <span v-if="pickMode" class="pick-mark" aria-hidden="true">
                  {{ isPicked(app.id) ? '\uE73E' : '\uE710' }}
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </WinScrollViewer>
    <!-- 挑选分享：底部悬浮栏 -->
    <div v-if="pickMode" class="pick-bar" role="region" :aria-label="t('collection.pick-bar-label')">
      <span class="pick-bar-count">{{ t('collection.picked-count', { count: picked.length, max: COLLECTION_MAX }) }}</span>
      <span class="pick-bar-names">{{ pickedNames }}</span>
      <span class="pick-bar-actions">
        <WinButton
          Style="AccentButtonStyle"
          FontSize="13"
          Padding="12,0,12,0"
          :Content="t('collection.share')"
          :IsEnabled="picked.length > 0"
          @Click="openPickShare" />
        <WinButton
          FontSize="13"
          Padding="10,0,10,0"
          :Content="t('collection.clear')"
          :IsEnabled="picked.length > 0"
          @Click="clearPicked" />
      </span>
    </div>

    <!-- 分享结果面板 -->
    <div v-if="pickShareOpen && picked.length" class="pick-share-mask" @click.self="pickShareOpen = false">
      <div class="pick-share" role="dialog" aria-modal="true">
        <div class="pick-share-head">
          <span class="pick-share-title">{{ t('collection.share-title') }}</span>
          <button type="button" class="pick-share-x" :aria-label="t('collection.close')" @click="pickShareOpen = false">×</button>
        </div>
        <div class="pick-share-body">
          <div class="pick-share-left">
            <span class="tool-label">{{ t('collection.share-text-label') }}</span>
            <textarea class="pick-share-text" :value="pickShareText" readonly rows="7" @focus="selectAll" />
            <div class="pick-share-btns">
              <WinButton
                Style="AccentButtonStyle"
                FontSize="13"
                Padding="10,0,10,0"
                :Content="pickCopyState === 'text' ? t('collection.copied') : t('collection.copy-text')"
                @Click="copyPickShare('text')" />
              <WinButton
                FontSize="13"
                Padding="10,0,10,0"
                :Content="pickCopyState === 'link' ? t('collection.copied') : t('collection.copy-link')"
                @Click="copyPickShare('link')" />
              <WinButton
                FontSize="13"
                Padding="10,0,10,0"
                :Content="t('collection.open')"
                @Click="openPickPage" />
            </div>
          </div>
          <div class="pick-share-qr">
            <span class="tool-label">{{ t('collection.qr-label') }}</span>
            <div class="pick-share-qr-img" v-html="pickQrSvg" />
            <span class="tool-hint pick-share-qr-tip">{{ t('collection.qr-tip') }}</span>
          </div>
        </div>
      </div>
    </div>

</template>

<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue';
import type { Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { prefetchRoute } from '../router';
import type { HolidayTheme } from '../holidayTheme';
import WinScrollViewer from '../../components/WinScrollViewer.vue';
import WinTextBlock from '../../components/WinTextBlock.vue';
import WinSelectorBar from '../../components/WinSelectorBar.vue';
import WinComboBox from '../../components/WinComboBox.vue';
import WinInfoBar from '../../components/WinInfoBar.vue';
import WinButton from '../../components/WinButton.vue';
import { useI18n } from '../../components/i18n/index';
import { applyUpdate, checkForUpdate } from '../appUpdate';
import { apps, categories, categoryName, platformName, platforms, appName, appTagline } from '../data';
import type { SoftwareApp } from '../data';
import { appIconUrlSafe, markIconBroken } from '../appIcons';
import {
  COLLECTION_MAX,
  buildCollectionText,
  buildCollectionUrl,
  decodeIds,
  readDraft,
  saveDraft
} from '../collection';
import { buildQrSvg } from '../share';
import '../styles/home-page.css';
// 软件清单模板：与根目录 软件数据/apps/_模板.json 保持同源（打包时内联进单文件）
import softwareTemplateRaw from '../../../软件数据/apps/_模板.json?raw';
// AI 导航入口卡片的文字：根目录 AI导航文本.ts（和导航页共用同一份，方便改）
import aiNav from '../../../AI导航文本';

const { t, locale } = useI18n();
const router = useRouter();

// 当前节日皮肤（App.vue 提供；关闭节日皮肤或不在档期时为 null）
const activeHoliday = inject<Ref<HolidayTheme | null>>('activeHoliday', ref(null));

/** 筛选条项目：第一个是“全部”，后面按分类顺序排 */
const filterItems = computed(() => [
  { Text: t('filter.all'), Tag: 'all' },
  ...categories.map((category) => ({ Text: categoryName(category.key, locale), Tag: category.key }))
]);

const selectedIndex = ref(0);
const activeFilter = ref('all');

const selectedItem = computed(() => filterItems.value[selectedIndex.value]);

/** 系统下拉：第一项是“全部系统”，后面取自 软件数据/platforms.json */
const platformItems = computed(() => [
  { key: 'all', name: t('filter.platform-all') },
  ...platforms.map((platform) => ({ key: platform.key, name: platformName(platform, locale) }))
]);

const platformIndex = ref(0);
const activePlatform = computed(() => platformItems.value[platformIndex.value]?.key ?? 'all');

/** 分类与系统是「且」的关系；没写 platforms 的软件只在「全部系统」下出现 */
const filteredApps = computed(() =>
  apps.filter(
    (app) =>
      (activeFilter.value === 'all' || app.category === activeFilter.value) &&
      (activePlatform.value === 'all' || app.platforms?.includes(activePlatform.value))
  )
);

const countText = computed(() =>
  activeFilter.value === 'all' && activePlatform.value === 'all'
    ? t('filter.collected', { count: apps.length })
    : t('filter.showing', { count: filteredApps.value.length })
);

/** WinSelectorBar 的 SelectionChanged：sender 带 Items / SelectedItem */
const onFilterChanged = (sender: { Items?: { Tag?: string }[]; SelectedItem?: { Tag?: string } } | null) => {
  const selected = sender?.SelectedItem;
  selectedIndex.value = Math.max(0, sender?.Items?.indexOf(selected as never) ?? 0);
  activeFilter.value = selected?.Tag ?? 'all';
};
const classroomCategoryKey = 'classroom';
const showIwbCard = computed(
  () =>
    activeFilter.value === classroomCategoryKey &&
    Boolean(t('home.iwb-card-title')?.trim()) &&
    Boolean(t('home.iwb-card-desc')?.trim()) &&
    Boolean(t('home.iwb-card-url')?.trim())
);

/* ── 选择分享 ───────────────────────────────────────────────────
   在首页就地勾选软件，生成一条可分享的清单链接。 */

const pickMode = ref(false);

const route = useRoute();

/** 打开时带 ?ids= 就是别人分享来的清单：直接进挑选模式并勾好 */
const incoming = decodeIds(String(route.query.ids ?? ''));
const picked = ref<string[]>(incoming.length ? incoming : readDraft());
if (incoming.length) pickMode.value = true;

const pickShareOpen = ref(false);
const pickCopyState = ref<'' | 'text' | 'link'>('');

const isPicked = (id: string) => picked.value.includes(id);

/** 底部悬浮栏里的已选名字（最多 6 个） */
const pickedNames = computed(() => {
  const names = picked.value
    .map((id) => {
      const found = apps.find((a) => a.id === id);
      return found ? appName(found, locale) : '';
    })
    .filter(Boolean);
  if (!names.length) return '';
  const head = names.slice(0, 6).join('、');
  return names.length > 6 ? `${head} 等 ${names.length} 个` : head;
});

const togglePickMode = () => {
  pickMode.value = !pickMode.value;
  if (!pickMode.value) pickShareOpen.value = false;
};

const togglePick = (id: string) => {
  const list = [...picked.value];
  const at = list.indexOf(id);
  if (at >= 0) list.splice(at, 1);
  else if (list.length < COLLECTION_MAX) list.push(id);
  else return;
  picked.value = list;
  saveDraft(list);
};

const clearPicked = () => {
  picked.value = [];
  saveDraft([]);
  pickShareOpen.value = false;
};

/** 挑选模式下点卡片是勾选，否则照旧进详情页 */
const onCardClick = (app: SoftwareApp) => {
  if (pickMode.value) {
    togglePick(app.id);
    return;
  }
  openDetail(app);
};

const pickShareUrl = computed(() => buildCollectionUrl(picked.value));
const pickShareText = computed(() => {
  const names = picked.value
    .map((id) => {
      const found = apps.find((a) => a.id === id);
      return found ? appName(found, locale) : '';
    })
    .filter(Boolean);
  return buildCollectionText(names, pickShareUrl.value);
});
const pickQrSvg = computed(() => (pickShareUrl.value ? buildQrSvg(pickShareUrl.value) : ''));

const openPickShare = () => {
  if (picked.value.length) pickShareOpen.value = true;
};

const copyPickShare = async (kind: 'text' | 'link') => {
  const value = kind === 'text' ? pickShareText.value : pickShareUrl.value;
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    pickCopyState.value = kind;
    window.setTimeout(() => {
      if (pickCopyState.value === kind) pickCopyState.value = '';
    }, 2000);
  } catch {
    // 剪贴板不可用：textarea 可手动复制
  }
};

const openPickPage = () => {
  if (pickShareUrl.value) window.open(pickShareUrl.value, '_blank', 'noopener,noreferrer');
};

const selectAll = (e: Event) => {
  (e.target as HTMLTextAreaElement | null)?.select();
};

const openDetail = (app: SoftwareApp) => {
  void router.push({ name: 'download-detail', params: { id: app.id } });
};

// 空闲预取详情页 chunk（首页主要跳转路径）
const UPDATE_DISMISS_KEY = 'csh-update-dismissed';
const pendingUpdate = ref<{ latest: string; running: string } | null>(null);

const isUpdateDismissed = (latest: string): boolean => {
  try {
    return localStorage.getItem(UPDATE_DISMISS_KEY) === latest;
  } catch {
    return false;
  }
};

const updateAvailable = computed(
  () => !!pendingUpdate.value && !isUpdateDismissed(pendingUpdate.value.latest)
);
const updateMessage = computed(() =>
  pendingUpdate.value
    ? t('home.update-message', {
        running: pendingUpdate.value.running,
        latest: pendingUpdate.value.latest
      })
    : ''
);
const dismissUpdate = () => {
  const latest = pendingUpdate.value?.latest;
  if (latest) {
    try {
      localStorage.setItem(UPDATE_DISMISS_KEY, latest);
    } catch {
      /* 无痕模式写不进去：本次隐藏即可 */
    }
  }
  pendingUpdate.value = null;
};
const onUpdateBarOpen = (open: boolean) => {
  if (!open) dismissUpdate();
};
const runHomeUpdate = () => {
  void applyUpdate();
};

onMounted(() => {
  const schedule =
    typeof window.requestIdleCallback === 'function'
      ? window.requestIdleCallback
      : (callback: () => void) => window.setTimeout(callback, 1200);
  schedule(() => prefetchRoute('download-detail'));

  void checkForUpdate()
    .then((result) => {
      if (result.state === 'stale') {
        pendingUpdate.value = { latest: result.latest, running: result.running };
      }
    })
    .catch(() => {});
});
const desktopPromo = {
  ...(locale === 'zh-CN'
    ? {
        title: '体验桌面应用版',
        desc: '原生 WinUI 界面 · 内置工具 · 托盘常驻 · 自动更新，不用打开浏览器',
        enter: '前往下载',
        allVersions: '下载页'
      }
    : {
        title: 'Try the desktop app',
        desc: 'Native WinUI shell · built-in tools · tray · auto updates',
        enter: 'Get it',
        allVersions: 'Downloads'
      })
};
const openDesktopPage = () => {
  void router.push({ name: 'desktop' });
};

/** 首页「内置工具」入口卡片：文案直接写在这里（工具相关文案不进 文字设置.ts） */
const toolsCard =
  locale === 'zh-CN'
    ? {
        title: '内置工具',
        desc: '图片取色 · 抽号 · 计时器 · 时钟…… 不用下载，打开就能用'
      }
    : {
        title: 'Built-in tools',
        desc: 'Color picker · draw · timer · clock … nothing to install'
      };

const openTools = () => {
  void router.push({ name: 'tools' });
};

/** 首页「AI 导航」入口卡片：文字来自根目录 AI导航文本.ts */
const openAiNav = () => {
  void router.push({ name: 'ai' });
};
const downloadSoftwareTemplate = () => {
  try {
    const blob = new Blob([softwareTemplateRaw], { type: 'application/json;charset=utf-8' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = t('home.download-template-filename');
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  } catch (error) {
    window.alert(t('home.download-template-failed', { error: String(error) }));
  }
};
</script>
