<template>
  <div class="echo-cave-root">
    <header class="ec-header">
      <WinTextBlock class="ec-title" :Text="t('echo-cave.title')" />
      <WinTextBlock class="ec-subtitle" :Text="t('echo-cave.subtitle')" />
    </header>

    <!--
      舞台：点一下换一条，打字机逐字打出来（照 ClassIsland 的回声洞）。
      原来那条 5 秒自动轮播的进度条去掉了 —— 改成手动点，也就没有「第 x / y 条」这回事
      （洗牌之后顺序是随机的）。
    -->
    <button
      type="button"
      class="ec-stage"
      :aria-busy="typing"
      @click="next">
      <template v-if="messages.length > 0">
        <blockquote class="ec-message">
          <p class="ec-text">{{ displayText }}</p>
        </blockquote>
        <div class="ec-stage-foot">
          <span class="ec-count">{{ t('echo-cave.count', { total: messages.length }) }}</span>
        </div>
      </template>
      <span v-else class="ec-empty">{{ t('echo-cave.empty') }}</span>
    </button>

    <footer class="ec-actions">
      <WinButton class="ec-submit" :Content="t('echo-cave.submit')" @Click="openSubmit" />
      <WinTextBlock class="ec-submit-note" :Text="t('echo-cave.submit-note')" />
    </footer>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import WinTextBlock from '../../components/WinTextBlock.vue';
import WinButton from '../../components/WinButton.vue';
import { useI18n } from '../../components/i18n/index';

const { t } = useI18n();

// 一条一个文件：回声洞/messages/message1.json、message2.json……
// 用 glob 在构建期收整个目录，所以「加一条字条」= 加一个文件，不用改代码。
const files = import.meta.glob<{ default: { text?: string } }>('../../../回声洞/messages/*.json', {
  eager: true,
});

/** message7.json → 7，按文件名里的编号排序 */
const numberOf = (filePath: string) => {
  const matched = /message(\d+)\.json$/i.exec(filePath);
  return matched ? Number(matched[1]) : Number.MAX_SAFE_INTEGER;
};

const messages = Object.keys(files)
  .sort((a, b) => numberOf(a) - numberOf(b))
  .map((path) => String(files[path]?.default?.text ?? '').trim())
  .filter((text) => text.length > 0);

// 打字节奏照 ClassIsland 的 TypingControl：清空 → 停 150ms → 每字 40ms；
// 光标 "_" 不是逐字闪，是每 10 个字翻一次。
const CLEAR_DELAY = 150;
const CHAR_DELAY = 40;
const BLINK_EVERY = 10;

const queue = ref<string[]>([]);
const displayText = ref('');
const typing = ref(false);

let generation = 0;

/** Fisher-Yates 洗牌 */
const shuffle = (list: string[]) => {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** 取下一条；这一轮抽完才重洗 —— 一轮之内不重复 */
const takeNext = (): string | null => {
  if (messages.length === 0) return null;
  if (queue.value.length === 0) queue.value = shuffle(messages);
  return queue.value.shift() ?? null;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 逐字打出来；被打断（离开页面）时不写最终文本 */
const typeOut = async (text: string) => {
  const my = ++generation;
  typing.value = true;
  try {
    displayText.value = '';
    await sleep(CLEAR_DELAY);
    if (my !== generation) return;

    for (let i = 0; i < text.length; i++) {
      displayText.value = text.slice(0, i) + (Math.floor(i / BLINK_EVERY) % 2 === 0 ? '_' : '');
      await sleep(CHAR_DELAY);
      if (my !== generation) return;
    }
    displayText.value = text; // 收尾补全，把可能留着的光标去掉
  } finally {
    if (my === generation) typing.value = false;
  }
};

const next = async () => {
  if (typing.value) return; // 打字期间再点无效
  const text = takeNext();
  if (!text) return;
  await typeOut(text);
};

// 进页面先静静显示一条，不打字（同 ClassIsland 的 _isFirstUpdate）
const first = takeNext();
if (first) displayText.value = first;

onBeforeUnmount(() => {
  generation++; // 让正在跑的那一遍打字作废
  typing.value = false;
});

// 投稿：打开 GitHub 上字条目录的「新建文件」页
const SUBMIT_URL =
  'https://github.com/c1201y/ClassSoftwareHub/new/main/' + encodeURIComponent('回声洞/messages');
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

/* 舞台：整块可点（原生 button 去外观） */
.ec-stage {
  display: block;
  width: 100%;
  min-height: 220px;
  padding: 36px 28px 30px;
  border: 1px solid var(--card-stroke, rgba(128, 128, 128, 0.4));
  border-radius: 12px;
  background: var(--card-bg, rgba(255, 255, 255, 0.04));
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.ec-stage:hover {
  border-color: var(--card-stroke-hover, rgba(128, 128, 128, 0.6));
  background: rgba(128, 128, 128, 0.06);
}

.ec-stage:active {
  background: rgba(128, 128, 128, 0.1);
}

.ec-stage:focus-visible {
  outline: 2px solid var(--accent, #0078d4);
  outline-offset: 2px;
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

.ec-stage-foot {
  margin-top: 16px;
  text-align: right;
}

.ec-count {
  font-size: 12px;
  color: var(--text-secondary, #5f5f5f);
  font-variant-numeric: tabular-nums;
}

.ec-empty {
  display: block;
  text-align: center;
  color: var(--text-secondary, #5f5f5f);
  font-size: 14px;
  padding: 40px 0;
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
</style>
