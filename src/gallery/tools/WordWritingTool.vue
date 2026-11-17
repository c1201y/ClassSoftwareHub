<template>
  <ToolShell
    :title="t('tool.word-writing.name')"
    :subtitle="t('tool.word-writing.subtitle')">
    <!-- 工具条：所有操作都在这一行，与站内其它工具一致 -->
    <div class="tool-row ww-toolbar">
      <WinButton
        Style="AccentButtonStyle"
        FontSize="13"
        Padding="12,0,12,0"
        :Content="t('word-writing.import')"
        @Click="openImport" />
      <WinButton
        FontSize="13"
        Padding="10,0,10,0"
        :Content="t('word-writing.reveal')"
        :IsEnabled="words.length > 0"
        @Click="revealed = !revealed" />
      <WinButton
        FontSize="13"
        Padding="10,0,10,0"
        :Content="t('word-writing.undo')"
        :IsEnabled="canUndo"
        @Click="undo" />
      <WinButton
        FontSize="13"
        Padding="10,0,10,0"
        :Content="t('word-writing.clear-page')"
        :IsEnabled="pageHasInk"
        @Click="clearPage" />
      <WinButton
        FontSize="13"
        Padding="10,0,10,0"
        :Content="t('word-writing.print')"
        :IsEnabled="words.length > 0"
        @Click="printPage" />
      <!-- 全屏：把书写板铺满整个屏幕，投影 / 大屏演示时用 -->
      <WinButton
        FontSize="13"
        Padding="10,0,10,0"
        :Content="isFullscreen ? t('word-writing.exit-fullscreen') : t('word-writing.fullscreen')"
        :IsEnabled="words.length > 0"
        @Click="toggleFullscreen" />
      <span class="tool-hint ww-toolbar-hint">{{ statusText }}</span>
    </div>

    <!-- 主体：左词表 / 右书写板 -->
    <div class="ww-layout">
      <!-- 左：词表 -->
      <div class="tool-panel ww-panel">
        <span class="tool-section-title">{{ t('word-writing.list-title') }}</span>
        <div class="tool-row ww-list-tools">
          <WinComboBox
            class="ww-list-combo"
            :ItemsSource="listNames"
            :SelectedIndex="activeListIndex"
            @Update:SelectedIndex="onListPicked" />
          <WinButton FontSize="12" Padding="8,0,8,0" :Content="t('word-writing.list-new')" @Click="newList" />
          <WinButton FontSize="12" Padding="8,0,8,0" :Content="t('word-writing.list-rename')" @Click="renameList" />
          <WinButton FontSize="12" Padding="8,0,8,0" :Content="t('word-writing.list-delete')" :IsEnabled="lists.length > 1" @Click="deleteList" />
        </div>

        <WinTextBox
          class="ww-list-box"
          v-model:Text="activeList.text"
          :AcceptsReturn="true"
          TextWrapping="Wrap"
          :IsSpellCheckEnabled="false"
          :PlaceholderText="t('word-writing.list-placeholder')"
          :FontSize="13"
          @Update:Text="onListTextChanged" />
        <div class="ww-list-meta tool-hint">
          <span>{{ t('word-writing.word-count', { count: words.length }) }}</span>
          <span>{{ t('word-writing.per-page-count', { count: perPage }) }}</span>
        </div>

        <div class="tool-row ww-perpage">
          <span class="tool-label">{{ t('word-writing.per-page-label') }}</span>
          <WinComboBox
            class="ww-perpage-combo"
            :ItemsSource="PER_PAGE_OPTIONS"
            :SelectedIndex="perPageIndex"
            @Update:SelectedIndex="onPerPagePicked" />
        </div>
      </div>

      <!-- 右：书写板 -->
      <div class="tool-panel ww-panel ww-board-panel">
        <div class="ww-board-head">
          <span class="tool-section-title">{{ t('word-writing.board-title') }}</span>
          <div class="tool-row ww-board-tools">
            <button
              v-for="p in PENS"
              :key="p.id"
              type="button"
              class="ww-pen"
              :class="{ 'is-active': tool === 'pen' && penId === p.id }"
              :style="{ '--pen-color': p.color }"
              :title="p.name"
              :aria-label="p.name"
              @click="pickPen(p.id)"><span class="ww-pen-dot" /></button>
            <button
              type="button"
              class="ww-eraser"
              :class="{ 'is-active': tool === 'eraser' }"
              :title="t('word-writing.eraser')"
              :aria-label="t('word-writing.eraser')"
              @click="tool = 'eraser'">{{ t('word-writing.eraser') }}</button>
            <span class="ww-board-sep" aria-hidden="true" />
            <WinButton FontSize="12" Padding="8,0,8,0" :Content="t('word-writing.prev-page')" :IsEnabled="page > 0" @Click="prevPage" />
            <span class="ww-page-info">{{ page + 1 }} / {{ pageCount }}</span>
            <WinButton FontSize="12" Padding="8,0,8,0" :Content="t('word-writing.next-page')" :IsEnabled="page < pageCount - 1" @Click="nextPage" />
          </div>
        </div>

        <!-- 空白态 -->
        <div v-if="!words.length" class="ww-empty">
          <p class="ww-empty-title">{{ t('word-writing.empty-title') }}</p>
          <p class="ww-empty-desc">{{ t('word-writing.empty-desc') }}</p>
          <WinButton
            Style="AccentButtonStyle"
            :Content="t('word-writing.load-sample')"
            @Click="loadSample" />
        </div>

        <!-- 四线三格书写区 -->
        <div v-else ref="boardWrapRef" class="ww-board-wrap">
          <div class="ww-board" :style="{ height: boardHeight + 'px' }">
            <!-- 左侧词序号 + 汉语 -->
            <div class="ww-labels">
              <div
                v-for="(item, i) in pageWords"
                :key="item.key"
                class="ww-label"
                :style="{ top: i * ROW_H + 'px', height: ROW_H + 'px' }">
                <span class="ww-label-index">{{ startIndex + i + 1 }}</span>
                <span class="ww-label-cn">{{ item.cn }}</span>
                <span v-if="revealed && item.en" class="ww-label-en">{{ item.en }}</span>
              </div>
            </div>

            <!-- 四线三格 + canvas 笔迹 -->
            <div class="ww-lines">
              <svg
                class="ww-guides"
                :width="boardWidth"
                :height="boardHeight"
                :viewBox="`0 0 ${boardWidth} ${boardHeight}`"
                aria-hidden="true">
                <template v-for="(_, i) in pageWords" :key="i">
                  <line
                    v-for="(g, gi) in GUIDE_Y"
                    :key="gi"
                    :x1="0"
                    :x2="boardWidth"
                    :y1="i * ROW_H + g"
                    :y2="i * ROW_H + g"
                    :class="gi === 1 || gi === 2 ? 'is-light' : ''" />
                </template>
              </svg>
              <canvas
                ref="canvasRef"
                class="ww-canvas"
                :width="boardWidth"
                :height="boardHeight"
                @pointerdown="onPointerDown"
                @pointermove="onPointerMove"
                @pointerup="onPointerUp"
                @pointercancel="onPointerUp"
                @pointerleave="onPointerUp" />
            </div>
          </div>
        </div>

        <p class="tool-hint ww-board-hint">
          {{ t('word-writing.board-hint') }}
        </p>
      </div>
    </div>

    <!-- 导入对话框 -->
    <div v-if="importOpen" class="ww-dialog-mask" @click.self="importOpen = false">
      <div class="ww-dialog" role="dialog" aria-modal="true" aria-labelledby="ww-dialog-title">
        <div class="ww-dialog-head">
          <span id="ww-dialog-title" class="ww-dialog-title">{{ t('word-writing.import') }}</span>
          <button type="button" class="ww-dialog-x" :aria-label="t('word-writing.close')" @click="importOpen = false">×</button>
        </div>
        <p class="ww-dialog-desc">
          {{ t('word-writing.import-desc') }}
        </p>
        <textarea
          v-model="importText"
          class="ww-dialog-text"
          rows="10"
          :placeholder="t('word-writing.import-placeholder')" />
        <div class="ww-dialog-foot">
          <WinButton
            FontSize="13"
            Padding="10,0,10,0"
            :Content="t('word-writing.fill-sample')"
            @Click="importText = SAMPLE_TEXT" />
          <span class="ww-dialog-grow" />
          <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('word-writing.cancel')" @Click="importOpen = false" />
          <WinButton
            Style="AccentButtonStyle"
            FontSize="13"
            Padding="10,0,10,0"
            :Content="t('word-writing.confirm-import')"
            :IsEnabled="!!importText.trim()"
            @Click="applyImport" />
        </div>
      </div>

    </div>
  </ToolShell>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import ToolShell from './ToolShell.vue';
import WinButton from '../../components/WinButton.vue';
import WinTextBox from '../../components/WinTextBox.vue';
import WinComboBox from '../../components/WinComboBox.vue';
import { useI18n } from '../../components/i18n/index';


/* ══════════════════════════════════════════════════════════════════
   单词默写 —— 2026-11-15 由 iframe 版重写为原生 Vue 组件。

   原实现把 1200 行独立 HTML 塞进 iframe，自带一套灰白配色，
   与站内 WinUI 深色主题完全割裂。现在：
     · UI 全部用 WinUIonWeb 组件 + tool.css 公共类，跟随站点主题
     · 词表 / 笔迹仍存 localStorage，key 与旧版一致（word-writing.v1），
       老用户的数据不会丢
     · 四线三格用 SVG 画，笔迹用 canvas —— 打印时只留线条不留笔迹

   数据形状：
     lists: [{ name, text }]        多套词表（老师可给不同班级各存一份）
     active: number                 当前词表下标
     ink: Record<string, Stroke[]>  以「词表名:页码」为 key 存笔迹
   ══════════════════════════════════════════════════════════════════ */

const { t } = useI18n();

const STORAGE_KEY = 'word-writing.v1';

/** 每行高度（含四线三格）：足够大的触摸目标，投影下也看得清 */
const ROW_H = 72;

/** 四线三格的四条线相对行顶的位置：第 1 条在最上，第 4 条在最下。
 *  三格高度均分（8→26→45→64），字母主体写在中间那格。 */
const GUIDE_Y = [8, 26, 45, 64];

const PER_PAGE_OPTIONS = [6, 8, 10, 12, 16];

/** 笔色：取站内强调色系，避免花花绿绿 */
const PENS = [
  { id: 'blue', name: '蓝色', color: '#0067C0' },
  { id: 'black', name: '黑色', color: '#1a1a1a' },
  { id: 'red', name: '红色', color: '#C42B1C' },
  { id: 'green', name: '绿色', color: '#107C10' }
];

const SAMPLE_TEXT = ['苹果', '香蕉', '橙子', '葡萄', '西瓜', '草莓', '菠萝', '芒果'].join('\n');

interface WordItem {
  /** 稳定 key：用下标 + 汉语，避免 Vue 复用错行 */
  key: string;
  /** 汉语（左侧显示） */
  cn: string;
  /** 英文提示（可选，显示答案时才出现） */
  en: string;
}

interface Stroke {
  color: string;
  width: number;
  /** 归一化到 [0,1] 的点，换设备 / 改窗口后仍能正确缩放 */
  points: [number, number][];
}

interface WordList {
  name: string;
  text: string;
}

/* ── 状态 ─────────────────────────────────────────────────────────── */

const lists = reactive<WordList[]>([{ name: '词表 1', text: '' }]);
const activeIndex = ref(0);
const perPageIndex = ref(2); // 默认 10 个
const page = ref(0);
const tool = ref<'pen' | 'eraser'>('pen');
const penId = ref('blue');
const revealed = ref(false);
const importOpen = ref(false);
const importText = ref('');

/** 笔迹：key = `${词表名}:${页码}` */
const ink = reactive<Record<string, Stroke[]>>({});

const boardWidth = ref(640);
const boardHeight = computed(() => Math.max(1, pageWords.value.length) * ROW_H);

const boardWrapRef = ref<HTMLElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);

let drawing: Stroke | null = null;
let resizeObserver: ResizeObserver | null = null;

/* ── 派生数据 ─────────────────────────────────────────────────────── */

const activeList = computed(() => lists[activeIndex.value] ?? lists[0]);
const listNames = computed(() => lists.map((l) => l.name));
const activeListIndex = computed(() => activeIndex.value);
const perPage = computed(() => PER_PAGE_OPTIONS[perPageIndex.value] ?? 10);

/** 把词表文本解析成 WordItem[]：去序号、去空行、支持「汉语 英文」 */
const words = computed<WordItem[]>(() => {
  const raw = (activeList.value?.text ?? '').split(/\r?\n/);
  const out: WordItem[] = [];
  for (const line of raw) {
    // 去掉行首序号：「1. 苹果」「1、苹果」「(1) 苹果」「1 苹果」
    let s = line.replace(/^\s*[（(]?\d+[.)、．]?\s*/, '').trim();
    if (!s) continue;
    // 「苹果 apple」→ cn=苹果 en=apple（英文部分只作提示）
    const m = s.match(/^(.+?)[\s\t,，]+([A-Za-z][A-Za-z\s'\-]*)$/);
    let cn = s;
    let en = '';
    if (m) {
      cn = m[1].trim();
      en = m[2].trim();
    }
    out.push({ key: `${out.length}:${cn}`, cn, en });
  }
  return out;
});

const pageCount = computed(() => Math.max(1, Math.ceil(words.value.length / perPage.value)));
const startIndex = computed(() => page.value * perPage.value);
const pageWords = computed(() => words.value.slice(startIndex.value, startIndex.value + perPage.value));

/** 当前页的笔迹 key */
const inkKey = computed(() => `${activeList.value?.name ?? ''}:${page.value}`);
const currentStrokes = computed<Stroke[]>(() => ink[inkKey.value] ?? []);

const canUndo = computed(() => currentStrokes.value.length > 0);
const pageHasInk = computed(() => currentStrokes.value.length > 0);

const statusText = computed(() => {
  if (!words.value.length) return '还没有词，先导入一份词表';
  return `共 ${words.value.length} 个词，每页 ${perPage.value} 个`;
});

/* ── 持久化 ───────────────────────────────────────────────────────── */

interface Saved {
  lists: WordList[];
  active: number;
  perPage: number;
  ink: Record<string, Stroke[]>;
}

const persist = () => {
  try {
    const payload: Saved = {
      lists: lists.map((l) => ({ name: l.name, text: l.text })),
      active: activeIndex.value,
      perPage: perPageIndex.value,
      ink
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* 配额满 / 无痕模式：放弃保存，功能仍可用 */
  }
};

const restore = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as Partial<Saved>;
    if (Array.isArray(data.lists) && data.lists.length) {
      lists.splice(0, lists.length, ...data.lists.map((l) => ({
        name: String(l.name ?? '词表'),
        text: String(l.text ?? '')
      })));
    }
    if (typeof data.active === 'number') {
      activeIndex.value = Math.min(Math.max(0, data.active), lists.length - 1);
    }
    if (typeof data.perPage === 'number') {
      perPageIndex.value = Math.min(Math.max(0, data.perPage), PER_PAGE_OPTIONS.length - 1);
    }
    if (data.ink && typeof data.ink === 'object') {
      Object.assign(ink, data.ink);
    }
  } catch {
    /* 数据损坏：当作全新开始，不弹错 */
  }
};

/* ── 词表操作 ─────────────────────────────────────────────────────── */

const onListPicked = (index: number) => {
  activeIndex.value = Math.max(0, index);
  page.value = 0;
  revealed.value = false;
  void nextTick(redraw);
};

const newList = () => {
  lists.push({ name: `词表 ${lists.length + 1}`, text: '' });
  activeIndex.value = lists.length - 1;
  page.value = 0;
  persist();
  void nextTick(redraw);
};

const renameList = () => {
  const current = activeList.value;
  if (!current) return;
  const next = window.prompt('重命名词表', current.name);
  const name = (next ?? '').trim();
  if (!name || name === current.name) return;
  current.name = name;
  persist();
};

const deleteList = () => {
  if (lists.length <= 1) return;
  if (!window.confirm(`删除「${activeList.value?.name ?? ''}」？`)) return;
  lists.splice(activeIndex.value, 1);
  activeIndex.value = Math.max(0, activeIndex.value - 1);
  page.value = 0;
  persist();
  void nextTick(redraw);
};

const onListTextChanged = () => {
  // 词表变了：页码可能越界，收敛到合法范围
  if (page.value > pageCount.value - 1) page.value = Math.max(0, pageCount.value - 1);
  persist();
  void nextTick(redraw);
};

const onPerPagePicked = (index: number) => {
  perPageIndex.value = Math.max(0, index);
  page.value = 0;
  persist();
  void nextTick(redraw);
};

const prevPage = () => {
  if (page.value > 0) {
    page.value -= 1;
    void nextTick(redraw);
  }
};

const nextPage = () => {
  if (page.value < pageCount.value - 1) {
    page.value += 1;
    void nextTick(redraw);
  }
};

/* ── 导入 ─────────────────────────────────────────────────────────── */

const openImport = () => {
  importText.value = activeList.value?.text ?? '';
  importOpen.value = true;
};

const applyImport = () => {
  if (!activeList.value) return;
  activeList.value.text = importText.value;
  importOpen.value = false;
  page.value = 0;
  onListTextChanged();
};

const loadSample = () => {
  if (!activeList.value) return;
  activeList.value.text = SAMPLE_TEXT;
  page.value = 0;
  onListTextChanged();
};

/* ── 绘制 ─────────────────────────────────────────────────────────── */

const penColor = computed(() => PENS.find((p) => p.id === penId.value)?.color ?? '#0067C0');

const pickPen = (id: string) => {
  penId.value = id;
  tool.value = 'pen';
};

/** 量一次书写区宽度，通知 canvas 与 SVG 同步 */
const measureBoard = () => {
  const wrap = boardWrapRef.value;
  if (!wrap) return;
  const w = Math.floor(wrap.getBoundingClientRect().width);
  if (w > 0 && w !== boardWidth.value) boardWidth.value = w;
};

/** 把一笔笔迹画到 canvas 上（按归一化坐标还原） */
const paintStroke = (ctx: CanvasRenderingContext2D, stroke: Stroke) => {
  const pts = stroke.points;
  if (pts.length < 2) {
    // 单点：画一个圆点，否则点一下没痕迹
    if (pts.length === 1) {
      const [nx, ny] = pts[0];
      ctx.beginPath();
      ctx.arc(nx * boardWidth.value, ny * boardHeight.value, stroke.width / 2, 0, Math.PI * 2);
      ctx.fillStyle = stroke.color;
      ctx.fill();
    }
    return;
  }
  ctx.beginPath();
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  pts.forEach(([nx, ny], i) => {
    const x = nx * boardWidth.value;
    const y = ny * boardHeight.value;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
};

/** 重画整块画布 */
const redraw = () => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  measureBoard();
  // 设 width/height 会清空画布，所以每次都全量重画
  canvas.width = boardWidth.value;
  canvas.height = boardHeight.value;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  // 高分屏：按 devicePixelRatio 放大，避免笔迹发虚
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = boardWidth.value * dpr;
  canvas.height = boardHeight.value * dpr;
  canvas.style.width = `${boardWidth.value}px`;
  canvas.style.height = `${boardHeight.value}px`;
  ctx.scale(dpr, dpr);
  for (const stroke of currentStrokes.value) paintStroke(ctx, stroke);
};

/* ── 指针事件 ─────────────────────────────────────────────────────── */

const pointOf = (event: PointerEvent): [number, number] | null => {
  const canvas = canvasRef.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  // 归一化坐标：窗口尺寸变了笔迹也不会错位
  return [
    Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
  ];
};

const onPointerDown = (event: PointerEvent) => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  // 手掌误触不做特殊处理（浏览器已区分笔/触摸的 pointerType）
  canvas.setPointerCapture(event.pointerId);

  if (tool.value === 'eraser') {
    eraseAt(event);
    return;
  }
  const pt = pointOf(event);
  if (!pt) return;
  drawing = { color: penColor.value, width: 3, points: [pt] };
  const ctx = canvas.getContext('2d');
  if (ctx) paintStroke(ctx, { ...drawing, points: [pt, pt] });
};

const onPointerMove = (event: PointerEvent) => {
  if (tool.value === 'eraser') {
    if (event.buttons > 0) eraseAt(event);
    return;
  }
  if (!drawing) return;
  const pt = pointOf(event);
  if (!pt) return;
  const prev = drawing.points[drawing.points.length - 1];
  // 抽稀：距离过近的点不记，省空间也让线条更顺
  if (Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) * boardWidth.value < 1.5) return;
  drawing.points.push(pt);

  const ctx = canvasRef.value?.getContext('2d');
  if (!ctx) return;
  // 只画新加的这一小段，避免每次重画整页
  const [px, py] = prev;
  const [nx, ny] = pt;
  ctx.beginPath();
  ctx.strokeStyle = drawing.color;
  ctx.lineWidth = drawing.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.moveTo(px * boardWidth.value, py * boardHeight.value);
  ctx.lineTo(nx * boardWidth.value, ny * boardHeight.value);
  ctx.stroke();
};

const onPointerUp = () => {
  if (!drawing) return;
  // 单点也算一笔（点一下留个点）
  const list = ink[inkKey.value] ?? (ink[inkKey.value] = []);
  list.push(drawing);
  if (list.length > 400) list.shift(); // 防御：单页最多留 400 笔
  drawing = null;
  persist();
};

/** 橡皮：删掉擦到的整笔（比逐点擦更符合「擦掉重写」的直觉） */
const eraseAt = (event: PointerEvent) => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const pt = pointOf(event);
  if (!pt) return;
  const [nx, ny] = pt;
  const x = nx * boardWidth.value;
  const y = ny * boardHeight.value;

  const list = ink[inkKey.value];
  if (!list?.length) return;

  const hitRadius = 14;
  let removed = false;
  for (let i = list.length - 1; i >= 0; i--) {
    if (strokeHits(list[i], x, y, hitRadius)) {
      list.splice(i, 1);
      removed = true;
      break; // 一次只擦一笔，避免拖动时误删一片
    }
  }
  if (removed) {
    redraw();
    persist();
  }
};

/** 这一笔是否经过 (x, y) 附近 */
const strokeHits = (stroke: Stroke, x: number, y: number, radius: number): boolean => {
  const pts = stroke.points.map(([nx, ny]) => [nx * boardWidth.value, ny * boardHeight.value]);
  if (pts.length === 1) {
    return Math.hypot(pts[0][0] - x, pts[0][1] - y) <= radius;
  }
  for (let i = 1; i < pts.length; i++) {
    if (distToSegment(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= radius) return true;
  }
  return false;
};

const distToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
};

/* ── 撤销 / 清空 / 打印 ───────────────────────────────────────────── */

const undo = () => {
  const list = ink[inkKey.value];
  if (!list?.length) return;
  list.pop();
  redraw();
  persist();
};

const clearPage = () => {
  const list = ink[inkKey.value];
  if (!list?.length) return;
  list.length = 0;
  redraw();
  persist();
};

/** 打印：只印四线三格和词，不印屏幕上的笔迹（等于生成一份空白练习纸） */
const printPage = () => {
  window.print();
};

/* ── 全屏 ─────────────────────────────────────────────────────────── */

/**
 * 是否处于全屏。
 *
 * 用 document.fullscreenElement 作为唯一真源，而不是自己记一个 flag ——
 * 用户按 Esc 退出全屏时浏览器不会通知我们，只有读这个属性才准。
 */
const isFullscreen = ref(false);

const syncFullscreenState = () => {
  isFullscreen.value = !!document.fullscreenElement;
  // 进出全屏后画布尺寸变了，必须重新量宽并重画
  void nextTick(() => {
    measureBoard();
    redraw();
  });
};

const toggleFullscreen = async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else if (boardWrapRef.value) {
      await boardWrapRef.value.requestFullscreen();
    }
  } catch {
    // 浏览器拒绝（如 iOS Safari 不支持元素全屏）：静默失败，不影响书写
  }
};

/* ── 生命周期 ─────────────────────────────────────────────────────── */

onMounted(() => {
  restore();
  void nextTick(() => {
    measureBoard();
    redraw();
  });
  // 窗口 / 侧栏变化时重新量宽并重画
  resizeObserver = new ResizeObserver(() => {
    measureBoard();
    redraw();
  });
  if (boardWrapRef.value) resizeObserver.observe(boardWrapRef.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

// 页码 / 词表变化都要重画（画布内容是跟着页走的）
watch(() => [inkKey.value, pageWords.value.length], () => {
  void nextTick(redraw);
});

// 窗口缩放时笔迹要跟着重画
watch(boardWidth, () => redraw());

// 打印前把 canvas 隐藏，打印样式只留四线三格
onMounted(() => {
  window.addEventListener('beforeprint', hideInkForPrint);
  window.addEventListener('afterprint', showInkForPrint);
  // 全屏状态以浏览器为准：Esc 退出时也要同步回来
  document.addEventListener('fullscreenchange', syncFullscreenState);
});
onBeforeUnmount(() => {
  window.removeEventListener('beforeprint', hideInkForPrint);
  window.removeEventListener('afterprint', showInkForPrint);
  document.removeEventListener('fullscreenchange', syncFullscreenState);
});

const hideInkForPrint = () => {
  document.body.classList.add('ww-printing');
};
const showInkForPrint = () => {
  document.body.classList.remove('ww-printing');
};
</script>

<style scoped>
/* ── 工具条 ─────────────────────────────────────────────────────────── */
.ww-toolbar {
  margin-bottom: 16px;
}

.ww-toolbar-hint {
  flex: 1 1 220px;
  min-width: 0;
}

/* ── 主体两列 ───────────────────────────────────────────────────────── */
.ww-layout {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(0, 2fr);
  gap: 16px;
  align-items: start;
}

.ww-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ww-board-panel {
  min-width: 0;
}

/* ── 词表列 ─────────────────────────────────────────────────────────── */
.ww-list-tools {
  gap: 6px;
}

.ww-list-combo {
  flex: 1 1 120px;
  min-width: 0;
}

.ww-list-box {
  min-height: 200px;
}

.ww-list-box :deep(textarea) {
  min-height: 200px;
  font-size: 13px;
  line-height: 21px;
}

.ww-list-meta {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.ww-perpage {
  gap: 8px;
}

.ww-perpage-combo {
  width: 96px;
  flex: none;
}

/* ── 书写板 ─────────────────────────────────────────────────────────── */
.ww-board-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.ww-board-head .tool-section-title {
  margin: 0;
  line-height: 32px;
}

.ww-board-tools {
  gap: 6px;
}

/* 笔色选择：圆点 + 选中环 */
.ww-pen {
  width: 28px;
  height: 28px;
  padding: 0;
  border-radius: 50%;
  border: 1px solid var(--ctrl-border, rgba(0, 0, 0, 0.22));
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.ww-pen.is-active {
  border-color: var(--accent-base, #0067C0);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-base, #0067C0) 30%, transparent);
}

.ww-pen-dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--pen-color);
}

.ww-eraser {
  height: 28px;
  padding: 0 10px;
  border-radius: 4px;
  border: 1px solid var(--ctrl-border, rgba(0, 0, 0, 0.22));
  background: var(--ctrl-fill-default, rgba(255, 255, 255, 0.7));
  color: var(--text-primary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.ww-eraser.is-active {
  border-color: var(--accent-base, #0067C0);
  background: color-mix(in srgb, var(--accent-base, #0067C0) 14%, transparent);
}

.ww-board-sep {
  width: 1px;
  height: 20px;
  background: var(--stroke-divider, rgba(0, 0, 0, 0.12));
}

.ww-page-info {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 48px;
  text-align: center;
}

/* 空白态 */
.ww-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 260px;
  padding: 24px;
  border: 1px dashed var(--ctrl-border, rgba(0, 0, 0, 0.22));
  border-radius: 8px;
  text-align: center;
}

.ww-empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.ww-empty-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

/* 书写区 */
.ww-board-wrap {
  position: relative;
  width: 100%;
  border: 1px solid var(--ctrl-border, rgba(0, 0, 0, 0.18));
  border-radius: 8px;
  overflow: hidden;
  background: var(--card-bg, #fff);
}

.ww-board {
  position: relative;
  display: flex;
  width: 100%;
}

/* 左侧汉语标签 */
.ww-labels {
  position: relative;
  flex: none;
  width: 132px;
  border-right: 1px solid var(--ctrl-border, rgba(0, 0, 0, 0.12));
}

.ww-label {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  box-sizing: border-box;
}

.ww-label-index {
  flex: none;
  min-width: 18px;
  font-size: 12px;
  color: var(--text-tertiary, var(--text-secondary));
  text-align: right;
}

.ww-label-cn {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ww-label-en {
  margin-left: auto;
  font-size: 12px;
  color: var(--accent-base, #0067C0);
  white-space: nowrap;
}

/* 四线三格 + 画布 */
.ww-lines {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}

.ww-guides {
  display: block;
  pointer-events: none;
}

/* 四线三格：外侧两条（第 1 / 第 4 条）是格界，画实；
   中间两条（第 2 / 第 3 条）是辅助线，明显更淡 ——
   否则四线等距会让整块看起来像密集横条纹。 */
.ww-guides line {
  stroke: color-mix(in srgb, var(--text-secondary, #888) 55%, transparent);
  stroke-width: 1;
}

.ww-guides line.is-light {
  stroke: color-mix(in srgb, var(--text-secondary, #888) 16%, transparent);
  stroke-dasharray: 3 4;
}

.ww-canvas {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none; /* 关键：否则手机上会被滚动手势吃掉 */
  cursor: crosshair;
}

.ww-board-hint {
  margin: 0;
}

/* ── 全屏：书写区铺满屏幕 ───────────────────────────────────────────
   全屏的是 .ww-board-wrap 本身，所以这里要让它在全屏下撑满视口，
   并把背景改成不透明（浏览器全屏层默认黑底，透出主题色会很怪）。 */
.ww-board-wrap:fullscreen {
  width: 100vw;
  height: 100vh;
  border: none;
  border-radius: 0;
  background: var(--card-bg-solid, #fafafa);
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.ww-board-wrap:fullscreen .ww-board {
  /* 全屏时行高按视口等分，让每行都够大、投影下看得清 */
  height: 100% !important;
  flex: 1 1 auto;
}

.ww-board-wrap:fullscreen .ww-label {
  align-items: center;
}

.ww-board-wrap:fullscreen .ww-label-cn {
  font-size: 22px;
}

.ww-board-wrap:fullscreen .ww-label-index {
  font-size: 14px;
}

/* ── 导入对话框 ─────────────────────────────────────────────────────── */
.ww-dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.ww-dialog {
  width: min(560px, 100%);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px;
  border-radius: 10px;
  border: 1px solid var(--card-stroke, var(--ctrl-border, rgba(0, 0, 0, 0.12)));
  background: var(--dialog-background, var(--card-bg, #fff));
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
}

.ww-dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ww-dialog-title {
  font-size: 18px;
  font-weight: 600;
}

.ww-dialog-x {
  border: none;
  background: none;
  font-size: 22px;
  line-height: 1;
  color: var(--text-secondary);
  cursor: pointer;
}

.ww-dialog-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.ww-dialog-text {
  box-sizing: border-box;
  width: 100%;
  min-height: 200px;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid var(--ctrl-border, rgba(0, 0, 0, 0.22));
  background: var(--ctrl-fill-default, rgba(255, 255, 255, 0.7));
  color: var(--text-primary);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.7;
  resize: vertical;
}

.ww-dialog-foot {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ww-dialog-grow {
  flex: 1 1 auto;
}

/* ── 窄屏：词表叠到书写板上面 ───────────────────────────────────────── */
@media (max-width: 860px) {
  .ww-layout {
    grid-template-columns: 1fr;
  }

  .ww-labels {
    width: 96px;
  }

  .ww-label-cn {
    font-size: 14px;
  }
}

/* ── 打印：只留四线三格和词，隐藏所有操作界面 ──────────────────────── */
@media print {
  .ww-toolbar,
  .ww-list-tools,
  .ww-list-meta,
  .ww-perpage,
  .ww-board-tools,
  .ww-board-hint,
  .ww-empty,
  .ww-dialog-mask {
    display: none !important;
  }

  .ww-layout {
    display: block;
  }

  .ww-list-box {
    display: none;
  }

  .ww-board-wrap {
    border: none;
  }

  .ww-canvas {
    display: none; /* 笔迹不打印：等于输出空白练习纸 */
  }
}
</style>
