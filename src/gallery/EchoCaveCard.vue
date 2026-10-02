<template>
  <div
    class="echo-cave-card"
    @mouseenter="paused = true"
    @mouseleave="paused = false">
    <!-- 第一行：回声洞 -->
    <div class="ec-card-title">{{ t('echo-cave.title') }}</div>

    <!-- 下一行：轮播内容 -->
    <div class="ec-card-stage">
      <template v-if="messages.length > 0">
        <Transition name="ec-card-fade" mode="out-in">
          <div class="ec-card-message" :key="index" aria-live="polite">
            <p class="ec-card-text">{{ current.text }}</p>
            <div v-if="hasMeta" class="ec-card-meta">
              <span v-if="current.speaker">{{ t('echo-cave.speaker') }}：{{ current.speaker }}</span>
              <span v-if="current.group">{{ current.group }}</span>
              <span v-if="current.date">{{ current.date }}</span>
            </div>
          </div>
        </Transition>
      </template>
      <div v-else class="ec-card-empty">{{ t('echo-cave.empty') }}</div>
    </div>

    <!-- 投稿入口（GitHub 编辑页开分支提 PR） -->
    <div class="ec-card-footer">
      <WinHyperlinkButton
        :NavigateUri="submitUrl"
        TargetName="_blank"
        Padding="0"
        Margin="0"
        :Content="t('echo-cave.submit')" />
    </div>

    <!-- 底部细进度条，提示每 5 秒切换 -->
    <div class="ec-card-progress" aria-hidden="true">
      <div class="ec-card-progress-bar" :style="{ width: progressPercent + '%' }"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import WinHyperlinkButton from '../components/WinHyperlinkButton.vue';
import { useI18n } from '../components/i18n/index';
import echoRaw from '../../回声洞/messages.json?raw';

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
const submitUrl =
  'https://github.com/c1201y/ClassSoftwareHub/edit/main/' +
  encodeURIComponent('回声洞') +
  '/messages.json';
</script>

<style scoped>
/* 关于页·回声洞卡片：与访问量卡片同款样式（独立卡片，文字跟随主题） */
.echo-cave-card {
  position: relative;
  margin-top: 6px;
  padding: 12px 16px 14px;
  border: 1px solid var(--CardStrokeColorDefaultBrush, var(--card-stroke, rgba(128, 128, 128, 0.4)));
  border-radius: 8px;
  background: var(--CardBackgroundFillColorDefaultBrush, var(--card-bg, rgba(255, 255, 255, 0.04)));
  color: var(--TextFillColorPrimaryBrush, var(--text-primary, #1f1f1f));
  overflow: hidden;
}

/* 第一行：回声洞 */
.ec-card-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
  margin-bottom: 6px;
  color: var(--TextFillColorPrimaryBrush, var(--text-primary, #1f1f1f));
}

/* 下一行：轮播内容 */
.ec-card-stage {
  min-height: 44px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.ec-card-message {
  margin: 0;
}

.ec-card-text {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
  color: var(--TextFillColorPrimaryBrush, var(--text-primary, #1f1f1f));
  white-space: pre-wrap;
  word-break: break-word;
}

.ec-card-meta {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 11px;
  line-height: 16px;
  color: var(--TextFillColorSecondaryBrush, var(--text-secondary, #5f5f5f));
}

.ec-card-empty {
  font-size: 13px;
  color: var(--TextFillColorSecondaryBrush, var(--text-secondary, #5f5f5f));
}

.ec-card-footer {
  margin-top: 8px;
}

.ec-card-footer :deep(.win-hyperlink-button) {
  font-size: 12px;
}

/* 底部细进度条：提示每 5 秒切换 */
.ec-card-progress {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  overflow: hidden;
}

.ec-card-progress-bar {
  height: 100%;
  background: var(--accent, #0078d4);
  transition: width 0.1s linear;
}

/* 切换动画 */
.ec-card-fade-enter-active,
.ec-card-fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.ec-card-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.ec-card-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (prefers-reduced-motion: reduce) {
  .ec-card-fade-enter-active,
  .ec-card-fade-leave-active {
    transition: none;
  }
}
</style>
