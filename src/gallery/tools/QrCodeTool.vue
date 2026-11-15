<template>
  <ToolShell
    :title="t('tool.qrcode.name')"
    :subtitle="t('tool.qrcode.subtitle')">
    <div class="tool-grid-2">
      <div class="tool-panel">
        <span class="tool-section-title">{{ t('qrcode.section') }}</span>
        <WinTextBox
          :PlaceholderText="t('qrcode.placeholder')"
          AcceptsReturn
          TextWrapping="Wrap"
          :IsSpellCheckEnabled="false"
          MinHeight="120"
          v-model:Text="text" />
        <div class="tool-row qr-opts">
          <WinComboBox
            class="qr-sel"
            :Header="t('qrcode.ec')"
            Width="180"
            :ItemsSource="EC_ITEMS"
            DisplayMemberPath="label"
            v-model:SelectedIndex="ecIndex" />
          <WinNumberBox
            class="qr-num"
            :Header="t('qrcode.size')"
            Width="150"
            :Minimum="128"
            :Maximum="1024"
            :SmallChange="32"
            SpinButtonPlacementMode="Inline"
            v-model:Value="size" />
        </div>
      </div>

      <div class="tool-panel qr-stage">
        <span class="tool-section-title">{{ t('qrcode.preview') }}</span>
        <div v-if="error" class="tool-hint qr-error">{{ error }}</div>
        <canvas v-show="!error" ref="canvas" class="qr-canvas"></canvas>
        <div class="tool-row qr-actions">
          <WinButton Style="AccentButtonStyle" :Content="t('qrcode.download')" :IsEnabled="!error" @Click="download" />
          <WinButton :Content="t('qrcode.copy')" :IsEnabled="!error" @Click="copyImage" />
        </div>
      </div>
    </div>

    <div v-if="toast" class="tool-toast" role="status">{{ toast }}</div>
  </ToolShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import qrcode from 'qrcode-generator';
import ToolShell from './ToolShell.vue';
import { useCopy } from './useCopy';
import WinButton from '../../components/WinButton.vue';
import WinComboBox from '../../components/WinComboBox.vue';
import WinNumberBox from '../../components/WinNumberBox.vue';
import WinTextBox from '../../components/WinTextBox.vue';
import { useI18n } from '../../components/i18n/index';

const { t } = useI18n();
const { toast, copy, flash } = useCopy();

const text = ref('https://classsoftwarehub.cn');
const ec = ref<'L' | 'M' | 'Q' | 'H'>('M');
const size = ref(320);
const error = ref('');
const canvas = ref<HTMLCanvasElement | null>(null);

const EC_ITEMS = computed<{ value: 'L' | 'M' | 'Q' | 'H'; label: string }[]>(() => [
  { value: 'L', label: t('qrcode.ec.L') },
  { value: 'M', label: t('qrcode.ec.M') },
  { value: 'Q', label: t('qrcode.ec.Q') },
  { value: 'H', label: t('qrcode.ec.H') }
]);
const ecIndex = computed({
  get: () => Math.max(0, EC_ITEMS.value.findIndex((i) => i.value === ec.value)),
  set: (i: number) => {
    const o = EC_ITEMS.value[i];
    if (o) ec.value = o.value;
  }
});

const MARGIN = 4; // 静默区（模块数）

const render = () => {
  const value = text.value.trim();
  const cv = canvas.value;
  if (!cv) return;
  if (!value) {
    error.value = t('qrcode.error.empty');
    return;
  }
  try {
    const qr = qrcode(0, ec.value); // typeNumber 0 = 自动选择最小版本
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    const total = count + MARGIN * 2;
    const scale = Math.max(1, Math.floor(size.value / total));
    const px = total * scale;

    cv.width = px;
    cv.height = px;
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error(t('qrcode.error.canvas'));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect((c + MARGIN) * scale, (r + MARGIN) * scale, scale, scale);
        }
      }
    }
    error.value = '';
  } catch (err) {
    error.value = err instanceof Error
      ? t('qrcode.error.failed', { message: err.message })
      : t('qrcode.error.too-long');
  }
};

const download = () => {
  const cv = canvas.value;
  if (!cv) return;
  cv.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'qrcode.png';
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, 'image/png');
};

const copyImage = () => {
  const cv = canvas.value;
  if (!cv) return;
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    copy(text.value, t('qrcode.copy-label'));
    return;
  }
  cv.toBlob((blob) => {
    if (!blob) return;
    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      .then(() => flash(t('qrcode.copied')))
      .catch(() => flash(t('qrcode.copy-failed'), 2600));
  }, 'image/png');
};

let timer: number | null = null;
const schedule = () => {
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(render, 180);
};

watch([text, ec, size], schedule);
onMounted(render);
</script>

<style scoped>
.qr-opts {
  margin-top: 14px;
  align-items: flex-start;
}

.qr-sel,
.qr-num {
  flex: 0 0 auto;
}

.qr-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.qr-canvas {
  width: 320px;
  height: 320px;
  max-width: 100%;
  image-rendering: pixelated;
  border: 1px solid var(--card-stroke, rgba(0, 0, 0, 0.12));
  border-radius: 6px;
  background: #fff;
}

.qr-error {
  min-height: 320px;
  display: flex;
  align-items: center;
}

.qr-actions {
  width: 100%;
  margin-top: 16px;
  justify-content: center;
}
</style>
