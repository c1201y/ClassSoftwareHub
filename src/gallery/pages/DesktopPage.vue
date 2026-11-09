<template>
  <WinScrollViewer
    class="gallery-page-scroll"
    VerticalScrollBarVisibility="Auto"
    VerticalScrollMode="Auto">
    <div class="gallery-page-content desktop-page">
      <header class="desktop-header">
        <WinTextBlock
          class="desktop-title"
          AutomationProperties.HeadingLevel="Level1"
          :Text="t('desktop.title')" />
        <WinTextBlock class="desktop-subtitle" :Text="t('desktop.subtitle')" />
      </header>

      <!-- 通道说明：正式版 / 预览版的区别是新用户最先需要知道的事，
           放在卡片之前，避免他们先点了预览版再回头找解释。 -->
      <WinInfoBar
        class="desktop-channel-bar"
        :IsOpen="true"
        :IsClosable="false"
        Severity="Informational"
        :Title="t('desktop.channel-title')"
        :Message="t('desktop.channel-desc')" />

      <!-- 加载中：只在真的还没拿到数据时出现（缓存命中时是瞬间的） -->
      <p v-if="loading" class="desktop-loading">{{ t('desktop.loading') }}</p>

      <!-- 全部拿不到时的说明：引导去 Releases 页，而不是留一排点不动的按钮 -->
      <WinInfoBar
        v-else-if="allEmpty"
        class="desktop-error-bar"
        :IsOpen="true"
        :IsClosable="false"
        Severity="Warning"
        :Title="t('desktop.load-failed-title')"
        :Message="t('desktop.load-failed-desc')" />

      <section
        v-for="(card, index) in cards"
        :key="card.platform"
        class="desktop-card"
        :class="{ 'is-coming-soon': card.comingSoon }">
        <div class="desktop-card-head">
          <span class="desktop-card-icon" aria-hidden="true">{{ card.icon }}</span>
          <div class="desktop-card-heading">
            <h2 class="desktop-card-title">{{ t(card.titleKey) }}</h2>
            <p class="desktop-card-requirement">{{ t(card.requirementKey) }}</p>
          </div>
          <a
            v-if="card.repoUrl"
            class="desktop-card-all"
            :href="card.repoUrl"
            target="_blank"
            rel="noopener noreferrer">
            {{ t('desktop.all-versions') }}
            <span class="desktop-card-all-icon" aria-hidden="true">&#xE8A7;</span>
          </a>
        </div>

        <!-- 该平台暂时没有产物（Linux）：如实说明，不给假按钮 -->
        <p v-if="card.comingSoon" class="desktop-coming-soon">{{ t('desktop.coming-soon') }}</p>

        <div v-else class="desktop-rows">
          <div v-for="row in card.rows" :key="row.id" class="desktop-row">
            <div class="desktop-row-info">
              <div class="desktop-row-name">{{ t(row.nameKey) }}</div>
              <div v-if="row.build" class="desktop-row-meta">
                <span class="desktop-row-version">{{ row.build.tag }}</span>
                <span class="desktop-row-note">{{ t(row.noteKey) }}</span>
              </div>
              <!-- 接口没取到这一条：说明原因，按钮区改为 Releases 入口 -->
              <div v-else class="desktop-row-note">{{ t('desktop.row-unavailable') }}</div>
            </div>
            <div class="desktop-row-actions">
              <WinButton
                v-if="row.build"
                class="desktop-download-button"
                Style="AccentButtonStyle"
                :disabled="busyRow !== ''"
                :Content="busyRow === row.id ? t('desktop.downloading') : t('desktop.download')"
                @click="startDownload(row.id)" />
              <WinHyperlinkButton
                v-else
                class="desktop-release-link"
                :Content="t('desktop.open-releases')"
                :NavigateUri="card.repoUrl"
                TargetName="_blank" />
              <!-- 校验文件：每个包都有同名 .md5，给了才显示 -->
              <WinHyperlinkButton
                v-if="row.build"
                class="desktop-md5-link"
                :Content="t('desktop.md5')"
                :NavigateUri="md5Of(row.build)"
                TargetName="_blank" />
            </div>
          </div>
        </div>
      </section>

      <footer class="desktop-footer">
        <p class="desktop-footer-note">{{ t('desktop.mirror-note') }}</p>
        <WinHyperlinkButton
          class="desktop-docs-link"
          :Content="t('desktop.docs')"
          :NavigateUri="DOCS_URL"
          TargetName="_blank" />
      </footer>
    </div>
  </WinScrollViewer>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import WinScrollViewer from '../../components/WinScrollViewer.vue';
import WinTextBlock from '../../components/WinTextBlock.vue';
import WinButton from '../../components/WinButton.vue';
import WinHyperlinkButton from '../../components/WinHyperlinkButton.vue';
import WinInfoBar from '../../components/WinInfoBar.vue';
import { useI18n } from '../../components/i18n/index';
import {
  ANDROID_RELEASES_URL,
  DESKTOP_RELEASES_URL,
  DOCS_URL,
  WIN7_RELEASES_URL,
  downloadEntry,
  entryOf,
  resolveDownloadEntries
} from '../desktopDownload';
import type { DesktopBuild, DownloadEntries, DownloadId } from '../desktopDownload';
import '../styles/desktop-page.css';

const { t } = useI18n();

const entries = ref<DownloadEntries | null>(null);
const loading = ref(true);
/** 正在下载的行 id（空串 = 空闲）：用来禁用按钮并切换文案 */
const busyRow = ref('');

onMounted(async () => {
  try {
    entries.value = await resolveDownloadEntries();
  } finally {
    loading.value = false;
  }
});

/** 某个产物对应的 .md5 校验文件地址（GitHub Release 里就放在同名 .md5） */
const md5Of = (build: DesktopBuild) => `${build.url}.md5`;

interface RowDef {
  id: DownloadId;
  nameKey: string;
  noteKey: string;
}

interface CardDef {
  platform: string;
  icon: string;
  titleKey: string;
  requirementKey: string;
  repoUrl: string;
  rows: (RowDef & { build: DesktopBuild | null })[];
  comingSoon?: boolean;
}

/**
 * 卡片与行的定义 —— 顺序即页面顺序。
 *
 * 行一律先声明、再回填 build：接口没取到某一条时，那一行仍然显示（带说明），
 * 而不是整块消失。消失会让人以为「这个版本不存在」，而实际情况可能只是接口挂了。
 */
const cards = computed<CardDef[]>(() => {
  const e = entries.value;
  const row = (id: DownloadId, nameKey: string, noteKey: string) => ({
    id,
    nameKey,
    noteKey,
    build: e ? entryOf(e, id) : null
  });

  return [
    {
      platform: 'win10',
      icon: '\uE977',
      titleKey: 'desktop.win10-title',
      requirementKey: 'desktop.win10-requirement',
      repoUrl: DESKTOP_RELEASES_URL,
      rows: [
        row('stable', 'desktop.row-stable', 'desktop.note-win10-setup'),
        row('insider', 'desktop.row-insider', 'desktop.note-win10-setup')
      ]
    },
    {
      platform: 'win7',
      icon: '\uE7F8',
      titleKey: 'desktop.win7-title',
      requirementKey: 'desktop.win7-requirement',
      repoUrl: WIN7_RELEASES_URL,
      rows: [
        row('win7-setup', 'desktop.row-win7-setup', 'desktop.note-win7-setup'),
        row('win7-portable', 'desktop.row-win7-portable', 'desktop.note-win7-portable'),
        row('win7-insider-setup', 'desktop.row-win7-insider-setup', 'desktop.note-win7-setup'),
        row('win7-insider-portable', 'desktop.row-win7-insider-portable', 'desktop.note-win7-portable')
      ]
    },
    {
      platform: 'android',
      icon: '\uE8EA',
      titleKey: 'desktop.android-title',
      requirementKey: 'desktop.android-requirement',
      repoUrl: ANDROID_RELEASES_URL,
      rows: [row('android', 'desktop.row-android', 'desktop.note-android')]
    },
    {
      platform: 'linux',
      icon: '\uE7F8',
      titleKey: 'desktop.linux-title',
      requirementKey: 'desktop.linux-requirement',
      repoUrl: '',
      rows: [],
      comingSoon: true
    }
  ];
});

/** 一条产物都没取到（接口全挂）—— 此时显示顶部的说明条 */
const allEmpty = computed(() => {
  const e = entries.value;
  if (!e) return false;
  return !Object.values(e).some(Boolean);
});

const startDownload = async (id: DownloadId) => {
  if (busyRow.value || !entries.value) return;
  busyRow.value = id;
  try {
    const result = await downloadEntry(entries.value, id);
    // 'release' 表示镜像全不通、已把用户送到 Release 页，无需再提示
    // 'missing' 表示这一行其实没取到（正常不会走到：按钮此时不渲染）
    void result;
  } finally {
    busyRow.value = '';
  }
};
</script>
