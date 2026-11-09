<template>
  <WinScrollViewer
    class="gallery-page-scroll"
    VerticalScrollBarVisibility="Auto"
    VerticalScrollMode="Auto">
    <div class="gallery-page-content desktop-page">
      <!-- ═══ A. Hero：与文档站一致（图标 + 标题 + 副标题，居中）═══ -->
      <section class="hero-section">
        <img class="hero-logo" :src="siteIcon" alt="ClassSoftwareHub" />
        <h1 class="hero-title">{{ t('desktop.hero-title') }}</h1>
        <p class="hero-subtitle">{{ t('desktop.hero-subtitle') }}</p>
      </section>

      <!-- ═══ B. 主下载按钮（WinSplitButton：主按钮 + 下拉换产物）═══ -->
      <section class="download-btn-section">
        <p v-if="loading" class="loading-inline">{{ t('desktop.loading') }}</p>

        <WinInfoBar
          v-else-if="allEmpty"
          class="error-bar"
          :IsOpen="true"
          :IsClosable="false"
          Severity="Error"
          :Title="t('desktop.load-failed-title')"
          :Message="t('desktop.load-failed-desc')" />

        <template v-else-if="primaryRow">
          <WinSplitButton
            class="split-download-btn"
            :Content="busy ? t('desktop.downloading') : t('desktop.download-now')"
            :IsEnabled="!busy"
            :Options="assetOptions"
            @Click="download(primaryRow.id)"
            @Select="onAssetSelect">
            <!-- @vue-expect-error 上游 WinSplitButton 未导出插槽类型，运行时正常 -->
            <template #main="{ onClick, isDisabled }">
              <WinButton
                class="win-split-main-button main-btn"
                Style="AccentButtonStyle"
                :IsEnabled="!isDisabled"
                @Click="onClick">
                <span class="btn-icon" aria-hidden="true">&#xE896;</span>
                <span>{{ busy ? t('desktop.downloading') : t('desktop.download-now') }}</span>
              </WinButton>
            </template>
          </WinSplitButton>

          <div class="download-meta">
            <span class="meta-tag">{{ primaryRow.build?.tag }}</span>
            <span class="meta-size">{{ formatSize(primaryRow.build?.size) }}</span>
          </div>
        </template>

        <p v-else class="no-assets">{{ t('desktop.no-builds') }}</p>
      </section>

      <!-- ═══ C. 选项行：下载源（ComboBox）+ 版本通道（SelectorBar）═══ -->
      <section class="options-row">
        <div class="option-group">
          <label class="option-label">{{ t('desktop.source-label') }}</label>
          <WinComboBox
            class="source-combo"
            :ItemsSource="sourceOptions"
            DisplayMemberPath="name"
            v-model:SelectedIndex="sourceIndex" />
        </div>

        <div class="option-group">
          <label class="option-label">{{ t('desktop.channel-label') }}</label>
          <WinSelectorBar
            class="channel-bar"
            :Items="channelItems"
            :SelectedItem="selectedChannelItem"
            @SelectionChanged="onChannelChanged" />
        </div>
      </section>

      <!-- ═══ D. 平台切换：与文档站同一节奏，放在下方作为版本入口 ═══ -->
      <section class="platform-row">
        <span class="option-label">{{ t('desktop.platform-label') }}</span>
        <WinSelectorBar
          class="platform-bar"
          :Items="platformItems"
          :SelectedItem="selectedPlatformItem"
          @SelectionChanged="onPlatformChanged" />
      </section>

      <!-- 线路/系统要求说明 -->
      <section v-if="!card.soon" class="meta-row">
        <span class="requirement-text">{{ t(card.requirementKey) }}</span>
      </section>

      <p v-if="downloadFailed" class="hint-failed">{{ t('desktop.download-failed') }}</p>

      <!-- ═══ E. Linux 占位 ═══ -->
      <WinInfoBar
        v-if="card.soon"
        class="soon-bar"
        :IsOpen="true"
        :IsClosable="false"
        Severity="Informational"
        :Title="t('desktop.tab-linux')"
        :Message="t('desktop.coming-soon')" />

      <!-- ═══ F. 更新日志（与文档站同款卡片）═══ -->
      <section v-if="!card.soon && changelogHtml" class="changelog-section">
        <div class="section-header">
          <h2 class="changelog-heading">{{ t('desktop.changelog') }}</h2>
          <span class="version-badge">{{ currentBuild?.tag }}</span>
        </div>
        <div class="changelog-body markdown-body" v-html="changelogHtml"></div>
      </section>

      <!-- ═══ G. 页脚：历史版本 / 文档 / 校验值 ═══ -->
      <div class="history-link">
        <a v-if="card.repoUrl" :href="card.repoUrl" target="_blank" rel="noopener noreferrer">
          {{ t('desktop.history') }}
        </a>
        <a :href="DOCS_URL" target="_blank" rel="noopener noreferrer">{{ t('desktop.docs') }}</a>
        <a v-if="currentBuild" :href="md5Of(currentBuild)" target="_blank" rel="noopener noreferrer">
          {{ t('desktop.md5') }}
        </a>
      </div>

      <p class="mirror-note">{{ t('desktop.mirror-note') }}</p>
    </div>
  </WinScrollViewer>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import WinScrollViewer from '../../components/WinScrollViewer.vue';
import WinButton from '../../components/WinButton.vue';
import WinSplitButton from '../../components/WinSplitButton.vue';
import WinComboBox from '../../components/WinComboBox.vue';
import WinSelectorBar from '../../components/WinSelectorBar.vue';
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
import siteIconUrl from '../../assets/AppIcon-512.png';
import '../styles/desktop-page.css';

const { t } = useI18n();
const siteIcon = siteIconUrl;

type PlatformId = 'win10' | 'win7' | 'android' | 'linux';
type ChannelId = 'stable' | 'insider';

/* ── 状态 ─────────────────────────────────────────────────────────── */

const entries = ref<DownloadEntries | null>(null);
const loading = ref(true);
const busy = ref(false);
const downloadFailed = ref(false);

const activePlatform = ref<PlatformId>('win10');
const activeChannel = ref<ChannelId>('stable');

/* ── 平台 / 通道 / 线路 三组数据 ──────────────────────────────────── */

interface PlatformDef {
  id: PlatformId;
  labelKey: string;
  icon: string;
  requirementKey: string;
  repoUrl: string;
  soon?: boolean;
}

const PLATFORMS: PlatformDef[] = [
  { id: 'win10', labelKey: 'desktop.tab-win10', icon: '\uE977', requirementKey: 'desktop.win10-requirement', repoUrl: DESKTOP_RELEASES_URL },
  { id: 'win7', labelKey: 'desktop.tab-win7', icon: '\uE7F8', requirementKey: 'desktop.win7-requirement', repoUrl: WIN7_RELEASES_URL },
  { id: 'android', labelKey: 'desktop.tab-android', icon: '\uE8EA', requirementKey: 'desktop.android-requirement', repoUrl: ANDROID_RELEASES_URL },
  { id: 'linux', labelKey: 'desktop.tab-linux', icon: '\uE7F8', requirementKey: 'desktop.linux-requirement', repoUrl: '', soon: true }
];

/** WinSelectorBar 的 Items：{ Text, Tag, Icon } */
const platformItems = computed(() =>
  PLATFORMS.map((p) => ({ Text: t(p.labelKey), Tag: p.id, Icon: p.icon }))
);
const selectedPlatformItem = computed(() => platformItems.value.find((i) => i.Tag === activePlatform.value));
const onPlatformChanged = (sender: { SelectedItem?: { Tag?: string } } | null) => {
  const tag = sender?.SelectedItem?.Tag as PlatformId | undefined;
  if (tag) activePlatform.value = tag;
};

const channelItems = computed(() => [
  { Text: t('desktop.channel-stable'), Tag: 'stable' },
  { Text: t('desktop.channel-insider'), Tag: 'insider' }
]);
const selectedChannelItem = computed(() => channelItems.value.find((i) => i.Tag === activeChannel.value));
const onChannelChanged = (sender: { SelectedItem?: { Tag?: string } } | null) => {
  const tag = sender?.SelectedItem?.Tag as ChannelId | undefined;
  if (tag) activeChannel.value = tag;
};

/** 下载线路：自建节点 + 公益镜像 + GitHub 官方 */
const channels = mirrorChoices();
interface SourceOption {
  name: string;
  id: string;
  descKey: string;
}
const sourceOptions = computed<SourceOption[]>(() => [
  ...channels.map((ch) => ({
    name: ch.name,
    id: ch.id,
    descKey: ch.self ? 'desktop.source-self' : 'desktop.source-mirror'
  })),
  { name: 'GitHub', id: OFFICIAL_CHANNEL_ID, descKey: 'desktop.source-official' }
]);
const sourceIndex = ref(0);
const selectedSourceId = computed(() => sourceOptions.value[sourceIndex.value]?.id ?? channels[0]?.id ?? '');

/* ── 当前卡片 ─────────────────────────────────────────────────────── */

const card = computed(() => PLATFORMS.find((p) => p.id === activePlatform.value) ?? PLATFORMS[0]);

interface RowDef {
  id: DownloadId;
  nameKey: string;
  noteKey: string;
  build: DesktopBuild | null;
}

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

const primaryRow = computed(() => currentRows.value.find((r) => r.build) ?? null);
const currentBuild = computed(() => primaryRow.value?.build ?? null);

/** 下拉里的其余产物（WinSplitButton 的 Options 格式：{ Text, Tag }） */
const assetOptions = computed(() =>
  currentRows.value
    .filter((r) => r !== primaryRow.value && r.build)
    .map((r) => ({
      Text: `${t(r.nameKey)} · ${r.build?.tag ?? ''}`,
      Tag: r.id
    }))
);

const onAssetSelect = (option: { Tag?: string } | null) => {
  const id = option?.Tag as DownloadId | undefined;
  if (id) void download(id);
};

const allEmpty = computed(() => {
  const e = entries.value;
  if (!e) return false;
  return !Object.values(e).some(Boolean);
});

/* ── 更新日志 ─────────────────────────────────────────────────────── */

const changelogHtml = computed(() => {
  const body = currentBuild.value?.changelog;
  if (!body || !body.trim()) return '';
  try {
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

const formatSize = (bytes?: number) => {
  if (!bytes) return '';
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
};

const md5Of = (build: DesktopBuild) => `${build.url}.md5`;

/* ── 下载 ─────────────────────────────────────────────────────────── */

const download = async (id: DownloadId) => {
  if (busy.value || !entries.value) return;
  const build = entryOf(entries.value, id);
  if (!build) return;
  busy.value = true;
  downloadFailed.value = false;
  try {
    if (selectedSourceId.value === OFFICIAL_CHANNEL_ID) {
      downloadBuildDirect(build);
    } else {
      const result = await downloadBuildVia(build, selectedSourceId.value);
      if (result === 'failed') downloadFailed.value = true;
    }
  } finally {
    busy.value = false;
  }
};

onMounted(async () => {
  try {
    entries.value = await resolveDownloadEntries();
  } finally {
    loading.value = false;
  }
});
</script>
