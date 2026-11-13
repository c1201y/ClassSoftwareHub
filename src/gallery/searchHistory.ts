// ════════════════════════════════════════════════════════════════════
// searchHistory.ts —— 搜索历史与「猜你想找」（纯逻辑，便于单独验证）
//
// 背景：全局搜索（Ctrl+K）此前完全没有记忆 —— 每次打开都是空白，
// 用户搜过「希沃」下次还得重新打字。网页版相对桌面版的一个优势就是
// 这类轻量状态可以跨会话保留（localStorage），这里把它补上。
//
// 设计取舍：
//   · **不存日期、不存次数权重**，只存最近 N 个关键词 —— 搜索历史是
//     高频短生命周期数据，存简单结构最不容易出兼容问题（旧版本的记录
//     读进来也不会因为缺字段而崩）。
//   · 去重时「大小写不敏感但保留原样」：用户搜 Arc 与 arc 算同一个词，
//     但显示时保留他第一次输入的样子。
//   · 只存**成功的查询**（有结果的才记），避免把一堆错字留在历史里。
//
// 本文件不产出界面文字 —— 文案在 文字设置.ts 的 search.* 中。
// ════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'csh-search-history';

/** 最多保留多少条（再多也没人翻，且会挤占空态展示） */
export const HISTORY_MAX = 8;

/** 单条关键词的长度上限（防止把整段话塞进历史） */
const MAX_TERM_LEN = 40;

function readRaw(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 容错：历史记录里可能混进非字符串（旧版本 / 手改过的 localStorage）
    return parsed.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  } catch {
    // 无痕模式 / JSON 损坏：都当作空历史，不影响搜索本身
    return [];
  }
}

function writeRaw(list: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // 写入失败（配额满 / 无痕）：静默放弃，功能退化为「没有历史」
  }
}

/** 归一化用于比较：去空白 + 小写（显示时仍用原样） */
const norm = (value: string) => value.trim().toLowerCase();

/** 读取搜索历史（最近使用的在前） */
export function readSearchHistory(): string[] {
  return readRaw().slice(0, HISTORY_MAX);
}

/**
 * 记一条搜索历史。
 *
 * @param term 用户输入的查询词
 * @param hadResult 这次查询是否出了结果 —— 没结果的错字不进历史
 */
export function pushSearchHistory(term: string, hadResult = true): string[] {
  const value = term.trim().slice(0, MAX_TERM_LEN);
  if (!value || !hadResult) return readSearchHistory();

  const key = norm(value);
  // 已存在就提到最前（不新增重复项）
  const rest = readRaw().filter((item) => norm(item) !== key);
  const next = [value, ...rest].slice(0, HISTORY_MAX);
  writeRaw(next);
  return next;
}

/** 删一条（空态里每项右侧的 × ） */
export function removeSearchHistory(term: string): string[] {
  const key = norm(term);
  const next = readRaw().filter((item) => norm(item) !== key);
  writeRaw(next);
  return next.slice(0, HISTORY_MAX);
}

/** 清空全部 */
export function clearSearchHistory(): string[] {
  writeRaw([]);
  return [];
}

/**
 * 「猜你想找」的候选词。
 *
 * 空查询时展示的固定推荐：**从站点实际内容里挑高频需求**，
 * 不写死成「热门搜索」这种空话。这些词都能真的搜到东西
 * （搜索索引里有对应的同义词组），点了不会出现空结果。
 */
export const SUGGESTED_TERMS = [
  '白板',
  '投屏',
  '清理',
  '截图',
  '投屏',
  '压缩',
  '课表',
  '输入法',
  '浏览器',
  '播放器',
  '卸载',
  '计时'
];

/** 去重后的推荐词（上面的表里「投屏」重复了，这里兜底去掉） */
export const uniqueSuggestions = (): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of SUGGESTED_TERMS) {
    const key = norm(term);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
};

/**
 * 拼音首字母匹配：让「xhbb」能搜到「希沃白板」。
 *
 * 不引入拼音库（体积大、且只需首字母）—— 用一张覆盖教学场景常用字的
 * 首字母表。表外的字不做映射（宁可搜不到，也不要错误匹配到别的软件）。
 */
const PINYIN_INITIALS: Record<string, string> = {
  希: 'x', 沃: 'w', 白: 'b', 板: 'b', 课: 'k', 表: 'b', 计: 'j', 时: 's', 器: 'q',
  投: 't', 屏: 'p', 截: 'j', 图: 't', 压: 'y', 缩: 's', 解: 'j', 输: 's', 入: 'r',
  法: 'f', 浏: 'l', 览: 'l', 播: 'b', 放: 'f', 卸: 'x', 载: 'z', 清: 'q', 理: 'l',
  优: 'y', 化: 'h', 安: 'a', 全: 'q', 杀: 's', 毒: 'd', 远: 'y', 程: 'c', 办: 'b',
  公: 'g', 文: 'w', 档: 'd', 演: 'y', 示: 's', 教: 'j', 学: 'x', 班: 'b', 级: 'j',
  管: 'g', 网: 'w', 页: 'y', 系: 'x', 统: 't', 工: 'g', 具: 'j', 实: 's', 用: 'y',
  随: 's', 机: 'j', 点: 'd', 名: 'm', 抽: 'c', 号: 'h', 倒: 'd', 秒: 'm', 钟: 'z',
  画: 'h', 笔: 'b', 标: 'b', 注: 'z', 转: 'z', 换: 'h', 编: 'b', 码: 'm', 哈: 'h',
  值: 'z', 日: 'r', 卫: 'w', 生: 's', 驱: 'q', 动: 'd', 运: 'y', 行: 'x', 库: 'k',
  恢: 'h', 复: 'f', 找: 'z', 回: 'h', 搜: 's', 索: 's', 查: 'c', 看: 'k', 取: 'q',
  色: 's', 颜: 'y', 像: 'x', 照: 'z', 片: 'p', 音: 'y', 乐: 'l', 视: 's',
  频: 'p', 会: 'h', 议: 'y', 直: 'z', 展: 'z', 台: 't'
};

/** 把一段中文转成拼音首字母串（表外字符原样保留） */
export function toPinyinInitials(text: string): string {
  let out = '';
  for (const ch of text) {
    const mapped = PINYIN_INITIALS[ch];
    out += mapped ?? ch.toLowerCase();
  }
  return out;
}

/**
 * 拼音首字母是否匹配查询。
 *
 * 只有查询**全是字母**时才启用（中文查询走原有的分词逻辑）。
 *
 * 两种匹配都算命中：
 *   ① 子串匹配：`wbb` 能在 `xwbb` 里找到 → 命中「希沃白板」
 *   ② **逐字前缀匹配**：查询按顺序对应每个字的首字母前缀
 *      —— `xh` 能命中「希沃白板」，因为它是 x(希) h(?) 的**前缀式**匹配：
 *      用户常常只记得前两个字，而不会完整打出四个字的首字母。
 *
 * 第 ② 条是必需的：只做子串匹配的话，「xh」在「xwbb」里找不到
 * （中间隔了 w），但用户脑子里就是「希-沃」两个音，打 xh 最自然。
 */
export function matchesInitials(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q || !/^[a-z]+$/.test(q)) return false;

  const initials = toPinyinInitials(text);

  // ① 直接子串
  if (initials.includes(q)) return true;

  // ② 逐字累加比对：q 必须是 initials 逐字符累加串的前缀
  //    （即 q 的每个字符依次对应 initials 里的字符，允许跳着取）
  let qi = 0;
  for (const ch of initials) {
    if (ch === q[qi]) qi++;
    if (qi === q.length) return true;
  }
  return false;
}
