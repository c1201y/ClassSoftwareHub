<template>
  <ToolShell
    :title="t('tool.dictation.name')"
    :subtitle="t('tool.dictation.subtitle')">
    <div class="tool-grid-2">
      <div class="tool-panel">
        <span class="tool-section-title">{{ t('dictation.list') }}</span>
        <textarea
          v-model="listText"
          class="tool-textarea dt-list"
          :placeholder="t('dictation.list-placeholder')"
          :disabled="running"
          spellcheck="false" />
        <div class="tool-row dt-meta">
          <span class="tool-hint">{{ t('dictation.count', { n: words.length }) }}</span>
          <button type="button" class="tool-btn small" :disabled="running" @click="fillSample">{{ t('random-group.sample') }}</button>
        </div>

        <div class="dt-options">
          <label class="dt-field">
            <span class="tool-label">{{ t('dictation.interval') }}</span>
            <input v-model.number="intervalSec" class="tool-input" type="number" min="1" max="60" step="1" />
          </label>
          <label class="dt-field">
            <span class="tool-label">{{ t('dictation.repeat') }}</span>
            <input v-model.number="repeatCount" class="tool-input" type="number" min="1" max="5" step="1" />
          </label>
          <label class="dt-field">
            <span class="tool-label">{{ t('dictation.rate') }}</span>
            <input v-model.number="rate" class="tool-input" type="number" min="0.5" max="1.5" step="0.05" />
          </label>
          <label class="dt-field">
            <span class="tool-label">{{ t('dictation.voice') }}</span>
            <select v-model="voiceUri" class="tool-select">
              <option value="">{{ t('dictation.voice-default') }}</option>
              <option v-for="voice in voices" :key="voice.voiceURI" :value="voice.voiceURI">{{ voice.name }}</option>
            </select>
          </label>
        </div>

        <div class="tool-row dt-checks">
          <label class="dt-check"><input v-model="shuffleOrder" type="checkbox" />{{ t('dictation.shuffle') }}</label>
          <label class="dt-check"><input v-model="showMeaning" type="checkbox" />{{ t('dictation.meaning') }}</label>
        </div>

        <div class="tool-row dt-actions">
          <button v-if="phase === 'idle' || phase === 'done'" type="button" class="tool-btn accent dt-main" :disabled="!supported" @click="start">
            {{ phase === 'done' ? t('dictation.restart') : t('dictation.start') }}
          </button>
          <button v-else-if="phase === 'playing'" type="button" class="tool-btn accent dt-main" @click="pause">{{ t('dictation.pause') }}</button>
          <button v-else type="button" class="tool-btn accent dt-main" @click="resume">{{ t('dictation.resume') }}</button>
          <button v-if="running" type="button" class="tool-btn" @click="stop">{{ t('dictation.stop') }}</button>
        </div>
        <div v-if="!supported" class="dt-error">{{ t('dictation.unsupported') }}</div>
        <div class="tool-hint dt-hint">{{ t('dictation.hint') }}</div>
      </div>

      <div class="tool-panel dt-stage">
        <div class="dt-stage-head">
          <span class="tool-section-title">{{ t('dictation.current') }}</span>
          <span class="tool-hint">{{ t('dictation.progress', { index: position, total: order.length || words.length }) }}</span>
        </div>
        <div class="dt-word-card">
          <template v-if="currentWord">
            <span class="dt-word">{{ currentWord.en }}</span>
            <span v-if="showMeaning && currentWord.zh" class="dt-meaning">{{ currentWord.zh }}</span>
          </template>
          <span v-else class="tool-hint">{{ phase === 'done' ? t('dictation.finished') : t('dictation.empty') }}</span>
        </div>
        <div class="dt-progress">
          <div class="dt-progress-bar" :style="{ width: progressPct + '%' }" />
        </div>
        <div v-if="words.length" class="dt-wordlist">
          <span
            v-for="(word, index) in words"
            :key="index"
            class="dt-wordlist-item"
            :class="{ 'is-current': isCurrentWord(index) }">
            {{ word.en }}
          </span>
        </div>
      </div>
    </div>

    <div v-if="toast" class="tool-toast" role="status">{{ toast }}</div>
  </ToolShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import ToolShell from './ToolShell.vue';
import { useCopy } from './useCopy';
import { useI18n } from '../../components/i18n/index';

interface Word {
  en: string;
  zh: string;
}

const LIST_KEY = 'tool.dictation.list';
const { t } = useI18n();
const { toast, flash } = useCopy();

const synth: SpeechSynthesis | undefined = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
const supported = !!synth;

const listText = ref('');
try {
  listText.value = localStorage.getItem(LIST_KEY) ?? '';
} catch {
  /* 忽略 */
}

const words = computed<Word[]>(() => {
  const out: Word[] = [];
  for (const raw of listText.value.split(/\r?\n/)) {
    const line = raw.replace(/^\s*\d+\s*[.、．)）]\s*/, '').trim();
    if (!line) continue;
    const split = line.split(/[\t,，;；]+/);
    if (split.length > 1) {
      const en = split[0].trim();
      const zh = split.slice(1).join(' ').trim();
      if (en) out.push({ en, zh });
      continue;
    }
    // 无分隔符：贪婪匹配开头的英文单词（含空格短语），其余视为释义
    const match = line.match(/^([A-Za-z][A-Za-z'’.\- ]*)\s+(.+)$/);
    if (match) {
      out.push({ en: match[1].trim(), zh: match[2].trim() });
    } else {
      out.push({ en: line, zh: '' });
    }
  }
  return out;
});

const intervalSec = ref(5);
const repeatCount = ref(2);
const rate = ref(1);
const shuffleOrder = ref(true);
const showMeaning = ref(true);
const voiceUri = ref('');
const voices = ref<SpeechSynthesisVoice[]>([]);

const phase = ref<'idle' | 'playing' | 'paused' | 'done'>('idle');
const running = computed(() => phase.value === 'playing' || phase.value === 'paused');
const order = ref<number[]>([]);
const cursor = ref(-1);

const position = computed(() => (cursor.value >= 0 ? cursor.value + 1 : 0));
const currentWord = computed<Word | null>(() => {
  if (cursor.value < 0 || cursor.value >= order.value.length) return null;
  return words.value[order.value[cursor.value]] ?? null;
});
const progressPct = computed(() => {
  const total = order.value.length || words.value.length;
  if (!total || cursor.value < 0) return 0;
  return Math.round(((cursor.value + 1) / total) * 100);
});

const isCurrentWord = (index: number) => currentWord.value !== null && order.value[cursor.value] === index;

const ctl = { stop: false, paused: false, wake: null as null | (() => void) };

const waitWhilePaused = () =>
  new Promise<void>((resolve) => {
    if (!ctl.paused || ctl.stop) return resolve();
    ctl.wake = () => {
      ctl.wake = null;
      resolve();
    };
  });

/** 可被 stop 提前唤醒的等待 */
const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    if (ctl.stop) return resolve();
    let timer = 0;
    const finish = () => {
      window.clearTimeout(timer);
      if (ctl.wake === finish) ctl.wake = null;
      resolve();
    };
    timer = window.setTimeout(finish, ms);
    ctl.wake = finish;
  });

const refreshVoices = () => {
  if (!synth) return;
  voices.value = synth.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith('en'));
};

const speak = (text: string) =>
  new Promise<void>((resolve) => {
    if (!synth) return resolve();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = Math.min(1.5, Math.max(0.5, Number(rate.value) || 1));
    const voice = voices.value.find((item) => item.voiceURI === voiceUri.value);
    if (voice) utterance.voice = voice;
    let finished = false;
    let timer = 0;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      resolve();
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    // onend 在部分浏览器切到后台时不触发，按字数兜底
    timer = window.setTimeout(finish, Math.max(4000, text.length * 1000));
    synth.speak(utterance);
  });

const runLoop = async () => {
  const list = words.value;
  for (let i = 0; i < order.value.length; i++) {
    if (ctl.stop) return;
    await waitWhilePaused();
    if (ctl.stop) return;
    cursor.value = i;
    const word = list[order.value[i]];
    if (!word) continue;
    for (let r = 0; r < Math.max(1, Math.floor(repeatCount.value) || 1); r++) {
      if (ctl.stop) return;
      await waitWhilePaused();
      if (ctl.stop) return;
      await speak(word.en);
      if (ctl.stop) return;
      await sleep(650);
    }
    if (i < order.value.length - 1) {
      await sleep(Math.max(1, Number(intervalSec.value) || 1) * 1000);
    }
  }
  if (!ctl.stop) {
    phase.value = 'done';
    flash(t('dictation.finished'), 2200);
  }
};

const shuffle = <T,>(list: T[]): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
};

const start = () => {
  if (!synth) return;
  const list = words.value;
  if (!list.length) {
    flash(t('dictation.empty'), 2200);
    return;
  }
  synth.cancel();
  try {
    localStorage.setItem(LIST_KEY, listText.value);
  } catch {
    /* 忽略 */
  }
  const indices = list.map((_, index) => index);
  order.value = shuffleOrder.value ? shuffle(indices) : indices;
  cursor.value = -1;
  ctl.stop = false;
  ctl.paused = false;
  phase.value = 'playing';
  void runLoop();
};

const pause = () => {
  if (phase.value !== 'playing') return;
  ctl.paused = true;
  phase.value = 'paused';
};

const resume = () => {
  if (phase.value !== 'paused') return;
  ctl.paused = false;
  phase.value = 'playing';
  ctl.wake?.();
};

const stop = () => {
  ctl.stop = true;
  ctl.paused = false;
  ctl.wake?.();
  synth?.cancel();
  phase.value = 'idle';
  cursor.value = -1;
  order.value = [];
};

const fillSample = () => {
  listText.value = ['apple 苹果', 'banana 香蕉', 'orange 橙子', 'pencil 铅笔', 'schoolbag 书包', 'library 图书馆'].join('\n');
};

onMounted(() => {
  refreshVoices();
  synth?.addEventListener('voiceschanged', refreshVoices);
});

onBeforeUnmount(() => {
  ctl.stop = true;
  ctl.wake?.();
  synth?.cancel();
  synth?.removeEventListener('voiceschanged', refreshVoices);
});
</script>

<style scoped>
.dt-list {
  min-height: 200px;
}

.dt-meta {
  margin-top: 8px;
  justify-content: space-between;
}

.dt-options {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 10px;
}

.dt-field {
  display: block;
  min-width: 0;
}

.dt-field .tool-input,
.dt-field .tool-select {
  width: 100%;
}

.dt-checks {
  margin-top: 14px;
  gap: 18px;
}

.dt-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.dt-actions {
  margin-top: 16px;
}

.dt-main {
  min-width: 140px;
}

.dt-error {
  margin-top: 10px;
  font-size: 13px;
  color: var(--system-error, #c42b1c);
}

.dt-hint {
  margin-top: 10px;
}

.dt-stage {
  display: flex;
  flex-direction: column;
}

.dt-stage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.dt-stage-head .tool-section-title {
  margin: 0;
}

.dt-word-card {
  margin-top: 14px;
  min-height: 132px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  border-radius: 8px;
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.04));
  text-align: center;
}

.dt-word {
  font-size: 40px;
  font-weight: 600;
  line-height: 1.1;
  color: var(--accent-base, #0067c0);
  word-break: break-word;
}

.dt-meaning {
  font-size: 16px;
  color: var(--text-secondary);
}

.dt-progress {
  margin-top: 12px;
  height: 4px;
  border-radius: 2px;
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.08));
  overflow: hidden;
}

.dt-progress-bar {
  height: 100%;
  background: var(--accent-base, #0067c0);
  transition: width 200ms ease;
}

.dt-wordlist {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  max-height: 180px;
  overflow: auto;
}

.dt-wordlist-item {
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.05));
  font-size: 12px;
  color: var(--text-secondary);
}

.dt-wordlist-item.is-current {
  background: var(--accent-base, #0067c0);
  color: var(--accent-text, #fff);
}
</style>
