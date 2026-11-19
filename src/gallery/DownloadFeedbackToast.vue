<!-- 下载体验悬浮窗：自建加速下载开始 5 秒后出现在右下角，可随时关闭。 -->
<template>
  <Teleport to="body">
    <Transition name="dlfb">
      <aside
        v-if="open"
        class="dlfb"
        role="complementary"
        :aria-label="t('dlfb.title')"
        @keydown.esc="dismiss">
        <header class="dlfb-head">
          <span class="dlfb-title">{{ t('dlfb.title') }}</span>
          <button type="button" class="dlfb-close" :aria-label="t('dlfb.close')" @click="dismiss">✕</button>
        </header>

        <template v-if="step === 'ask'">
          <p class="dlfb-question">{{ t('dlfb.question') }}</p>
          <div class="dlfb-choices">
            <button type="button" class="dlfb-choice" @click="pick('good')">{{ t('dlfb.good') }}</button>
            <button type="button" class="dlfb-choice" @click="pick('bad')">{{ t('dlfb.bad') }}</button>
          </div>
        </template>

        <template v-else-if="step === 'form'">
          <p class="dlfb-question">
            {{ rating === 'good' ? t('dlfb.good-prompt') : t('dlfb.bad-prompt') }}
          </p>
          <textarea
            v-model="detail"
            class="dlfb-textarea"
            rows="3"
            maxlength="800"
            :placeholder="rating === 'good' ? t('dlfb.good-placeholder') : t('dlfb.bad-placeholder')" />
          <input
            v-model="contact"
            class="dlfb-input"
            type="text"
            maxlength="120"
            :placeholder="t('dlfb.contact-placeholder')" />
          <p class="dlfb-note">{{ t('dlfb.contact-note') }}</p>
          <p v-if="error" class="dlfb-error" role="alert">{{ t('dlfb.failed') }}</p>
          <div class="dlfb-actions">
            <button type="button" class="dlfb-btn" @click="dismiss">{{ t('dlfb.cancel') }}</button>
            <button
              type="button"
              class="dlfb-btn primary"
              :disabled="!canSubmit || busy"
              @click="submit">
              {{ t('dlfb.submit') }}
            </button>
          </div>
        </template>

        <p v-else class="dlfb-thanks">{{ t('dlfb.thanks') }}</p>
      </aside>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from '../components/i18n/index';
import {
  DOWNLOAD_FEEDBACK_EVENT,
  submitDownloadFeedback,
  validateDraft,
  type DownloadFeedbackContext,
  type DownloadFeedbackRating
} from './downloadFeedback';

const { t } = useI18n();

type Step = 'ask' | 'form' | 'thanks';

const open = ref(false);
const step = ref<Step>('ask');
const rating = ref<DownloadFeedbackRating>('good');
const detail = ref('');
const contact = ref('');
const busy = ref(false);
const error = ref(false);
const context = ref<DownloadFeedbackContext>({});

const canSubmit = computed(
  () => validateDraft({ rating: rating.value, detail: detail.value, contact: contact.value }) === null
);

let hideTimer = 0;

const reset = () => {
  step.value = 'ask';
  rating.value = 'good';
  detail.value = '';
  contact.value = '';
  busy.value = false;
  error.value = false;
};

const dismiss = () => {
  window.clearTimeout(hideTimer);
  open.value = false;
  reset();
};

const pick = (value: DownloadFeedbackRating) => {
  rating.value = value;
  step.value = 'form';
};

const submit = async () => {
  if (!canSubmit.value || busy.value) return;
  busy.value = true;
  error.value = false;
  const ok = await submitDownloadFeedback(
    { rating: rating.value, detail: detail.value, contact: contact.value },
    context.value
  );
  busy.value = false;
  if (!ok) {
    error.value = true;
    return;
  }
  step.value = 'thanks';
  hideTimer = window.setTimeout(() => {
    open.value = false;
    reset();
  }, 2600);
};

const onRequest = (event: Event) => {
  const payload = (event as CustomEvent<DownloadFeedbackContext>).detail;
  context.value = payload || {};
  reset();
  open.value = true;
};

onMounted(() => window.addEventListener(DOWNLOAD_FEEDBACK_EVENT, onRequest));
onBeforeUnmount(() => {
  window.removeEventListener(DOWNLOAD_FEEDBACK_EVENT, onRequest);
  window.clearTimeout(hideTimer);
});
</script>

<style scoped>
.dlfb {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 1200;
  width: 300px;
  max-width: calc(100vw - 24px);
  padding: 12px 14px 14px;
  border: 1px solid var(--flyout-border);
  border-radius: 8px;
  background: var(--dialog-content-bg);
  color: var(--text-primary);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16);
  font-size: 13px;
  line-height: 1.45;
  backdrop-filter: blur(18px) saturate(1.4);
}
.dlfb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.dlfb-title {
  font-weight: 600;
  font-size: 13px;
}
.dlfb-close {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1;
  padding: 4px 6px;
  border-radius: 4px;
  cursor: pointer;
}
.dlfb-close:hover {
  background: var(--subtle-secondary);
}
.dlfb-question {
  margin: 0 0 10px;
  color: var(--text-secondary);
}
.dlfb-choices {
  display: flex;
  gap: 8px;
}
.dlfb-choice {
  flex: 1;
  padding: 8px 0;
  border: 1px solid var(--SurfaceStrokeColorDefaultBrush);
  border-radius: 5px;
  background: var(--subtle-secondary);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
}
.dlfb-choice:hover {
  border-color: var(--accent);
  background: rgba(0, 103, 192, 0.08);
}
.dlfb-textarea,
.dlfb-input {
  box-sizing: border-box;
  width: 100%;
  margin-bottom: 8px;
  padding: 6px 8px;
  border: 1px solid var(--SurfaceStrokeColorDefaultBrush);
  border-bottom-color: rgba(0, 0, 0, 0.36);
  border-radius: 4px;
  background: var(--dialog-content-bg);
  color: var(--text-primary);
  font: inherit;
  resize: vertical;
}
.dlfb-textarea:focus,
.dlfb-input:focus {
  outline: none;
  border-bottom-color: var(--accent);
  box-shadow: inset 0 -2px 0 var(--accent);
}
.dlfb-note {
  margin: 0 0 8px;
  color: var(--text-secondary);
  font-size: 11.5px;
}
.dlfb-error {
  margin: 0 0 8px;
  color: #c42b1c;
  font-size: 12px;
}
.dlfb-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.dlfb-btn {
  padding: 5px 14px;
  border: 1px solid var(--SurfaceStrokeColorDefaultBrush);
  border-radius: 4px;
  background: var(--subtle-secondary);
  color: var(--text-primary);
  font-size: 12.5px;
  cursor: pointer;
}
.dlfb-btn.primary {
  border-color: transparent;
  background: var(--accent);
  color: #fff;
}
.dlfb-btn.primary:disabled {
  background: var(--accent-fill-disabled);
  cursor: default;
}
.dlfb-thanks {
  margin: 4px 0 2px;
  color: var(--text-secondary);
}
.dlfb-enter-active,
.dlfb-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.dlfb-enter-from,
.dlfb-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
