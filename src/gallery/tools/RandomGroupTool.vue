<template>
  <ToolShell
    :title="t('tool.random-group.name')"
    :subtitle="t('tool.random-group.subtitle')">
    <div class="tool-grid-2">
      <div class="tool-panel">
        <span class="tool-section-title">{{ t('random-group.names') }}</span>
        <WinTextBox
          AcceptsReturn
          MinHeight="180"
          :IsSpellCheckEnabled="false"
          :PlaceholderText="t('random-group.names-placeholder')"
          v-model:Text="namesText" />
        <div class="tool-row rg-meta">
          <span class="tool-hint">{{ t('random-group.count', { n: names.length }) }}</span>
          <div class="tool-row">
            <WinButton :Content="t('random-group.sample')" @Click="fillSample" />
            <WinButton :Content="t('common.clear')" :IsEnabled="!!namesText" @Click="clearNames" />
          </div>
        </div>

        <div class="rg-options">
          <WinComboBox
            :Header="t('random-group.mode')"
            Width="100%"
            :ItemsSource="modeItems"
            DisplayMemberPath="label"
            SelectedValuePath="value"
            v-model:SelectedValue="mode" />
          <div class="tool-row rg-countrow">
            <template v-if="mode === 'groups'">
              <span class="tool-hint">{{ t('random-group.groups') }}</span>
              <WinNumberBox class="rg-num" :Width="88" :Minimum="1" :Maximum="99" :SmallChange="1" v-model:Value="groupCount" />
            </template>
            <template v-else>
              <span class="tool-hint">{{ t('random-group.per-group') }}</span>
              <WinNumberBox class="rg-num" :Width="88" :Minimum="1" :Maximum="99" :SmallChange="1" v-model:Value="perGroup" />
            </template>
          </div>
        </div>

        <div class="rg-actions">
          <WinButton class="rg-main" Style="AccentButtonStyle" :Content="t('random-group.group')" @Click="makeGroups" />
        </div>
        <div v-if="error" class="rg-error">{{ error }}</div>
      </div>

      <div class="tool-panel">
        <div class="rg-result-head">
          <span class="tool-section-title">{{ t('random-group.result') }}</span>
          <div class="tool-row">
            <WinButton :Content="t('random-group.copy-groups')" :IsEnabled="groups.length > 0" @Click="copyGroups" />
            <WinButton :Content="t('random-group.csv')" :IsEnabled="groups.length > 0" @Click="exportGroupsCsv" />
          </div>
        </div>
        <div v-if="groups.length" class="rg-groups">
          <div v-for="(group, index) in groups" :key="index" class="rg-group">
            <div class="rg-group-head">
              <span class="rg-group-title">{{ t('random-group.group-title', { index: index + 1, count: group.length }) }}</span>
            </div>
            <div class="rg-chips">
              <span v-for="name in group" :key="name" class="rg-chip">{{ name }}</span>
            </div>
          </div>
        </div>
        <div v-else class="tool-hint">{{ t('random-group.empty') }}</div>
      </div>
    </div>

    <div class="tool-panel rg-seat-panel">
      <div class="rg-result-head">
        <span class="tool-section-title">{{ t('random-group.seat-title') }}</span>
        <div class="tool-row">
          <WinButton :Content="t('random-group.seat-copy')" :IsEnabled="seats.length > 0" @Click="copySeats" />
        </div>
      </div>
      <div class="tool-row rg-seatopts">
        <span class="tool-hint">{{ t('random-group.rows') }}</span>
        <WinNumberBox class="rg-num" :Width="88" :Minimum="1" :Maximum="30" :SmallChange="1" v-model:Value="rows" />
        <span class="tool-hint">{{ t('random-group.cols') }}</span>
        <WinNumberBox class="rg-num" :Width="88" :Minimum="1" :Maximum="30" :SmallChange="1" v-model:Value="cols" />
        <WinButton :Content="t('random-group.seat')" @Click="makeSeats" />
      </div>
      <div class="tool-hint rg-seat-hint">{{ t('random-group.seat-hint') }}</div>
      <div v-if="seatError" class="rg-error">{{ seatError }}</div>
      <div v-if="seats.length" class="rg-seat-grid" :style="{ gridTemplateColumns: `repeat(${seatCols}, minmax(64px, 1fr))` }">
        <div v-for="(name, index) in seats" :key="index" class="rg-seat-cell" :class="{ 'is-empty': !name }">
          {{ name }}
        </div>
      </div>
    </div>

    <div v-if="toast" class="tool-toast" role="status">{{ toast }}</div>
  </ToolShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ToolShell from './ToolShell.vue';
import { useCopy } from './useCopy';
import { useI18n } from '../../components/i18n/index';
import WinButton from '../../components/WinButton.vue';
import WinComboBox from '../../components/WinComboBox.vue';
import WinNumberBox from '../../components/WinNumberBox.vue';
import WinTextBox from '../../components/WinTextBox.vue';

const NAMES_KEY = 'tool.random-group.names';

const { t } = useI18n();
const { toast, copy, flash } = useCopy();

const namesText = ref('');
try {
  namesText.value = localStorage.getItem(NAMES_KEY) ?? '';
} catch {
  /* 隐私模式禁用存储时忽略 */
}
watch(namesText, (value) => {
  try {
    localStorage.setItem(NAMES_KEY, value);
  } catch {
    /* 忽略 */
  }
});

/** 每行可再按逗号 / 顿号 / 制表符 / 分号继续拆分；开头的序号与分隔符自动去掉 */
const names = computed(() => {
  const out: string[] = [];
  for (const line of namesText.value.split(/\r?\n/)) {
    for (const piece of line.split(/[,，、\t;；]+/)) {
      const value = piece.replace(/^\s*\d+\s*[.、．)）]?\s*/, '').trim();
      if (value) out.push(value);
    }
  }
  return out;
});

const mode = ref<'groups' | 'per'>('groups');
const groupCount = ref(4);
const perGroup = ref(4);
const groups = ref<string[][]>([]);
const error = ref('');

const rows = ref(6);
const cols = ref(6);
const seats = ref<string[]>([]);
const seatCols = ref(6);
const seatError = ref('');

const modeItems = computed(() => [
  { value: 'groups', label: t('random-group.mode.groups') },
  { value: 'per', label: t('random-group.mode.per') }
]);

const clearNames = () => {
  namesText.value = '';
};

const randInt = (n: number) => {
  if (!(n >= 1)) return 0;
  if (n > 4294967295) return Math.floor(Math.random() * n);
  const limit = Math.floor(4294967295 / n) * n;
  const buf = new Uint32Array(1);
  let v = 0;
  do {
    crypto.getRandomValues(buf);
    v = buf[0];
  } while (v >= limit);
  return v % n;
};

/** Fisher–Yates，使用加密随机数保证分组不可预测 */
const shuffle = <T,>(list: T[]): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
};

const makeGroups = () => {
  error.value = '';
  const list = names.value;
  if (!list.length) {
    error.value = t('random-group.error.empty');
    return;
  }
  if (list.length < 2) {
    error.value = t('random-group.error.too-few');
    return;
  }
  const size = Math.max(1, Math.floor(mode.value === 'groups' ? groupCount.value : perGroup.value) || 1);
  const count = mode.value === 'groups' ? Math.min(size, list.length) : Math.ceil(list.length / size);
  const out: string[][] = Array.from({ length: count }, () => []);
  shuffle(list).forEach((name, index) => {
    out[index % count].push(name);
  });
  groups.value = out;
};

const makeSeats = () => {
  seatError.value = '';
  const list = names.value;
  const r = Math.max(1, Math.floor(rows.value) || 1);
  const c = Math.max(1, Math.floor(cols.value) || 1);
  if (!list.length) {
    seatError.value = t('random-group.error.empty');
    return;
  }
  const total = r * c;
  if (total < list.length) {
    seatError.value = t('random-group.seat-error', { seats: total, count: list.length });
    return;
  }
  const filled = shuffle(list);
  seats.value = Array.from({ length: total }, (_, index) => filled[index] ?? '');
  seatCols.value = c;
};

const groupsText = () =>
  groups.value.map((group, index) => `#${index + 1} (${group.length})\n${group.join('\n')}`).join('\n\n');

const copyGroups = () => {
  if (!groups.value.length) return;
  void copy(groupsText(), t('random-group.copied-groups'));
};

const copySeats = () => {
  if (!seats.value.length) return;
  const lines: string[] = [];
  for (let r = 0; r < seats.value.length; r += seatCols.value) {
    lines.push(seats.value.slice(r, r + seatCols.value).join('\t'));
  }
  void copy(lines.join('\n'), t('random-group.copied-seat'));
};

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

const download = (name: string, content: string) => {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};

const exportGroupsCsv = () => {
  if (!groups.value.length) return;
  const width = Math.max(...groups.value.map((group) => group.length));
  const lines = [
    Array.from({ length: width }, (_, index) => t('random-group.csv-member', { index: index + 1 })).join(',')
  ];
  for (const group of groups.value) {
    const cells = group.map(csvCell);
    while (cells.length < width) cells.push('');
    lines.push(cells.join(','));
  }
  download('groups.csv', lines.join('\n'));
  flash(t('random-group.csv-done'));
};

const fillSample = () => {
  namesText.value = Array.from({ length: 24 }, (_, index) => t('random-group.sample-name', { n: index + 1 })).join('\n');
};
</script>

<style scoped>
.rg-meta {
  margin-top: 8px;
  justify-content: space-between;
}

.rg-options {
  margin-top: 16px;
}

.rg-countrow {
  margin-top: 10px;
}

.rg-num {
  flex: 0 0 auto;
}

.rg-actions {
  margin-top: 16px;
}

.rg-main {
  width: 100%;
}

.rg-error {
  margin-top: 10px;
  font-size: 13px;
  color: var(--system-error, #c42b1c);
}

.rg-result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.rg-result-head .tool-section-title {
  margin: 0;
}

.rg-groups {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rg-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rg-group-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.rg-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.rg-chip {
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.06));
  font-size: 13px;
  line-height: 18px;
}

.rg-seat-panel {
  margin-top: 16px;
}

.rg-seatopts {
  margin-top: 12px;
}

.rg-seat-hint {
  margin-top: 8px;
}

.rg-seat-grid {
  display: grid;
  gap: 6px;
  margin-top: 12px;
}

.rg-seat-cell {
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 6px;
  border: 1px solid var(--card-stroke, rgba(0, 0, 0, 0.12));
  border-radius: 6px;
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.04));
  font-size: 13px;
  text-align: center;
  word-break: break-all;
}

.rg-seat-cell.is-empty {
  border-style: dashed;
  background: transparent;
}
</style>
