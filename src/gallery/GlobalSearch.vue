<!-- 全站搜索面板（Ctrl + K / 点标题栏搜索按钮打开）。
     结果分四组：软件 / 内置工具 / AI 导航 / 页面 —— 匹配逻辑全在 src/gallery/searchIndex.ts。
     文案（分组名、快捷键提示、页面标题等）在根目录 文字设置.ts 的 search.* 键。
     键盘：↑↓ 选择 · Enter 打开 · Esc 关闭 · 点面板外空白处关闭。 -->
<template>
  <Teleport to="body">
    <Transition name="gs-fade">
      <div
        v-if="open"
        class="gs-overlay"
        @pointerdown.self="close">
        <div
          class="gs-panel"
          role="dialog"
          aria-modal="true"
          :aria-label="t('text.search')"
          @keydown="onKeydown">
          <!-- 输入框：自动聚焦，回车打开当前选中项 -->
          <div class="gs-field-row" @pointerdown.stop>
            <span class="gs-field-icon" aria-hidden="true">&#xE721;</span>
            <input
              ref="fieldRef"
              class="gs-field"
              type="text"
              role="searchbox"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
              :value="query"
              :placeholder="t('search.placeholder')"
              :aria-label="t('text.search')"
              @input="onInput" />
            <button
              v-if="query"
              type="button"
              class="gs-field-clear"
              :aria-label="t('search.clear')"
              v-bind="{ 'tooltipservice.tooltip': t('search.clear') }"
              @click="clearQuery">
              <span aria-hidden="true">&#xE711;</span>
            </button>
          </div>

          <!-- 结果列表：按组显示，最多 limitPerKind 条/组 -->
          <div ref="listRef" class="gs-list" role="list">
            <template v-for="group in groups" :key="group.kind">
              <div class="gs-group-title" role="presentation">
                <span>{{ groupTitle(group.kind) }}</span>
                <span class="gs-group-count">{{ group.hits.length }}</span>
              </div>
              <button
                v-for="hit in group.hits"
                :key="`${hit.kind}:${hit.key}`"
                type="button"
                class="gs-item"
                :class="{ 'is-active': hit === activeHit }"
                role="listitem"
                @click="activate(hit)"
                @pointermove="setActive(hit)">
                <span
                  class="gs-item-icon"
                  :class="iconClass(hit)"
                  :style="iconStyle(hit)"
                  aria-hidden="true">{{ iconText(hit) }}</span>
                <span class="gs-item-text">
                  <span class="gs-item-title">{{ hit.title }}</span>
                  <span class="gs-item-sub">{{ hit.subtitle }}</span>
                </span>
                <span class="gs-item-badge">{{ badgeText(hit) }}</span>
              </button>
            </template>

            <!-- 一个都没搜到：给出路（换词 / 去提交页提需求） -->
            <div v-if="!groups.length" class="gs-empty">
              <p class="gs-empty-title">{{ t('search.no-results', { query: query.trim() }) }}</p>
              <p class="gs-empty-desc">{{ t('search.empty-hint') }}</p>
            </div>
          </div>

          <!-- 底部：快捷键提示 -->
          <div class="gs-footer">
            <span class="gs-footer-keys">
              <kbd class="gs-kbd">↑</kbd><kbd class="gs-kbd">↓</kbd> {{ t('search.keys-select') }}
              <kbd class="gs-kbd">Enter</kbd> {{ t('search.keys-open') }}
              <kbd class="gs-kbd">Esc</kbd> {{ t('search.keys-close') }}
            </span>
            <span class="gs-footer-note">{{ t('search.footer-note') }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from '../components/i18n/index';
import { searchGlobal, type GlobalHit, type GlobalHitKind } from './searchIndex';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const { t } = useI18n();
const router = useRouter();

/** 每组最多显示多少条（超过就靠继续打字缩小范围） */
const LIMIT_PER_KIND = 5;

const query = ref('');
const fieldRef = ref<HTMLInputElement | null>(null);
const listRef = ref<HTMLElement | null>(null);
const activeHit = ref<GlobalHit | null>(null);

const groups = computed(() => searchGlobal(query.value, t, LIMIT_PER_KIND));
/** 拍平成一条线，方便 ↑↓ 在跨组之间连续移动 */
const flatHits = computed(() => groups.value.flatMap((group) => group.hits));

const groupTitles: Record<GlobalHitKind, string> = {
  app: 'search.group-apps',
  tool: 'search.group-tools',
  ai: 'search.group-ai',
  page: 'search.group-pages'
};
const groupTitle = (kind: GlobalHitKind) => t(groupTitles[kind]);

/** 图标：工具/页面用图标字体，软件与 AI 站点用首字色块 */
const iconClass = (hit: GlobalHit) => ({
  'is-glyph': hit.kind === 'tool' || hit.kind === 'page',
  'is-letter': hit.kind === 'app' || hit.kind === 'ai'
});
const iconText = (hit: GlobalHit) => hit.icon || hit.title.trim().slice(0, 1).toUpperCase();
const iconStyle = (hit: GlobalHit) =>
  hit.kind === 'ai' && hit.color ? { background: hit.color, color: '#fff' } : undefined;

/** 右侧小字：软件显示命中的来源，其余显示分类 / 分组 / 域名 */
const badgeText = (hit: GlobalHit) => {
  if (hit.kind === 'app' && hit.source) {
    return hit.source === 'name' ? t('search.source-name') : t('search.source-intro');
  }
  return hit.badge;
};

const close = () => emit('update:open', false);
const clearQuery = () => {
  query.value = '';
  fieldRef.value?.focus({ preventScroll: true });
};

const onInput = (event: Event) => {
  query.value = (event.target as HTMLInputElement).value;
};

const setActive = (hit: GlobalHit | null) => {
  activeHit.value = hit;
};

/** 把当前选中项滚进可视区（键盘上下移动时用） */
const scrollActiveIntoView = () => {
  const index = flatHits.value.indexOf(activeHit.value as GlobalHit);
  if (index < 0) return;
  const items = listRef.value?.querySelectorAll<HTMLElement>('.gs-item');
  items?.[index]?.scrollIntoView({ block: 'nearest' });
};

const moveActive = (step: number) => {
  const hits = flatHits.value;
  if (!hits.length) return;
  const current = activeHit.value ? hits.indexOf(activeHit.value) : -1;
  const next = current < 0 ? (step > 0 ? 0 : hits.length - 1) : (current + step + hits.length) % hits.length;
  activeHit.value = hits[next] ?? null;
  void nextTick(scrollActiveIntoView);
};

const activate = (hit: GlobalHit) => {
  if (hit.url) {
    // AI 导航是站外站点：新标签页打开，面板关掉即可（当前页面不动）
    window.open(hit.url, '_blank', 'noopener,noreferrer');
  } else if (hit.route) {
    void router.push(hit.route);
  } else {
    return;
  }
  close();
};

const onKeydown = (event: KeyboardEvent) => {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      moveActive(1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      moveActive(-1);
      break;
    case 'Enter':
      if (activeHit.value) {
        event.preventDefault();
        activate(activeHit.value);
      }
      break;
    case 'Escape':
      event.preventDefault();
      close();
      break;
    default:
      break;
  }
};

/** 打开时清空上次的关键词、自动聚焦输入框，并预选第一条 */
watch(
  () => props.open,
  (open) => {
    if (!open) {
      activeHit.value = null;
      return;
    }
    query.value = '';
    void nextTick(() => {
      fieldRef.value?.focus({ preventScroll: true });
      activeHit.value = flatHits.value[0] ?? null;
    });
  }
);

/** 关键词变了：重新预选第一条（避免选中项指向已消失的结果） */
watch(query, () => {
  activeHit.value = flatHits.value[0] ?? null;
});
</script>

<style scoped>
.gs-overlay {
  position: fixed;
  inset: 0;
  z-index: 10050;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: max(env(titlebar-area-height, 0px), 48px) 16px 16px;
  background: rgba(0, 0, 0, 0.3);
}

:global(html.theme-dark) .gs-overlay {
  background: rgba(0, 0, 0, 0.5);
}

.gs-panel {
  position: relative;
  width: min(680px, 100%);
  max-height: min(72vh, 560px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--AcrylicInAppFillColorDefaultBrush, var(--flyout-bg, rgba(252, 252, 252, 0.92)));
  -webkit-backdrop-filter: var(--flyout-backdrop, blur(30px));
  backdrop-filter: var(--flyout-backdrop, blur(30px));
  border: 1px solid var(--ctrl-border, rgba(0, 0, 0, 0.06));
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
  color: var(--text-primary);
  font-family: 'Segoe UI', system-ui, sans-serif;
}

/* ── 输入行 ───────────────────────────────────────────────── */
.gs-field-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
  height: 52px;
  padding: 0 12px;
  border-bottom: 1px solid var(--ctrl-border, rgba(0, 0, 0, 0.06));
}

.gs-field-icon {
  flex: 0 0 auto;
  font-family: 'WinUIOnWebIcons';
  font-size: 16px;
  line-height: 1;
  color: var(--text-secondary);
}

.gs-field {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 15px;
}

.gs-field::placeholder {
  color: var(--text-secondary);
}

.gs-field-clear {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  font-family: 'WinUIOnWebIcons';
  font-size: 12px;
  cursor: pointer;
}

.gs-field-clear:hover {
  background: var(--subtle-secondary);
  color: var(--text-primary);
}

/* ── 结果列表 ─────────────────────────────────────────────── */
.gs-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 8px 8px;
  overscroll-behavior: contain;
}

.gs-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 8px 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.gs-group-count {
  font-weight: 400;
  color: var(--text-tertiary, var(--text-secondary));
}

.gs-item {
  position: relative;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

/* 选中项：WinUI 的左强调条 + 半透明填充 */
.gs-item.is-active {
  background: var(--subtle-secondary);
}

.gs-item.is-active::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 2px;
  background: var(--accent-base, #0067c0);
}

.gs-item-icon {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--subtle-secondary);
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1;
}

.gs-item-icon.is-glyph {
  font-family: 'WinUIOnWebIcons';
  color: var(--accent-base, #0067c0);
  background: color-mix(in srgb, var(--accent-base, #0067c0) 12%, transparent);
}

.gs-item-icon.is-letter {
  font-size: 13px;
  font-weight: 600;
}

.gs-item-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gs-item-title {
  font-size: 14px;
  line-height: 20px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gs-item-sub {
  font-size: 12px;
  line-height: 16px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gs-item-badge {
  flex: 0 0 auto;
  /* 注意：这里不能写百分比 —— grid 的 auto 轨道在算固有尺寸时会把百分比上限当 0，
     结果小字被压成两三个像素。用固定上限，超长再用省略号。 */
  max-width: 180px;
  font-size: 11px;
  line-height: 16px;
  color: var(--text-tertiary, var(--text-secondary));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── 空结果 ───────────────────────────────────────────────── */
.gs-empty {
  padding: 28px 16px 24px;
  text-align: center;
}

.gs-empty-title {
  margin: 0;
  font-size: 14px;
  color: var(--text-primary);
}

.gs-empty-desc {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--text-secondary);
}

/* ── 底部提示 ─────────────────────────────────────────────── */
.gs-footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  border-top: 1px solid var(--ctrl-border, rgba(0, 0, 0, 0.06));
  font-size: 11px;
  color: var(--text-secondary);
}

.gs-footer-keys {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.gs-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border: 1px solid var(--ctrl-border, rgba(0, 0, 0, 0.12));
  border-radius: 4px;
  background: var(--subtle-secondary);
  font-family: inherit;
  font-size: 10px;
  line-height: 1;
}

.gs-footer-note {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── 打开 / 关闭动画 ─────────────────────────────────────── */
.gs-fade-enter-active,
.gs-fade-leave-active {
  transition: opacity 120ms linear;
}

.gs-fade-enter-active .gs-panel,
.gs-fade-leave-active .gs-panel {
  transition: transform 180ms cubic-bezier(0.33, 0, 0.2, 1);
}

.gs-fade-enter-from,
.gs-fade-leave-to {
  opacity: 0;
}

.gs-fade-enter-from .gs-panel,
.gs-fade-leave-to .gs-panel {
  transform: translateY(-12px);
}

@media (max-width: 640px) {
  .gs-overlay {
    padding: max(env(titlebar-area-height, 0px), 48px) 8px 8px;
  }

  .gs-footer-note {
    display: none;
  }
}
</style>
