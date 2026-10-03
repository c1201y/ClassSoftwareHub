<template>
  <div class="echo-cave-card">
    <!-- 第一行：回声洞 -->
    <div class="ec-card-title">{{ t('echo-cave.title') }}</div>

    <!--
      舞台：点一下换一条，打字机逐字打出来（照 ClassIsland 的回声洞）。
      内容整块可点；没有额外的操作提示行 —— 悬停底色变化 + 手型光标就够了。
    -->
    <button
      type="button"
      class="ec-card-stage"
      :aria-busy="typing"
      @click="next">
      <p v-if="messages.length > 0" class="ec-card-text">{{ displayText }}</p>
      <span v-else class="ec-card-empty">{{ t('echo-cave.empty') }}</span>
    </button>

    <!-- 投稿入口（GitHub 上新建字条文件） -->
    <div class="ec-card-footer">
      <WinHyperlinkButton
        :NavigateUri="submitUrl"
        TargetName="_blank"
        Padding="0"
        Margin="0"
        :Content="t('echo-cave.submit')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import WinHyperlinkButton from '../components/WinHyperlinkButton.vue';
import { useI18n } from '../components/i18n/index';

const { t } = useI18n();

// 一条一个文件：回声洞/messages/message1.json、message2.json……
// 用 glob 在构建期收整个目录，所以「加一条字条」= 加一个文件，不用改代码。
const files = import.meta.glob<{ default: { text?: string } }>('../../回声洞/messages/*.json', {
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

const queue = ref<string[]>([]); // 本轮洗好的队列：抽一条少一条
const displayText = ref('');
const typing = ref(false);

// 打字“代数”：每次开打 +1，上一遍发现代数变了就自己停
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
  if (typing.value) return; // 打字期间再点无效（同 ClassIsland 用 IsBusy 挡重复点击）
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
const submitUrl =
  'https://github.com/c1201y/ClassSoftwareHub/new/main/' + encodeURIComponent('回声洞/messages');
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

/* 舞台：整块可点（原生 button 去外观，只留系统式的悬停/焦点反馈） */
.ec-card-stage {
  display: block;
  width: 100%;
  min-height: 44px;
  margin: 0;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s ease;
}

.ec-card-stage:hover {
  background: rgba(128, 128, 128, 0.1);
}

.ec-card-stage:active {
  background: rgba(128, 128, 128, 0.16);
}

.ec-card-stage:focus-visible {
  outline: 2px solid var(--accent, #0078d4);
  outline-offset: 1px;
}

.ec-card-text {
  margin: 0;
  min-height: 22px;
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
  color: var(--TextFillColorPrimaryBrush, var(--text-primary, #1f1f1f));
  white-space: pre-wrap;
  word-break: break-word;
}

.ec-card-empty {
  display: block;
  min-height: 22px;
  font-size: 13px;
  line-height: 22px;
  color: var(--TextFillColorSecondaryBrush, var(--text-secondary, #5f5f5f));
}

.ec-card-footer {
  margin-top: 8px;
}

.ec-card-footer :deep(.win-hyperlink-button) {
  font-size: 12px;
}
</style>
