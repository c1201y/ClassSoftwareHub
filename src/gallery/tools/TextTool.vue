<template>
  <ToolShell
    title="文本处理"
    subtitle="去重、去空行、大小写、中英标点互转、字数统计……写通知/名单/文案时常用的小工具。">
    <div class="tool-grid-2">
      <div class="tool-panel">
        <span class="tool-section-title">输入</span>
        <WinTextBox
          class="tt-box"
          v-model:Text="input"
          :AcceptsReturn="true"
          TextWrapping="Wrap"
          :IsSpellCheckEnabled="false"
          PlaceholderText="把文本粘进来"
          FontFamily="Consolas, 'Courier New', monospace"
          :FontSize="13" />
        <div class="tt-stats tool-hint">
          <span>{{ stats.chars }} 字</span>
          <span>{{ stats.noSpace }} 不含空格</span>
          <span>{{ stats.cjk }} 汉字</span>
          <span>{{ stats.words }} 英文词</span>
          <span>{{ stats.lines }} 行</span>
        </div>
      </div>

      <div class="tool-panel">
        <span class="tool-section-title">结果</span>
        <WinTextBox
          class="tt-box"
          v-model:Text="output"
          :AcceptsReturn="true"
          TextWrapping="Wrap"
          :IsSpellCheckEnabled="false"
          PlaceholderText="处理结果出现在这里"
          FontFamily="Consolas, 'Courier New', monospace"
          :FontSize="13" />
        <div class="tool-row tt-actions">
          <WinButton FontSize="13" Padding="10,0,10,0" Content="复制结果" :IsEnabled="!!output" @Click="copy(output, '结果')" />
          <WinButton FontSize="13" Padding="10,0,10,0" Content="用结果替换输入" :IsEnabled="!!output" @Click="input = output" />
          <WinButton FontSize="13" Padding="10,0,10,0" Content="清空" :IsEnabled="!!input || !!output" @Click="clearAll" />
        </div>
      </div>
    </div>

    <div class="tool-panel tt-ops">
      <span class="tool-section-title">一键处理</span>
      <div class="tt-op-groups">
        <div class="tt-op-group">
          <span class="tool-label">行处理</span>
          <div class="tool-row">
            <WinButton FontSize="13" Padding="10,0,10,0" Content="去重复行" @Click="apply(dedupeLines)" />
            <WinButton FontSize="13" Padding="10,0,10,0" Content="去空行" @Click="apply(removeEmptyLines)" />
            <WinButton FontSize="13" Padding="10,0,10,0" Content="去首尾空格" @Click="apply(trimLines)" />
            <WinButton FontSize="13" Padding="10,0,10,0" Content="反转行序" @Click="apply(reverseLines)" />
            <WinButton FontSize="13" Padding="10,0,10,0" Content="按行排序" @Click="apply(sortLines)" />
          </div>
        </div>
        <div class="tt-op-group">
          <span class="tool-label">大小写</span>
          <div class="tool-row">
            <WinButton FontSize="13" Padding="10,0,10,0" Content="全部大写" @Click="apply((t) => t.toUpperCase())" />
            <WinButton FontSize="13" Padding="10,0,10,0" Content="全部小写" @Click="apply((t) => t.toLowerCase())" />
          </div>
        </div>
        <div class="tt-op-group">
          <span class="tool-label">标点 / 空白</span>
          <div class="tool-row">
            <WinButton FontSize="13" Padding="10,0,10,0" Content="中文标点→英文" @Click="apply(cnToEn)" />
            <WinButton FontSize="13" Padding="10,0,10,0" Content="英文标点→中文" @Click="apply(enToCn)" />
            <WinButton FontSize="13" Padding="10,0,10,0" Content="合并连续空格" @Click="apply(collapseSpaces)" />
            <WinButton FontSize="13" Padding="10,0,10,0" Content="去全文首尾空白" @Click="apply(trimAll)" />
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
const sortLines = (t: string) => lines(t).sort((a, b) => a.localeCompare(b, 'zh')).join('\n');
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
