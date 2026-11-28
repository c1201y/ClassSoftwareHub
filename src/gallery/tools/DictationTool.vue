<template>
  <ToolShell
    :title="t('tool.dictation.name')"
    :subtitle="t('tool.dictation.subtitle')">
    <div class="tool-grid-2">
      <div class="tool-panel">
        <span class="tool-section-title">{{ t('dictation.list') }}</span>
        <WinTextBox
          AcceptsReturn
          MinHeight="200"
          :IsEnabled="!running"
          :IsSpellCheckEnabled="false"
          :PlaceholderText="t('dictation.list-placeholder')"
          v-model:Text="listText" />
        <div class="tool-row dt-meta">
          <span class="tool-hint">{{ t('dictation.count', { n: words.length }) }}</span>
          <WinButton :Content="t('random-group.sample')" :IsEnabled="!running" @Click="fillSample" />
        </div>

        <div class="dt-options">
          <WinNumberBox
            class="dt-field"
            :Header="t('dictation.interval')"
            Width="100%"
            :Minimum="1"
            :Maximum="60"
            :SmallChange="1"
            :IsEnabled="!running"
            v-model:Value="intervalSec" />
          <WinNumberBox
            class="dt-field"
            :Header="t('dictation.repeat')"
            Width="100%"
            :Minimum="1"
            :Maximum="5"
            :SmallChange="1"
            :IsEnabled="!running"
            v-model:Value="repeatCount" />
          <WinNumberBox
            class="dt-field"
            :Header="t('dictation.rate')"
            Width="100%"
            :Minimum="0.5"
            :Maximum="1.5"
            :SmallChange="0.05"
            :IsEnabled="!running"
            v-model:Value="rate" />
          <WinComboBox
            class="dt-field"
            :Header="t('dictation.voice')"
            Width="100%"
            :ItemsSource="voiceItems"
            DisplayMemberPath="name"
            SelectedValuePath="voiceURI"
            :IsEnabled="!running"
            v-model:SelectedValue="voiceUri" />
        </div>

        <div class="tool-row dt-checks">
          <WinCheckBox :Content="t('dictation.shuffle')" :IsEnabled="!running" v-model:IsChecked="shuffleOrder" />
          <WinCheckBox :Content="t('dictation.meaning')" v-model:IsChecked="showMeaning" />
        </div>

        <div class="tool-row dt-actions">
          <WinButton
            v-if="phase === 'idle' || phase === 'done'"
            class="dt-main"
            Style="AccentButtonStyle"
            :IsEnabled="supported"
            :Content="phase === 'done' ? t('dictation.restart') : t('dictation.start')"
            @Click="start" />
          <WinButton
            v-else-if="phase === 'playing'"
            class="dt-main"
            Style="AccentButtonStyle"
            :Content="t('dictation.pause')"
            @Click="pause" />
          <WinButton v-else class="dt-main" Style="AccentButtonStyle" :Content="t('dictation.resume')" @Click="resume" />
          <WinButton v-if="running" :Content="t('dictation.stop')" @Click="stop" />
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
import WinButton from '../../components/WinButton.vue';
import WinCheckBox from '../../components/WinCheckBox.vue';
import WinComboBox from '../../components/WinComboBox.vue';
import WinNumberBox from '../../components/WinNumberBox.vue';
import WinTextBox from '../../components/WinTextBox.vue';

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
const voiceItems = computed(() => [
  { voiceURI: '', name: t('dictation.voice-default') },
  ...voices.value.map((voice) => ({ voiceURI: voice.voiceURI, name: voice.name }))
]);

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
  min-width: 0;
}

.dt-checks {
  margin-top: 14px;
  gap: 18px;
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
