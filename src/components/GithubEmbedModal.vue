<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { SUBMIT_TIMEOUT_MS, orderedEndpoints, rememberEndpoint } from '../gallery/submitEndpoints';

const props = defineProps<{
  open: boolean;
  githubUrl: string;
  appName?: string;
}>();

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void;
}>();

const frameSrc = ref('');
const loading = ref(false);
const error = ref('');
const timerText = ref('');
const expiresAt = ref(0);
const closeBtn = ref<HTMLButtonElement | null>(null);
let tickTimer: number | undefined;
let keyHandler: ((event: KeyboardEvent) => void) | undefined;

const repoLabel = computed(() => {
  const parsed = parseGithubUrl(props.githubUrl);
  return parsed ? parsed.repo : props.githubUrl;
});

function parseGithubUrl(raw: string): { repo: string } | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return null;
    if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    return { repo: `${parts[0]}/${parts[1]}` };
  } catch {
    return null;
  }
}

function stopTick() {
  if (tickTimer !== undefined) {
    window.clearTimeout(tickTimer);
    tickTimer = undefined;
  }
}

function startTick() {
  stopTick();
  const update = () => {
    const left = Math.max(0, expiresAt.value - Date.now());
    if (left <= 0) {
      timerText.value = '签名已过期';
      stopTick();
      return;
    }
    const minutes = Math.floor(left / 60000);
    const seconds = Math.floor((left % 60000) / 1000);
    timerText.value = `剩余 ${minutes}:${String(seconds).padStart(2, '0')}`;
    tickTimer = window.setTimeout(update, 1000);
  };
  update();
}

async function requestToken(): Promise<{ url: string; grantExpiresAt?: number } | null> {
  for (const base of orderedEndpoints()) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);
    try {
      const response = await fetch(
        `${base}/api/embed-sign?url=${encodeURIComponent(props.githubUrl)}`,
        { cache: 'no-store', signal: controller.signal }
      );
      if (!response.ok) continue;
      const data = (await response.json()) as { url?: unknown; grantExpiresAt?: unknown };
      if (typeof data.url === 'string' && data.url) {
        rememberEndpoint(base);
        return {
          url: data.url,
          grantExpiresAt: typeof data.grantExpiresAt === 'number' ? data.grantExpiresAt : undefined
        };
      }
    } catch {
      // 当前入口不可用，继续试下一个
    } finally {
      window.clearTimeout(timer);
    }
  }
  return null;
}

async function launch() {
  loading.value = true;
  error.value = '';
  frameSrc.value = '';
  stopTick();
  timerText.value = '正在申请签名…';
  const token = await requestToken();
  if (!props.open) return;
  loading.value = false;
  if (!token) {
    timerText.value = '';
    error.value = '暂时无法获取内嵌签名，请稍后重试或使用新标签页打开。';
    return;
  }
  expiresAt.value = token.grantExpiresAt ?? Date.now() + 15 * 60 * 1000;
  frameSrc.value = token.url;
  startTick();
}

function close() {
  emit('update:open', false);
}

function openExternal() {
  const win = window.open('about:blank', '_blank');
  if (!win) {
    error.value = '浏览器拦截了新标签页，请允许弹窗后重试。';
    return;
  }
  try { win.opener = null; } catch {}
  void requestToken().then((token) => {
    if (!token) {
      try { win.close(); } catch {}
      error.value = '暂时无法获取内嵌签名，请稍后重试。';
      return;
    }
    win.location.href = token.url;
  });
}

function cleanup() {
  stopTick();
  frameSrc.value = '';
  loading.value = false;
  error.value = '';
  timerText.value = '';
  document.documentElement.classList.remove('csh-gh-embed-lock');
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = undefined;
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      document.documentElement.classList.add('csh-gh-embed-lock');
      keyHandler = (event: KeyboardEvent) => {
        if (event.key === 'Escape') close();
      };
      document.addEventListener('keydown', keyHandler);
      await launch();
      await nextTick();
      closeBtn.value?.focus();
    } else {
      cleanup();
    }
  },
  { immediate: true }
);

onBeforeUnmount(cleanup);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="csh-gh-embed-mask" @click.self="close">
      <section class="csh-gh-embed-card" role="dialog" aria-modal="true" aria-label="GitHub 页面">
        <header class="csh-gh-embed-head">
          <div class="csh-gh-embed-title">
            <span class="csh-gh-embed-mark" aria-hidden="true">
              <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38l-.01-1.49c-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48l-.01 2.19c0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
              </svg>
            </span>
            <div class="csh-gh-embed-labels">
              <strong>{{ appName ? `GitHub · ${appName}` : 'GitHub 页面' }}</strong>
              <span>{{ repoLabel }}</span>
            </div>
          </div>
          <div class="csh-gh-embed-actions">
            <span class="csh-gh-embed-timer">{{ timerText }}</span>
            <button type="button" class="csh-gh-embed-btn" :disabled="loading" @click="launch">重新签名</button>
            <button type="button" class="csh-gh-embed-btn" :disabled="loading" @click="openExternal">新标签页</button>
            <button ref="closeBtn" type="button" class="csh-gh-embed-close" aria-label="关闭" @click="close">×</button>
          </div>
        </header>
        <div class="csh-gh-embed-body">
          <iframe
            v-if="frameSrc"
            class="csh-gh-embed-frame"
            :src="frameSrc"
            title="GitHub 页面"
            sandbox="allow-scripts allow-same-origin"
            referrerpolicy="no-referrer"
            loading="eager"
          />
          <div v-else class="csh-gh-embed-state">
            <span v-if="loading" class="csh-gh-embed-spinner" aria-hidden="true" />
            <p>{{ error || '正在向本站申请内嵌签名…' }}</p>
            <button v-if="error" type="button" class="csh-gh-embed-btn" @click="launch">重试</button>
          </div>
        </div>
        <footer class="csh-gh-embed-foot">
          通过 8083 加速加载 · 一次性签名，15 分钟有效 · 页面内不能跳转站外或提交表单
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
:global(html.csh-gh-embed-lock) {
  overflow: hidden;
}

.csh-gh-embed-mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.38);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.csh-gh-embed-card {
  width: min(1400px, 96vw);
  height: min(90vh, 1000px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--card-stroke, rgba(128, 128, 128, 0.28));
  border-radius: 12px;
  background: var(--card-bg, #fff);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
}

.csh-gh-embed-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--card-stroke, rgba(128, 128, 128, 0.24));
}

.csh-gh-embed-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.csh-gh-embed-mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent-base, #0067c0) 10%, var(--card-bg, #fff));
  color: var(--accent-base, #0067c0);
}

.csh-gh-embed-labels {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.35;
}

.csh-gh-embed-labels strong {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.csh-gh-embed-labels span {
  font-size: 11.5px;
  color: var(--text-secondary, #666);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.csh-gh-embed-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.csh-gh-embed-timer {
  font-size: 12px;
  color: var(--text-secondary, #666);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.csh-gh-embed-btn {
  height: 30px;
  padding: 0 11px;
  border: 1px solid var(--card-stroke, rgba(128, 128, 128, 0.3));
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary, #222);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.csh-gh-embed-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--text-primary, #000) 6%, transparent);
}

.csh-gh-embed-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.csh-gh-embed-close {
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary, #666);
  font: 20px/1 system-ui, sans-serif;
  cursor: pointer;
}

.csh-gh-embed-close:hover {
  background: color-mix(in srgb, var(--text-primary, #000) 8%, transparent);
  color: var(--text-primary, #222);
}

.csh-gh-embed-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
}

.csh-gh-embed-frame {
  flex: 1;
  width: 100%;
  min-height: 0;
  border: 0;
  display: block;
  background: #fff;
}

.csh-gh-embed-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  color: var(--text-secondary, #666);
  font-size: 13px;
  text-align: center;
}

.csh-gh-embed-state p {
  margin: 0;
  max-width: 520px;
  line-height: 1.6;
}

.csh-gh-embed-spinner {
  width: 26px;
  height: 26px;
  border: 2px solid color-mix(in srgb, var(--accent-base, #0067c0) 24%, transparent);
  border-top-color: var(--accent-base, #0067c0);
  border-radius: 50%;
  animation: csh-gh-embed-spin 0.8s linear infinite;
}

@keyframes csh-gh-embed-spin {
  to { transform: rotate(360deg); }
}

.csh-gh-embed-foot {
  flex: none;
  padding: 7px 14px;
  border-top: 1px solid var(--card-stroke, rgba(128, 128, 128, 0.24));
  color: var(--text-secondary, #777);
  font-size: 11.5px;
}

@media (max-width: 720px) {
  .csh-gh-embed-mask { padding: 0; }
  .csh-gh-embed-card {
    width: 100vw;
    height: 100vh;
    border: 0;
    border-radius: 0;
  }
  .csh-gh-embed-head { padding: 8px 10px; gap: 8px; }
  .csh-gh-embed-timer { display: none; }
  .csh-gh-embed-btn { padding: 0 8px; }
  .csh-gh-embed-foot { display: none; }
}
</style>
