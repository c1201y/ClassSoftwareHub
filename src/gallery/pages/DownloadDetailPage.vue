<template>
  <WinScrollViewer
    class="gallery-page-scroll"
    VerticalScrollBarVisibility="Auto"
    VerticalScrollMode="Auto">
    <div class="gallery-page-content download-detail-page">
      <template v-if="app">
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

        <h2 class="detail-section-title">{{ t('detail.intro') }}</h2>
        <p class="detail-description">{{ app.description }}</p>

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

        <!-- 换票失败时的原因说明（额度用完 / 入口不通），紧贴下载列表上方 -->
        <div v-if="downloadError" class="detail-download-error">{{ downloadError }}</div>
        <!-- 直连（OSS 短时地址）每次下载均需重新换取：此处主动说明，
             避免用户下载中途失败时误认为站点故障。 -->
        <div v-if="downloadNotice" class="detail-download-notice">{{ downloadNotice }}</div>

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
                <!-- GitHub 的链接才多给一条国内加速路（通道清单见 githubMirror.ts）。
                     点了**直接在本页开始下载**：隐藏 <a> 触发，不跳转、不闪新标签，
                     所以地址栏里不会出现镜像的 IP/域名。 -->
                <WinButton
                  v-if="isMirrorableUrl(download.url)"
                  class="detail-mirror-button"
                  Style="AccentButtonStyle"
                  :disabled="accelerateBusy"
                  @click="accelerateDownload(download)">
                  <span class="detail-mirror-button-icon" aria-hidden="true">&#xE945;</span>
                  <span>{{ t('detail.mirror-button') }}</span>
                </WinButton>
              </div>
            </div>

            <!-- 加速后的兜底提示：该通道不可用（拦截 / 限速 / 节点失效）时
                 用户可自行更换 —— 无需联系维护者。点击展开镜像列表。 -->
            <p v-if="mirrorHintUrl === download.url" class="detail-mirror-hint">
              <button
                type="button"
                class="detail-mirror-hint-link"
                :aria-expanded="mirrorOpenUrl === download.url"
                @click="toggleMirror(download.url)">
                {{ t('detail.mirror-hint') }}
              </button>
            </p>

            <!-- 换个镜像：列出除刚才使用那条以外的通道（自建节点排第一时即原四个公益镜像），
                 点击哪条即走哪条，同样不跳转 -->
            <div v-if="mirrorOpenUrl === download.url" class="detail-mirror-panel">
              <p class="detail-mirror-desc">{{ t('detail.mirror-desc') }}</p>
              <div class="detail-mirror-channels">
                <a
                  v-for="channel in alternativeChannels"
                  :key="channel.id"
                  class="detail-mirror-channel"
                  :href="mirrorHref(download, channel)"
                  rel="noopener noreferrer"
                  @click.prevent="onMirrorClick(download, channel)">
                  <span class="detail-mirror-channel-name">{{ channel.name }}</span>
                </a>
              </div>
              <p class="detail-mirror-note">{{ t('detail.mirror-note') }}</p>
            </div>
          </div>
        </div>
        <p v-else-if="storeLink" class="detail-store-only-hint">{{ t('detail.store-only') }}</p>

        <!-- 软件仅有商店一个入口时：本机未安装商店会形成循环提示（商店引导安装商店），
             故补充「如何恢复商店」的说明 —— wsreset -i 是 Windows 内置的静默重装开关 -->
        <p v-if="storeLink && !otherDownloads.length" class="detail-store-nostore">{{ t('detail.store-nostore') }}</p>
      </template>

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
import { isSafeNavigateUrl, kindOf, triggerDownload } from '../downloadLink';
import { OssDownloadError, ossKeyOf, resolveDownloadDetail } from '../ossDownload';
import {
  fetchSelfSignedUrl,
  isMirrorableUrl,
  mirrorUrl,
  orderedChannels,
  preferredChannelId,
  rememberChannel,
  usableChannels
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
// 文件直链在本页直接下载：隐藏 <a> 触发，当前页不动、不闪新标签。
// 网盘 / 官网下载页只能跳转 —— 因此按钮文案与说明需明确去向，避免用户点击后才发现离开本页。

// 本站 OSS 对象不是能直接点的地址：先换一张短时票据，再触发下载。
// 换票期间按钮上显示「正在准备下载…」，失败就在下载区顶部说明原因。
const downloadPreparing = ref('');
const downloadError = ref('');
/** 直连通道的额外说明（有效期短，中断了要重新点）—— 与错误提示分开显示 */
const downloadNotice = ref('');

const downloadErrorText = (error: unknown) => {
  if (error instanceof OssDownloadError && error.code === 'quota') return t('detail.download-quota');
  return t('detail.download-failed');
};

const openDownload = async (download: DownloadItem) => {
  const url = download.url;
  if (!url) return;
  if (kindOf(download) !== 'file') {
    // 白名单兜底：数据里混进 javascript: 这类串时不开新窗口（kindOf 已把它归为 page）
    if (isSafeNavigateUrl(url)) window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  downloadError.value = '';
  downloadNotice.value = '';
  if (!ossKeyOf(url)) {
    triggerDownload(url);
    return;
  }
  downloadPreparing.value = url;
  try {
    const detail = await resolveDownloadDetail(url);
    triggerDownload(detail.url);
    // direct 是一条**不带设备凭据**的短时地址，有效期按体积分档；relay 走票据中继，
    // 只在开始下载时校验一次，中途断了也不会失效。所以只有 direct 需要提醒用户。
    if (detail.mode === 'direct') downloadNotice.value = t('detail.download-expired');
  } catch (error) {
    downloadError.value = downloadErrorText(error);
  } finally {
    downloadPreparing.value = '';
  }
};

/** 主按钮文案：可直下时显示「下载」，需跳转时说明去向 */
const downloadButtonText = (download: DownloadItem) => {
  if (downloadPreparing.value && downloadPreparing.value === download.url) {
    return t('detail.download-preparing');
  }
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
  // 商店链接也过一遍白名单（ms-windows-store: 协议在名单里，不受影响）
  if (target && isSafeNavigateUrl(target)) {
    window.open(target, '_blank', 'noopener,noreferrer');
  }
};

// ── 校验值（downloads[].hash）───────────────────────────────────────────
// 128 位的 SHA512 完整显示会超出卡片宽度，故仅显示首尾几位，
// 完整值置于 title、点击复制。填写 hash 时只写十六进制即可，算法按长度推断。

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
// 主按钮始终是 GitHub 官方直链；「加速下载」点击后**直接在本页开始下载**，
// 不跳转、不闪新标签 —— 用隐藏 <a> 触发，地址栏里不会出现镜像的 IP。
// 下载失败时保留一行「不能下载？点我换个镜像」提示，展开其余通道重试。
//
// 两条状态各用一条 url 记（同一个软件不会有两行同一个链接）：
//   mirrorHintUrl —— 点过加速、该显示那行小字的那条
//   mirrorOpenUrl —— 小字点开后、展开着换镜像面板的那条

/** 点过加速下载的那条链接；空串表示还没点过 */
const mirrorHintUrl = ref('');
/** 当前展开着「换个镜像」面板的那条链接；空串表示都没展开 */
const mirrorOpenUrl = ref('');

// 切换到其他软件时组件会被复用（ref 不会自动清空），此处收起展开的面板和复制状态
watch(
  () => route.params.id,
  () => {
    mirrorHintUrl.value = '';
    mirrorOpenUrl.value = '';
    copiedHash.value = '';
  }
);

/** 上次用过的通道排到最前 —— 常用的话能少点一下 */
const preferredId = ref(preferredChannelId());

/**
 * 可用通道，按「上次用过的排第一」排序。
 * 不可用的通道（http 前缀 + 页面是 https）已在 usableChannels() 中滤除，
 * 此处不再重复判断 —— 判断逻辑只保留在 githubMirror.ts 一处。
 */
const channels = computed(() => orderedChannels(preferredId.value));

/**
 * 点「加速下载」默认走的那条 = 自建节点，**不受 localStorage 里旧选择影响**。
 * 用户之前可能点过 ghproxy 并存进 localStorage；若让那条继续当默认，就违背「默认用自建节点」的要求。
 * 这里硬取自建节点（https 页面下一定可用），记住的选择只用来给「换个镜像」面板排序。
 */
const accelerateChannel = computed<MirrorChannel | null>(() => {
  const usable = usableChannels();
  return usable.find((channel) => channel.self) || usable[0] || null;
});

/**
 * 「换个镜像」里列出的候选 = 除刚刚作为默认用过的那条（自建节点）以外的全部通道。
 * 用户点开这一栏是想换掉刚失败的那条，所以不再把原样列回去 —— 这里正好是原来那四个公益镜像。
 */
const alternativeChannels = computed(() =>
  channels.value.filter((channel) => channel.id !== accelerateChannel.value?.id)
);

/** 拼出该下载项在某个通道下的链接（url 为可选字段，此处兜底空值） */
const mirrorHref = (download: DownloadItem, channel: MirrorChannel) =>
  download.url ? mirrorUrl(download.url, channel) : '';

const accelerateBusy = ref(false);

/**
 * 加速下载：默认走自建节点，**直接在本页触发下载**（不导航、不留 DOM）。
 *
 * 自建节点开启了「无签名一律 403」的防盗链，不能像公益镜像那样前缀直拼 ——
 * 需先向本站 Worker 申请一条 15 分钟有效的限时签名链接；申请失败（节点未配置 /
 * 接口不可用）则退回第一条公益镜像，保证用户始终可以下载。
 * 同时显示「不能下载？」提示行 —— 下载结果仅用户可知，
 * 当场提供备选路径优于事后反馈。
 */
const accelerateDownload = async (download: DownloadItem) => {
  if (!download.url || accelerateBusy.value) return;
  const channel = accelerateChannel.value;
  if (!channel) return;
  accelerateBusy.value = true;
  try {
    let href = '';
    if (channel.self) {
      const signed = await fetchSelfSignedUrl(download.url);
      if (signed) {
        href = signed;
      } else {
        // 签名获取失败：退回第一条公益镜像（自建节点不在「换个镜像」清单中，此处手动选取）
        const fallback = usableChannels().find((item) => !item.self);
        if (fallback) href = mirrorUrl(download.url, fallback);
      }
    } else {
      href = mirrorUrl(download.url, channel);
    }
    if (!href) return;
    triggerDownload(href);
    preferredId.value = channel.id;
    rememberChannel(channel.id);
    mirrorHintUrl.value = download.url;
    mirrorOpenUrl.value = '';
  } finally {
    accelerateBusy.value = false;
  }
};

const toggleMirror = (url?: string) => {
  if (!url) return;
  mirrorOpenUrl.value = mirrorOpenUrl.value === url ? '' : url;
};

/** 更换镜像：同样在本页触发下载，不跳转；点击后收起面板作为操作反馈 */
const onMirrorClick = (download: DownloadItem, channel: MirrorChannel) => {
  const href = mirrorHref(download, channel);
  if (href) triggerDownload(href);
  preferredId.value = channel.id;
  rememberChannel(channel.id);
  mirrorOpenUrl.value = '';
};
</script>
