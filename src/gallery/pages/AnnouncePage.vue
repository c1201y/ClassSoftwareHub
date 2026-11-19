<template>

  <ToolShell
    :title="t('tool.announce.name')"
    :subtitle="t('tool.announce.desc')">
    <div class="announce-root">
      <!-- ── 发送表单 ─────────────────────────────────────────── -->
      <section class="an-card">
        <div class="an-fields">
          <WinTextBox
            class="an-code"
            :MaxLength="6"
            :PlaceholderText="t('announce.code-placeholder')"
            :Text="pairCode"
            @update:Text="onCodeInput">
            <template #header>{{ t('announce.code-label') }}<span class="an-required-star" aria-hidden="true">*</span></template>
          </WinTextBox>
          <p class="an-hint">{{ t('announce.code-hint') }}</p>

          <WinTextBox
            :Header="t('announce.content-label')"
            AcceptsReturn
            MinHeight="96"
            :MaxLength="100"
            :PlaceholderText="t('announce.content-placeholder')"
            v-model:Text="text">
            <template #header>{{ t('announce.content-label') }}<span class="an-required-star" aria-hidden="true">*</span></template>
          </WinTextBox>
          <p class="an-char-count" :class="{ 'is-full': text.length >= 100 }">{{ text.length }} / 100</p>

          <WinTextBox
            :Header="t('announce.signer-label')"
            :MaxLength="20"
            :PlaceholderText="t('announce.signer-placeholder')"
            v-model:Text="from" />

          <div class="an-field">
            <span class="an-label">{{ t('announce.duration-label') }}</span>
            <div class="an-duration-row" role="radiogroup" :aria-label="t('announce.duration-label')">
              <button
                v-for="opt in DURATIONS"
                :key="opt"
                type="button"
                class="an-duration-btn"
                :class="{ 'is-active': duration === opt }"
                @click="duration = opt">
                {{ t('announce.seconds', { count: opt }) }}
              </button>
            </div>
          </div>
        </div>

        <div class="an-section-divider" aria-hidden="true" />

        <!-- 发送行：主色按钮 + 忙碌指示 + 结果 InfoBar -->
        <div class="an-send-row">
          <WinButton class="an-send" Style="AccentButtonStyle" :IsEnabled="!sending" @Click="send">
            <WinProgressRing
              v-if="sending"
              class="an-send-ring"
              :Width="16" :Height="16"
              IsActive IsIndeterminate />
            <span>{{ sending ? t('announce.sending') : t('announce.send') }}</span>
            <span class="an-send-glyph" aria-hidden="true">&#xE724;</span>
          </WinButton>
        </div>
        <WinInfoBar
          v-if="result"
          class="an-result-bar"
          :IsOpen="true"
          :IsClosable="false"
          :Severity="resultKind === 'ok' ? 'Success' : 'Error'"
          :Message="result" />
      </section>

      <!-- ── 开启说明 ─────────────────────────────────────────── -->
      <section class="an-howto">
        <WinTextBlock class="an-howto-title" FontSize="15" FontWeight="600" :Text="t('announce.howto-title')" />
        <ol class="an-howto-list">
          <li>{{ t('announce.howto-1') }}</li>
          <li>{{ t('announce.howto-2') }}</li>
          <li>{{ t('announce.howto-3') }}</li>
          <li>{{ t('announce.howto-4') }}</li>
        </ol>
      </section>
    </div>
  </ToolShell>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import WinButton from '../../components/WinButton.vue';
import WinInfoBar from '../../components/WinInfoBar.vue';
import WinProgressRing from '../../components/WinProgressRing.vue';
import WinTextBox from '../../components/WinTextBox.vue';
import WinTextBlock from '../../components/WinTextBlock.vue';
import { useI18n } from '../../components/i18n/index';
import ToolShell from '../tools/ToolShell.vue';
import { SUBMIT_TIMEOUT_MS, orderedEndpoints, rememberEndpoint } from '../submitEndpoints';

const { t } = useI18n();

// ── 常量 ────────────────────────────────────────────────────────
const DURATIONS = [15, 30, 60] as const;

/** 记住上次发送成功的配对码（同 submitEndpoints 的 endpoint 记忆思路） */
const CODE_CACHE_KEY = 'csh-announce-code';

// ── 表单状态 ────────────────────────────────────────────────────
const pairCode = ref(readCachedCode());
const text = ref('');
const from = ref('');
const duration = ref<number>(30);

const sending = ref(false);
const result = ref('');
const resultKind = ref<'ok' | 'error'>('ok');

function readCachedCode(): string {
  try {
    return window.localStorage.getItem(CODE_CACHE_KEY) ?? '';
  } catch {
    return '';
  }
}

function cacheCode(code: string) {
  try {
    window.localStorage.setItem(CODE_CACHE_KEY, code);
  } catch {
    // 隐私模式等场景写不进去，忽略
  }
}

/** 配对码只放行数字（比原 maxlength=6 更进一步：字母直接进不来） */
function onCodeInput(v: string) {
  pairCode.value = v.replace(/\D/g, '').slice(0, 6);
}

// ── 发送 ────────────────────────────────────────────────────────
async function send() {
  if (sending.value) return;

  const code = pairCode.value.trim();
  const content = text.value.trim();
  const signer = from.value.trim();

  if (!/^\d{6}$/.test(code)) {
    showResult(t('announce.error-code'), 'error');
    return;
  }
  if (!content) {
    showResult(t('announce.error-content'), 'error');
    return;
  }

  sending.value = true;
  result.value = '';
  try {
    const reply = await postAnnounce(code, content, signer, duration.value);
    if (reply.ok) {
      cacheCode(code);
      const n = reply.devices ?? 0;
      showResult(
        n > 0
          ? t('announce.sent-devices', { count: n })
          : t('announce.sent-none'),
        'ok'
      );
      text.value = '';           // 成功后清内容，署名与配对码保留（连续喊话常见）
    } else {
      showResult(reply.message, 'error');
    }
  } catch {
    showResult(t('announce.error-network'), 'error');
  } finally {
    sending.value = false;
  }
}

/** 多入口回退发送；全部入口失败时抛错。返回 { ok, message, devices }。 */
async function postAnnounce(
  code: string,
  content: string,
  signer: string,
  seconds: number
): Promise<{ ok: boolean; message: string; devices?: number }> {
  let lastError = '';
  for (const base of orderedEndpoints()) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);
    try {
      const res = await fetch(`${base}/api/announce/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairCode: code, text: content, from: signer, duration: seconds }),
        signal: controller.signal
      });

      // 4xx 是"服务端给了明确说法"（无在线设备 / 太快），换入口也没用，直接把话转给用户
      if (res.status === 403) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (body?.error === 'no_device') {
          return { ok: false, message: t('announce.error-no-device') };
        }
        return { ok: false, message: t('announce.error-bad-code') };
      }
      if (res.status === 429) {
        return { ok: false, message: t('announce.error-rate-limit') };
      }
      if (res.status === 400) {
        return { ok: false, message: t('announce.error-format') };
      }

      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; devices?: number }
        | null;
      if (data?.ok === true) {
        rememberEndpoint(base);
        return { ok: true, message: '', devices: data.devices ?? 0 };
      }
      lastError = t('announce.error-service');
    } catch {
      lastError = t('announce.error-endpoint');
    } finally {
      window.clearTimeout(timer);
    }
  }
  return { ok: false, message: t('announce.error-all', { detail: lastError || '—' }) };
}

function showResult(message: string, kind: 'ok' | 'error') {
  result.value = message;
  resultKind.value = kind;
}
</script>

<style scoped>
.announce-root {
  max-width: 640px;
  padding: 4px 0 48px;
  box-sizing: border-box;
}

/* ── 表单卡 ── */
.an-card {
  border: 1px solid var(--card-stroke, var(--ctrl-border, rgba(0, 0, 0, 0.12)));
  border-radius: 8px;
  background: var(--card-bg, var(--ctrl-fill-default, rgba(255, 255, 255, 0.04)));
  padding: 20px;
  box-sizing: border-box;
}

.an-fields {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.an-field {
  margin: 0;
}

.an-label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-primary, #1f1f1f);
}

/* 配对码：大字号 + 字距，输入框内生效（WinTextBox 的根类是 win-textbox） */
.an-code :deep(.win-textbox-field) {
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 10px;
  font-variant-numeric: tabular-nums;
}

.an-required-star {
  margin-left: 2px;
  color: #c42b1c;
}

.an-hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--text-secondary, #5f5f5f);
}

.an-char-count {
  margin: -8px 0 0;
  font-size: 12px;
  text-align: right;
  color: var(--text-secondary, #5f5f5f);
  font-variant-numeric: tabular-nums;
}

.an-char-count.is-full {
  color: #c42b1c;
}

/* 时长选择：WinUI 分段按钮观感 */
.an-duration-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.an-duration-btn {
  border: 1px solid var(--ctrl-border, var(--card-stroke, rgba(128, 128, 128, 0.4)));
  border-radius: 6px;
  background: var(--ctrl-fill-default, transparent);
  color: var(--text-primary, inherit);
  font: inherit;
  font-size: 13px;
  padding: 8px 18px;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.an-duration-btn:hover {
  background: var(--ctrl-fill-secondary, rgba(128, 128, 128, 0.08));
}

.an-duration-btn.is-active {
  border-color: var(--accent, #0078d4);
  background: color-mix(in srgb, var(--accent, #0078d4) 14%, transparent);
  font-weight: 600;
}

.an-section-divider {
  height: 1px;
  margin: 18px 0;
  background: var(--card-stroke, rgba(128, 128, 128, 0.25));
}

/* ── 发送行 ── */
.an-send-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.an-send {
  min-width: 148px;
}

.an-send-ring {
  margin-right: 8px;
}

.an-send-glyph {
  margin-left: 8px;
  font-family: 'Segoe Icons', 'Segoe MDL2 Assets', sans-serif;
  font-size: 13px;
}

.an-result-bar {
  margin-top: 14px;
}

/* ── 开启说明 ── */
.an-howto {
  margin-top: 20px;
  border: 1px solid var(--card-stroke, var(--ctrl-border, rgba(0, 0, 0, 0.12)));
  border-radius: 8px;
  background: var(--card-bg, var(--ctrl-fill-default, rgba(255, 255, 255, 0.04)));
  padding: 18px 20px;
}

.an-howto-title {
  color: var(--text-primary, #1f1f1f);
}

.an-howto-list {
  margin: 10px 0 0;
  padding-left: 20px;
  font-size: 13px;
  line-height: 22px;
  color: var(--text-secondary, #5f5f5f);
}

@media (max-width: 480px) {
  .an-card,
  .an-howto {
    padding: 16px;
  }

  .an-code :deep(.win-textbox-field) {
    letter-spacing: 6px;
  }
}
</style>
