<template>
  <WinScrollViewer
    class="gallery-page-scroll"
    VerticalScrollBarVisibility="Auto"
    VerticalScrollMode="Auto">
    <div class="gallery-page-content desktop-page">
      <!-- ═══ Hero ═══ -->
      <section class="dl-hero">
        <img class="dl-logo" :src="siteIcon" alt="ClassSoftwareHub" />
        <h1>{{ t('desktop.hero-title') }}</h1>
        <p>{{ t('desktop.hero-subtitle') }}</p>
      </section>

      <!-- ═══ 工具栏：版本通道 + 下载线路 ═══ -->
      <div class="dl-toolbar">
        <div class="dl-channel-slot">
          <WinSelectorBar
            class="channel-bar"
            :Items="channelItems"
            :SelectedItem="selectedChannelItem"
            @SelectionChanged="onChannelChanged" />
        </div>

        <div class="dl-source-picker">
          <span class="dl-source-label">{{ t('desktop.source-label') }}</span>
          <WinComboBox
            class="dl-source-combo"
            :ItemsSource="sourceOptions"
            DisplayMemberPath="name"
            v-model:SelectedIndex="sourceIndex" />
        </div>
      </div>

      <!-- ═══ 状态：加载中 / 全部失败 ═══ -->
      <div v-if="loading" class="dl-state">
        <span class="dl-state-icon dl-spin" aria-hidden="true">&#xE895;</span>
        <span>{{ t('desktop.loading') }}</span>
      </div>

      <div v-else-if="allEmpty" class="dl-state dl-error">
        <span class="dl-state-icon" aria-hidden="true">&#xE7BA;</span>
        <strong>{{ t('desktop.load-failed-title') }}</strong>
        <p>{{ t('desktop.load-failed-desc') }}</p>
        <div class="dl-state-actions">
          <a class="web-links" style="border: none; padding: 0; margin: 0" :href="DESKTOP_RELEASES_URL" target="_blank" rel="noopener noreferrer">
            {{ t('desktop.open-releases') }}
          </a>
        </div>
      </div>

      <template v-else>
        <!-- 线路失败提示 -->
        <div v-if="downloadFailed" class="dl-notice">
          <span class="dl-notice-text">{{ t('desktop.download-failed') }}</span>
        </div>

        <!-- ═══ 版本卡片网格（两列，与文档站 .dl-grid 一致）═══ -->
        <div class="dl-grid">
          <article v-for="ed in editions" :key="ed.id" class="edition-card">
            <header class="edition-head">
              <span class="edition-icon" aria-hidden="true">{{ ed.icon }}</span>
              <div class="edition-title">
                <h2>
                  {{ t(ed.titleKey) }}
                  <span v-if="ed.badgeKey" class="edition-badge">{{ t(ed.badgeKey) }}</span>
                </h2>
                <p>{{ t(ed.descKey) }}</p>
              </div>
            </header>

            <p class="edition-sys">
              <span class="icon-glyph" aria-hidden="true">&#xE7F8;</span>
              {{ t(ed.sysKey) }}
            </p>

            <div class="edition-version">
              <template v-if="ed.build">
                <span class="version-tag">{{ ed.build.tag }}</span>
                <span>{{ formatSize(ed.build.size) }}</span>
              </template>
              <template v-else-if="ed.soon">
                {{ t('desktop.coming-soon-short') }}
              </template>
            </div>

            <!-- 下载行：主产物 + 次产物（便携版等） -->
            <div v-if="ed.build" class="download-rows">
              <div v-for="row in ed.rows" :key="row.id" class="download-row">
                <div class="row-meta">
                  <span class="row-label">{{ t(row.nameKey) }}</span>
                  <span v-if="row.build?.size" class="row-size">{{ formatSize(row.build.size) }}</span>
                </div>
                <div class="row-actions">
                  <WinButton
                    class="row-primary"
                    Style="AccentButtonStyle"
                    :IsEnabled="busy === ''"
                    :Content="busy === row.id ? t('desktop.downloading') : t('desktop.download')"
                    @Click="download(row.id)" />
                  <WinHyperlinkButton
                    v-if="row.build"
                    class="btn-compact"
                    :Content="t('desktop.md5')"
                    :NavigateUri="md5Of(row.build)"
                    TargetName="_blank" />
                </div>
                <p v-if="row.build && !row.build.size" class="row-hint">{{ t(row.noteKey) }}</p>
              </div>

              <a v-if="ed.repoUrl" class="card-link" :href="ed.repoUrl" target="_blank" rel="noopener noreferrer">
                {{ t('desktop.history') }}
                <span class="icon-glyph" aria-hidden="true">&#xE8A7;</span>
              </a>
            </div>

            <p v-else class="edition-empty">{{ t('desktop.no-builds') }}</p>
          </article>
        </div>

        <!-- ═══ 历史版本（与文档站一致：按平台分两列，可展开看说明）═══
             放在卡片网格之外，理由同更新日志：展开不能影响卡片高度。 -->
        <section v-if="columns.length" class="history-section">
          <div class="section-head">
            <h2>{{ t('desktop.history-title') }}</h2>
            <p>{{ t('desktop.history-desc') }}</p>
          </div>
          <div class="history-grid">
            <div v-for="col in columns" :key="col.key" class="history-column">
              <h3>{{ t(col.titleKey) }}</h3>

              <details
                v-for="(item, index) in col.items"
                :key="col.key + item.tag"
                class="history-item">
                <summary>
                  <span class="history-tag">{{ item.tag }}</span>
                  <span v-if="index === 0" class="history-latest">{{ t('desktop.history-latest') }}</span>
                  <span class="history-date">{{ shortDate(item.publishedAt) }}</span>
                </summary>
                <div class="history-links">
                  <div v-for="kind in item.kinds" :key="kind.labelKey" class="history-link">
                    <span class="history-kind">{{ t(kind.labelKey) }}</span>
                    <span class="history-size">{{ formatSize(kind.size) }}</span>
                    <a
                      class="history-download"
                      :href="kind.url"
                      target="_blank"
                      rel="noopener noreferrer">
                      {{ t('desktop.history-download') }}
                    </a>
                  </div>
                  <p v-if="!item.kinds.length" class="history-empty">{{ t('desktop.history-no-file') }}</p>
                  <a
                    class="history-download ghost"
                    :href="item.releaseUrl"
                    target="_blank"
                    rel="noopener noreferrer">
                    {{ t('desktop.history-open-release') }}
                  </a>
                </div>
              </details>

              <button
                v-if="col.total > col.items.length"
                type="button"
                class="history-more"
                @click="showMore(col.key)">
                {{ t('desktop.history-show-more') }}
              </button>

              <p v-if="!col.items.length" class="history-empty">{{ t('desktop.history-none') }}</p>
            </div>
          </div>
        </section>

        <!-- ═══ 网页端链接行（文档站 .web-links 同款）═══ -->
        <div class="web-links">
          <span class="web-links-label">{{ t('desktop.web-label') }}</span>
          <a :href="DOCS_URL" target="_blank" rel="noopener noreferrer">{{ t('desktop.docs') }}</a>
          <a :href="REPO_URL" target="_blank" rel="noopener noreferrer">GitHub</a>
        </div>

        <p class="dl-footnote">{{ t('desktop.mirror-note') }}</p>
      </template>
    </div>
  </WinScrollViewer>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import WinScrollViewer from '../../components/WinScrollViewer.vue';
import WinButton from '../../components/WinButton.vue';
import WinHyperlinkButton from '../../components/WinHyperlinkButton.vue';
import WinComboBox from '../../components/WinComboBox.vue';
import WinSelectorBar from '../../components/WinSelectorBar.vue';
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
  fetchReleaseHistory,
  mirrorChoices,
  resolveDownloadEntries
} from '../desktopDownload';
import type { DesktopBuild, DownloadEntries, DownloadId, ReleaseHistoryItem } from '../desktopDownload';
import siteIconUrl from '../../assets/AppIcon-512.png';
import '../styles/desktop-page.css';

const { t } = useI18n();
const siteIcon = siteIconUrl;
const REPO_URL = 'https://github.com/c1201y/ClassSoftwareHub';

type PlatformId = 'win10' | 'win7' | 'android';
type ChannelId = 'stable' | 'insider';

const loading = ref(true);
const busy = ref('');
const downloadFailed = ref(false);
const entries = ref<DownloadEntries | null>(null);
const activeChannel = ref<ChannelId>('stable');

/** 两个仓库的历史版本（拿到才渲染，拿不到就空着） */
const history = ref<{ desktop: ReleaseHistoryItem[]; win7: ReleaseHistoryItem[] } | null>(null);

/** 仓库 slug（API 入口与 releaseUrl 都要用） */
const DESKTOP_REPO = 'c1201y/ClassSoftwareHub-Desktop';
const WIN7_REPO = 'c1201y/ClassSoftwareHub-windows7';

/* ── 版本通道（文档站是两个按钮的 channel-switch）────────────────── */

const channelItems = computed(() => [
  { Text: t('desktop.channel-stable'), Tag: 'stable' },
  { Text: t('desktop.channel-insider'), Tag: 'insider' }
]);
const selectedChannelItem = computed(() => channelItems.value.find((i) => i.Tag === activeChannel.value));
const onChannelChanged = (sender: { SelectedItem?: { Tag?: string } } | null) => {
  const tag = sender?.SelectedItem?.Tag as ChannelId | undefined;
  if (tag) activeChannel.value = tag;
};

/* ── 下载线路 ─────────────────────────────────────────────────────── */

const channels = mirrorChoices();
const sourceOptions = computed(() => [
  ...channels.map((ch) => ({ name: ch.name, id: ch.id })),
  { name: 'GitHub', id: OFFICIAL_CHANNEL_ID }
]);
const sourceIndex = ref(0);
const selectedSourceId = computed(() => sourceOptions.value[sourceIndex.value]?.id ?? '');

/* ── 版本卡片数据 ─────────────────────────────────────────────────── */

interface RowDef {
  id: DownloadId;
  nameKey: string;
  noteKey: string;
  build: DesktopBuild | null;
}

interface EditionDef {
  id: PlatformId;
  icon: string;
  titleKey: string;
  descKey: string;
  sysKey: string;
  repoUrl: string;
  rows: RowDef[];
  build: DesktopBuild | null;
  soon?: boolean;
  badgeKey?: string;
}

/** 与文档站的 edition 卡片一致：Win10/11 + Win7 两张并排，安卓单独一条 */
const editions = computed<EditionDef[]>(() => {
  const e = entries.value;
  const ch = activeChannel.value;

  const row = (id: DownloadId, nameKey: string, noteKey: string): RowDef => ({
    id,
    nameKey,
    noteKey,
    build: e ? entryOf(e, id) : null
  });

  const desktopId: DownloadId = ch === 'stable' ? 'stable' : 'insider';
  const win7SetupId: DownloadId = ch === 'stable' ? 'win7-setup' : 'win7-insider-setup';
  const win7PortableId: DownloadId = ch === 'stable' ? 'win7-portable' : 'win7-insider-portable';

  const desktopRows = [row(desktopId, 'desktop.row-installer', 'desktop.note-win10-setup')];
  const win7Rows = [
    row(win7SetupId, 'desktop.row-installer', 'desktop.note-win7-setup'),
    row(win7PortableId, 'desktop.row-portable', 'desktop.note-win7-portable')
  ];
  const androidRows = [row('android', 'desktop.row-apk', 'desktop.note-android')];

  const primary = (rows: RowDef[]) => rows.find((r) => r.build)?.build ?? null;

  const mk = (
    id: PlatformId,
    icon: string,
    titleKey: string,
    descKey: string,
    sysKey: string,
    repoUrl: string,
    rows: RowDef[],
    extra: Partial<EditionDef> = {}
  ): EditionDef => {
    const b = primary(rows);
    return {
      id,
      icon,
      titleKey,
      descKey,
      sysKey,
      repoUrl,
      rows: rows.filter((r) => r.build),
      build: b,
      ...extra
    };
  };

  return [
    mk('win10', '\uE977', 'desktop.win10-title', 'desktop.win10-desc', 'desktop.win10-requirement', DESKTOP_RELEASES_URL, desktopRows, {
      badgeKey: ch === 'insider' ? 'desktop.channel-insider' : ''
    }),
    mk('win7', '\uE7F8', 'desktop.win7-title', 'desktop.win7-desc', 'desktop.win7-requirement', WIN7_RELEASES_URL, win7Rows, {
      badgeKey: ch === 'insider' ? 'desktop.channel-insider' : ''
    }),
    // 安卓与桌面版并列展示（文档站也是把非桌面端作为独立那张卡）
    mk('android', '\uE8EA', 'desktop.android-title', 'desktop.android-desc', 'desktop.android-requirement', ANDROID_RELEASES_URL, androidRows),
    // Linux 占位卡：与文档站「coming soon」同一位置
    {
      id: 'win10',
      icon: '\uE7F8',
      titleKey: 'desktop.linux-title',
      descKey: 'desktop.linux-desc',
      sysKey: 'desktop.linux-requirement',
      repoUrl: '',
      rows: [],
      build: null,
      soon: true
    }
  ];
});

/** 一条都没取到 */
const allEmpty = computed(() => {
  const e = entries.value;
  if (!e) return false;
  return !Object.values(e).some(Boolean);
});

/* ── 历史版本 ─────────────────────────────────────────────────────── */

/** ISO → YYYY-MM-DD */
const shortDate = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** 历史版本里的一条下载项（同一 release 可能有安装版 + 便携版） */
interface HistoryKind {
  labelKey: string;
  size: number;
  url: string;
}

interface HistoryRow {
  tag: string;
  publishedAt: string;
  kinds: HistoryKind[];
  releaseUrl: string;
}

interface HistoryColumn {
  key: string;
  titleKey: string;
  items: HistoryRow[];
  /** 该通道下的版本总数（用于判断要不要显示「显示更多」） */
  total: number;
}

/**
 * 从某个仓库的历史里，按通道筛出该平台的版本列表。
 *
 * `kindsOf` 负责把「文件名数组」翻译成页面上的下载行 ——
 * 桌面版只有一个 .exe，Win7 版有安装版 + 便携版两种，所以交给调用方决定。
 */
const buildColumn = (
  history: ReleaseHistoryItem[],
  repo: string,
  titleKey: string,
  kindsOf: (item: ReleaseHistoryItem) => HistoryKind[],
  wantPrerelease: boolean,
  limit: number
): HistoryColumn => {
  const all: HistoryRow[] = history
    .filter((h) => h.prerelease === wantPrerelease)
    .map((h) => ({
      tag: h.tag,
      publishedAt: h.publishedAt,
      kinds: kindsOf(h),
      releaseUrl: `https://github.com/${repo}/releases/tag/${h.tag}`
    }))
    .filter((h) => h.kinds.length > 0);

  return {
    key: `${repo}-${wantPrerelease}`,
    titleKey,
    items: all.slice(0, limit),
    total: all.length
  };
};

/**
 * 某个 release 里匹配正则的那个文件的直链。
 *
 * GitHub 的下载直链形态固定为
 *   https://github.com/<owner>/<repo>/releases/download/<tag>/<file>
 * 所以这里需要 repo 与 tag —— 两者都不在 ReleaseHistoryItem 上，
 * 由调用方传进来，避免把 repo 字符串散落在各处。
 */
const assetUrl = (
  item: ReleaseHistoryItem,
  repo: string,
  pattern: RegExp,
  labelKey: string
): HistoryKind | null => {
  const name = item.assetNames.find((n) => pattern.test(n));
  if (!name) return null;
  return {
    labelKey,
    size: 0,
    url: `https://github.com/${repo}/releases/download/${item.tag}/${name}`
  };
};

/** 每列默认显示几条 */
const HISTORY_SHOW = 5;

/** 哪些列点了「显示更多」（列 key → 是否展开） */
const historyExpanded = ref<Record<string, boolean>>({});

const showMore = (key: string) => {
  historyExpanded.value = { ...historyExpanded.value, [key]: true };
};

const columns = computed<HistoryColumn[]>(() => {
  const h = history.value;
  if (!h) return [];
  const isPre = activeChannel.value === 'insider';

  const desktop = buildColumn(
    h.desktop,
    DESKTOP_REPO,
    'desktop.win10-title',
    (item) => {
      const hit = assetUrl(item, DESKTOP_REPO, /\.exe$/i, 'desktop.row-installer');
      return hit ? [{ ...hit, size: item.size }] : [];
    },
    isPre,
    historyExpanded.value[`${DESKTOP_REPO}-${isPre}`] ? 99 : HISTORY_SHOW
  );

  const win7 = buildColumn(
    h.win7,
    WIN7_REPO,
    'desktop.win7-title',
    (item) => {
      const setup = assetUrl(item, WIN7_REPO, /^ClassSoftwareHub-Setup-win7-.*\.exe$/i, 'desktop.row-installer');
      const portable = assetUrl(item, WIN7_REPO, /^ClassSoftwareHub-Portable-win7-.*\.zip$/i, 'desktop.row-portable');
      const out: HistoryKind[] = [];
      if (setup) out.push({ ...setup, size: item.size });
      if (portable) out.push(portable);
      return out;
    },
    isPre,
    historyExpanded.value[`${WIN7_REPO}-${isPre}`] ? 99 : HISTORY_SHOW
  );

  return [desktop, win7].filter((c) => c.items.length > 0);
});

/* ── Markdown 渲染（Release 正文是他人可写，必须消毒）─────────────── */

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
  busy.value = id;
  downloadFailed.value = false;
  try {
    if (selectedSourceId.value === OFFICIAL_CHANNEL_ID) {
      downloadBuildDirect(build);
    } else {
      const r = await downloadBuildVia(build, selectedSourceId.value);
      if (r === 'failed') downloadFailed.value = true;
    }
  } finally {
    busy.value = '';
  }
};

onMounted(async () => {
  try {
    entries.value = await resolveDownloadEntries();
  } finally {
    loading.value = false;
  }

  // 历史版本是次要信息：不参与上面的 loading 态，拿到再渲染。
  // 接口挂了就返回空数组，页面底部那一段直接不显示，不影响下载。
  const [desktopHist, win7Hist] = await Promise.all([
    fetchReleaseHistory(DESKTOP_REPO),
    fetchReleaseHistory(WIN7_REPO)
  ]);
  history.value = { desktop: desktopHist, win7: win7Hist };
});
</script>
