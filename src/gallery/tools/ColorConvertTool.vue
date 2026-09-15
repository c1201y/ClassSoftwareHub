<template>
  <ToolShell
    title="颜色转换 / 配色"
    subtitle="HEX、RGB、HSL 三种格式互转，并基于当前颜色一键生成互补色、类似色、三色等和谐配色。点色块即可复制。">
    <div class="tool-grid-2 cc-top">
      <div class="tool-panel">
        <span class="tool-section-title">颜色</span>

        <div class="cc-hex-row">
          <input type="color" class="cc-picker" :value="hex" @input="onPicker" aria-label="取色板" />
          <input class="tool-input cc-hex" :value="hex" spellcheck="false" @change="onHex" />
        </div>

        <div class="cc-group">
          <span class="tool-label">RGB</span>
          <div class="tool-row">
            <input class="tool-input cc-num" type="number" min="0" max="255" :value="rgb[0]" @change="onRgb(0, $event)" />
            <input class="tool-input cc-num" type="number" min="0" max="255" :value="rgb[1]" @change="onRgb(1, $event)" />
            <input class="tool-input cc-num" type="number" min="0" max="255" :value="rgb[2]" @change="onRgb(2, $event)" />
          </div>
        </div>

        <div class="cc-group">
          <span class="tool-label">HSL</span>
          <div class="tool-row">
            <input class="tool-input cc-num" type="number" min="0" max="360" :value="hsl.h" @change="onHsl('h', $event)" />
            <input class="tool-input cc-num" type="number" min="0" max="100" :value="hsl.s" @change="onHsl('s', $event)" />
            <input class="tool-input cc-num" type="number" min="0" max="100" :value="hsl.l" @change="onHsl('l', $event)" />
          </div>
        </div>

        <div class="cc-values tool-hint">
          <span>hex {{ hex }}</span>
          <span>rgb({{ rgb[0] }}, {{ rgb[1] }}, {{ rgb[2] }})</span>
          <span>hsl({{ hsl.h }}, {{ hsl.s }}%, {{ hsl.l }}%)</span>
        </div>
      </div>

      <div class="tool-panel cc-preview-panel">
        <span class="tool-section-title">预览</span>
        <div class="cc-preview" :style="{ background: hex }"></div>
        <div class="cc-preview-meta tool-hint">点击右侧色块可复制对应色值</div>
      </div>
    </div>

    <!-- 配色方案 -->
    <div class="tool-panel cc-harmony">
      <span class="tool-section-title">和谐配色</span>
      <div v-for="group in harmonies" :key="group.name" class="cc-harmony-row">
        <span class="cc-harmony-name">{{ group.name }}</span>
        <div class="cc-harmony-swatches">
          <button
            v-for="item in group.colors"
            :key="item.label + item.hex"
            type="button"
            class="cc-chip"
            :style="{ background: item.hex }"
            :title="`${item.hex}（点击复制）`"
            @click="copy(item.hex)">
            <span class="cc-chip-label">{{ item.hex }}</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="toast" class="tool-toast" role="status">{{ toast }}</div>
  </ToolShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import ToolShell from './ToolShell.vue';
import { useCopy } from './useCopy';
import { rgbToHsl, hslToRgb, rgbToHex } from '../imageColors';

const { toast, copy } = useCopy();

type Rgb = [number, number, number];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const rgb = ref<Rgb>([0, 120, 212]);
const hsl = computed(() => rgbToHsl(rgb.value[0], rgb.value[1], rgb.value[2]));
const hex = computed(() => rgbToHex(rgb.value));

const setRgb = (r: number, g: number, b: number) => {
  rgb.value = [clamp(Math.round(r), 0, 255), clamp(Math.round(g), 0, 255), clamp(Math.round(b), 0, 255)];
};

const onHex = (e: Event) => {
  const raw = (e.target as HTMLInputElement).value.trim().replace(/^#/, '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (/^[0-9a-fA-F]{6}$/.test(full)) {
    setRgb(parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16));
  } else {
    (e.target as HTMLInputElement).value = hex.value;
  }
};

const onPicker = (e: Event) => onHex(e as unknown as Event);

const onRgb = (index: 0 | 1 | 2, e: Event) => {
  const v = Number((e.target as HTMLInputElement).value);
  const next = [...rgb.value] as Rgb;
  next[index] = clamp(Number.isFinite(v) ? v : 0, 0, 255);
  rgb.value = next;
};

const onHsl = (key: 'h' | 's' | 'l', e: Event) => {
  const v = Number((e.target as HTMLInputElement).value);
  const base = { ...hsl.value };
  base[key] = clamp(Number.isFinite(v) ? v : 0, 0, key === 'h' ? 360 : 100);
  const [r, g, b] = hslToRgb(base.h, base.s, base.l);
  setRgb(r, g, b);
};

const shift = (deltaH: number) => {
  const h = (((hsl.value.h + deltaH) % 360) + 360) % 360;
  const [r, g, b] = hslToRgb(h, hsl.value.s, hsl.value.l);
  return { label: `${deltaH > 0 ? '+' : ''}${deltaH}`, hex: rgbToHex([r, g, b]) };
};

const harmonies = computed(() => [
  { name: '类似色', colors: [shift(-30), shift(30)] },
  { name: '互补色', colors: [shift(180)] },
  { name: '分裂互补', colors: [shift(150), shift(210)] },
  { name: '三色', colors: [shift(120), shift(240)] },
  { name: '四色', colors: [shift(90), shift(180), shift(270)] }
]);
</script>

<style scoped>
.cc-top {
  margin-bottom: 16px;
}

.cc-hex-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}

.cc-picker {
  flex: 0 0 auto;
  width: 44px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--ctrl-border, rgba(0, 0, 0, 0.2));
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
}

.cc-hex {
  font-family: Consolas, 'Courier New', monospace;
  text-transform: uppercase;
}

.cc-group {
  margin-top: 12px;
}

.cc-num {
  width: 84px !important;
  flex: 0 0 auto;
}

.cc-values {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 14px;
  font-family: Consolas, 'Courier New', monospace;
}

.cc-preview-panel {
  display: flex;
  flex-direction: column;
}

.cc-preview {
  flex: 1 1 auto;
  min-height: 150px;
  border-radius: 8px;
  border: 1px solid var(--card-stroke, rgba(0, 0, 0, 0.12));
}

.cc-preview-meta {
  margin-top: 10px;
}

/* 配色 */
.cc-harmony-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 0;
  border-top: 1px solid var(--stroke-divider, rgba(0, 0, 0, 0.06));
}

.cc-harmony-row:first-of-type {
  border-top: 0;
}

.cc-harmony-name {
  flex: 0 0 72px;
  font-size: 13px;
  color: var(--text-secondary);
}

.cc-harmony-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cc-chip {
  width: 96px;
  height: 46px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0 0 3px;
}

.cc-chip-label {
  font-size: 10px;
  font-family: Consolas, 'Courier New', monospace;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.82);
  color: #1a1a1a;
}
</style>
