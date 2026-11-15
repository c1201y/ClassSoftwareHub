<template>
  <ToolShell
    :title="t('tool.encoding.name')"
    :subtitle="t('tool.encoding.subtitle')">
    <div class="tool-grid-2">
      <div class="tool-panel">
        <span class="tool-section-title">{{ t('common.input') }}</span>
        <WinTextBox
          class="enc-box"
          v-model:Text="input"
          :AcceptsReturn="true"
          TextWrapping="Wrap"
          :IsSpellCheckEnabled="false"
          :PlaceholderText="t('encoding.input-placeholder')"
          FontFamily="Consolas, 'Courier New', monospace"
          :FontSize="13" />

        <div class="tool-row enc-actions">
          <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('encoding.b64-encode')" @Click="b64enc" />
          <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('encoding.b64-decode')" @Click="b64dec" />
          <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('encoding.url-encode')" @Click="urlenc" />
          <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('encoding.url-decode')" @Click="urldec" />
        </div>
      </div>

      <div class="tool-panel">
        <span class="tool-section-title">{{ t('common.output') }}</span>
        <WinTextBox
          class="enc-box"
          v-model:Text="output"
          :AcceptsReturn="true"
          TextWrapping="Wrap"
          :IsSpellCheckEnabled="false"
          :PlaceholderText="t('encoding.output-placeholder')"
          FontFamily="Consolas, 'Courier New', monospace"
          :FontSize="13" />
        <div class="tool-row enc-actions">
          <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('common.copy-result')" :IsEnabled="!!output" @Click="copy(output, t('common.result'))" />
          <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('common.replace-input')" :IsEnabled="!!output" @Click="useOutputAsInput" />
        </div>
      </div>
    </div>

    <div class="tool-panel enc-hash">
      <span class="tool-section-title">{{ t('encoding.hash-title') }}</span>
      <div v-for="row in hashes" :key="row.name" class="enc-hash-row">
        <div class="enc-hash-head">
          <span class="enc-hash-name">{{ row.name }}</span>
          <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('common.copy')" :IsEnabled="!!row.value" @Click="copy(row.value, row.name)" />
        </div>
        <div class="enc-hash-value mono">{{ row.value || '—' }}</div>
      </div>
      <div v-if="hashUnsupported" class="tool-hint">{{ t('encoding.hash-unsupported') }}</div>
    </div>

    <div v-if="toast" class="tool-toast" role="status">{{ toast }}</div>
  </ToolShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import ToolShell from './ToolShell.vue';
import { useCopy } from './useCopy';
import { md5 } from './md5';
import WinTextBox from '../../components/WinTextBox.vue';
import WinButton from '../../components/WinButton.vue';
import { useI18n } from '../../components/i18n/index';

const { t } = useI18n();
const { toast, copy, flash } = useCopy();

const input = ref('');
const output = ref('');

const enc = new TextEncoder();
const dec = new TextDecoder();
const hashUnsupported = ref(false);
const sha = ref<Record<string, string>>({});

const toBase64 = (text: string) => {
  const bytes = enc.encode(text);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
};

const fromBase64 = (text: string) => {
  const bin = atob(text.trim());
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return dec.decode(bytes);
};

const b64enc = () => { try { output.value = toBase64(input.value); } catch { flash(t('encoding.error.encode'), 2600); } };
const b64dec = () => { try { output.value = fromBase64(input.value); } catch { flash(t('encoding.error.decode-b64'), 2600); } };
const urlenc = () => { output.value = encodeURIComponent(input.value); };
const urldec = () => { try { output.value = decodeURIComponent(input.value); } catch { flash(t('encoding.error.decode'), 2600); } };

const useOutputAsInput = () => { input.value = output.value; };

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

const computeHashes = async (text: string) => {
  const bytes = enc.encode(text);
  sha.value = { MD5: text ? md5(bytes) : '' };
  if (!globalThis.crypto?.subtle) {
    hashUnsupported.value = true;
    return;
  }
  hashUnsupported.value = false;
  const algos: [string, AlgorithmIdentifier][] = [
    ['SHA-1', 'SHA-1'],
    ['SHA-256', 'SHA-256'],
    ['SHA-512', 'SHA-512']
  ];
  const results = await Promise.all(
    algos.map(async ([name, algo]) => {
      if (!text) return [name, ''] as const;
      const buf = await crypto.subtle.digest(algo, bytes);
      return [name, hex(buf)] as const;
    })
  );
  sha.value = { MD5: text ? md5(bytes) : '', ...Object.fromEntries(results) };
};

const order = ['MD5', 'SHA-1', 'SHA-256', 'SHA-512'];
const hashes = computed(() => order.map((name) => ({ name, value: sha.value[name] ?? '' })));

let timer: number | null = null;
watch(input, (v) => {
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => { void computeHashes(v); }, 200);
});

onMounted(() => { void computeHashes(''); });
</script>

<style scoped>
.enc-box :deep(.win-textbox-textarea) {
  min-height: 120px;
}

.enc-actions {
  margin-top: 12px;
}

.enc-hash {
  margin-top: 16px;
}

.enc-hash-row {
  padding: 10px 0;
  border-top: 1px solid var(--stroke-divider, rgba(0, 0, 0, 0.06));
}

.enc-hash-row:first-of-type {
  border-top: 0;
}

.enc-hash-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}

.enc-hash-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

/* SHA-512 哈希值长达 128 个字符，单独成行、等宽显示，user-select:all 便于整段选中 */
.enc-hash-value {
  padding: 6px 10px;
  border-radius: 4px;
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.045));
  font-size: 12.5px;
  line-height: 19px;
  word-break: break-all;
  user-select: all;
}

.mono {
  font-family: Consolas, 'Courier New', monospace;
}
</style>
