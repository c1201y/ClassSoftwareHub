<template>
  <ToolShell
    title="课堂计时器"
    subtitle="倒计时 / 秒表，大字号方便投影到教室大屏，到点会响铃。纯本地运行。">
    <div class="tool-row timer-modes">
      <button class="tool-btn" :class="{ accent: mode === 'countdown' }" @click="setMode('countdown')">倒计时</button>
      <button class="tool-btn" :class="{ accent: mode === 'stopwatch' }" @click="setMode('stopwatch')">秒表</button>
    </div>

    <div class="tool-panel timer-stage">
      <div class="timer-display" :class="{ done: finished }">{{ display }}</div>
      <div class="timer-bar"><span :style="{ width: progress + '%' }"></span></div>

      <div class="timer-controls">
        <button class="tool-btn accent timer-btn" @click="toggle">{{ running ? '暂停' : (finished ? '重新开始' : '开始') }}</button>
        <button class="tool-btn timer-btn" @click="reset">重置</button>
      </div>
    </div>

    <template v-if="mode === 'countdown'">
      <div class="tool-panel timer-set">
        <span class="tool-section-title">设定时长</span>
        <div class="tool-row">
          <input v-model.number="min" class="tool-input timer-num" type="number" min="0" max="999" :disabled="running" />
          <span class="tool-hint">分</span>
          <input v-model.number="sec" class="tool-input timer-num" type="number" min="0" max="59" :disabled="running" />
          <span class="tool-hint">秒</span>
        </div>
        <div class="tool-row timer-presets">
          <button v-for="p in presets" :key="p" class="tool-btn small" :disabled="running" @click="applyPreset(p)">{{ p }} 分钟</button>
        </div>
      </div>
    </template>

    <div v-if="toast" class="tool-toast" role="status">{{ toast }}</div>
  </ToolShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import ToolShell from './ToolShell.vue';
import { useCopy } from './useCopy';

const { toast } = useCopy();

const mode = ref<'countdown' | 'stopwatch'>('countdown');
const presets = [1, 3, 5, 10, 15];

const min = ref(5);
const sec = ref(0);
const totalMs = ref(5 * 60 * 1000);
const remainingMs = ref(totalMs.value);
const elapsedMs = ref(0);
const running = ref(false);
const finished = ref(false);

let raf = 0;
let endAt = 0;
let startAt = 0;
let baseElapsed = 0;

const display = computed(() => {
  const ms = mode.value === 'countdown' ? remainingMs.value : elapsedMs.value;
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
});

const progress = computed(() => {
  if (mode.value === 'stopwatch') return 0;
  if (!totalMs.value) return 0;
  return Math.max(0, Math.min(100, (remainingMs.value / totalMs.value) * 100));
});

watch([min, sec], () => {
  const m = Math.max(0, min.value || 0);
  const s = Math.max(0, Math.min(59, sec.value || 0));
  totalMs.value = (m * 60 + s) * 1000;
  if (!running.value) {
    remainingMs.value = totalMs.value;
    finished.value = false;
  }
});

const applyPreset = (minutes: number) => {
  min.value = minutes;
  sec.value = 0;
  setMode('countdown');
};

const setMode = (m: 'countdown' | 'stopwatch') => {
  stopLoop();
  mode.value = m;
  running.value = false;
  finished.value = false;
  remainingMs.value = totalMs.value;
  elapsedMs.value = 0;
  baseElapsed = 0;
};

const tick = () => {
  const now = performance.now();
  if (mode.value === 'countdown') {
    remainingMs.value = Math.max(0, endAt - now);
    if (remainingMs.value <= 0) {
      finish();
      return;
    }
  } else {
    elapsedMs.value = baseElapsed + (now - startAt);
  }
  raf = requestAnimationFrame(tick);
};

const startLoop = () => {
  running.value = true;
  finished.value = false;
  const now = performance.now();
  if (mode.value === 'countdown') {
    endAt = now + remainingMs.value;
  } else {
    startAt = now;
  }
  raf = requestAnimationFrame(tick);
};

const stopLoop = () => {
  running.value = false;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
};

const toggle = () => {
  if (running.value) {
    // 暂停
    const now = performance.now();
    if (mode.value === 'countdown') remainingMs.value = Math.max(0, endAt - now);
    else baseElapsed = elapsedMs.value;
    stopLoop();
    return;
  }
  if (finished.value) {
    remainingMs.value = totalMs.value;
    elapsedMs.value = 0;
    baseElapsed = 0;
    finished.value = false;
  }
  if (mode.value === 'countdown' && remainingMs.value <= 0) remainingMs.value = totalMs.value;
  startLoop();
};

const reset = () => {
  stopLoop();
  finished.value = false;
  remainingMs.value = totalMs.value;
  elapsedMs.value = 0;
  baseElapsed = 0;
};

const finish = () => {
  stopLoop();
  finished.value = true;
  remainingMs.value = 0;
  beep();
};

/** 用 Web Audio 现场合成提示音，不依赖任何音频文件 */
const beep = () => {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const now = ctx.currentTime;
    [0, 0.35, 0.7].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.3);
    });
    window.setTimeout(() => { void ctx.close(); }, 1600);
  } catch {
    /* 静默失败即可 */
  }
};

onBeforeUnmount(stopLoop);
</script>

<style scoped>
.timer-modes {
  margin-bottom: 16px;
}

.timer-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 28px 16px;
}

.timer-display {
  font-size: 96px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  font-family: Consolas, 'Courier New', monospace;
  color: var(--text-primary);
}

.timer-display.done {
  color: var(--accent-base, #0067C0);
  animation: timer-blink 0.9s steps(2, start) infinite;
}

@keyframes timer-blink {
  50% { opacity: 0.35; }
}

.timer-bar {
  width: 100%;
  max-width: 520px;
  height: 6px;
  border-radius: 3px;
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.08));
  overflow: hidden;
}

.timer-bar span {
  display: block;
  height: 100%;
  background: var(--accent-base, #0067C0);
  transition: width 0.12s linear;
}

.timer-controls {
  display: flex;
  gap: 10px;
}

.timer-btn {
  min-width: 96px;
  height: 40px;
  font-size: 15px;
}

.timer-set {
  margin-top: 16px;
}

.timer-num {
  width: 92px !important;
  flex: 0 0 auto;
}

.timer-presets {
  margin-top: 12px;
}

@media (max-width: 640px) {
  .timer-display {
    font-size: 64px;
  }
}
</style>
