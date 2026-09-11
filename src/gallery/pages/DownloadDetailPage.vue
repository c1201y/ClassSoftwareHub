<template>
  <WinScrollViewer
    class="gallery-page-scroll"
    VerticalScrollBarVisibility="Auto"
    VerticalScrollMode="Auto">
    <div class="gallery-page-content download-detail-page">
      <template v-if="app">
        <!-- 头部：图标 + 名称 + 标语 + 分类徽标 -->
        <div class="detail-heading">
          <div class="detail-app-icon">
            <img v-if="app.icon" :src="app.icon" :alt="app.name" />
          </div>
          <div class="detail-heading-text">
            <h1 class="detail-title">{{ app.name }}</h1>
            <p class="detail-tagline">{{ app.tagline }}</p>
            <span class="detail-category-badge">{{ categoryName(app.category) }}</span>
          </div>
        </div>

        <!-- 应用介绍 -->
        <h2 class="detail-section-title">{{ t('detail.intro') }}</h2>
        <p class="detail-description">{{ app.description }}</p>

        <!-- 详细信息 -->
        <h2 class="detail-section-title">{{ t('detail.info') }}</h2>
        <div class="detail-info-list">
          <div class="detail-info-row">
            <span class="detail-info-label">{{ t('detail.version') }}</span>
            <span class="detail-info-value">{{ app.version || t('detail.pending') }}</span>
          </div>
          <div class="detail-info-row">
            <span class="detail-info-label">{{ t('detail.size') }}</span>
            <span class="detail-info-value">{{ app.size || t('detail.pending') }}</span>
          </div>
          <div class="detail-info-row">
            <span class="detail-info-label">{{ t('detail.system') }}</span>
            <span class="detail-info-value">{{ app.system || t('detail.pending') }}</span>
          </div>
          <div v-if="app.website" class="detail-info-row">
            <span class="detail-info-label">{{ t('detail.website') }}</span>
            <WinHyperlinkButton
              class="detail-info-link"
              :Content="app.website"
              :NavigateUri="app.website"
              TargetName="_blank" />
          </div>
          <div v-if="app.github" class="detail-info-row">
            <span class="detail-info-label">{{ t('detail.github') }}</span>
            <WinHyperlinkButton
              class="detail-info-link"
              :Content="app.github"
              :NavigateUri="app.github"
              TargetName="_blank" />
          </div>
        </div>

        <!-- 更新提示：更新频繁 / 直链易失效的软件，提醒去官网或应用商店拿最新版 -->
        <WinInfoBar
          v-if="app.notice"
          class="detail-notice"
          :IsOpen="true"
          :IsClosable="false"
          Severity="Informational"
          :Title="t('detail.notice-title')"
          :Message="app.notice" />

        <!-- 下载区 -->
        <h2 class="detail-section-title">{{ t('detail.downloads') }}</h2>

        <!-- 应用商店入口（app.store 字段，或 downloads 里指向 Microsoft Store 的条目，都会自动显示这张高亮卡片） -->
        <div v-if="storeLink" class="detail-store-card">
          <div class="detail-store-text">
            <div class="detail-store-title">{{ t('detail.store-title') }}</div>
            <div class="detail-store-desc">{{ t('detail.store-desc') }}</div>
          </div>
          <WinButton
            class="detail-store-button"
            :Content="t('detail.store-button')"
            Style="AccentButtonStyle"
            @click="openStore" />
        </div>

        <div v-if="otherDownloads.length" class="detail-download-list">
          <div
            v-for="download in otherDownloads"
            :key="download.platform"
            class="detail-download-row">
            <div class="detail-download-info">
              <div class="detail-download-platform">{{ download.platform }}</div>
              <div v-if="download.note" class="detail-download-note">{{ download.note }}</div>
              <div v-if="download.size" class="detail-download-size">{{ download.size }}</div>
            </div>
            <WinButton
              class="detail-download-button"
              :Content="t('detail.download')"
              Style="AccentButtonStyle"
              @click="openDownload(download)" />
          </div>
        </div>
        <p v-else-if="storeLink" class="detail-store-only-hint">{{ t('detail.store-only') }}</p>
      </template>

      <!-- 找不到该软件 -->
      <p v-else class="detail-not-found">{{ t('detail.not-found') }}</p>
    </div>
  </WinScrollViewer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import WinScrollViewer from '../../components/WinScrollViewer.vue';
import WinHyperlinkButton from '../../components/WinHyperlinkButton.vue';
import WinInfoBar from '../../components/WinInfoBar.vue';
import WinButton from '../../components/WinButton.vue';
import { useI18n } from '../../components/i18n/index';
import { findAppById, categoryName } from '../data';
import type { DownloadItem } from '../data';
import '../styles/download-detail-page.css';

const { t } = useI18n();
const route = useRoute();

/** 网址 #/download/<id> 里的 id 对应的软件 */
const app = computed(() => findAppById(String(route.params.id ?? '')));

/** 判断一个下载链接是不是 Microsoft Store 应用页 */
const isStoreUrl = (url?: string) =>
  /^https?:\/\/(apps\.microsoft\.com|www\.microsoft\.com\/store|store\.microsoft\.com)|^ms-windows-store:/i.test(url || '');

/** 商店入口：优先用 store 字段；没有就把 downloads 里指向商店的那条自动提上来 */
const storeLink = computed(() => {
  const value = app.value;
  if (!value) return '';
  if (value.store) return value.store;
  const matched = (value.downloads || []).find((item) => isStoreUrl(item.url));
  return matched ? matched.url : '';
});

/** 除商店外的普通下载项 */
const otherDownloads = computed(() =>
  ((app.value?.downloads) || []).filter((item) => !isStoreUrl(item.url))
);

const openDownload = (download: DownloadItem) => {
  if (download.url) {
    window.open(download.url, '_blank', 'noopener,noreferrer');
  }
};

/** 打开应用商店页面（新标签页） */
const openStore = () => {
  const target = storeLink.value;
  if (target) {
    window.open(target, '_blank', 'noopener,noreferrer');
  }
};
</script>
