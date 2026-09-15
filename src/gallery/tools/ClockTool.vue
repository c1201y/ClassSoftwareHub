<template>
  <ToolShell
    title="全屏时钟"
    subtitle="把屏幕变成一面大钟 —— 考试、自习、开班会时抬头就能看时间。默认黑白；想好看点可以放张背景图，再叠一层蒙版或亚克力、云母材质。">
    <div class="tool-grid-2">
      <!-- ── 预览 ───────────────────────────────────────────── -->
      <div class="tool-panel">
        <span class="tool-section-title">预览</span>
        <div class="clock-stage clock-stage--preview" :class="stageClass" :style="stageStyle">
          <div class="clock-veil" :style="veilStyle"></div>
          <div class="clock-face">
            <div class="clock-time">
              {{ timeText }}<span v-if="showSeconds" class="clock-sec">:{{ secText }}</span>
            </div>
            <div v-if="showDate" class="clock-date">{{ dateText }}</div>
          </div>
        </div>

        <div class="tool-row clock-modes">
          <button class="tool-btn accent" @click="enterWeb">网页全屏</button>
          <button class="tool-btn" @click="enterScreen">屏幕全屏</button>
        </div>
        <div class="tool-hint clock-mode-hint">
          「网页全屏」= 铺满整个浏览器窗口；「屏幕全屏」= 浏览器全屏（F11 那种）。
          全屏后 <b>双击屏幕</b>（或按 Esc）退出。
        </div>
      </div>

      <!-- ── 设置 ───────────────────────────────────────────── -->
      <div class="tool-panel">
        <span class="tool-section-title">外观设置</span>

        <span class="tool-label">背景图片</span>
        <div class="tool-row">
          <label class="tool-btn small clock-filebtn">
            选择图片
            <input type="file" accept="image/*" @change="onFile" />
          </label>
          <button class="tool-btn small" :disabled="!bgUrl" @click="clearBg">移除图片</button>
        </div>
        <div class="tool-hint clock-bgname">
          {{ bgUrl ? bgName : '不选图片就是纯黑底白字' }}
        </div>

        <label class="clock-field">
          <span class="tool-label">蒙版 / 材质</span>
          <select v-model="veil" class="tool-select">
            <option value="none">无</option>
            <option value="white">白色蒙版</option>
            <option value="black">黑色蒙版</option>
            <option value="acrylic">亚克力（Acrylic）</option>
            <option value="mica">云母（Mica）</option>
          </select>
        </label>

        <label v-if="veil !== 'none'" class="clock-field">
          <span class="tool-label">蒙版强度 {{ veilStrength }}%</span>
          <input v-model.number="veilStrength" class="clock-slider" type="range" min="0" max="100" step="1" />
        </label>

        <label class="clock-field">
          <span class="tool-label">字号大小 {{ Math.round(scale * 100) }}%</span>
          <input v-model.number="scale" class="clock-slider" type="range" min="0.6" max="1.3" step="0.05" />
        </label>

        <div class="clock-checks">
          <label class="clock-check"><input v-model="showSeconds" type="checkbox" /><span>显示秒</span></label>
          <label class="clock-check"><input v-model="showDate" type="checkbox" /><span>显示日期 / 星期</span></label>
          <label class="clock-check"><input v-model="hour12" type="checkbox" /><span>12 小时制</span></label>
        </div>
      </div>
    </div>

    <!-- ── 全屏层（挂到 body，躲开页面布局） ───────────────── -->
    <Teleport to="body">
      <div
        v-if="mode !== 'normal'"
        ref="overlayEl"
        class="clock-stage clock-stage--full"
        :class="[stageClass, { 'has-sec': showSeconds }]"
        :style="stageStyle"
        @pointerup="onOverlayTap">
        <div class="clock-veil" :style="veilStyle"></div>
        <div class="clock-face">
          <div class="clock-time">
            {{ timeText }}<span v-if="showSeconds" class="clock-sec">:{{ secText }}</span>
          </div>
          <div v-if="showDate" class="clock-date">{{ dateText }}</div>
        </div>
        <div v-show="hintVisible" class="clock-hint">双击屏幕退出全屏</div>
      </div>
    </Teleport>

    <div v-if="toast" class="tool-toast" role="status">{{ toast }}</div>
  </ToolShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import ToolShell from './ToolShell.vue';
import { useCopy } from './useCopy';

const { toast } = useCopy();

type Mode = 'normal' | 'web' | 'screen';
type Veil = 'none' | 'white' | 'black' | 'acrylic' | 'mica';

const mode = ref<Mode>('normal');
const overlayEl = ref<HTMLElement | null>(null);
const hintVisible = ref(false);
let hintTimer = 0;

const bgUrl = ref('');
const bgName = ref('');
const veil = ref<Veil>('none');
const veilStrength = ref(55);
const scale = ref(1);
const showSeconds = ref(true);
const showDate = ref(true);
const hour12 = ref(false);

/* ── 时间 ─────────────────────────────────────────────────── */
const now = ref(new Date());
const pad = (n: number) => String(n).padStart(2, '0');

const timeText = computed(() => {
  const d = now.value;
  const h = hour12.value ? d.getHours() % 12 || 12 : d.getHours();
  return `${hour12.value ? h : pad(h)}:${pad(d.getMinutes())}`;
});
const secText = computed(() => pad(now.value.getSeconds()));
const dateText = computed(() => {
  const d = now.value;
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · 星期${week}`;
});

let tick = 0;
onMounted(() => {
  tick = window.setInterval(() => { now.value = new Date(); }, 250);
});

/* ── 样式：默认就是纯黑白 ─────────────────────────────────── */
const a = computed(() => veilStrength.value / 100);

const stageStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = { '--clock-scale': String(scale.value) };
  if (bgUrl.value) style.backgroundImage = `url("${bgUrl.value}")`;
  return style;
});

const veilStyle = computed<Record<string, string>>(() => {
  const x = a.value;
  switch (veil.value) {
    case 'white':
      return { backgroundColor: `rgba(255, 255, 255, ${Math.round(x * 100) / 100})`, backdropFilter: 'none' };
    case 'black':
      return { backgroundColor: `rgba(0, 0, 0, ${Math.round(x * 100) / 100})`, backdropFilter: 'none' };
    case 'acrylic':
      return {
        backgroundColor: `rgba(255, 255, 255, ${Math.round((0.04 + 0.28 * x) * 100) / 100})`,
        backdropFilter: `blur(${Math.round(12 + 34 * x)}px) saturate(150%)`
      };
    case 'mica':
      return {
        backgroundColor: `rgba(12, 12, 12, ${Math.round((0.1 + 0.55 * x) * 100) / 100})`,
        backdropFilter: `blur(${Math.round(26 + 50 * x)}px) saturate(120%)`
      };
    default:
      return { backgroundColor: 'transparent', backdropFilter: 'none' };
  }
});

/**
 * 底色 / 文字色走 CSS：
 *   没有背景图 → 纯黑白，跟随网站主题（亮色=白底黑字，暗色=黑底白字）
 *   有背景图   → 白蒙版给深色字，其余给白字（都带一圈淡投影，保证看得清）
 */
const stageClass = computed(() => ({
  'is-photo': !!bgUrl.value,
  'is-light-bg': !!bgUrl.value && veil.value === 'white'
}));

/* ── 背景图片 ─────────────────────────────────────────────── */
const onFile = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    toast.value = '请选择图片文件';
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    toast.value = '图片太大了（建议 12MB 以内）';
    return;
  }
  if (bgUrl.value) URL.revokeObjectURL(bgUrl.value);
  bgUrl.value = URL.createObjectURL(file);
  bgName.value = file.name;
};

const clearBg = () => {
  if (bgUrl.value) URL.revokeObjectURL(bgUrl.value);
  bgUrl.value = '';
  bgName.value = '';
};

/* ── 全屏 / 退出 ──────────────────────────────────────────── */
const showHint = () => {
  hintVisible.value = true;
  if (hintTimer) window.clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => { hintVisible.value = false; }, 3200);
};

const enterWeb = () => {
  mode.value = 'web';
  showHint();
  void requestWakeLock();
};

const enterScreen = async () => {
  mode.value = 'screen';
  showHint();
  await nextTick();
  try {
    await overlayEl.value?.requestFullscreen?.();
  } catch {
    toast.value = '浏览器拒绝了全屏请求，可以用「网页全屏」';
  }
  void requestWakeLock();
};

const exitFull = () => {
  hintVisible.value = false;
  if (document.fullscreenElement) void document.exitFullscreen();
  mode.value = 'normal';
  void releaseWakeLock();
};

/** 鼠标双击 / 手指双击（触屏没有 dblclick，所以用两次 pointerup 的间隔判断） */
let lastTap = 0;
const onOverlayTap = () => {
  const t = Date.now();
  if (t - lastTap < 340) {
    lastTap = 0;
    exitFull();
  } else {
    lastTap = t;
  }
};

const onFullscreenChange = () => {
  if (mode.value === 'screen' && !document.fullscreenElement) {
    mode.value = 'normal';
    void releaseWakeLock();
  }
};

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && mode.value === 'web') exitFull();
};

/* ── 屏幕常亮（投影 / 平板挂着当钟用时不至于黑屏） ─────────── */
type WakeLockLike = { release: () => Promise<void> };
let wakeLock: WakeLockLike | null = null;

const requestWakeLock = async () => {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockLike> } };
    if (!nav.wakeLock) return;
    if (wakeLock) return;
    wakeLock = await nav.wakeLock.request('screen');
  } catch {
    /* 不支持或被拒绝就算了 */
  }
};

const releaseWakeLock = async () => {
  try {
    await wakeLock?.release();
  } catch {
    /* 忽略 */
  }
  wakeLock = null;
};

const onVisibility = () => {
  if (document.visibilityState === 'visible' && mode.value !== 'normal') void requestWakeLock();
};

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('keydown', onKey);
});

onBeforeUnmount(() => {
  if (tick) window.clearInterval(tick);
  if (hintTimer) window.clearTimeout(hintTimer);
  if (bgUrl.value) URL.revokeObjectURL(bgUrl.value);
  document.removeEventListener('fullscreenchange', onFullscreenChange);
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('keydown', onKey);
  if (document.fullscreenElement) void document.exitFullscreen();
  void releaseWakeLock();
});
</script>

<style scoped>
/* ── 舞台（默认纯黑，简约；有图片才画图） ─────────────────── */
.clock-stage {
  position: relative;
  overflow: hidden;
  /* 纯黑白，跟随网站主题：亮色 = 白底黑字，暗色 = 黑底白字 */
  background-color: #ffffff;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

html.theme-dark .clock-stage {
  background-color: #000000;
}

.clock-stage--preview {
  height: 210px;
  border-radius: 8px;
  border: 1px solid var(--card-stroke, rgba(0, 0, 0, 0.12));
}

.clock-veil {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.clock-face {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.12em;
  user-select: none;
  -webkit-user-select: none;
  color: #111111;
  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.45);
}

html.theme-dark .clock-face {
  color: #ffffff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
}

/* 有背景图时不再看主题：白蒙版上给深色字，其余一律白字 */
.clock-stage.is-photo .clock-face {
  color: #ffffff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
}

.clock-stage.is-photo.is-light-bg .clock-face {
  color: #111111;
  text-shadow: 0 1px 2px rgba(255, 255, 255, 0.45);
}

.clock-time {
  display: flex;
  align-items: baseline;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  letter-spacing: 0.01em;
  line-height: 1;
  font-weight: 600;
}

.clock-stage--preview .clock-time {
  font-size: calc(46px * var(--clock-scale, 1));
}

.clock-stage--preview .clock-sec {
  font-size: 0.46em;
  font-weight: 500;
  margin-left: 0.06em;
}

.clock-stage--preview .clock-date {
  font-size: calc(12.5px * var(--clock-scale, 1));
  font-weight: 500;
  opacity: 0.9;
}

/* ── 全屏层 ───────────────────────────────────────────────── */
/* z-index 必须高于站点的标题栏（.gallery-titlebar 是 fixed + 9999），
   否则返回按钮和搜索框会浮在时钟上面 */
.clock-stage--full {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  width: 100vw;
  height: 100vh;
  cursor: default;
  touch-action: none;
  -webkit-tap-highlight-color: transparent;
}

.clock-stage--full .clock-time {
  font-size: calc(min(30vw, 46vh) * var(--clock-scale, 1));
}

.clock-stage--full.has-sec .clock-time {
  font-size: calc(min(22vw, 34vh) * var(--clock-scale, 1));
}

.clock-stage--full .clock-sec {
  font-size: 0.5em;
  font-weight: 500;
  margin-left: 0.05em;
}

.clock-stage--full .clock-date {
  font-size: calc(min(2.4vw, 4vh) * var(--clock-scale, 1));
  font-weight: 500;
  opacity: 0.92;
}

/* 进入全屏后提示几秒「双击退出」，之后自动消失 */
.clock-hint {
  position: absolute;
  left: 50%;
  bottom: max(28px, env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  padding: 7px 16px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.7);
  font-size: 13px;
  letter-spacing: 0.02em;
  pointer-events: none;
  animation: clock-hint-in 0.3s ease both;
}

html.theme-dark .clock-hint {
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.92);
}

@keyframes clock-hint-in {
  from { opacity: 0; transform: translate(-50%, 6px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

/* ── 设置区 ───────────────────────────────────────────────── */
.clock-field {
  display: block;
  margin-top: 16px;
}

.clock-slider {
  width: 100%;
  accent-color: var(--accent-base, #0067C0);
}

.clock-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin-top: 16px;
}

.clock-check {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.clock-modes {
  margin-top: 14px;
}

.clock-modes .tool-btn {
  flex: 1 1 140px;
}

.clock-mode-hint {
  margin-top: 10px;
}

.clock-bgname {
  margin-top: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 隐藏原生 file input，用 label 当按钮 */
.clock-filebtn {
  position: relative;
  overflow: hidden;
  cursor: pointer;
}

.clock-filebtn input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
</style>
