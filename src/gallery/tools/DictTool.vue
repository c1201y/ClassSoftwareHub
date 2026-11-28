<template>
  <ToolShell
    :title="t('tool.dict.name')"
    :subtitle="t('tool.dict.subtitle')">
    <!-- 查询栏 -->
    <div class="tool-row dt-search-row">
      <WinTextBox
        class="dt-input"
        v-model:Text="query"
        :PlaceholderText="t('dict.placeholder')"
        :IsSpellCheckEnabled="false"
        :FontSize="16" />
      <WinButton
        Style="AccentButtonStyle"
        FontSize="14"
        Padding="14,0,14,0"
        :Content="t('dict.search')"
        @Click="runSearch" />
      <WinButton
        FontSize="13"
        Padding="10,0,10,0"
        :Content="t('dict.clear')"
        :IsEnabled="!!query"
        @Click="clearAll" />
    </div>

    <!-- 状态行：加载中 / 未找到 / 已加载块数 -->
    <p class="dt-status tool-hint">{{ statusText }}</p>

    <!-- 结果 -->
    <div v-if="exact" class="tool-panel dt-card">
      <div class="dt-head">
        <span class="dt-word">{{ exact.word }}</span>
        <span v-if="exact.phonetic" class="dt-phonetic">{{ exact.phonetic }}</span>
        <WinButton class="dt-speak" :title="t('dict.speak')" :aria-label="t('dict.speak')" @Click="speak(exact.word)">
          <span class="dt-speak-icon" aria-hidden="true">&#xE995;</span>
        </WinButton>
      </div>
      <p class="dt-sense">{{ exact.sense }}</p>
    </div>

    <!-- 前缀匹配 -->
    <div v-else-if="prefix.length" class="tool-panel dt-card">
      <span class="tool-section-title">{{ t('dict.prefix-title', { query: query.trim() }) }}</span>
      <div class="dt-prefix-list">
        <button
          v-for="item in prefix"
          :key="item.word"
          type="button"
          class="dt-prefix-item"
          @click="pick(item)">
          <span class="dt-prefix-word">{{ item.word }}</span>
          <span class="dt-prefix-sense">{{ item.sense }}</span>
        </button>
      </div>
    </div>

    <!-- 没找到 -->
    <div v-else-if="searched && !loading" class="tool-panel dt-card dt-empty">
      <p class="dt-empty-title">{{ t('dict.not-found', { query: query.trim() }) }}</p>
      <p class="dt-empty-desc">{{ t('dict.not-found-desc') }}</p>
    </div>

    <!-- 初始态：使用说明 -->
    <div v-if="!searched" class="tool-panel dt-tips">
      <span class="tool-section-title">{{ t('dict.tips-title') }}</span>
      <ul class="dt-tip-list">
        <li>{{ t('dict.tip-1') }}</li>
        <li>{{ t('dict.tip-2') }}</li>
        <li>{{ t('dict.tip-3') }}</li>
      </ul>
      <p class="tool-hint dt-total">{{ t('dict.total', { count: TOTAL_WORDS }) }}</p>
    </div>
  </ToolShell>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import ToolShell from './ToolShell.vue';
import WinTextBox from '../../components/WinTextBox.vue';
import WinButton from '../../components/WinButton.vue';
import { useI18n } from '../../components/i18n/index';
import { lookup, type DictEntry } from '../dict';

const { t } = useI18n();

/** 词库总量（写死：数据是构建时生成的固定快照，改词库时同步改这里） */
const TOTAL_WORDS = 29417;

const query = ref('');
const exact = ref<DictEntry | null>(null);
const prefix = ref<DictEntry[]>([]);
const searched = ref(false);
const loading = ref(false);
const statusText = ref('');

let searchToken = 0;

/**
 * 查词。
 *
 * 每次查询递增 token，异步返回时对不上就丢弃 —— 用户连续打字时，
 * 慢的那个请求不能覆盖快的结果。
 */
const doSearch = async (raw: string) => {
  const token = ++searchToken;
  const q = raw.trim();

  if (!q) {
    exact.value = null;
    prefix.value = [];
    searched.value = false;
    statusText.value = '';
    loading.value = false;
    return;
  }

  loading.value = true;
  statusText.value = t('dict.loading');
  try {
    const result = await lookup(q);
    if (token !== searchToken) return; // 已有更新的查询
    exact.value = result.exact;
    prefix.value = result.prefix;
    searched.value = true;
    statusText.value = result.exact
      ? t('dict.found')
      : result.prefix.length
        ? t('dict.prefix-hint')
        : '';
  } catch {
    if (token !== searchToken) return;
    exact.value = null;
    prefix.value = [];
    searched.value = true;
    statusText.value = t('dict.load-failed');
  } finally {
    if (token === searchToken) loading.value = false;
  }
};

/**
 * 输入即查。
 *
 * 用 watch 而不是 @Update:Text：与 v-model:Text 同时绑定时，
 * 事件和 v-model 的写入顺序不稳定，容易读到旧值。
 */
watch(query, (value) => {
  void doSearch(value);
});

const runSearch = () => {
  void doSearch(query.value);
};

const clearAll = () => {
  query.value = '';
  exact.value = null;
  prefix.value = [];
  searched.value = false;
  statusText.value = '';
};

/** 点前缀建议：直接填入并查 */
const pick = (item: DictEntry) => {
  query.value = item.word;
  void doSearch(item.word);
};

/**
 * 朗读单词。
 *
 * 用浏览器自带的 SpeechSynthesis（无网络请求、无第三方服务）。
 * 不是所有环境都有英文语音包，失败时静默。
 */
const speak = (word: string) => {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(word);
    utter.lang = 'en-US';
    utter.rate = 0.9;
    synth.speak(utter);
  } catch {
    /* 没有语音能力时静默 */
  }
};
</script>

<style scoped>
.dt-search-row {
  gap: 8px;
  align-items: center;
}

.dt-input {
  flex: 1 1 320px;
  min-width: 0;
}

.dt-status {
  margin: 8px 0 0;
  min-height: 17px;
}

.dt-card {
  margin-top: 14px;
}

/* 词条卡 */
.dt-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.dt-word {
  font-size: 30px;
  font-weight: 700;
  line-height: 1.2;
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
}

.dt-phonetic {
  font-size: 16px;
  color: var(--text-secondary);
  font-family: 'Segoe UI', sans-serif;
}

.dt-speak {
  margin-left: auto;
  width: 34px;
  height: 34px;
  min-height: 0;
  --ButtonPadding: 0;
  --ButtonCornerRadius: 50%;
  --ButtonForeground: var(--accent-base, #0067C0);
}

.dt-speak-icon {
  font-family: 'WinUIOnWebIcons';
  font-size: 16px;
}

.dt-sense {
  margin: 12px 0 0;
  font-size: 16px;
  line-height: 1.75;
  white-space: pre-wrap;
}

/* 前缀建议 */
.dt-prefix-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dt-prefix-item {
  display: flex;
  align-items: baseline;
  gap: 12px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.dt-prefix-item:hover {
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.05));
}

.dt-prefix-word {
  flex: none;
  min-width: 120px;
  font-size: 15px;
  font-weight: 600;
}

.dt-prefix-sense {
  min-width: 0;
  font-size: 13px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 空态 / 说明 */
.dt-empty {
  text-align: center;
  padding: 28px 20px;
}

.dt-empty-title {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
}

.dt-empty-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.dt-tips {
  margin-top: 14px;
}

.dt-tip-list {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
  line-height: 1.9;
  color: var(--text-secondary);
}

.dt-total {
  margin: 10px 0 0;
}

@media (max-width: 640px) {
  .dt-word {
    font-size: 24px;
  }

  .dt-prefix-word {
    min-width: 80px;
  }
}
</style>
