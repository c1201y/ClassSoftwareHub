// ════════════════════════════════════════════════════════════════════
// searchRank.ts —— 搜索结果的使用频率加权（纯逻辑，可单独验证）
//
// 现有搜索（searchIndex.ts）已经能按「名称命中 > 简介命中」和同义词排序，
// 但它对所有软件一视同仁：搜索「播放器」时，站内点开最多的那个和其它
// 排在一起，用户还得自己挑。
//
// 这里补一层**热度加权**：
//   · 记录每个结果被点开的次数（localStorage，滚动窗口）
//   · 同分时常用的排前面
//   · 记录只在「真的点了」时 +1，不做浏览计数（避免首页滚动就把热度刷满）
//
// 为什么不用后端统计：热门搜索是低频数据，本地记录就够用，也不必为它
// 增加一次网络请求（本项目的第一约束是国内可达性）。
//
// 本文件不产出界面文字。
// ════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'csh-search-hits';

/** 最多记多少个软件的热度（再多也没意义，且会撑大 localStorage） */
const MAX_ENTRIES = 200;

/** 单条热度上限：防止某个软件被刷到无法被超越 */
const MAX_SCORE = 50;

type HitMap = Record<string, number>;

function read(): HitMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: HitMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Number(v);
      if (typeof k === 'string' && k && Number.isFinite(n) && n > 0) {
        out[k] = Math.min(MAX_SCORE, Math.round(n));
      }
    }
    return out;
  } catch {
    return {};
  }
}

function write(map: HitMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // 配额满 / 无痕模式：热度退化为「没有热度」，不影响搜索本身
  }
}

/** 读取某个 key 的热度（软件 id / 工具 id / 页面 key 共用） */
export function hitScore(key: string): number {
  return read()[key] ?? 0;
}

/**
 * 记一次「真的点开了」。
 *
 * @param key 结果标识（软件 id、工具 id、页面 key）
 */
export function recordHit(key: string): void {
  if (!key) return;
  const map = read();
  map[key] = Math.min(MAX_SCORE, (map[key] ?? 0) + 1);

  // 超出上限时丢掉最冷的那些，保持文件体积可控
  const entries = Object.entries(map);
  if (entries.length > MAX_ENTRIES) {
    entries.sort((a, b) => b[1] - a[1]);
    write(Object.fromEntries(entries.slice(0, MAX_ENTRIES)));
    return;
  }
  write(map);
}

/** 清空热度记录（设置页里可能用得上） */
export function clearHits(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 忽略 */
  }
}

/**
 * 对一组已排序的结果做「同分则按热度重排」。
 *
 * 不改变相关度：只在 **score 相同** 的相邻区间内按热度排序，
 * 所以「精确命中的仍然排在模糊命中之前」这条规则不受影响。
 *
 * @param items  已按相关度排好序的数组
 * @param scoreOf  取出该项相关度分数的函数
 * @param keyOf    取出该项标识的函数
 */
export function reorderByHits<T>(
  items: T[],
  scoreOf: (item: T) => number,
  keyOf: (item: T) => string
): T[] {
  if (items.length < 2) return items;

  // 先按分数分块（相邻同分归一组）
  const blocks: T[][] = [];
  let current: T[] = [];
  let currentScore = Number.NaN;

  for (const item of items) {
    const s = scoreOf(item);
    if (Number.isNaN(currentScore) || s === currentScore) {
      current.push(item);
      currentScore = s;
    } else {
      blocks.push(current);
      current = [item];
      currentScore = s;
    }
  }
  if (current.length) blocks.push(current);

  // 每个块内按热度降序；热度相同保持原顺序（稳定排序）
  const map = read();
  const out: T[] = [];
  for (const block of blocks) {
    if (block.length < 2) {
      out.push(...block);
      continue;
    }
    const decorated = block.map((item, index) => ({
      item,
      index,
      hit: map[keyOf(item)] ?? 0
    }));
    decorated.sort((a, b) => (b.hit - a.hit) || (a.index - b.index));
    out.push(...decorated.map((d) => d.item));
  }
  return out;
}
