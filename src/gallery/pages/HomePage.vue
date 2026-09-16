<template>
  <WinScrollViewer
    class="gallery-home-scroll"
    VerticalScrollBarVisibility="Auto"
    VerticalScrollMode="Auto">
    <div class="gallery-home-page">
      <!-- 节日皮肤：首页顶部海报（补丁模块，见 src/gallery/holidayTheme.ts）
           图片顶部 = 网页顶部，高度按原比例自动，底部柔和渐隐进页面，不遮挡下方文字 -->
      <div v-if="activeHoliday" class="holiday-hero" aria-hidden="true">
        <img class="holiday-hero-image" :src="activeHoliday.banner" :alt="activeHoliday.label" />
      </div>
      <div class="home-page">
        <!-- 页头：站名 + 副标题 + 软件清单模板按钮 -->
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
            <!-- 软件清单模板：登记新软件时下载，内容与根目录 软件数据/apps/_模板.json 一致 -->
            <span class="home-download-template-line">
              <button
                type="button"
                class="home-download-html-btn"
                @click="downloadSoftwareTemplate">
                {{ t('home.download-template') }}
              </button>
              <span class="home-download-html-tip">{{ t('home.download-template-tip') }}</span>
              <!-- 加入 QQ 群：和模板按钮同一行、靠右（链接复用设置页「关于」的 about.qq-group-url） -->
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

        <!-- 两个入口卡片：内置工具 + AI 导航（各占一半，在分类筛选条上方） -->
        <div class="home-jump-row">
          <button
            type="button"
            class="home-jump-card"
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
            @click="openAiNav">
            <span class="home-jump-icon" aria-hidden="true">&#xE99A;</span>
            <span class="home-jump-text">
              <span class="home-jump-title">{{ aiNav.homeTitle }}</span>
              <span class="home-jump-desc">{{ aiNav.homeDesc }}</span>
            </span>
            <span class="home-jump-arrow" aria-hidden="true">&#xE76C;</span>
          </button>
        </div>

        <!-- 分类筛选条 + 右边的「已收录软件数量」小字 -->
        <div class="filter-row">
          <WinSelectorBar
            class="filter-bar token-filter-bar"
            :class="{ 'is-cjk-locale': locale === 'zh-CN' }"
            HorizontalAlignment="Center"
            :Items="filterItems"
            :SelectedItem="selectedItem"
            @SelectionChanged="onFilterChanged" />
          <span class="filter-count">{{ t('filter.collected', { count: apps.length }) }}</span>
        </div>

        <!-- 软件卡片网格（列表最上方可能带一张分类推荐卡） -->
        <div class="switch-presenter">
          <!-- 分类推荐卡：选到「教学辅助」时，在软件列表最上方插一条整页宽的外链卡片
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
          <div class="grid-view download-grid">
            <button
              v-for="app in filteredApps"
              :key="app.id"
              type="button"
              class="control-item download-card"
              @click="openDetail(app)">
              <span class="control-item-surface">
                <span class="download-app-icon">
                  <img v-if="app.icon" :src="app.icon" :alt="app.name" />
                </span>
                <span class="control-item-text">
                  <WinTextBlock class="control-item-title" :Text="app.name" />
                  <WinTextBlock
                    class="control-item-subtitle"
                    :Text="app.tagline ?? ''"
                    TextWrapping="NoWrap" />
                </span>
                <span class="category-badge">{{ categoryName(app.category) }}</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </WinScrollViewer>
</template>

<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import type { Ref } from 'vue';
import { useRouter } from 'vue-router';
import type { HolidayTheme } from '../holidayTheme';
import WinScrollViewer from '../../components/WinScrollViewer.vue';
import WinTextBlock from '../../components/WinTextBlock.vue';
import WinSelectorBar from '../../components/WinSelectorBar.vue';
import { useI18n } from '../../components/i18n/index';
import { apps, categories, categoryName } from '../data';
import type { SoftwareApp } from '../data';
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
  ...categories.map((category) => ({ Text: category.name, Tag: category.key }))
]);

const selectedIndex = ref(0);
const activeFilter = ref('all');

const selectedItem = computed(() => filterItems.value[selectedIndex.value]);

const filteredApps = computed(() =>
  activeFilter.value === 'all'
    ? apps
    : apps.filter((app) => app.category === activeFilter.value)
);

/** WinSelectorBar 的 SelectionChanged：sender 带 Items / SelectedItem */
const onFilterChanged = (sender: { Items?: { Tag?: string }[]; SelectedItem?: { Tag?: string } } | null) => {
  const selected = sender?.SelectedItem;
  selectedIndex.value = Math.max(0, sender?.Items?.indexOf(selected as never) ?? 0);
  activeFilter.value = selected?.Tag ?? 'all';
};

/**
 * 「教学辅助」分类顶部的推荐卡（Awesome IWB）：
 * 只在选中该分类时出现；文案里 title/desc 都被清空时自动隐藏（等于关掉这张卡）。
 */
const teachingCategoryKey = 'teaching';
const showIwbCard = computed(
  () =>
    activeFilter.value === teachingCategoryKey &&
    Boolean(t('home.iwb-card-title')?.trim()) &&
    Boolean(t('home.iwb-card-desc')?.trim()) &&
    Boolean(t('home.iwb-card-url')?.trim())
);

const openDetail = (app: SoftwareApp) => {
  void router.push({ name: 'download-detail', params: { id: app.id } });
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

/**
 * “⬇ 下载软件清单模板”：把登记新软件用的 _模板.json 原样下载给用户。
 * 模板内容打包时已内联（?raw），离线单文件版也能正常下载。
 */
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
    window.alert('下载失败：' + String(error));
  }
};
</script>
