<template>
  <div class="echo-cave-root">
    <header class="ec-header">
      <WinTextBlock class="ec-title" :Text="t('echo-cave.title')" />
      <WinTextBlock class="ec-subtitle" :Text="t('echo-cave.subtitle')" />
    </header>

    <section
      class="ec-stage"
      @mouseenter="paused = true"
      @mouseleave="paused = false">
      <template v-if="messages.length > 0">
        <Transition name="ec-fade" mode="out-in">
          <blockquote class="ec-message" :key="index" aria-live="polite">
            <p class="ec-text">{{ current.text }}</p>
            <footer v-if="hasMeta" class="ec-meta">
              <span v-if="current.speaker">{{ t('echo-cave.speaker') }}：{{ current.speaker }}</span>
              <span v-if="current.group">{{ current.group }}</span>
              <span v-if="current.date">{{ current.date }}</span>
            </footer>
          </blockquote>
        </Transition>
        <div class="ec-progress" aria-hidden="true">
          <div class="ec-progress-bar" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <div class="ec-index">{{ t('echo-cave.index', { current: index + 1, total: messages.length }) }}</div>
      </template>
      <div v-else class="ec-empty">{{ t('echo-cave.empty') }}</div>
    </section>

    <footer class="ec-actions">
      <WinButton class="ec-submit" :Content="t('echo-cave.submit')" @Click="openSubmit" />
      <WinTextBlock class="ec-submit-note" :Text="t('echo-cave.submit-note')" />
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import WinTextBlock from '../../components/WinTextBlock.vue';
import WinButton from '../../components/WinButton.vue';
import { useI18n } from '../../components/i18n/index';
import echoRaw from '../../../回声洞/messages.json?raw';

const { t } = useI18n();

interface EchoMessage {
  text: string;
  speaker?: string;
  group?: string;
  date?: string;
}

const parsed = JSON.parse(echoRaw) as { messages?: EchoMessage[] };
const messages = (parsed.messages ?? []) as EchoMessage[];

const DURATION = 5000; // 每 5 秒切一条
const index = ref(0);
const elapsed = ref(0); // 0..DURATION 毫秒
const paused = ref(false);

const current = computed<EchoMessage>(() => messages[index.value] ?? { text: '' });
const hasMeta = computed(() =>
  !!(current.value.speaker || current.value.group || current.value.date)
);
const progressPercent = computed(() => Math.min(100, (elapsed.value / DURATION) * 100));

const advance = () => {
  if (messages.length === 0) return;
  index.value = (index.value + 1) % messages.length;
  elapsed.value = 0;
};

// rAF 计时：每 DURATION 切下一条；hover 或切到后台标签页时暂停
let rafId = 0;
let lastTs = 0;
const tick = (ts: number) => {
  if (lastTs === 0) lastTs = ts;
  const dt = ts - lastTs;
  lastTs = ts;
  if (!paused.value && !document.hidden) {
    elapsed.value += dt;
    if (elapsed.value >= DURATION) advance();
  }
  rafId = requestAnimationFrame(tick);
};

const onVisibility = () => {
  // 回到前台时重置基准，避免一次性补算暂停期间的时间
  lastTs = 0;
};

onMounted(() => {
  rafId = requestAnimationFrame(tick);
  document.addEventListener('visibilitychange', onVisibility);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(rafId);
  document.removeEventListener('visibilitychange', onVisibility);
});

// 投稿：打开 GitHub 上 messages.json 的编辑页（可开分支提 PR）
const SUBMIT_URL =
  'https://github.com/c1201y/ClassSoftwareHub/edit/main/' +
  encodeURIComponent('回声洞') +
  '/messages.json';
const openSubmit = () => window.open(SUBMIT_URL, '_blank', 'noopener,noreferrer');
</script>

<style scoped>
.echo-cave-root {
  max-width: 820px;
  margin: 0 auto;
  padding: 24px 24px 48px;
  box-sizing: border-box;
}

.ec-header {
  margin-bottom: 20px;
}

.ec-title {
  font-size: 28px;
  font-weight: 600;
  line-height: 36px;
  color: var(--text-primary, #1f1f1f);
}

.ec-subtitle {
  margin-top: 6px;
  font-size: 13px;
  line-height: 20px;
  color: var(--text-secondary, #5f5f5f);
}

.ec-stage {
  position: relative;
  min-height: 220px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border: 1px solid var(--card-stroke, rgba(128, 128, 128, 0.4));
  border-radius: 12px;
  background: var(--card-bg, rgba(255, 255, 255, 0.04));
  padding: 36px 28px 30px;
}

.ec-message {
  margin: 0;
}

.ec-text {
  margin: 0;
  font-size: 22px;
  line-height: 1.6;
  font-weight: 500;
  color: var(--text-primary, #1f1f1f);
  white-space: pre-wrap;
  word-break: break-word;
}

.ec-meta {
  margin-top: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary, #5f5f5f);
}

.ec-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  overflow: hidden;
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
}

.ec-progress-bar {
  height: 100%;
  background: var(--accent, #0078d4);
}

.ec-index {
  margin-top: 14px;
  text-align: right;
  font-size: 12px;
  color: var(--text-secondary, #5f5f5f);
  font-variant-numeric: tabular-nums;
}

.ec-empty {
  text-align: center;
  color: var(--text-secondary, #5f5f5f);
  font-size: 14px;
}

.ec-actions {
  margin-top: 24px;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.ec-submit-note {
  font-size: 12px;
  line-height: 18px;
  color: var(--text-secondary, #5f5f5f);
}

/* 切换动画 */
.ec-fade-enter-active,
.ec-fade-leave-active {
  transition: opacity 0.35s ease, transform 0.35s ease;
}
.ec-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.ec-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (prefers-reduced-motion: reduce) {
  .ec-fade-enter-active,
  .ec-fade-leave-active {
    transition: none;
  }
}
</style>
