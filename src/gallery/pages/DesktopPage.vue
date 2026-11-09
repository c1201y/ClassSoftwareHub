<template>
  <WinScrollViewer
    class="gallery-page-scroll"
    VerticalScrollBarVisibility="Auto"
    VerticalScrollMode="Auto">
    <div class="gallery-page-content desktop-page">
      <!-- ── A. Hero ───────────────────────────────────────────────
           与文档站一致：图标 + 标题 + 一句话说明，居中。 -->
      <section class="dl-hero">
        <img class="dl-hero-logo" :src="siteIcon" alt="ClassSoftwareHub" />
        <h1 class="dl-hero-title">{{ t('desktop.hero-title') }}</h1>
        <p class="dl-hero-subtitle">{{ t('desktop.hero-subtitle') }}</p>
      </section>

      <!-- ── B. 通道切换（正式版 / 预览版）─────────────────────────
           文档站是「版本通道」按钮组；这里按平台各自一组，
           因为 Win7 的预览线与主桌面版不同步。 -->
      <section class="dl-platforms">
        <button
          v-for="p in platformTabs"
          :key="p.id"
          type="button"
          class="dl-platform-tab"
          :class="{ 'is-active': activePlatform === p.id, 'is-soon': p.soon }"
          @click="activePlatform = p.id">
          <span class="dl-platform-icon" aria-hidden="true">{{ p.icon }}</span>
          <span class="dl-platform-name">{{ t(p.nameKey) }}</span>
        </button>
      </section>

      <p v-if="loading" class="dl-loading">{{ t('desktop.loading') }}</p>

      <WinInfoBar
        v-else-if="allEmpty"
        class="dl-error-bar"
        :IsOpen="true"
        :IsClosable="false"
        Severity="Warning"
        :Title="t('desktop.load-failed-title')"
        :Message="t('desktop.load-failed-desc')" />

      <template v-else>
        <!-- ── C. 当前平台：通道切换 ────────────────────────────── -->
        <section v-if="!currentCard.soon" class="dl-channel-row">
          <span class="dl-label">{{ t('desktop.channel-label') }}</span>
          <div class="dl-channel-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              class="dl-channel-tab"
              :class="{ 'is-active': activeChannel === 'stable' }"
              :aria-selected="activeChannel === 'stable'"
              @click="activeChannel = 'stable'">
              {{ t('desktop.channel-stable') }}
            </button>
            <button
              type="button"
              role="tab"
              class="dl-channel-tab"
              :class="{ 'is-active': activeChannel === 'insider' }"
              :aria-selected="activeChannel === 'insider'"
              @click="activeChannel = 'insider'">
              {{ t('desktop.channel-insider') }}
            </button>
          </div>
        </section>

        <!-- ── D. 主下载按钮 + 其余产物下拉 ─────────────────────── -->
        <section v-if="!currentCard.soon && currentRows.length" class="dl-main-section">
          <div class="dl-split-btn">
            <button
              type="button"
              class="dl-main-btn"
              :disabled="busy"
              @click="download(primaryRow.id)">
              <span class="dl-btn-icon" aria-hidden="true">&#xE896;</span>
              <span>{{ busy ? t('desktop.downloading') : t('desktop.download-now') }}</span>
            </button>

            <div v-if="secondaryRows.length" class="dl-split-more">
              <button
                type="button"
                class="dl-split-trigger"
                :aria-expanded="assetMenuOpen"
                :aria-label="t('desktop.more-builds')"
                @click="assetMenuOpen = !assetMenuOpen">
                <span class="dl-chevron" aria-hidden="true">&#xE70D;</span>
              </button>
              <div v-if="assetMenuOpen" class="dl-asset-menu">
                <button
                  v-for="row in secondaryRows"
                  :key="row.id"
                  type="button"
                  class="dl-asset-item"
                  :disabled="busy"
                  @click="download(row.id)">
                  <span class="dl-asset-name">{{ t(row.nameKey) }}</span>
                  <span class="dl-asset-meta">
                    <span class="dl-asset-tag">{{ row.build?.tag }}</span>
                    <span class="dl-asset-size">{{ formatSize(row.build?.size) }}</span>
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div class="dl-main-meta">
            <span class="dl-meta-tag">{{ primaryRow.build?.tag }}</span>
            <span class="dl-meta-size">{{ formatSize(primaryRow.build?.size) }}</span>
            <span v-if="primaryRow.build?.publishedAt" class="dl-meta-date">
              {{ formatDate(primaryRow.build.publishedAt) }}
            </span>
          </div>
          <p class="dl-main-note">{{ t(primaryRow.noteKey) }}</p>
        </section>

        <!-- 该平台在该通道下没有产物 -->
        <p v-else-if="!currentCard.soon" class="dl-empty">{{ t('desktop.no-builds') }}</p>

        <!-- ── E. 选项行：下载线路 ──────────────────────────────── -->
        <section v-if="!currentCard.soon" class="dl-options">
          <div class="dl-option-group">
            <span class="dl-label">{{ t('desktop.source-label') }}</span>
            <div class="dl-source-wrap">
              <button
                type="button"
                class="dl-source-trigger"
                :aria-expanded="sourceMenuOpen"
                @click="sourceMenuOpen = !sourceMenuOpen">
                <span class="dl-source-dot" :class="{ 'is-self': !selectedIsOfficial }" aria-hidden="true"></span>
                <span class="dl-source-current">{{ selectedSourceName }}</span>
                <span class="dl-chevron" aria-hidden="true">&#xE70D;</span>
              </button>
              <div v-if="sourceMenuOpen" class="dl-source-menu">
                <button
                  v-for="opt in sourceOptions"
                  :key="opt.id"
                  type="button"
                  class="dl-source-item"
                  :class="{ 'is-selected': opt.id === sourceChannelId }"
                  @click="pickSource(opt.id)">
                  <span class="dl-source-dot" :class="{ 'is-self': opt.id !== OFFICIAL_CHANNEL_ID }" aria-hidden="true"></span>
                  <span class="dl-source-info">
                    <span class="dl-source-name">{{ opt.name }}</span>
                    <span class="dl-source-desc">{{ t(opt.descKey) }}</span>
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div class="dl-option-group">
            <span class="dl-label">{{ t('desktop.requirements-label') }}</span>
            <span class="dl-requirement">{{ t(currentCard.requirementKey) }}</span>
          </div>
        </section>

        <!-- 全部线路都不行时的说明 -->
        <p v-if="downloadFailed" class="dl-failed">{{ t('desktop.download-failed') }}</p>

        <!-- ── F. Linux 占位 ────────────────────────────────────── -->
        <section v-if="currentCard.soon" class="dl-soon">
          <span class="dl-soon-icon" aria-hidden="true">&#xE7F8;</span>
          <p class="dl-soon-text">{{ t('desktop.coming-soon') }}</p>
        </section>

        <!-- ── G. 更新日志 ──────────────────────────────────────── -->
        <section v-if="!currentCard.soon && changelogHtml" class="dl-changelog">
          <div class="dl-changelog-head">
            <h2 class="dl-changelog-title">{{ t('desktop.changelog') }}</h2>
            <span class="dl-changelog-tag">{{ currentBuild?.tag }}</span>
          </div>
          <!-- 内容来自 GitHub Release 正文（他人可写），必须经 DOMPurify 消毒 -->
          <div class="dl-changelog-body" v-html="changelogHtml"></div>
        </section>

        <!-- ── H. 页脚：历史版本 + 文档 + 校验说明 ──────────────── -->
        <footer class="dl-footer">
          <div class="dl-footer-links">
            <a
              v-if="currentCard.repoUrl"
              class="dl-footer-link"
              :href="currentCard.repoUrl"
              target="_blank"
              rel="noopener noreferrer">{{ t('desktop.history') }}</a>
            <a
              class="dl-footer-link"
              :href="DOCS_URL"
              target="_blank"
              rel="noopener noreferrer">{{ t('desktop.docs') }}</a>
            <a
              v-if="currentBuild"
              class="dl-footer-link"
              :href="md5Of(currentBuild)"
              target="_blank"
              rel="noopener noreferrer">{{ t('desktop.md5') }}</a>
          </div>
          <p class="dl-footer-note">{{ t('desktop.mirror-note') }}</p>
        </footer>
      </template>
    </div>
  </WinScrollViewer>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import WinScrollViewer from '../../components/WinScrollViewer.vue';
import WinInfoBar from '../../components/WinInfoBar.vue';
import { useI18n } from '../../components/i18n/index';
import {
  ANDROID_RELEASES_URL,
  DESKTOP_RELEASES_URL,
  DOCS_URL,
  OFFICIAL_CHANNEL_ID,
  WIN7_RELEASES_URL,
  downloadBuildDirect,
  downloadBuildVia,
  entryOf,
  mirrorChoices,
  resolveDownloadEntries
} from '../desktopDownload';
import type { DesktopBuild, DownloadEntries, DownloadId } from '../desktopDownload';
// 站点自己的应用图标（512 px PNG）。走 import 而不是 public/，
// 这样单文件构建（SINGLEFILE=1）会把它内联，离线版也能显示。
import siteIconUrl from '../../assets/AppIcon-512.png';
import '../styles/desktop-page.css';

const { t } = useI18n();

/** Hero 用的站点图标 */
const siteIcon = siteIconUrl;

type PlatformId = 'win10' | 'win7' | 'android' | 'linux';
type ChannelId = 'stable' | 'insider';

const activePlatform = ref<PlatformId>('win10');
const activeChannel = ref<ChannelId>('stable');
const assetMenuOpen = ref(false);
const sourceMenuOpen = ref(false);
const busy = ref(false);
const downloadFailed = ref(false);

const entries = ref<DownloadEntries | null>(null);
const loading = ref(true);

/** 线路清单（自建节点排最前）；不可用线路已由 githubMirror 过滤 */
const channels = mirrorChoices();
const sourceChannelId = ref(channels[0]?.id ?? '');
const selectedChannel = computed(() => channels.find((c) => c.id === sourceChannelId.value) ?? channels[0]);

/** 下拉里的完整清单 = 全部镜像 + 末尾的「GitHub 官方」 */
const sourceOptions = computed(() => [
  ...channels.map((ch) => ({
    id: ch.id,
    name: ch.name,
    descKey: ch.self ? 'desktop.source-self' : 'desktop.source-mirror'
  })),
  { id: OFFICIAL_CHANNEL_ID, name: 'GitHub', descKey: 'desktop.source-official' }
]);

/** 当前选中线路的显示名（官方那条不在 channels 里，要单独取） */
const selectedSourceName = computed(
  () => sourceOptions.value.find((o) => o.id === sourceChannelId.value)?.name ?? ''
);
const selectedIsOfficial = computed(() => sourceChannelId.value === OFFICIAL_CHANNEL_ID);

interface RowDef {
  id: DownloadId;
  nameKey: string;
  noteKey: string;
  build: DesktopBuild | null;
}

interface PlatformTab {
  id: PlatformId;
  icon: string;
  nameKey: string;
  soon?: boolean;
}

const platformTabs: PlatformTab[] = [
  { id: 'win10', icon: '\uE977', nameKey: 'desktop.tab-win10' },
  { id: 'win7', icon: '\uE7F8', nameKey: 'desktop.tab-win7' },
  { id: 'android', icon: '\uE8EA', nameKey: 'desktop.tab-android' },
  { id: 'linux', icon: '\uE7F8', nameKey: 'desktop.tab-linux', soon: true }
];

/** 当前平台的卡片配置（requirementKey / 仓库地址 / 各通道对应的行） */
const CARD_CONFIG: Record<PlatformId, { requirementKey: string; repoUrl: string; soon?: boolean }> = {
  win10: { requirementKey: 'desktop.win10-requirement', repoUrl: DESKTOP_RELEASES_URL },
  win7: { requirementKey: 'desktop.win7-requirement', repoUrl: WIN7_RELEASES_URL },
  android: { requirementKey: 'desktop.android-requirement', repoUrl: ANDROID_RELEASES_URL },
  linux: { requirementKey: 'desktop.linux-requirement', repoUrl: '', soon: true }
};

const currentCard = computed(() => CARD_CONFIG[activePlatform.value]);

/** 当前平台 + 当前通道下的行。安卓不区分预览通道，两档取同一份。 */
const currentRows = computed<RowDef[]>(() => {
  const e = entries.value;
  if (!e) return [];
  const row = (id: DownloadId, nameKey: string, noteKey: string): RowDef => ({
    id,
    nameKey,
    noteKey,
    build: entryOf(e, id)
  });
  const ch = activeChannel.value;

  switch (activePlatform.value) {
    case 'win10':
      return ch === 'stable'
        ? [row('stable', 'desktop.row-stable', 'desktop.note-win10-setup')]
        : [row('insider', 'desktop.row-insider', 'desktop.note-win10-setup')];
    case 'win7':
      return ch === 'stable'
        ? [
            row('win7-setup', 'desktop.row-win7-setup', 'desktop.note-win7-setup'),
            row('win7-portable', 'desktop.row-win7-portable', 'desktop.note-win7-portable')
          ]
        : [
            row('win7-insider-setup', 'desktop.row-win7-insider-setup', 'desktop.note-win7-setup'),
            row('win7-insider-portable', 'desktop.row-win7-insider-portable', 'desktop.note-win7-portable')
          ];
    case 'android':
      return [row('android', 'desktop.row-android', 'desktop.note-android')];
    default:
      return [];
  }
});

/** 主按钮那一行 = 第一条有 build 的；下拉里放其余的 */
const primaryRow = computed(() => currentRows.value.find((r) => r.build) ?? currentRows.value[0]);
const secondaryRows = computed(() =>
  currentRows.value.filter((r) => r !== primaryRow.value && r.build)
);
const currentBuild = computed(() => primaryRow.value?.build ?? null);

/** 一条产物都没取到（接口全挂） */
const allEmpty = computed(() => {
  const e = entries.value;
  if (!e) return false;
  return !Object.values(e).some(Boolean);
});

/* ── 更新日志：GitHub Release 正文是他人可写内容，必须消毒 ──────────── */
const changelogHtml = computed(() => {
  const body = currentBuild.value?.changelog;
  if (!body || !body.trim()) return '';
  try {
    // Release 正文里常带整图的 ![](url)，渲染出来会把版面撑破，先去掉
    const cleaned = body.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/<img\s[^>]*\/?>/gi, '');
    const raw = marked.parse(cleaned, { async: false }) as string;
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'blockquote', 'pre', 'code',
        'ul', 'ol', 'li', 'strong', 'em', 'del', 's', 'a', 'table', 'thead', 'tbody',
        'tr', 'th', 'td', 'span', 'div'
      ],
      ALLOWED_ATTR: ['href', 'title', 'class', 'align'],
      ALLOW_DATA_ATTR: false
    });
  } catch {
    return '';
  }
});

/* ── 工具 ─────────────────────────────────────────────────────────── */

/** 字节数 → 「83.0 MB」；取不到时返回空串（不显示） */
const formatSize = (bytes?: number) => {
  if (!bytes) return '';
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
};

/** ISO 日期 → YYYY-MM-DD */
const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const md5Of = (build: DesktopBuild) => `${build.url}.md5`;

/* ── 交互 ─────────────────────────────────────────────────────────── */

const download = async (id: DownloadId) => {
  if (busy.value || !entries.value) return;
  const build = entryOf(entries.value, id);
  if (!build) return;
  busy.value = true;
  downloadFailed.value = false;
  assetMenuOpen.value = false;
  try {
    // 用用户明确选中的线路；选的是「GitHub 官方」就直接走官方
    if (selectedIsOfficial.value) {
      downloadBuildDirect(build);
    } else {
      const result = await downloadBuildVia(build, sourceChannelId.value);
      if (result === 'failed') downloadFailed.value = true;
    }
  } finally {
    busy.value = false;
  }
};

const pickSource = (id: string) => {
  sourceChannelId.value = id;
  sourceMenuOpen.value = false;
  downloadFailed.value = false;
};

/** 点空白处收起两个下拉（与文档站一致） */
const closeMenus = (e: MouseEvent) => {
  const target = e.target as HTMLElement | null;
  if (!target?.closest('.dl-split-more')) assetMenuOpen.value = false;
  if (!target?.closest('.dl-source-wrap')) sourceMenuOpen.value = false;
};

onMounted(async () => {
  document.addEventListener('click', closeMenus);
  try {
    entries.value = await resolveDownloadEntries();
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('click', closeMenus);
});
</script>
