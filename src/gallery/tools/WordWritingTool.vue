<template>
  <ToolShell :title="t('tool.word-writing.name')" :subtitle="t('tool.word-writing.subtitle')">
    <div class="ww-toolbar tool-row">
      <WinButton :Content="t('word-writing.open-new')" @Click="openInNewWindow" />
      <WinButton :Content="t('word-writing.reload')" @Click="reload" />
      <span class="tool-hint ww-hint">{{ t('word-writing.hint') }}</span>
    </div>

    <div class="tool-panel ww-frame-panel">
      <iframe
        :key="frameKey"
        class="ww-frame"
        :src="FRAME_SRC"
        :title="t('word-writing.frame-title')"
        allow="fullscreen; clipboard-write"
        allowfullscreen />
    </div>

    <div class="tool-hint ww-note">
      {{ t('word-writing.note-1') }}<code>word-writing.v1</code>{{ t('word-writing.note-2') }}<b>{{ t('word-writing.note-3') }}</b>{{ t('word-writing.note-4') }}
    </div>
  </ToolShell>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ToolShell from './ToolShell.vue';
import WinButton from '../../components/WinButton.vue';
import { useI18n } from '../../components/i18n/index';

const { t } = useI18n();

/**
 * iframe 地址用**相对路径**：vite.config.ts 里 base 是 './'，
 * 站点既可能部署在域名根目录（GitHub Pages / FTP），也可能在子目录
 * （OpenList 网盘的「网站/」）。站点用 hash 路由，文档路径不会变，
 * 所以 './tools/word-writing.html' 在两种部署深度下都能正确解析。
 *
 * 文件本体放在 public/tools/word-writing.html（Vite 会原样拷进 dist/），
 * 不能用 new URL('…', import.meta.url) —— 那个 HTML 不在 src 里，不会被 Vite 采集。
 */
const FRAME_SRC = './tools/word-writing.html';

const frameKey = ref(0);

const reload = () => {
  frameKey.value += 1;
};

/**
 * 在新窗口里打开同一个 HTML。
 * 让老师能把练习页铺到投影 / 第二块屏幕上，而站点本身留在原地。
 */
const openInNewWindow = () => {
  const url = new URL(FRAME_SRC, window.location.href).href;
  window.open(url, '_blank', 'noopener');
};
</script>

<style scoped>
/* iframe 需要显式高度：ToolShell 的滚动区不会给它撑开 */
.ww-frame-panel {
  padding: 0;
  overflow: hidden;
  height: clamp(420px, calc(100vh - 300px), 900px);
}

.ww-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--card-bg, #fff);
}

.ww-toolbar {
  margin-bottom: 12px;
}

.ww-hint {
  flex: 1 1 240px;
  min-width: 0;
}

.ww-note {
  margin-top: 10px;
}

.ww-note code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.06));
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
}
</style>
