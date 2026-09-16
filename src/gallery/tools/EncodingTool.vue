<template>
  <ToolShell
    title="编码 / 哈希工具"
    subtitle="Base64、URL 编解码，以及 MD5 / SHA-1 / SHA-256 / SHA-512 哈希。全部在本地计算。">
    <div class="tool-grid-2">
      <div class="tool-panel">
        <span class="tool-section-title">输入</span>
        <WinTextBox
          class="enc-box"
          v-model:Text="input"
          :AcceptsReturn="true"
          TextWrapping="Wrap"
          :IsSpellCheckEnabled="false"
          PlaceholderText="在这里输入文字（支持中文）"
          FontFamily="Consolas, 'Courier New', monospace"
          :FontSize="13" />

        <div class="tool-row enc-actions">
          <WinButton FontSize="13" Padding="10,0,10,0" Content="Base64 编码" @Click="b64enc" />
          <WinButton FontSize="13" Padding="10,0,10,0" Content="Base64 解码" @Click="b64dec" />
          <WinButton FontSize="13" Padding="10,0,10,0" Content="URL 编码" @Click="urlenc" />
          <WinButton FontSize="13" Padding="10,0,10,0" Content="URL 解码" @Click="urldec" />
        </div>
      </div>

      <div class="tool-panel">
        <span class="tool-section-title">输出</span>
        <WinTextBox
          class="enc-box"
          v-model:Text="output"
          :AcceptsReturn="true"
          TextWrapping="Wrap"
          :IsSpellCheckEnabled="false"
          PlaceholderText="转换结果"
          FontFamily="Consolas, 'Courier New', monospace"
          :FontSize="13" />
        <div class="tool-row enc-actions">
          <WinButton FontSize="13" Padding="10,0,10,0" Content="复制结果" :IsEnabled="!!output" @Click="copy(output, '结果')" />
          <WinButton FontSize="13" Padding="10,0,10,0" Content="用结果替换输入" :IsEnabled="!!output" @Click="useOutputAsInput" />
        </div>
      </div>
    </div>

    <div class="tool-panel enc-hash">
      <span class="tool-section-title">哈希（对左侧输入实时计算）</span>
      <div v-for="row in hashes" :key="row.name" class="enc-hash-row">
        <div class="enc-hash-head">
          <span class="enc-hash-name">{{ row.name }}</span>
          <WinButton FontSize="13" Padding="10,0,10,0" Content="复制" :IsEnabled="!!row.value" @Click="copy(row.value, row.name)" />
        </div>
        <div class="enc-hash-value mono">{{ row.value || '—' }}</div>
      </div>
      <div v-if="hashUnsupported" class="tool-hint">当前环境不支持 SHA 哈希（需要 https 或 localhost）。</div>
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

const { toast, copy } = useCopy();

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

const b64enc = () => { try { output.value = toBase64(input.value); } catch { toast.value = '编码失败'; } };
const b64dec = () => { try { output.value = fromBase64(input.value); } catch { toast.value = '解码失败，请检查 Base64 内容'; } };
const urlenc = () => { output.value = encodeURIComponent(input.value); };
const urldec = () => { try { output.value = decodeURIComponent(input.value); } catch { toast.value = '解码失败，请检查内容'; } };

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

/* SHA-512 有 128 个字符 → 单独一行、等宽、点一下整段选中 */
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
