<template>
  <ToolShell
    title="文本处理"
    subtitle="去重、去空行、大小写、中英标点互转、字数统计……写通知/名单/文案时常用的小工具。">
    <div class="tool-grid-2">
      <div class="tool-panel">
        <span class="tool-section-title">输入</span>
        <textarea v-model="input" class="tool-textarea tt-box" spellcheck="false" placeholder="把文本粘进来"></textarea>
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
        <textarea v-model="output" class="tool-textarea tt-box" spellcheck="false" placeholder="处理结果出现在这里"></textarea>
        <div class="tool-row tt-actions">
          <button class="tool-btn small" :disabled="!output" @click="copy(output, '结果')">复制结果</button>
          <button class="tool-btn small" :disabled="!output" @click="input = output">用结果替换输入</button>
          <button class="tool-btn small" :disabled="!input && !output" @click="clearAll">清空</button>
        </div>
      </div>
    </div>

    <div class="tool-panel tt-ops">
      <span class="tool-section-title">一键处理</span>
      <div class="tt-op-groups">
        <div class="tt-op-group">
          <span class="tool-label">行处理</span>
          <div class="tool-row">
            <button class="tool-btn small" @click="apply(dedupeLines)">去重复行</button>
            <button class="tool-btn small" @click="apply(removeEmptyLines)">去空行</button>
            <button class="tool-btn small" @click="apply(trimLines)">去首尾空格</button>
            <button class="tool-btn small" @click="apply(reverseLines)">反转行序</button>
            <button class="tool-btn small" @click="apply(sortLines)">按行排序</button>
          </div>
        </div>
        <div class="tt-op-group">
          <span class="tool-label">大小写</span>
          <div class="tool-row">
            <button class="tool-btn small" @click="apply((t) => t.toUpperCase())">全部大写</button>
            <button class="tool-btn small" @click="apply((t) => t.toLowerCase())">全部小写</button>
          </div>
        </div>
        <div class="tt-op-group">
          <span class="tool-label">标点 / 空白</span>
          <div class="tool-row">
            <button class="tool-btn small" @click="apply(cnToEn)">中文标点→英文</button>
            <button class="tool-btn small" @click="apply(enToCn)">英文标点→中文</button>
            <button class="tool-btn small" @click="apply(collapseSpaces)">合并连续空格</button>
            <button class="tool-btn small" @click="apply(trimAll)">去全文首尾空白</button>
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
