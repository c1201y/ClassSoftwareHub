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
            <!-- 图标：本地那份优先（见 src/gallery/appIcons.ts）；外链挂掉就退回首字色块 -->
            <img
              v-if="appIconUrlSafe(app)"
              :src="appIconUrlSafe(app)"
              :alt="app.name"
              decoding="async"
              referrerpolicy="no-referrer"
              @error="markIconBroken(app.id)" />
            <span v-else class="detail-app-icon-fallback" aria-hidden="true">{{ app.name.slice(0, 1) }}</span>
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
            v-for="(download, index) in otherDownloads"
            :key="download.platform + '-' + index"
            class="detail-download-item">
            <div class="detail-download-row">
              <div class="detail-download-info">
                <div class="detail-download-platform">{{ download.platform }}</div>
                <div v-if="download.note" class="detail-download-note">{{ download.note }}</div>
                <div v-if="download.size" class="detail-download-size">{{ download.size }}</div>
                <!-- 不是文件直链的项（网盘 / 官网下载页），如实说明点了会去哪儿 -->
                <div v-if="downloadHint(download)" class="detail-download-kind">{{ downloadHint(download) }}</div>
                <!-- 校验值：只有数据里填了 hash 才出现；默认只显示首尾，点一下复制完整值 -->
                <button
                  v-if="download.hash"
                  class="detail-download-hash"
                  type="button"
                  :title="hashAlgorithm(download.hash) + ' ' + download.hash"
                  @click="copyHash(download.hash)">
                  <span class="detail-download-hash-alg">{{ hashAlgorithm(download.hash) }}</span>
                  <span class="detail-download-hash-value">{{ shortHash(download.hash) }}</span>
                  <span class="detail-download-hash-action">{{ copiedHash === download.hash ? t('detail.hash-copied') : t('detail.hash-copy') }}</span>
                </button>
              </div>
              <div class="detail-download-actions">
                <WinButton
                  class="detail-download-button"
                  :Content="downloadButtonText(download)"
                  Style="AccentButtonStyle"
                  @click="openDownload(download)" />
                <!-- GitHub 的链接才多给一条国内加速路（通道清单见 githubMirror.ts） -->
                <WinButton
                  v-if="isMirrorableUrl(download.url)"
                  class="detail-mirror-button"
                  Style="AccentButtonStyle"
                  @click="toggleMirror(download.url)">
                  <span class="detail-mirror-button-icon" aria-hidden="true">&#xE945;</span>
                  <span>{{ t('detail.mirror-button') }}</span>
                </WinButton>
              </div>
            </div>

            <!-- 加速通道：展开后列出所有镜像，点哪条走哪条 -->
            <div v-if="mirrorOpenUrl === download.url" class="detail-mirror-panel">
              <p class="detail-mirror-desc">{{ t('detail.mirror-desc') }}</p>
              <div class="detail-mirror-channels">
                <a
                  v-for="channel in orderedChannels"
                  :key="channel.id"
                  class="detail-mirror-channel"
                  :href="mirrorHref(download, channel)"
                  target="_blank"
                  rel="noopener noreferrer"
                  @click="onMirrorClick(channel)">
                  <span class="detail-mirror-channel-name">{{ channel.name }}</span>
                </a>
              </div>
              <p class="detail-mirror-note">{{ t('detail.mirror-note') }}</p>
            </div>
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
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import WinScrollViewer from '../../components/WinScrollViewer.vue';
import WinHyperlinkButton from '../../components/WinHyperlinkButton.vue';
import WinInfoBar from '../../components/WinInfoBar.vue';
import WinButton from '../../components/WinButton.vue';
import { useI18n } from '../../components/i18n/index';
import { findAppById, categoryName } from '../data';
import type { DownloadItem } from '../data';
import { appIconUrlSafe, markIconBroken } from '../appIcons';
import { kindOf, triggerDownload } from '../downloadLink';
import {
  MIRROR_CHANNELS,
  isMirrorableUrl,
  mirrorUrl,
  preferredChannelId,
  rememberChannel
} from '../githubMirror';
import type { MirrorChannel } from '../githubMirror';
import '../styles/download-detail-page.css';

const { t } = useI18n();
const route = useRoute();

/** 网址 #/download/<id> 里的 id 对应的软件 */
const app = computed(() => findAppById(String(route.params.id ?? '')));

/** 商店入口：优先用 store 字段；没有就把 downloads 里指向商店的那条自动提上来 */
const storeLink = computed(() => {
  const value = app.value;
  if (!value) return '';
  if (value.store) return value.store;
  const matched = (value.downloads || []).find((item) => kindOf(item) === 'store');
  return matched ? matched.url || '' : '';
});

/** 除商店外的普通下载项 */
const otherDownloads = computed(() =>
  ((app.value?.downloads) || []).filter((item) => kindOf(item) !== 'store')
);

// ── 下载项的落地方式（判定规则见 src/gallery/downloadLink.ts）───────────
// 文件直链在本页直接下：隐藏 <a> 一戳就走下载，当前页不动、不闪新标签。
// 网盘 / 官网下载页只能跳转 —— 那就把按钮文案和说明写清楚，别让用户点完才发现被带走了。

const openDownload = (download: DownloadItem) => {
  const url = download.url;
  if (!url) return;
  if (kindOf(download) === 'file') {
    triggerDownload(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
};

/** 主按钮文案：能直下的说「下载」，要跳走的说清楚去哪儿 */
const downloadButtonText = (download: DownloadItem) => {
  const kind = kindOf(download);
  if (kind === 'netdisk') return t('detail.open-netdisk');
  if (kind === 'page') return t('detail.open-page');
  return t('detail.download');
};

/** 跳转项的说明；文件直链返回空串（不显示这一行） */
const downloadHint = (download: DownloadItem) => {
  const kind = kindOf(download);
  if (kind === 'netdisk') return t('detail.hint-netdisk');
  if (kind === 'page') return t('detail.hint-page');
  return '';
};

/** 打开应用商店页面（新标签页） */
const openStore = () => {
  const target = storeLink.value;
  if (target) {
    window.open(target, '_blank', 'noopener,noreferrer');
  }
};

// ── 校验值（downloads[].hash）───────────────────────────────────────────
// 128 位的 SHA512 直接铺在下载行里会把文字画出卡片，所以这里只显示首尾几位，
// 完整值放 title 里、点一下复制走。填 hash 时只写十六进制即可，算法按长度推断。

/** 长度 → 算法名（32=MD5 / 40=SHA-1 / 56=SHA-224 / 64=SHA-256 / 96=SHA-384 / 128=SHA-512） */
const HASH_ALGORITHMS: Record<number, string> = {
  32: 'MD5',
  40: 'SHA-1',
  56: 'SHA-224',
  64: 'SHA-256',
  96: 'SHA-384',
  128: 'SHA-512'
};

const hashAlgorithm = (hash: string) => HASH_ALGORITHMS[hash.length] || t('detail.hash-checksum');

const shortHash = (hash: string) => (hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash);

/** 刚复制了哪一条（2 秒后按钮文字变回「复制」） */
const copiedHash = ref('');
let copiedHashTimer = 0;

const copyHash = async (hash: string) => {
  try {
    await navigator.clipboard.writeText(hash);
  } catch {
    return; // 剪贴板不可用时什么都不做：完整值在 title 里，用户还能手选
  }
  copiedHash.value = hash;
  window.clearTimeout(copiedHashTimer);
  copiedHashTimer = window.setTimeout(() => {
    copiedHash.value = '';
  }, 2000);
};

// ── GitHub 下载加速（通道清单与判断逻辑见 src/gallery/githubMirror.ts）──────
// 主按钮始终是 GitHub 官方直链；这里只是额外给一条国内镜像的路，
// 展开哪一行用 url 记（同一个软件不会有两行同一个链接）。

/** 当前展开了加速通道的那条下载链接；空串表示都没展开 */
const mirrorOpenUrl = ref('');

// 点进另一个软件时组件会被复用（ref 不会自己清），把展开的面板和复制状态收起来
watch(
  () => route.params.id,
  () => {
    mirrorOpenUrl.value = '';
    copiedHash.value = '';
  }
);

const toggleMirror = (url?: string) => {
  if (!url) return;
  mirrorOpenUrl.value = mirrorOpenUrl.value === url ? '' : url;
};

/** 上次用过的通道排到最前 —— 常用的话能少点一下 */
const preferredId = ref(preferredChannelId());
const orderedChannels = computed(() => {
  const first = MIRROR_CHANNELS.find((channel) => channel.id === preferredId.value);
  if (!first) return MIRROR_CHANNELS;
  return [first, ...MIRROR_CHANNELS.filter((channel) => channel !== first)];
});

/** 拼出该下载项在某个通道下的链接（url 是可选字段，这里顺手兜住空值） */
const mirrorHref = (download: DownloadItem, channel: MirrorChannel) =>
  download.url ? mirrorUrl(download.url, channel) : '';

/** 记下这次选的通道（下次它就在最前面），并收起面板 —— 点完有反馈，不会看着像没反应 */
const onMirrorClick = (channel: MirrorChannel) => {
  preferredId.value = channel.id;
  rememberChannel(channel.id);
  mirrorOpenUrl.value = '';
};
</script>
