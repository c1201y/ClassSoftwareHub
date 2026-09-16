<template>
  <ToolShell
    title="图片取色"
    subtitle="上传一张图片，自动提取出一组柔和的配色（类似 Win11 壁纸主题色的取法）。点击色块复制 hex。图片只在你的浏览器里处理，不会上传。">
    <!-- ── 上传区 ─────────────────────────────────────────── -->
    <div
      class="color-drop"
      :class="{ 'is-dragging': dragging, 'has-image': !!previewUrl }"
      role="button"
      tabindex="0"
      @click="pickFile"
      @keydown.enter.prevent="pickFile"
      @keydown.space.prevent="pickFile"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop">
      <template v-if="previewUrl">
        <img :src="previewUrl" class="color-preview" alt="预览" />
        <div class="color-drop-text">
          <span class="color-drop-title">换一张图片</span>
          <span class="tool-hint">点击这里，或把新图片拖进来</span>
        </div>
      </template>
      <template v-else>
        <span class="color-drop-icon" aria-hidden="true">&#xEB9F;</span>
        <div class="color-drop-text">
          <span class="color-drop-title">点击选择图片</span>
          <span class="tool-hint">或把图片拖进来 · 支持 PNG / JPG / WebP / GIF</span>
        </div>
      </template>
    </div>
    <input ref="fileInput" type="file" accept="image/*" class="color-file" @change="onFileChange" />

    <div v-if="error" class="color-error tool-panel">{{ error }}</div>

    <!-- ── 结果 ───────────────────────────────────────────── -->
    <template v-if="palette">
      <div class="color-seed tool-panel">
        <span class="color-seed-chip" :style="{ background: palette.seedHex }"></span>
        <div class="color-seed-text">
          <span class="tool-hint">提取到的种子色</span>
          <span class="color-seed-value">{{ palette.seedHex }} · {{ hslText(palette.seedHsl) }}</span>
        </div>
      </div>

      <div class="color-result-head">
        <span class="tool-section-title">配色方案</span>
        <span class="tool-hint">点击色块复制 hex</span>
      </div>

      <div class="color-swatches">
        <button
          v-for="variant in palette.variants"
          :key="variant.key"
          type="button"
          class="color-swatch"
          :title="`点击复制 ${variant.hex}`"
          @click="copy(variant.hex)">
          <span class="color-swatch-block" :style="{ background: variant.hex }">
            <span v-if="copied === variant.hex" class="color-swatch-check" aria-hidden="true">&#xE73E;</span>
          </span>
          <span class="color-swatch-name">{{ variant.label }}</span>
          <span class="color-swatch-hex">{{ variant.hex }}</span>
        </button>
      </div>

      <div class="color-hsl-block">
        <span class="tool-label">HSL（点击复制）</span>
        <div class="color-hsl-chips">
          <button
            v-for="variant in palette.variants"
            :key="variant.key"
            type="button"
            class="color-hsl-copy"
            :title="`点击复制 ${hslText(variant.hsl)}`"
            @click="copy(hslText(variant.hsl))">{{ hslShort(variant.hsl) }}</button>
        </div>
      </div>

      <div class="color-actions">
        <WinButton Content="换一张" @Click="pickFile" />
        <WinButton Content="清空" @Click="reset" />
      </div>
    </template>

    <div v-if="toast" class="tool-toast" role="status">{{ toast }}</div>
  </ToolShell>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import ToolShell from './ToolShell.vue';
import { useCopy } from './useCopy';
import { extractPalette } from '../imageColors';
import type { Hsl, PaletteResult } from '../imageColors';
import WinButton from '../../components/WinButton.vue';

/** 缩放到的最长边（像素）：太大没必要，还会拖慢取色 */
const MAX_SIDE = 120;

const { toast, copy: copyRaw } = useCopy();
const copied = ref('');

const fileInput = ref<HTMLInputElement | null>(null);
const dragging = ref(false);
const error = ref('');
const previewUrl = ref('');
const palette = ref<PaletteResult | null>(null);

let objectUrl = '';

const hslText = (hsl: Hsl) => `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
const hslShort = (hsl: Hsl) => `${hsl.h}° ${hsl.s}% ${hsl.l}%`;

const copy = (value: string) => {
  copied.value = value;
  void copyRaw(value);
};

const pickFile = () => fileInput.value?.click();

const onFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) void process(file);
  input.value = '';
};

const onDrop = (event: DragEvent) => {
  dragging.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) void process(file);
};

const clearObjectUrl = () => {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = '';
  }
};

const reset = () => {
  palette.value = null;
  previewUrl.value = '';
  error.value = '';
  copied.value = '';
  clearObjectUrl();
};

const process = async (file: File) => {
  error.value = '';
  if (!file.type.startsWith('image/')) {
    error.value = '这不是图片文件，请选择 PNG / JPG / WebP 等图片。';
    return;
  }
  clearObjectUrl();
  objectUrl = URL.createObjectURL(file);
  previewUrl.value = objectUrl;
  try {
    const image = await loadImage(objectUrl);
    const result = readPalette(image);
    if (!result) {
      palette.value = null;
      error.value = '这张图里没有可用的不透明像素（可能是全透明图片），换一张试试。';
      return;
    }
    palette.value = result;
  } catch (err) {
    palette.value = null;
    error.value = err instanceof Error ? err.message : String(err);
  }
};

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('图片解码失败，可能是格式不支持或文件已损坏。'));
  img.src = src;
});

const readPalette = (image: HTMLImageElement): PaletteResult | null => {
  const naturalW = image.naturalWidth || image.width;
  const naturalH = image.naturalHeight || image.height;
  if (!naturalW || !naturalH) throw new Error('读不到图片尺寸。');

  const scale = Math.min(1, MAX_SIDE / Math.max(naturalW, naturalH));
  const w = Math.max(1, Math.round(naturalW * scale));
  const h = Math.max(1, Math.round(naturalH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('当前浏览器不支持 canvas 取色。');

  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, w, h);

  return extractPalette(ctx.getImageData(0, 0, w, h));
};

onBeforeUnmount(() => {
  clearObjectUrl();
});
</script>

<style scoped>
/* ── 上传区 ───────────────────────────────────────────────────── */
.color-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 200px;
  padding: 24px;
  border: 1px dashed var(--ctrl-border, rgba(0, 0, 0, 0.22));
  border-radius: 8px;
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.02));
  cursor: pointer;
  transition: border-color var(--fast-duration) var(--fast-out-slow-in),
    background var(--fast-duration) var(--fast-out-slow-in);
}

.color-drop:hover,
.color-drop.is-dragging {
  border-color: var(--accent-base, #0067C0);
  background: color-mix(in srgb, var(--accent-base, #0067C0) 6%, transparent);
}

.color-drop:focus-visible {
  outline: 2px solid var(--accent-base, #0067C0);
  outline-offset: 2px;
}

.color-drop.has-image {
  flex-direction: row;
  justify-content: flex-start;
  align-items: center;
  gap: 20px;
  min-height: 0;
  padding: 16px 20px;
  border-style: solid;
}

.color-preview {
  flex: 0 0 auto;
  max-width: 220px;
  max-height: 140px;
  border-radius: 6px;
  border: 1px solid var(--card-stroke, rgba(0, 0, 0, 0.12));
  object-fit: contain;
  background: repeating-conic-gradient(rgba(0, 0, 0, 0.06) 0% 25%, transparent 0% 50%) 50% / 14px 14px;
}

.color-drop-text {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  text-align: center;
}

.color-drop.has-image .color-drop-text {
  align-items: flex-start;
  text-align: left;
}

.color-drop-icon {
  font-family: 'WinUIOnWebIcons';
  font-size: 32px;
  line-height: 1;
  color: var(--accent-base, #0067C0);
}

.color-drop-title {
  font-size: 15px;
  font-weight: 600;
}

.color-file {
  display: none;
}

.color-error {
  margin-top: 14px;
  color: var(--system-error-text, #c42b1c);
}

/* ── 结果 ─────────────────────────────────────────────────────── */
.color-seed {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
}

.color-seed-chip {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.15);
}

.color-seed-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.color-seed-value {
  font-size: 14px;
  font-family: Consolas, 'Courier New', monospace;
}

.color-result-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 22px 0 10px;
}

.color-swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}

.color-swatch {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  text-align: left;
  border: 1px solid var(--card-stroke, var(--ctrl-border, rgba(0, 0, 0, 0.12)));
  border-radius: 8px;
  background: var(--card-bg, var(--ctrl-fill-default, rgba(255, 255, 255, 0.5)));
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
  transition: border-color var(--fast-duration) var(--fast-out-slow-in),
    background var(--fast-duration) var(--fast-out-slow-in);
}

.color-swatch:hover {
  border-color: var(--accent-base, #0067C0);
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.03));
}

.color-swatch:focus-visible {
  outline: 2px solid var(--accent-base, #0067C0);
  outline-offset: 2px;
}

.color-swatch-block {
  position: relative;
  height: 60px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.color-swatch-check {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'WinUIOnWebIcons';
  font-size: 20px;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}

.color-swatch-name {
  font-size: 12px;
  color: var(--text-secondary);
}

.color-swatch-hex {
  font-size: 13px;
  font-weight: 600;
  font-family: Consolas, 'Courier New', monospace;
}

/* ── HSL 快捷复制 ─────────────────────────────────────────────── */
.color-hsl-block {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--stroke-divider, rgba(0, 0, 0, 0.08));
}

.color-hsl-chips {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}

.color-hsl-copy {
  box-sizing: border-box;
  width: 100%;
  padding: 5px 4px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border: 1px solid var(--card-stroke, rgba(0, 0, 0, 0.12));
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-family: Consolas, 'Courier New', monospace;
  cursor: pointer;
  transition: color var(--fast-duration) var(--fast-out-slow-in),
    border-color var(--fast-duration) var(--fast-out-slow-in);
}

.color-hsl-copy:hover {
  color: var(--text-primary);
  border-color: var(--accent-base, #0067C0);
}

.color-actions {
  display: flex;
  gap: 8px;
  margin-top: 20px;
}

@media (max-width: 640px) {
  .color-drop.has-image {
    flex-direction: column;
    align-items: flex-start;
  }

  .color-swatches,
  .color-hsl-chips {
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  }
}
</style>
