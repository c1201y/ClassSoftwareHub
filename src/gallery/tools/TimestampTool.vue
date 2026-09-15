<template>
  <ToolShell
    title="时间戳转换"
    subtitle="Unix 时间戳与日期时间互转，支持秒 / 毫秒自动识别，附带当前时间戳与常见日期格式。">
    <div class="tool-grid-2">
      <!-- 当前 -->
      <div class="tool-panel ts-now">
        <span class="tool-section-title">当前时间</span>
        <div class="ts-now-row">
          <span class="ts-now-num mono">{{ nowSec }}</span>
          <span class="tool-hint">秒</span>
          <button class="tool-btn small" @click="copy(String(nowSec), '秒级时间戳')">复制</button>
        </div>
        <div class="ts-now-row">
          <span class="ts-now-num mono">{{ nowMs }}</span>
          <span class="tool-hint">毫秒</span>
          <button class="tool-btn small" @click="copy(String(nowMs), '毫秒时间戳')">复制</button>
        </div>
        <div class="tool-hint ts-now-local">本地时间：{{ nowLocal }}</div>
      </div>

      <!-- 时间戳 -> 时间 -->
      <div class="tool-panel">
        <span class="tool-section-title">时间戳 → 时间</span>
        <input v-model.trim="tsInput" class="tool-input mono" placeholder="输入时间戳，如 1757952000" />
        <div class="ts-out">
          <template v-if="tsOut">
            <div class="ts-out-row"><span class="tool-hint">本地</span><span class="mono">{{ tsOut.local }}</span><button class="tool-btn small" @click="copy(tsOut.local, '本地时间')">复制</button></div>
            <div class="ts-out-row"><span class="tool-hint">UTC</span><span class="mono">{{ tsOut.utc }}</span><button class="tool-btn small" @click="copy(tsOut.utc, 'UTC 时间')">复制</button></div>
            <div class="ts-out-row"><span class="tool-hint">ISO</span><span class="mono">{{ tsOut.iso }}</span><button class="tool-btn small" @click="copy(tsOut.iso, 'ISO')">复制</button></div>
            <div class="ts-out-row"><span class="tool-hint">距今</span><span>{{ tsOut.relative }}</span></div>
          </template>
          <div v-else class="tool-hint">输入数字后自动识别（≤10 位按秒，否则按毫秒）</div>
        </div>
      </div>

      <!-- 时间 -> 时间戳 -->
      <div class="tool-panel">
        <span class="tool-section-title">时间 → 时间戳</span>
        <input v-model="dtInput" type="datetime-local" step="1" class="tool-input" />
        <div class="ts-out">
          <template v-if="dtOut">
            <div class="ts-out-row"><span class="tool-hint">秒</span><span class="mono">{{ dtOut.sec }}</span><button class="tool-btn small" @click="copy(String(dtOut.sec), '秒级')">复制</button></div>
            <div class="ts-out-row"><span class="tool-hint">毫秒</span><span class="mono">{{ dtOut.ms }}</span><button class="tool-btn small" @click="copy(String(dtOut.ms), '毫秒级')">复制</button></div>
            <div class="ts-out-row"><span class="tool-hint">相对现在</span><span>{{ dtOut.relative }}</span></div>
          </template>
          <div v-else class="tool-hint">选择一个日期时间</div>
        </div>
        <button class="tool-btn small ts-fill" @click="fillNow">填入当前时间</button>
      </div>
    </div>

    <div v-if="toast" class="tool-toast" role="status">{{ toast }}</div>
  </ToolShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import ToolShell from './ToolShell.vue';
import { useCopy } from './useCopy';

const { toast, copy } = useCopy();

const now = ref(Date.now());
let timer = 0;

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

const fmtLocal = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

const fmtUtc = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;

const relative = (ms: number) => {
  const diff = ms - now.value;
  const abs = Math.abs(diff);
  const unit = abs < 60_000 ? '秒' : abs < 3_600_000 ? '分钟' : abs < 86_400_000 ? '小时' : '天';
  const value = abs < 60_000 ? abs / 1000 : abs < 3_600_000 ? abs / 60_000 : abs < 86_400_000 ? abs / 3_600_000 : abs / 86_400_000;
  const rounded = Math.round(value);
  return diff >= 0 ? `${rounded} ${unit}后` : `${rounded} ${unit}前`;
};

const nowSec = computed(() => Math.floor(now.value / 1000));
const nowMs = computed(() => now.value);
const nowLocal = computed(() => fmtLocal(new Date(now.value)));

const tsInput = ref('');
const tsOut = computed(() => {
  const raw = tsInput.value;
  if (!/^-?\d+$/.test(raw)) return null;
  const num = Number(raw);
  const ms = raw.replace('-', '').length <= 10 ? num * 1000 : num;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return { local: fmtLocal(d), utc: fmtUtc(d), iso: d.toISOString(), relative: relative(ms) };
});

const dtInput = ref('');
const dtOut = computed(() => {
  if (!dtInput.value) return null;
  const d = new Date(dtInput.value);
  if (Number.isNaN(d.getTime())) return null;
  return { sec: Math.floor(d.getTime() / 1000), ms: d.getTime(), relative: relative(d.getTime()) };
});

const fillNow = () => {
  const d = new Date();
  dtInput.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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
