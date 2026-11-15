<template>
  <ToolShell
    :title="t('tool.timestamp.name')"
    :subtitle="t('tool.timestamp.subtitle')">
    <div class="tool-grid-2">
      <!-- 当前 -->
      <div class="tool-panel ts-now">
        <span class="tool-section-title">{{ t('timestamp.now') }}</span>
        <div class="ts-now-row">
          <span class="ts-now-num mono">{{ nowSec }}</span>
          <span class="tool-hint">{{ t('common.second-unit') }}</span>
          <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('common.copy')" @Click="copy(String(nowSec), t('timestamp.copy-seconds'))" />
        </div>
        <div class="ts-now-row">
          <span class="ts-now-num mono">{{ nowMs }}</span>
          <span class="tool-hint">ms</span>
          <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('common.copy')" @Click="copy(String(nowMs), t('timestamp.copy-ms'))" />
        </div>
        <div class="tool-hint ts-now-local">{{ t('timestamp.local-time', { value: nowLocal }) }}</div>
      </div>

      <!-- 时间戳 -> 时间 -->
      <div class="tool-panel">
        <span class="tool-section-title">{{ t('timestamp.ts-to-time') }}</span>
        <WinTextBox
          v-model:Text="tsInput"
          :PlaceholderText="t('timestamp.ts-placeholder')"
          FontFamily="Consolas, 'Courier New', monospace" />
        <div class="ts-out">
          <template v-if="tsOut">
            <div class="ts-out-row"><span class="tool-hint">{{ t('timestamp.local') }}</span><span class="mono">{{ tsOut.local }}</span><WinButton FontSize="13" Padding="10,0,10,0" :Content="t('common.copy')" @Click="copy(tsOut.local, t('timestamp.copy-local'))" /></div>
            <div class="ts-out-row"><span class="tool-hint">{{ t('timestamp.utc') }}</span><span class="mono">{{ tsOut.utc }}</span><WinButton FontSize="13" Padding="10,0,10,0" :Content="t('common.copy')" @Click="copy(tsOut.utc, t('timestamp.copy-utc'))" /></div>
            <div class="ts-out-row"><span class="tool-hint">{{ t('timestamp.iso') }}</span><span class="mono">{{ tsOut.iso }}</span><WinButton FontSize="13" Padding="10,0,10,0" :Content="t('common.copy')" @Click="copy(tsOut.iso, t('timestamp.iso'))" /></div>
            <div class="ts-out-row"><span class="tool-hint">{{ t('timestamp.ago') }}</span><span>{{ tsOut.relative }}</span></div>
          </template>
          <div v-else class="tool-hint">{{ t('timestamp.ts-hint') }}</div>
        </div>
      </div>

      <!-- 时间 -> 时间戳 -->
      <div class="tool-panel">
        <span class="tool-section-title">{{ t('timestamp.time-to-ts') }}</span>
        <div class="ts-dt-row">
          <WinDatePicker class="ts-dt-date" :Header="t('timestamp.date')" v-model:Date="dtDate" />
          <WinTimePicker class="ts-dt-time" :Header="t('timestamp.time')" ClockIdentifier="24HourClock" v-model:Time="dtTime" />
        </div>
        <div class="ts-out">
          <template v-if="dtOut">
            <div class="ts-out-row"><span class="tool-hint">{{ t('common.second-unit') }}</span><span class="mono">{{ dtOut.sec }}</span><WinButton FontSize="13" Padding="10,0,10,0" :Content="t('common.copy')" @Click="copy(String(dtOut.sec), t('timestamp.copy-sec'))" /></div>
            <div class="ts-out-row"><span class="tool-hint">ms</span><span class="mono">{{ dtOut.ms }}</span><WinButton FontSize="13" Padding="10,0,10,0" :Content="t('common.copy')" @Click="copy(String(dtOut.ms), t('timestamp.copy-ms-level'))" /></div>
            <div class="ts-out-row"><span class="tool-hint">{{ t('timestamp.relative-now') }}</span><span>{{ dtOut.relative }}</span></div>
          </template>
          <div v-else class="tool-hint">{{ t('timestamp.pick-date') }}</div>
        </div>
        <div class="ts-fill">
          <WinButton :Content="t('timestamp.fill-now')" @Click="fillNow" />
        </div>
      </div>
    </div>

    <div v-if="toast" class="tool-toast" role="status">{{ toast }}</div>
  </ToolShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import ToolShell from './ToolShell.vue';
import { useCopy } from './useCopy';
import WinButton from '../../components/WinButton.vue';
import WinTextBox from '../../components/WinTextBox.vue';
import WinDatePicker from '../../components/WinDatePicker.vue';
import WinTimePicker from '../../components/WinTimePicker.vue';
import { useI18n } from '../../components/i18n/index';

const { t, locale } = useI18n();
const { toast, copy } = useCopy();

const now = ref(Date.now());
let timer = 0;

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

const fmtLocal = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

const fmtUtc = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;

/** 相对时间交给原生 Intl 处理：单位与「前/后」的措辞按语言自动变化 */
const relFmt = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
const relative = (ms: number) => {
  const diff = ms - now.value;
  const abs = Math.abs(diff);
  const [unit, div]: [Intl.RelativeTimeFormatUnit, number] =
    abs < 60_000 ? ['second', 1000]
      : abs < 3_600_000 ? ['minute', 60_000]
        : abs < 86_400_000 ? ['hour', 3_600_000]
          : ['day', 86_400_000];
  return relFmt.format(Math.round(diff / div), unit);
};

const nowSec = computed(() => Math.floor(now.value / 1000));
const nowMs = computed(() => now.value);
const nowLocal = computed(() => fmtLocal(new Date(now.value)));

const tsInput = ref('');
const tsOut = computed(() => {
  const raw = tsInput.value.trim();
  if (!/^-?\d+$/.test(raw)) return null;
  const num = Number(raw);
  const ms = raw.replace('-', '').length <= 10 ? num * 1000 : num;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return { local: fmtLocal(d), utc: fmtUtc(d), iso: d.toISOString(), relative: relative(ms) };
});

const dtDate = ref<Date | null>(null);
const dtTime = ref<{ hour: number; minute: number } | null>(null);
const dtInput = computed(() => {
  const d = dtDate.value;
  const t = dtTime.value;
  if (!d || !t) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(t.hour)}:${pad(t.minute)}:00`;
});
const dtOut = computed(() => {
  if (!dtInput.value) return null;
  const d = new Date(dtInput.value);
  if (Number.isNaN(d.getTime())) return null;
  return { sec: Math.floor(d.getTime() / 1000), ms: d.getTime(), relative: relative(d.getTime()) };
});

const fillNow = () => {
  const d = new Date();
  dtDate.value = d;
  dtTime.value = { hour: d.getHours(), minute: d.getMinutes() };
};

onMounted(() => {
  timer = window.setInterval(() => { now.value = Date.now(); }, 1000);
});
onBeforeUnmount(() => window.clearInterval(timer));
</script>

<style scoped>
.ts-now-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.ts-now-num {
  font-size: 18px;
}

.ts-now-local {
  margin-top: 6px;
}

.mono {
  font-family: Consolas, 'Courier New', monospace;
}

.ts-dt-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 10px;
}

.ts-dt-date {
  flex: 1 1 260px;
  min-width: 0;
}

.ts-dt-date :deep(.picker-btn) {
  width: 100%;
  min-width: 0;
}

.ts-dt-time {
  flex: 0 0 auto;
}

.ts-out {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ts-out-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ts-out-row .tool-hint {
  flex: 0 0 56px;
}

.ts-out-row .mono {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  word-break: break-all;
}

.ts-fill {
  margin-top: 14px;
}
</style>
