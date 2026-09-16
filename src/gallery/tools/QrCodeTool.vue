<template>
  <ToolShell
    title="二维码生成"
    subtitle="把网址、文字、WLAN 配置等生成二维码，可下载 PNG，也能直接复制图片。全部本地生成，不经过任何服务器。">
    <div class="tool-grid-2">
      <div class="tool-panel">
        <span class="tool-section-title">内容</span>
        <WinTextBox
          PlaceholderText="输入网址或任意文字，例如 https://classsoftwarehub.132614.xyz"
          AcceptsReturn
          TextWrapping="Wrap"
          :IsSpellCheckEnabled="false"
          MinHeight="120"
          v-model:Text="text" />
        <div class="tool-row qr-opts">
          <WinComboBox
            class="qr-sel"
            Header="容错级别"
            Width="180"
            :ItemsSource="EC_ITEMS"
            DisplayMemberPath="label"
            v-model:SelectedIndex="ecIndex" />
          <WinNumberBox
            class="qr-num"
            Header="尺寸"
            Width="150"
            :Minimum="128"
            :Maximum="1024"
            :SmallChange="32"
            SpinButtonPlacementMode="Inline"
            v-model:Value="size" />
        </div>
      </div>

      <div class="tool-panel qr-stage">
        <span class="tool-section-title">预览</span>
        <div v-if="error" class="tool-hint qr-error">{{ error }}</div>
        <canvas v-show="!error" ref="canvas" class="qr-canvas"></canvas>
        <div class="tool-row qr-actions">
          <WinButton Style="AccentButtonStyle" Content="下载 PNG" :IsEnabled="!error" @Click="download" />
          <WinButton Content="复制图片" :IsEnabled="!error" @Click="copyImage" />
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

const { toast, copy } = useCopy();

const text = ref('https://classsoftwarehub.132614.xyz');
const ec = ref<'L' | 'M' | 'Q' | 'H'>('M');
const size = ref(320);
const error = ref('');
const canvas = ref<HTMLCanvasElement | null>(null);

const EC_ITEMS: { value: 'L' | 'M' | 'Q' | 'H'; label: string }[] = [
  { value: 'L', label: 'L（7%）' },
  { value: 'M', label: 'M（15%）' },
  { value: 'Q', label: 'Q（25%）' },
  { value: 'H', label: 'H（30%）' }
];
const ecIndex = computed({
  get: () => Math.max(0, EC_ITEMS.findIndex((i) => i.value === ec.value)),
  set: (i: number) => {
    const o = EC_ITEMS[i];
    if (o) ec.value = o.value;
  }
});

const MARGIN = 4; // 静默区（模块数）

const render = () => {
  const value = text.value.trim();
  const cv = canvas.value;
  if (!cv) return;
  if (!value) {
    error.value = '请输入要生成二维码的内容。';
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
    if (!ctx) throw new Error('canvas 不可用');
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
    error.value = err instanceof Error ? `生成失败：${err.message}` : '生成失败，内容可能过长。';
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
    copy(text.value, '内容（当前浏览器不支持复制图片）');
    return;
  }
  cv.toBlob((blob) => {
    if (!blob) return;
    navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      .then(() => toast.value = '已复制二维码图片')
      .catch(() => toast.value = '复制图片失败');
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
