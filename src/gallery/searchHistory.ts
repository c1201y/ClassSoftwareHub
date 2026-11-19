
import type { Locale } from '../components/i18n/index';

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
const SUGGESTED_ZH = [
  '白板',
  '投屏',
  '清理',
  '截图',
  '压缩',
  '课表',
  '输入法',
  '浏览器',
  '播放器',
  '卸载',
  '计时',
  '二维码'
];
const SUGGESTED_EN = [
  'whiteboard',
  'screen mirroring',
  'cleanup',
  'screenshot',
  'compress',
  'timetable',
  'input method',
  'browser',
  'player',
  'uninstall',
  'timer',
  'QR code'
];

/** 按语言返回去重后的推荐词（同一组里重复项也一并去掉） */
export const suggestedTerms = (locale: Locale = 'zh-CN'): string[] => {
  const source = locale === 'en-US' ? SUGGESTED_EN : SUGGESTED_ZH;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const term of source) {
    const key = norm(term);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }
  return out;
};
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
