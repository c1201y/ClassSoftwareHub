<template>
  <ToolShell
    :title="t('tool.image-convert.name')"
    :subtitle="t('tool.image-convert.subtitle')">
    <div
      class="ic-drop"
      :class="{ 'is-dragging': dragging }"
      role="button"
      tabindex="0"
      @click="pickFiles"
      @keydown.enter.prevent="pickFiles"
      @keydown.space.prevent="pickFiles"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="onDrop">
      <span class="ic-drop-icon" aria-hidden="true">&#xEB9F;</span>
      <div class="ic-drop-text">
        <span class="ic-drop-title">{{ t('image-convert.drop') }}</span>
        <span class="tool-hint">{{ t('image-convert.drop-hint') }}</span>
      </div>
    </div>
    <input ref="fileInput" type="file" accept="image/*" multiple class="ic-file" @change="onFileChange" />

    <div class="tool-panel ic-options">
      <div class="ic-opt">
        <WinComboBox
          :Header="t('image-convert.format')"
          :ItemsSource="formatItems"
          DisplayMemberPath="label"
          SelectedValuePath="value"
          v-model:SelectedValue="format" />
      </div>
      <div class="ic-opt ic-opt-wide">
        <WinSlider
          :Header="`${t('image-convert.quality')} ${qualityPct}%`"
          Width="100%"
          :Minimum="30"
          :Maximum="100"
          :StepFrequency="1"
          :IsEnabled="format !== 'image/png'"
          :ThumbToolTipValueConverter="asPercent"
          v-model:Value="qualityPct" />
      </div>
      <div class="ic-opt">
        <WinNumberBox
          :Header="t('image-convert.max-side')"
          Width="100%"
          :Minimum="64"
          :Maximum="8000"
          :SmallChange="64"
          :IsEnabled="!keepSize"
          v-model:Value="maxSide" />
      </div>
      <div class="ic-opt ic-opt-check">
        <WinCheckBox :Content="t('image-convert.keep-size')" v-model:IsChecked="keepSize" />
      </div>
      <div class="ic-opt ic-opt-bottom">
        <div class="ic-opt-color" :class="{ 'is-disabled': format === 'image/png' }">
          <span class="tool-label">{{ t('image-convert.background') }}</span>
          <WinColorPicker
            class="ic-color"
            :aria-label="t('image-convert.background')"
            IsMoreButtonVisible
            :IsColorChannelTextInputVisible="false"
            v-model:Color="background" />
        </div>
        <div class="ic-opt-actions">
          <WinButton :Content="t('image-convert.download-all')" :IsEnabled="doneCount > 0" @Click="downloadAll" />
          <WinButton :Content="t('common.clear')" :IsEnabled="items.length > 0" @Click="reset" />
        </div>
      </div>
    </div>

    <div v-if="items.length" class="ic-grid">
      <div v-for="item in items" :key="item.id" class="ic-card tool-panel">
        <div class="ic-thumbs">
          <img class="ic-thumb" :src="item.originalUrl" :alt="item.file.name" loading="lazy" />
          <img v-if="item.outputUrl" class="ic-thumb" :src="item.outputUrl" :alt="t('image-convert.after')" loading="lazy" />
        </div>
        <div class="ic-info">
          <span class="ic-name" :title="item.file.name">{{ item.file.name }}</span>
          <span class="tool-hint">
            {{ t('image-convert.before') }} {{ sizeText(item.originalSize) }}
            <template v-if="item.width"> · {{ item.width }}×{{ item.height }}</template>
          </span>
          <span v-if="item.status === 'done'" class="tool-hint ic-after">
            {{ t('image-convert.after') }} {{ sizeText(item.outputSize) }} · {{ item.outputWidth }}×{{ item.outputHeight }}
            <span class="ic-delta" :class="item.outputSize <= item.originalSize ? 'is-smaller' : 'is-larger'">
              {{ deltaText(item) }}
            </span>
          </span>
          <span v-else-if="item.status === 'busy'" class="tool-hint">{{ t('image-convert.processing') }}</span>
          <span v-else-if="item.status === 'error'" class="ic-error">{{ item.error }}</span>
        </div>
        <div class="ic-card-actions">
          <WinButton
            :Content="t('image-convert.download')"
            :IsEnabled="item.status === 'done'"
            @Click="downloadItem(item)" />
        </div>
      </div>
    </div>
    <div v-else class="tool-hint ic-empty">{{ t('image-convert.empty') }}</div>

    <div class="tool-hint ic-note">{{ t('image-convert.note') }}</div>

    <div v-if="toast" class="tool-toast" role="status">{{ toast }}</div>
  </ToolShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import ToolShell from './ToolShell.vue';
import { useCopy } from './useCopy';
import { useI18n } from '../../components/i18n/index';
import WinButton from '../../components/WinButton.vue';
import WinCheckBox from '../../components/WinCheckBox.vue';
import WinColorPicker from '../../components/WinColorPicker.vue';
import WinComboBox from '../../components/WinComboBox.vue';
import WinNumberBox from '../../components/WinNumberBox.vue';
import WinSlider from '../../components/WinSlider.vue';

interface Item {
  id: number;
  file: File;
  originalUrl: string;
  originalSize: number;
  width: number;
  height: number;
  outputUrl: string;
  outputSize: number;
  outputWidth: number;
  outputHeight: number;
  status: 'waiting' | 'busy' | 'done' | 'error';
  error: string;
}

type Source = ImageBitmap | HTMLImageElement;

const MAX_FILES = 40;
const { t } = useI18n();
const { toast, flash } = useCopy();

const fileInput = ref<HTMLInputElement | null>(null);
const dragging = ref(false);
const items = ref<Item[]>([]);
const format = ref<'image/jpeg' | 'image/png' | 'image/webp'>('image/webp');
const quality = ref(0.85);
const maxSide = ref(1920);
const keepSize = ref(true);
const background = ref('#ffffff');

const formatItems = [
  { label: 'JPG', value: 'image/jpeg' },
  { label: 'PNG', value: 'image/png' },
  { label: 'WebP', value: 'image/webp' }
];

const asPercent = (value: number) => `${Math.round(value)}%`;
const qualityPct = computed({
  get: () => Math.round(quality.value * 100),
  set: (value: number) => { quality.value = value / 100; }
});
const doneCount = computed(() => items.value.filter((item) => item.status === 'done').length);

const bitmaps = new Map<number, Source>();
let nextId = 1;
let runToken = 0;
let debounce = 0;

const sizeText = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index++;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[index]}`;
};

const deltaText = (item: Item) => {
  if (!item.originalSize) return '';
  const pct = Math.abs(Math.round((1 - item.outputSize / item.originalSize) * 100));
  return item.outputSize <= item.originalSize
    ? t('image-convert.saved', { pct })
    : t('image-convert.larger', { pct });
};

const extension = () => (format.value === 'image/jpeg' ? 'jpg' : format.value === 'image/png' ? 'png' : 'webp');

const outputName = (item: Item) => {
  const base = item.file.name.replace(/\.[^.]+$/, '') || 'image';
  return `${base}.${extension()}`;
};

const pickFiles = () => fileInput.value?.click();

const decode = async (file: File): Promise<Source> => {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* 某些格式（如部分 HEIC）不支持，退回 img 解码 */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('decode'));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};

const convertItem = async (item: Item) => {
  const source = bitmaps.get(item.id);
  if (!source) return;
  item.status = 'busy';
  try {
    const ratio = keepSize.value ? 1 : Math.min(1, Math.max(64, maxSide.value || 1920) / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * ratio));
    const height = Math.max(1, Math.round(source.height * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    if (format.value !== 'image/png') {
      context.fillStyle = background.value || '#ffffff';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((result) => resolve(result), format.value, format.value === 'image/png' ? undefined : quality.value);
    });
    if (!blob) throw new Error('encode');
    if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
    item.outputUrl = URL.createObjectURL(blob);
    item.outputSize = blob.size;
    item.outputWidth = width;
    item.outputHeight = height;
    item.status = 'done';
  } catch {
    item.status = 'error';
    item.error = t('image-convert.error', { name: item.file.name });
  }
};

const convertAll = async () => {
  const token = ++runToken;
  for (const item of items.value) {
    if (token !== runToken) return;
    if (item.status === 'error' && !bitmaps.has(item.id)) continue;
    await convertItem(item);
  }
};

const addFiles = async (files: File[]) => {
  const images = files.filter((file) => file.type.startsWith('image/'));
  if (!images.length) return;
  const room = Math.max(0, MAX_FILES - items.value.length);
  for (const file of images.slice(0, room)) {
    const item: Item = {
      id: nextId++,
      file,
      originalUrl: URL.createObjectURL(file),
      originalSize: file.size,
      width: 0,
      height: 0,
      outputUrl: '',
      outputSize: 0,
      outputWidth: 0,
      outputHeight: 0,
      status: 'waiting',
      error: ''
    };
    items.value.push(item);
    try {
      const source = await decode(file);
      bitmaps.set(item.id, source);
      item.width = source.width;
      item.height = source.height;
    } catch {
      item.status = 'error';
      item.error = t('image-convert.error', { name: file.name });
    }
  }
  if (images.length > room) flash(t('image-convert.limit', { max: MAX_FILES }), 2400);
  void convertAll();
};

const onFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (input.files?.length) void addFiles([...input.files]);
  input.value = '';
};

const onDrop = (event: DragEvent) => {
  dragging.value = false;
  if (event.dataTransfer?.files.length) void addFiles([...event.dataTransfer.files]);
};

const downloadItem = (item: Item) => {
  if (item.status !== 'done' || !item.outputUrl) return;
  const link = document.createElement('a');
  link.href = item.outputUrl;
  link.download = outputName(item);
  link.click();
};

const downloadAll = () => {
  const done = items.value.filter((item) => item.status === 'done');
  if (!done.length) return;
  done.forEach((item, index) => {
    window.setTimeout(() => downloadItem(item), index * 350);
  });
  flash(t('image-convert.downloading', { n: done.length }), 2600);
};

const reset = () => {
  runToken++;
  for (const item of items.value) {
    URL.revokeObjectURL(item.originalUrl);
    if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
  }
  for (const source of bitmaps.values()) {
    if ('close' in source) source.close();
  }
  bitmaps.clear();
  items.value = [];
};

watch([format, quality, maxSide, keepSize, background], () => {
  if (!items.value.length) return;
  window.clearTimeout(debounce);
  debounce = window.setTimeout(() => { void convertAll(); }, 280);
});

onBeforeUnmount(() => {
  window.clearTimeout(debounce);
  reset();
});
</script>

<style scoped>
.ic-drop {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px;
  border: 1px dashed var(--ctrl-border, rgba(0, 0, 0, 0.24));
  border-radius: 8px;
  background: var(--card-bg, rgba(255, 255, 255, 0.5));
  cursor: pointer;
  transition: border-color var(--fast-duration) var(--fast-out-slow-in);
}

.ic-drop:hover,
.ic-drop.is-dragging {
  border-color: var(--accent-base, #0067c0);
}

.ic-drop-icon {
  font-size: 28px;
  color: var(--accent-base, #0067c0);
}

.ic-drop-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ic-drop-title {
  font-size: 15px;
  font-weight: 600;
}

.ic-file {
  display: none;
}

.ic-options {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  align-items: end;
}

.ic-opt {
  min-width: 0;
}

.ic-opt-wide {
  grid-column: span 2;
}

.ic-opt-bottom {
  grid-column: 1 / -1;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
}

.ic-opt-color {
  min-width: 0;
}

.ic-opt-check {
  display: flex;
  align-items: center;
  min-height: 32px;
}

.ic-opt-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.ic-opt-color.is-disabled {
  opacity: 0.45;
  pointer-events: none;
}

.ic-color {
  --cp-spectrum-size: 148px;
  --cp-preview-width: 32px;
  --cp-preview-gap: 8px;
  min-width: 0;
  max-width: 100%;
  padding: 0;
}

.ic-grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.ic-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.ic-thumbs {
  display: flex;
  gap: 8px;
  height: 110px;
}

.ic-thumb {
  flex: 1 1 0;
  min-width: 0;
  width: 50%;
  height: 100%;
  object-fit: contain;
  border-radius: 4px;
  background: repeating-conic-gradient(rgba(0, 0, 0, 0.06) 0% 25%, transparent 0% 50%) 0 0 / 12px 12px;
}

.ic-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.ic-name {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ic-after {
  word-break: break-word;
}

.ic-delta {
  margin-left: 4px;
  font-weight: 600;
}

.ic-delta.is-smaller {
  color: var(--system-success, #0f7b0f);
}

.ic-delta.is-larger {
  color: var(--system-caution, #9d5d00);
}

.ic-error {
  font-size: 12px;
  color: var(--system-error, #c42b1c);
  word-break: break-word;
}

.ic-card-actions {
  margin-top: auto;
}

.ic-empty {
  margin-top: 16px;
}

.ic-note {
  margin-top: 14px;
}

@media (max-width: 640px) {
  .ic-opt-wide {
    grid-column: span 1;
  }
}
</style>
