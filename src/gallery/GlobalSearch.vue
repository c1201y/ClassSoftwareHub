<!-- 全站搜索结果下拉（标题栏搜索框一输入，结果就在它下方弹出）。
     结果分四组：软件 / 内置工具 / AI 导航 / 页面 —— 匹配逻辑全在 src/gallery/searchIndex.ts。
     本组件【不再自带输入框】：唯一输入框在标题栏（见 App.vue 的 .gallery-titlebar-search）。
     ↑↓ / Enter / Esc 由标题栏输入框转发进来（App.vue 的 onSearchKeydown → moveActive/activateActive）。
     文案（分组名、快捷键提示、页面标题等）在根目录 文字设置.ts 的 search.* 键。 -->
<template>
  <Teleport to="body">
    <Transition name="gs-fade">
      <div
        v-if="open"
        ref="panelRef"
        class="gs-panel"
        role="dialog"
        :aria-label="t('text.search')"
        :style="panelStyle"
        @pointerdown.stop>
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
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from '../components/i18n/index';
import { searchGlobal, type GlobalHit, type GlobalHitKind } from './searchIndex';

const props = defineProps<{
  /** 是否显示结果下拉 */
  open: boolean;
  /** 关键词（来自标题栏输入框） */
  query: string;
  /** 定位锚点：标题栏那个输入框，下拉贴在它下方 */
  anchor: HTMLElement | null;
}>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const { t } = useI18n();
const router = useRouter();

/** 每组最多显示多少条（超过就靠继续打字缩小范围） */
const LIMIT_PER_KIND = 5;

const panelRef = ref<HTMLElement | null>(null);
const listRef = ref<HTMLElement | null>(null);
const activeHit = ref<GlobalHit | null>(null);
/** 下拉的内联定位样式（贴在标题栏输入框下方） */
const panelStyle = ref<Record<string, string>>({});

const groups = computed(() => searchGlobal(props.query, t, LIMIT_PER_KIND));
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
    // AI 导航是站外站点：新标签页打开，下拉关掉即可（当前页面不动）
    window.open(hit.url, '_blank', 'noopener,noreferrer');
  } else if (hit.route) {
    void router.push(hit.route);
  } else {
    return;
  }
  close();
};

/** 供标题栏输入框的 Enter 调用：有选中项就打开它，返回是否真的打开了 */
const activateActive = (): boolean => {
  if (!activeHit.value) return false;
  activate(activeHit.value);
  return true;
};

defineExpose({ moveActive, activateActive });

/* ── 定位：贴在标题栏搜索框下方，左右边缘与搜索框对齐，并保证不超出视口 ── */
const updatePosition = () => {
  const anchor = props.anchor;
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  const vw = window.innerWidth;
  // 锚点已是搜索框容器（含图标/输入框/清空按钮外包块），直接让面板宽度 = 容器宽度，
  // 左右边缘与搜索框对齐；不再用固定 380 把面板拉宽导致偏右。
  const width = Math.min(rect.width, vw - 16);
  let left = rect.left;
  if (left + width > vw - 8) left = Math.max(8, vw - 8 - width);
  const top = rect.bottom + 6;
  const maxHeight = Math.max(200, window.innerHeight - top - 16);
  panelStyle.value = {
    left: `${Math.round(left)}px`,
    top: `${Math.round(top)}px`,
    width: `${Math.round(width)}px`,
    maxHeight: `${Math.round(maxHeight)}px`
  };
};

/* ── 打开时：定位 + 预选第一条；关闭时：清选中 ─────────────────── */
watch(
  () => props.open,
  (open) => {
    if (!open) {
      activeHit.value = null;
      return;
    }
    void nextTick(() => {
      updatePosition();
      activeHit.value = flatHits.value[0] ?? null;
    });
  }
);

/** 关键词变了：重新预选第一条（避免选中项指向已消失的结果） */
watch(
  () => props.query,
  () => {
    if (!props.open) return;
    activeHit.value = flatHits.value[0] ?? null;
  }
);

/** 锚点元素在挂载后才拿到，拿到后立刻定位一次 */
watch(
  () => props.anchor,
  (anchor) => {
    if (anchor && props.open) updatePosition();
  }
);

/* ── 点面板外空白处关闭 ──────────────────────────────────────── */
const onDocPointerDown = (event: PointerEvent) => {
  const target = event.target as Node | null;
  if (!target) return;
  if (panelRef.value?.contains(target)) return;
  if (props.anchor?.contains(target)) return;
  close();
};

const bindWindowListeners = () => {
  window.addEventListener('resize', updatePosition);
  // 滚动（含标题栏自身的滚动容器）时跟着移动
  window.addEventListener('scroll', updatePosition, true);
  document.addEventListener('pointerdown', onDocPointerDown);
};
const unbindWindowListeners = () => {
  window.removeEventListener('resize', updatePosition);
  window.removeEventListener('scroll', updatePosition, true);
  document.removeEventListener('pointerdown', onDocPointerDown);
};

watch(
  () => props.open,
  (open) => {
    if (open) bindWindowListeners();
    else unbindWindowListeners();
  }
);

onBeforeUnmount(unbindWindowListeners);
</script>

<style scoped>
/* 定位在标题栏输入框下方；具体 left/top/width/max-height 由 JS 内联给出 */
.gs-panel {
  position: fixed;
  z-index: 10050;
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
  transform: translateY(-8px);
}

@media (max-width: 640px) {
  .gs-footer-note {
    display: none;
  }
}
</style>
