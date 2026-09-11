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
        <!-- 页头：站名 + 副标题 + 离线保存按钮 -->
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
            <button
              type="button"
              class="home-download-html-btn"
              @click="downloadSiteHTML">
              {{ t('home.download-html') }}
            </button>
            <span class="home-download-html-tip">{{ t('home.download-html-tip') }}</span>
            <!-- 软件清单模板：登记新软件时下载，内容与根目录 软件数据/apps/_模板.json 一致 -->
            <span class="home-download-template-line">
              <button
                type="button"
                class="home-download-html-btn"
                @click="downloadSoftwareTemplate">
                {{ t('home.download-template') }}
              </button>
              <span class="home-download-html-tip">{{ t('home.download-template-tip') }}</span>
            </span>
          </div>
        </section>

        <!-- 分类筛选条 -->
        <WinSelectorBar
          class="filter-bar token-filter-bar"
          :class="{ 'is-cjk-locale': locale === 'zh-CN' }"
          HorizontalAlignment="Center"
          :Items="filterItems"
          :SelectedItem="selectedItem"
          @SelectionChanged="onFilterChanged" />

        <!-- 软件卡片网格 -->
        <div class="switch-presenter">
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

const openDetail = (app: SoftwareApp) => {
  void router.push({ name: 'download-detail', params: { id: app.id } });
};

/**
 * “⬇ 下载HTML”：把整页存成一份可离线打开的单文件 HTML。
 * 只在“单文件离线版”（npm run build:single 的产物）里有效：
 *  - 开发/多文件版页面引用了外部脚本与样式，直接导出必然残缺 → 弹提示；
 *  - 单文件版则导出“干净壳”：清空 #app 渲染内容、去掉运行时注入的
 *    blob 资源与 body 上的瞬态浮层，重开时由页面脚本重新完整渲染。
 */
const downloadSiteHTML = () => {
  try {
    const hasExternalAssets =
      document.querySelectorAll('link[rel="stylesheet"][href], script[src]').length > 0;
    if (hasExternalAssets) {
      window.alert(t('home.download-html-only-single'));
      return;
    }
    const root = document.documentElement.cloneNode(true) as HTMLElement;
    const app = root.querySelector('#app');
    if (app) app.innerHTML = '';
    root.querySelectorAll('link[href^="blob:"], link[rel="manifest"]').forEach((node) => node.remove());
    // body 里只保留 #app：清掉瞬态浮层等元素节点，以及 Vue 运行期遗留的注释锚点
    const body = root.querySelector('body');
    if (body) {
      Array.from(body.childNodes).forEach((node) => {
        if (node.nodeType === 8 || (node.nodeType === 1 && (node as HTMLElement).id !== 'app')) {
          node.remove();
        }
      });
    }
    const html = '<!DOCTYPE html>\n' + root.outerHTML;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob);
    anchor.download = t('home.download-html-filename');
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
  } catch (error) {
    window.alert('下载失败：' + String(error));
  }
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
