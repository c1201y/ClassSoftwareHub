<template>
  <ToolShell
    :title="t('tool.regex.name')"
    :subtitle="t('tool.regex.subtitle')">
    <div class="tool-grid-2">
      <div class="tool-panel">
        <span class="tool-section-title">{{ t('regex.pattern') }}</span>
        <input v-model="pattern" class="tool-input mono" :placeholder="t('regex.pattern-placeholder')" spellcheck="false" />
        <div class="rx-flags">
          <label class="rx-flag"><input v-model="flags.g" type="checkbox" />{{ t('regex.flag.g') }}</label>
          <label class="rx-flag"><input v-model="flags.i" type="checkbox" />{{ t('regex.flag.i') }}</label>
          <label class="rx-flag"><input v-model="flags.m" type="checkbox" />{{ t('regex.flag.m') }}</label>
          <label class="rx-flag"><input v-model="flags.s" type="checkbox" />{{ t('regex.flag.s') }}</label>
          <label class="rx-flag"><input v-model="flags.u" type="checkbox" />{{ t('regex.flag.u') }}</label>
          <label class="rx-flag"><input v-model="flags.y" type="checkbox" />{{ t('regex.flag.y') }}</label>
        </div>
        <div v-if="compiled.error" class="rx-error">{{ t('regex.error', { message: compiled.error }) }}</div>
        <div v-else-if="pattern" class="rx-ok">{{ t('regex.status-ok') }}</div>

        <span class="tool-section-title rx-text-title">{{ t('regex.text') }}</span>
        <textarea v-model="text" class="tool-textarea rx-text" spellcheck="false" />
      </div>

      <div class="tool-panel">
        <div class="rx-head">
          <span class="tool-section-title">{{ t('regex.matches') }}</span>
          <span class="tool-hint">{{ t('regex.match-count', { n: matches.length }) }}</span>
        </div>

        <div v-if="highlighted" class="rx-highlight mono" v-html="highlighted"></div>

        <div v-if="matches.length" class="rx-matches">
          <div v-for="(match, index) in visibleMatches" :key="index" class="rx-match">
            <div class="rx-match-head">
              <span class="rx-match-index">#{{ index + 1 }}</span>
              <span class="rx-match-at">{{ t('regex.index') }} {{ match.index }}</span>
              <span class="rx-match-text mono">{{ match.text || t('regex.zero-length') }}</span>
            </div>
            <div v-if="match.groups.length || match.named" class="rx-groups">
              <span v-for="(group, groupIndex) in match.groups" :key="groupIndex" class="rx-group">
                <span class="rx-group-key">${{ groupIndex + 1 }}</span>
                <span class="rx-group-val mono">{{ group }}</span>
              </span>
              <span v-for="(value, name) in match.named" :key="name" class="rx-group">
                <span class="rx-group-key">&lt;{{ name }}&gt;</span>
                <span class="rx-group-val mono">{{ value }}</span>
              </span>
            </div>
          </div>
          <div v-if="matches.length > visibleMatches.length" class="tool-hint">
            {{ t('regex.limit', { n: visibleMatches.length }) }}
          </div>
        </div>
        <div v-else class="tool-hint rx-empty">{{ pattern ? t('regex.no-match') : t('regex.empty') }}</div>

        <span class="tool-section-title rx-replace-title">{{ t('regex.replace') }}</span>
        <input v-model="replacement" class="tool-input mono" :placeholder="t('regex.replace-placeholder')" spellcheck="false" />
        <div class="rx-replace-head">
          <span class="tool-hint">{{ t('regex.replace-result') }}</span>
          <button type="button" class="tool-btn small" :disabled="!replaceResult" @click="copyReplace">{{ t('common.copy') }}</button>
        </div>
        <textarea class="tool-textarea rx-replace" readonly :value="replaceResult" />
      </div>
    </div>

    <div v-if="toast" class="tool-toast" role="status">{{ toast }}</div>
  </ToolShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import ToolShell from './ToolShell.vue';
import { useCopy } from './useCopy';
import { useI18n } from '../../components/i18n/index';

interface MatchItem {
  index: number;
  text: string;
  groups: string[];
  named: Record<string, string> | null;
}

const MATCH_LIMIT = 1000;
const VISIBLE_LIMIT = 200;

const { t } = useI18n();
const { toast, copy } = useCopy();

const pattern = ref('');
const text = ref('');
const replacement = ref('');
const flags = reactive({ g: true, i: false, m: false, s: false, u: true, y: false });

const flagString = computed(() =>
  `${flags.g ? 'g' : ''}${flags.i ? 'i' : ''}${flags.m ? 'm' : ''}${flags.s ? 's' : ''}${flags.u ? 'u' : ''}${flags.y ? 'y' : ''}`
);

const compiled = computed<{ re: RegExp | null; error: string }>(() => {
  if (!pattern.value) return { re: null, error: '' };
  try {
    return { re: new RegExp(pattern.value, flagString.value), error: '' };
  } catch (error) {
    return { re: null, error: error instanceof Error ? error.message : String(error) };
  }
});

const consume = (match: RegExpExecArray): MatchItem => ({
  index: match.index,
  text: match[0],
  groups: match.slice(1).map((value) => value ?? ''),
  named: match.groups ? { ...match.groups } : null
});

const matches = computed<MatchItem[]>(() => {
  const re = compiled.value.re;
  if (!re) return [];
  const out: MatchItem[] = [];
  if (!re.global && !re.sticky) {
    const match = re.exec(text.value);
    if (match) out.push(consume(match));
    return out;
  }
  // 克隆一份，避免 computed 重算之间残留 lastIndex
  const scan = new RegExp(re.source, re.flags);
  let match: RegExpExecArray | null;
  while (out.length < MATCH_LIMIT && (match = scan.exec(text.value)) !== null) {
    out.push(consume(match));
    if (match[0] === '') scan.lastIndex++;
  }
  return out;
});

const visibleMatches = computed(() => matches.value.slice(0, VISIBLE_LIMIT));

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

const highlighted = computed(() => {
  if (!text.value) return '';
  const usable = matches.value.filter((match) => match.text.length > 0);
  if (!usable.length) return escapeHtml(text.value);
  let cursor = 0;
  let html = '';
  for (const match of usable) {
    if (match.index < cursor) continue;
    html += escapeHtml(text.value.slice(cursor, match.index));
    html += `<mark>${escapeHtml(match.text)}</mark>`;
    cursor = match.index + match.text.length;
  }
  html += escapeHtml(text.value.slice(cursor));
  return html;
});

const replaceResult = computed(() => {
  const re = compiled.value.re;
  if (!re || !text.value) return '';
  try {
    return text.value.replace(new RegExp(re.source, re.flags), replacement.value);
  } catch {
    return '';
  }
});

const copyReplace = () => {
  if (!replaceResult.value) return;
  void copy(replaceResult.value, t('regex.replace-result'));
};
</script>

<style scoped>
.mono {
  font-family: Consolas, 'Courier New', monospace;
}

.rx-flags {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}

.rx-flag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.rx-error {
  margin-top: 10px;
  font-size: 13px;
  color: var(--system-error, #c42b1c);
  word-break: break-word;
}

.rx-ok {
  margin-top: 10px;
  font-size: 12px;
  color: var(--system-success, #0f7b0f);
}

.rx-text-title,
.rx-replace-title {
  margin-top: 18px;
}

.rx-text {
  min-height: 200px;
}

.rx-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.rx-head .tool-section-title {
  margin: 0;
}

.rx-highlight {
  margin-top: 12px;
  max-height: 180px;
  overflow: auto;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.04));
  font-size: 13px;
  line-height: 20px;
  white-space: pre-wrap;
  word-break: break-word;
}

.rx-highlight :deep(mark) {
  padding: 0 1px;
  border-radius: 2px;
  background: var(--accent-base, #0067c0);
  color: var(--accent-text, #fff);
}

.rx-matches {
  margin-top: 12px;
  max-height: 260px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rx-match {
  padding: 8px 10px;
  border: 1px solid var(--card-stroke, rgba(0, 0, 0, 0.1));
  border-radius: 6px;
}

.rx-match-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.rx-match-index {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-base, #0067c0);
}

.rx-match-at {
  font-size: 12px;
  color: var(--text-secondary);
}

.rx-match-text {
  font-size: 13px;
  word-break: break-all;
}

.rx-groups {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.rx-group {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  max-width: 100%;
  padding: 1px 7px;
  border-radius: 4px;
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.06));
  font-size: 12px;
}

.rx-group-key {
  color: var(--text-secondary);
}

.rx-group-val {
  word-break: break-all;
}

.rx-empty {
  margin-top: 12px;
}

.rx-replace-head {
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.rx-replace {
  margin-top: 8px;
  min-height: 96px;
}
</style>
