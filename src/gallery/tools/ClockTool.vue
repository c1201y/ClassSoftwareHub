<template>
  <ToolShell
    title="全屏时钟"
    subtitle="把屏幕变成一面大钟 —— 考试、自习、开班会时抬头就能看时间。默认黑白；想好看点可以放张背景图，再叠一层蒙版或亚克力、云母材质。">
    <div class="tool-grid-2">
      <!-- ── 预览 ───────────────────────────────────────────── -->
      <div class="tool-panel">
        <span class="tool-section-title">预览</span>
        <WinInfoBar
          class="clock-tip-bar"
          :IsOpen="true"
          :IsClosable="false"
          Severity="Informational"
          Title="放背景图"
          Message="把图片直接拖进下面的框就能当背景；也可以点右边的「选择图片」。" />
        <div
          class="clock-stage clock-stage--preview"
          :class="[stageClass, { 'is-dragover': dragOver }]"
          :style="stageStyle"
          @dragenter.prevent="onDragEnter"
          @dragover.prevent="onDragOver"
          @dragleave.prevent="onDragLeave"
          @drop.prevent="onDrop">
          <div class="clock-veil" :style="veilStyle"></div>
          <div class="clock-face">
            <div class="clock-time">
              {{ timeText }}<span v-if="showSeconds" class="clock-sec">:{{ secText }}</span>
            </div>
            <div v-if="showDate" class="clock-date">{{ dateText }}</div>
          </div>
          <div v-show="dragOver" class="clock-drop">松开鼠标，设为背景图</div>
        </div>

        <div class="clock-modes">
          <WinButton
            Style="AccentButtonStyle"
            Content="网页全屏"
            HorizontalContentAlignment="Center"
            @Click="enterWeb" />
          <WinButton
            Content="屏幕全屏"
            HorizontalContentAlignment="Center"
            @Click="enterScreen" />
        </div>
        <WinInfoBar
          class="clock-tip-bar clock-mode-hint"
          :IsOpen="true"
          :IsClosable="false"
          Severity="Informational"
          Title="全屏 / 退出"
          Message="「网页全屏」= 铺满整个浏览器窗口；「屏幕全屏」= 浏览器全屏（F11 那种）。全屏后双击屏幕（或按 Esc）退出。" />

        <div class="clock-sync">
          <WinButton Content="校准系统时间" @Click="openTimeSync" />
          <span class="tool-hint clock-sync-text">
            时钟读的是<b>本机系统时间</b>，显示不准就点左边按钮到 time.is 对一下时。
          </span>
        </div>
      </div>

      <!-- ── 设置 ───────────────────────────────────────────── -->
      <div class="tool-panel">
        <span class="tool-section-title">外观设置</span>

        <span class="tool-label">背景图片</span>
        <div class="tool-row">
          <input ref="fileInput" class="clock-file-hidden" type="file" accept="image/*" @change="onFile" />
          <WinButton Content="选择图片" @Click="pickFile" />
          <WinButton Content="移除图片" :IsEnabled="!!bgUrl" @Click="clearBg" />
        </div>
        <div class="tool-hint clock-bgname">
          {{ bgUrl ? bgName : '当前未设置背景图（上面拖一张进来即可）' }}
        </div>

        <WinComboBox
          class="clock-field"
          Header="蒙版 / 材质"
          Width="100%"
          :ItemsSource="VEIL_ITEMS"
          DisplayMemberPath="label"
          v-model:SelectedIndex="veilIndex" />

        <div v-if="veil !== 'none'" class="clock-field">
          <WinSlider
            Header="蒙版强度（%）"
            Width="100%"
            :Minimum="0"
            :Maximum="100"
            :StepFrequency="1"
            v-model:Value="veilStrength" />
        </div>

        <WinComboBox
          class="clock-field"
          Header="背景底色"
          Width="100%"
          :ItemsSource="TONE_ITEMS"
          DisplayMemberPath="label"
          v-model:SelectedIndex="toneIndex" />

        <WinComboBox
          class="clock-field"
          Header="文字颜色"
          Width="100%"
          :ItemsSource="INK_ITEMS"
          DisplayMemberPath="label"
          v-model:SelectedIndex="inkIndex" />

        <WinComboBox
          class="clock-field"
          Header="时间字体"
          Width="100%"
          :ItemsSource="FONT_OPTIONS"
          DisplayMemberPath="label"
          v-model:SelectedIndex="fontIndex" />

        <div class="clock-field">
          <WinSlider
            :Header="`字号大小 ${Math.round(scale * 100)}%`"
            Width="100%"
            :Minimum="0.6"
            :Maximum="1.3"
            :StepFrequency="0.05"
            v-model:Value="scale" />
        </div>

        <div class="clock-checks">
          <WinCheckBox Content="显示秒" v-model:IsChecked="showSeconds" />
          <WinCheckBox Content="显示日期 / 星期" v-model:IsChecked="showDate" />
          <WinCheckBox Content="12 小时制" v-model:IsChecked="hour12" />
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
import WinButton from '../../components/WinButton.vue';
import WinCheckBox from '../../components/WinCheckBox.vue';
import WinComboBox from '../../components/WinComboBox.vue';
import WinInfoBar from '../../components/WinInfoBar.vue';
import WinSlider from '../../components/WinSlider.vue';

const { toast, flash } = useCopy();

type Mode = 'normal' | 'web' | 'screen';
type Veil = 'none' | 'white' | 'black' | 'acrylic' | 'mica';

const mode = ref<Mode>('normal');
const overlayEl = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
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
/** 背景底色：跟随主题 / 强制白 / 强制黑（亮色模式下也想用黑底时的开关） */
const tone = ref<'theme' | 'light' | 'dark'>('theme');
/** 文字颜色：自动跟随底色 / 强制白 / 强制黑（背景图太亮、暗色模式下白字看不清时的开关） */
const ink = ref<'auto' | 'white' | 'black'>('auto');

/* ── 下拉选项（WinComboBox 的 ItemsSource） ──────────────── */
const VEIL_ITEMS: { value: Veil; label: string }[] = [
  { value: 'none', label: '无' },
  { value: 'white', label: '白色蒙版' },
  { value: 'black', label: '黑色蒙版' },
  { value: 'acrylic', label: '亚克力（Acrylic）' },
  { value: 'mica', label: '云母（Mica）' }
];
const TONE_ITEMS: { value: 'theme' | 'light' | 'dark'; label: string }[] = [
  { value: 'theme', label: '跟随网站主题' },
  { value: 'light', label: '白色' },
  { value: 'dark', label: '黑色' }
];
const INK_ITEMS: { value: 'auto' | 'white' | 'black'; label: string }[] = [
  { value: 'auto', label: '自动（跟随底色）' },
  { value: 'white', label: '白色字' },
  { value: 'black', label: '黑色字' }
];

/* ── 时间字体 ─────────────────────────────────────────────── */
type FontKey = 'consolas' | 'bahnschrift' | 'cascadia' | 'segoe' | 'georgia';
const FONT_OPTIONS: { key: FontKey; label: string; stack: string }[] = [
  { key: 'consolas', label: '等宽 · 同课堂计时器', stack: "Consolas, 'Courier New', monospace" },
  { key: 'bahnschrift', label: '工业风 · Bahnschrift', stack: "Bahnschrift, 'DIN Alternate', 'Segoe UI', sans-serif" },
  { key: 'cascadia', label: '现代等宽 · Cascadia', stack: "'Cascadia Mono', 'Cascadia Code', Consolas, monospace" },
  { key: 'segoe', label: '系统 UI · Segoe', stack: "'Segoe UI Variable Display', 'Segoe UI', system-ui, sans-serif" },
  { key: 'georgia', label: '优雅衬线 · Georgia', stack: "Georgia, 'Times New Roman', serif" }
];
const fontKey = ref<FontKey>('bahnschrift');
const fontStack = computed(
  () => FONT_OPTIONS.find((f) => f.key === fontKey.value)?.stack ?? FONT_OPTIONS[0].stack
);

/* 下拉双向绑定用的索引（WinComboBox 用 SelectedIndex） */
const veilIndex = computed({
  get: () => Math.max(0, VEIL_ITEMS.findIndex((i) => i.value === veil.value)),
  set: (i: number) => {
    const o = VEIL_ITEMS[i];
    if (o) veil.value = o.value;
  }
});
const toneIndex = computed({
  get: () => Math.max(0, TONE_ITEMS.findIndex((i) => i.value === tone.value)),
  set: (i: number) => {
    const o = TONE_ITEMS[i];
    if (o) tone.value = o.value;
  }
});
const inkIndex = computed({
  get: () => Math.max(0, INK_ITEMS.findIndex((i) => i.value === ink.value)),
  set: (i: number) => {
    const o = INK_ITEMS[i];
    if (o) ink.value = o.value;
  }
});
const fontIndex = computed({
  get: () => Math.max(0, FONT_OPTIONS.findIndex((f) => f.key === fontKey.value)),
  set: (i: number) => {
    const o = FONT_OPTIONS[i];
    if (o) fontKey.value = o.key;
  }
});

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
  const style: Record<string, string> = {
    '--clock-scale': String(scale.value),
    '--clock-font': fontStack.value
  };
  // 背景底色 / 文字色：跟随主题时交给 CSS，强制黑白时用变量覆盖
  if (tone.value === 'light') {
    style['--clock-bg'] = '#ffffff';
    style['--clock-fg'] = '#111111';
  } else if (tone.value === 'dark') {
    style['--clock-bg'] = '#000000';
    style['--clock-fg'] = '#ffffff';
  }
  // 文字颜色强制：优先级最高（--clock-ink），盖过底色/主题/背景图
  if (ink.value === 'white') style['--clock-ink'] = '#ffffff';
  else if (ink.value === 'black') style['--clock-ink'] = '#111111';
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
 * 底色 / 文字色：
 *   跟随主题 → 亮色 = 白底黑字，暗色 = 黑底白字（由 CSS 决定）
 *   强制白/黑 → 由 --clock-bg / --clock-fg 变量覆盖，亮色模式下也能用黑底
 *   有背景图 → 白蒙版给深色字，其余给白字
 */
const stageClass = computed(() => ({
  'is-photo': !!bgUrl.value,
  'is-light-bg': !!bgUrl.value && veil.value === 'white',
  'tone-light': tone.value === 'light',
  'tone-dark': tone.value === 'dark'
}));

/* ── 背景图片 ─────────────────────────────────────────────── */
const applyImageFile = (file: File) => {
  if (!file.type.startsWith('image/')) {
    flash('请选择图片文件', 2600);
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    flash('图片太大了（建议 12MB 以内）', 2600);
    return;
  }
  if (bgUrl.value) URL.revokeObjectURL(bgUrl.value);
  bgUrl.value = URL.createObjectURL(file);
  bgName.value = file.name;
};

const onFile = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) applyImageFile(file);
};

/** WinButton 触发隐藏的原生 file input */
const pickFile = () => fileInput.value?.click();

/* 直接把图片拖进预览框也能设为背景（学校浏览器上传按钮不好使时的兜底） */
const dragOver = ref(false);
let dragDepth = 0;
const onDragEnter = () => {
  dragDepth += 1;
  dragOver.value = true;
};
const onDragOver = () => {
  dragOver.value = true;
};
const onDragLeave = () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dragOver.value = false;
};
const onDrop = (e: DragEvent) => {
  dragDepth = 0;
  dragOver.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) applyImageFile(file);
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
    flash('浏览器拒绝了全屏请求，可以用「网页全屏」', 3000);
  }
  void requestWakeLock();
};

/** 打开 time.is 对时（只跳外链，不接任何 API） */
const openTimeSync = () => {
  window.open('https://time.is/', '_blank', 'noopener,noreferrer');
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
  /* 纯黑白，默认跟随网站主题：亮色 = 白底黑字，暗色 = 黑底白字；
     可用「背景底色」强制成黑/白（--clock-bg 覆盖） */
  background-color: var(--clock-bg, #ffffff);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

html.theme-dark .clock-stage {
  background-color: var(--clock-bg, #000000);
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
  color: var(--clock-ink, var(--clock-fg, #111111));
  pointer-events: none;
}

html.theme-dark .clock-face {
  color: var(--clock-ink, var(--clock-fg, #ffffff));
}

/* 有背景图时不再看主题：白蒙版上给深色字，其余一律白字；--clock-ink 可强制覆盖 */
.clock-stage.is-photo .clock-face {
  color: var(--clock-ink, #ffffff);
}

.clock-stage.is-photo.is-light-bg .clock-face {
  color: var(--clock-ink, #111111);
}

.clock-time {
  display: flex;
  align-items: baseline;
  /* 字体可在设置里切换；默认与课堂计时器同款等宽 */
  font-family: var(--clock-font, Consolas, 'Courier New', monospace);
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  letter-spacing: 0.01em;
  line-height: 1;
  font-weight: 700;
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

/* 强制黑白底色时，提示条配色也跟着走 */
.clock-stage.tone-light .clock-hint {
  background: rgba(0, 0, 0, 0.06);
  color: rgba(0, 0, 0, 0.7);
}

.clock-stage.tone-dark .clock-hint {
  background: rgba(255, 255, 255, 0.14);
  color: rgba(255, 255, 255, 0.92);
}

/* 把图片拖到预览框上时的提示 */
.clock-stage.is-dragover {
  outline: 2px dashed var(--accent-base, #0067C0);
  outline-offset: -6px;
}

/* 提示条（WinInfoBar）与上下元素留点间距 */
.clock-tip-bar {
  display: block;
  margin: 0 0 12px;
}

.clock-drop {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--clock-ink, var(--clock-fg, #111111));
  background: rgba(127, 127, 127, 0.18);
  pointer-events: none;
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

/* WinSlider 根节点 inheritAttrs:false、不接收外部 class，用 :deep 把宽度拉满 */
.clock-field :deep(.win-slider-root) {
  display: flex;
  width: 100%;
}

.clock-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 20px;
  margin-top: 18px;
}

.clock-modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 14px;
}

.clock-modes :deep(.win-btn) {
  width: 100%;
}

.clock-mode-hint {
  margin-top: 10px;
}

.clock-sync {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}

.clock-sync-text {
  margin: 0;
  flex: 1 1 auto;
  min-width: 0;
}

.clock-bgname {
  margin-top: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* WinButton 触发的隐藏原生 file input */
.clock-file-hidden {
  display: none;
}
</style>
