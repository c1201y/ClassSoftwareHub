<template>
  <ToolShell
    :title="t('tool.text.name')"
    :subtitle="t('tool.text.subtitle')">
    <div class="tool-grid-2">
      <div class="tool-panel">
        <span class="tool-section-title">{{ t('common.input') }}</span>
        <WinTextBox
          class="tt-box"
          v-model:Text="input"
          :AcceptsReturn="true"
          TextWrapping="Wrap"
          :IsSpellCheckEnabled="false"
          :PlaceholderText="t('text-tool.input-placeholder')"
          FontFamily="Consolas, 'Courier New', monospace"
          :FontSize="13" />
        <div class="tt-stats tool-hint">
          <span>{{ t('text-tool.stats.chars', { n: stats.chars }) }}</span>
          <span>{{ t('text-tool.stats.no-space', { n: stats.noSpace }) }}</span>
          <span>{{ t('text-tool.stats.cjk', { n: stats.cjk }) }}</span>
          <span>{{ t('text-tool.stats.words', { n: stats.words }) }}</span>
          <span>{{ t('text-tool.stats.lines', { n: stats.lines }) }}</span>
        </div>
      </div>

      <div class="tool-panel">
        <span class="tool-section-title">{{ t('common.result') }}</span>
        <WinTextBox
          class="tt-box"
          v-model:Text="output"
          :AcceptsReturn="true"
          TextWrapping="Wrap"
          :IsSpellCheckEnabled="false"
          :PlaceholderText="t('text-tool.output-placeholder')"
          FontFamily="Consolas, 'Courier New', monospace"
          :FontSize="13" />
        <div class="tool-row tt-actions">
          <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('common.copy-result')" :IsEnabled="!!output" @Click="copy(output, t('common.result'))" />
          <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('common.replace-input')" :IsEnabled="!!output" @Click="input = output" />
          <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('common.clear')" :IsEnabled="!!input || !!output" @Click="clearAll" />
        </div>
      </div>
    </div>

    <div class="tool-panel tt-ops">
      <span class="tool-section-title">{{ t('text-tool.ops') }}</span>
      <div class="tt-op-groups">
        <div class="tt-op-group">
          <span class="tool-label">{{ t('text-tool.group.lines') }}</span>
          <div class="tool-row">
            <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('text-tool.dedupe')" @Click="apply(dedupeLines)" />
            <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('text-tool.remove-empty')" @Click="apply(removeEmptyLines)" />
            <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('text-tool.trim-lines')" @Click="apply(trimLines)" />
            <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('text-tool.reverse')" @Click="apply(reverseLines)" />
            <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('text-tool.sort')" @Click="apply(sortLines)" />
          </div>
        </div>
        <div class="tt-op-group">
          <span class="tool-label">{{ t('text-tool.group.case') }}</span>
          <div class="tool-row">
            <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('text-tool.upper')" @Click="apply((x) => x.toUpperCase())" />
            <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('text-tool.lower')" @Click="apply((x) => x.toLowerCase())" />
          </div>
        </div>
        <div class="tt-op-group">
          <span class="tool-label">{{ t('text-tool.group.punct') }}</span>
          <div class="tool-row">
            <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('text-tool.cn-to-en')" @Click="apply(cnToEn)" />
            <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('text-tool.en-to-cn')" @Click="apply(enToCn)" />
            <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('text-tool.collapse')" @Click="apply(collapseSpaces)" />
            <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('text-tool.trim-all')" @Click="apply(trimAll)" />
          </div>
        </div>
      </div>
    </div>

    <div v-if="toast" class="tool-toast" role="status">{{ toast }}</div>
  </ToolShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import ToolShell from './ToolShell.vue';
import { useCopy } from './useCopy';
import WinTextBox from '../../components/WinTextBox.vue';
import WinButton from '../../components/WinButton.vue';
import { useI18n } from '../../components/i18n/index';

const { t, locale } = useI18n();
const { toast, copy } = useCopy();
const input = ref('');
const output = ref('');

const stats = computed(() => {
  const t = input.value;
  return {
    chars: [...t].length,
    noSpace: [...t.replace(/\s/g, '')].length,
    cjk: (t.match(/[\u4e00-\u9fa5]/g) ?? []).length,
    words: (t.match(/[A-Za-z0-9_'’-]+/g) ?? []).length,
    lines: t ? t.split(/\r?\n/).length : 0
  };
});

const apply = (fn: (text: string) => string) => {
  output.value = fn(input.value);
};

const lines = (t: string) => t.split(/\r?\n/);
const dedupeLines = (t: string) => [...new Set(lines(t))].join('\n');
const removeEmptyLines = (t: string) => lines(t).filter((l) => l.trim() !== '').join('\n');
const trimLines = (t: string) => lines(t).map((l) => l.trim()).join('\n');
const reverseLines = (t: string) => lines(t).reverse().join('\n');
const sortLines = (t: string) => lines(t).sort((a, b) => a.localeCompare(b, locale)).join('\n');
const collapseSpaces = (t: string) => t.replace(/[ \t]+/g, ' ');
const trimAll = (t: string) => t.trim();

const CN_EN: Record<string, string> = {
  '，': ',', '。': '.', '；': ';', '：': ':', '！': '!', '？': '?', '（': '(', '）': ')',
  '【': '[', '】': ']', '《': '<', '》': '>', '“': '"', '”': '"', '‘': "'", '’': "'",
  '、': ',', '～': '~', '·': '.', '—': '-', '……': '...'
};
const EN_CN: Record<string, string> = {
  ',': '，', '.': '。', ';': '；', ':': '：', '!': '！', '?': '？', '(': '（', ')': '）',
  '[': '【', ']': '】', '<': '《', '>': '》'
};

const cnToEn = (t: string) => t.replace(/[…—]|[\u3000-\u303f\uff00-\uffef]/g, (ch) => CN_EN[ch] ?? ch);
const enToCn = (t: string) => t.replace(/[.,;:!?()\[\]<>]/g, (ch) => EN_CN[ch] ?? ch);

const clearAll = () => { input.value = ''; output.value = ''; };
</script>

<style scoped>
.tt-box {
  min-height: 180px;
}

.tt-box :deep(.win-textbox-textarea) {
  min-height: 180px;
}

.tt-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
}

.tt-actions {
  margin-top: 12px;
}

.tt-ops {
  margin-top: 16px;
}

.tt-op-groups {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.tt-op-group .tool-row {
  margin-top: 6px;
}
</style>
