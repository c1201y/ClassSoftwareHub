<template>
  <ToolShell
    :title="t('tool.text-diff.name')"
    :subtitle="t('tool.text-diff.subtitle')">
    <div class="tool-grid-2">
      <div class="tool-panel">
        <span class="tool-section-title">{{ t('text-diff.left') }}</span>
        <WinTextBox
          AcceptsReturn
          MinHeight="180"
          FontFamily="Consolas, 'Courier New', monospace"
          :IsSpellCheckEnabled="false"
          :PlaceholderText="t('text-diff.placeholder')"
          v-model:Text="left" />
      </div>
      <div class="tool-panel">
        <span class="tool-section-title">{{ t('text-diff.right') }}</span>
        <WinTextBox
          AcceptsReturn
          MinHeight="180"
          FontFamily="Consolas, 'Courier New', monospace"
          :IsSpellCheckEnabled="false"
          :PlaceholderText="t('text-diff.placeholder')"
          v-model:Text="right" />
      </div>
    </div>

    <div class="tool-panel td-result">
      <div class="td-head">
        <span class="tool-section-title">{{ t('common.result') }}</span>
        <div class="tool-row td-options">
          <WinCheckBox :Content="t('text-diff.ignore-case')" v-model:IsChecked="ignoreCase" />
          <WinCheckBox :Content="t('text-diff.ignore-space')" v-model:IsChecked="ignoreSpace" />
          <WinButton :Content="t('text-diff.copy')" :IsEnabled="result.rows.length > 0" @Click="copyDiff" />
        </div>
      </div>

      <div v-if="result.rows.length" class="td-stats">
        <span class="td-stat is-add">{{ t('text-diff.legend-add') }} {{ result.add }}</span>
        <span class="td-stat is-del">{{ t('text-diff.legend-del') }} {{ result.del }}</span>
        <span class="td-stat">{{ t('text-diff.stats', { add: result.add, del: result.del, same: result.same }) }}</span>
      </div>

      <div v-if="result.tooBig" class="td-error">{{ t('text-diff.too-big', { max: MAX_CELLS.toLocaleString() }) }}</div>
      <div v-else-if="result.rows.length" class="td-body">
        <div v-for="(row, index) in result.rows" :key="index" class="td-row" :class="'is-' + row.type">
          <span class="td-no">{{ row.leftNo ?? '' }}</span>
          <span class="td-no">{{ row.rightNo ?? '' }}</span>
          <span class="td-mark" aria-hidden="true">{{ row.type === 'add' ? '+' : row.type === 'del' ? '−' : '' }}</span>
          <span class="td-text">{{ row.text }}</span>
        </div>
      </div>
      <div v-else class="tool-hint td-empty">{{ t('text-diff.empty') }}</div>
    </div>

    <div v-if="toast" class="tool-toast" role="status">{{ toast }}</div>
  </ToolShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import ToolShell from './ToolShell.vue';
import { useCopy } from './useCopy';
import { useI18n } from '../../components/i18n/index';
import WinButton from '../../components/WinButton.vue';
import WinCheckBox from '../../components/WinCheckBox.vue';
import WinTextBox from '../../components/WinTextBox.vue';

interface Row {
  type: 'equal' | 'add' | 'del';
  leftNo: number | null;
  rightNo: number | null;
  text: string;
}

interface DiffResult {
  rows: Row[];
  add: number;
  del: number;
  same: number;
  tooBig: boolean;
}

/** LCS 表与行数上限：超出后不计算，避免大文本卡死页面 */
const MAX_CELLS = 4_000_000;
const MAX_LINES = 10_000;

const { t } = useI18n();
const { toast, copy } = useCopy();

const left = ref('');
const right = ref('');
const ignoreCase = ref(false);
const ignoreSpace = ref(false);

const splitLines = (text: string) => {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '' && text.endsWith('\n')) lines.pop();
  return lines;
};

const normalize = (line: string) => {
  let value = line;
  if (ignoreSpace.value) value = value.replace(/\s+/g, ' ').trim();
  if (ignoreCase.value) value = value.toLowerCase();
  return value;
};

const result = computed<DiffResult>(() => {
  const a = splitLines(left.value);
  const b = splitLines(right.value);
  if (!a.length && !b.length) return { rows: [], add: 0, del: 0, same: 0, tooBig: false };
  if (a.length > MAX_LINES || b.length > MAX_LINES || a.length * b.length > MAX_CELLS) {
    return { rows: [], add: 0, del: 0, same: 0, tooBig: true };
  }

  const an = a.map(normalize);
  const bn = b.map(normalize);
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        an[i] === bn[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const rows: Row[] = [];
  let add = 0;
  let del = 0;
  let same = 0;
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (an[i] === bn[j]) {
      rows.push({ type: 'equal', leftNo: i + 1, rightNo: j + 1, text: a[i] });
      same++;
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      rows.push({ type: 'del', leftNo: i + 1, rightNo: null, text: a[i] });
      del++;
      i++;
    } else {
      rows.push({ type: 'add', leftNo: null, rightNo: j + 1, text: b[j] });
      add++;
      j++;
    }
  }
  while (i < n) {
    rows.push({ type: 'del', leftNo: i + 1, rightNo: null, text: a[i] });
    del++;
    i++;
  }
  while (j < m) {
    rows.push({ type: 'add', leftNo: null, rightNo: j + 1, text: b[j] });
    add++;
    j++;
  }
  return { rows, add, del, same, tooBig: false };
});

const copyDiff = () => {
  if (!result.value.rows.length) return;
  const text = result.value.rows
    .map((row) => (row.type === 'add' ? `+ ${row.text}` : row.type === 'del' ? `- ${row.text}` : `  ${row.text}`))
    .join('\n');
  void copy(text, t('text-diff.copy'));
};
</script>

<style scoped>
.td-result {
  margin-top: 16px;
}

.td-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.td-head .tool-section-title {
  margin: 0;
}

.td-options {
  gap: 14px;
}

.td-stats {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.td-stat {
  padding: 2px 9px;
  border-radius: 999px;
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.06));
  font-size: 12px;
  color: var(--text-secondary);
}

.td-stat.is-add {
  background: rgba(15, 123, 15, 0.12);
  color: #0f7b0f;
}

.td-stat.is-del {
  background: rgba(196, 43, 28, 0.12);
  color: #c42b1c;
}

.td-error {
  margin-top: 12px;
  font-size: 13px;
  color: var(--system-error, #c42b1c);
}

.td-body {
  margin-top: 12px;
  max-height: 520px;
  overflow: auto;
  border: 1px solid var(--card-stroke, rgba(0, 0, 0, 0.1));
  border-radius: 6px;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 13px;
  line-height: 19px;
}

.td-row {
  display: grid;
  grid-template-columns: 44px 44px 18px minmax(0, 1fr);
  align-items: start;
  border-bottom: 1px solid var(--stroke-divider, rgba(0, 0, 0, 0.05));
}

.td-row:last-child {
  border-bottom: none;
}

.td-row.is-add {
  background: rgba(15, 123, 15, 0.1);
}

.td-row.is-del {
  background: rgba(196, 43, 28, 0.09);
}

.td-no {
  padding: 2px 6px;
  text-align: right;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  user-select: none;
}

.td-mark {
  padding: 2px 0;
  text-align: center;
  color: var(--text-secondary);
  user-select: none;
}

.td-row.is-add .td-mark {
  color: #0f7b0f;
}

.td-row.is-del .td-mark {
  color: #c42b1c;
}

.td-text {
  padding: 2px 8px;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 19px;
}

.td-row.is-add .td-text {
  color: #0b5f0b;
}

.td-row.is-del .td-text {
  color: #9b2116;
}

.td-empty {
  margin-top: 12px;
}

html.theme-dark .td-row.is-add {
  background: rgba(74, 222, 128, 0.14);
}

html.theme-dark .td-row.is-del {
  background: rgba(248, 113, 113, 0.16);
}

html.theme-dark .td-row.is-add .td-text {
  color: #9ae6a4;
}

html.theme-dark .td-row.is-del .td-text {
  color: #ffb3ab;
}
</style>
