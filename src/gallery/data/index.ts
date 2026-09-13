// ════════════════════════════════════════════════════════════════════
// 软件数据加载器（类型化入口）
// ⚠️ 日常维护【不要】改本文件！
//   · 软件数据在【项目根目录】的「软件数据」文件夹：
//       软件数据/apps/<软件id>.json   ← 一个软件一个文件
//       软件数据/categories.json     ← 分类
//       软件数据/README-维护手册.md   ← 先读它！
//   · 全站文字在根目录 文字设置.ts
//
// ★ 容错加载：某个软件文件写坏了【不会】影响整个网站 ——
//   好的文件照常显示，坏文件被跳过，并在页面顶部红条里列出：
//   哪个文件出错、一共几个、大概错在哪一行（dataLoadIssues）。
// ════════════════════════════════════════════════════════════════════
import categoriesRaw from '../../../软件数据/categories.json?raw';

export interface DownloadCategory {
  key: string;
  name: string;
  icon: string;
}

export interface DownloadItem {
  platform: string;
  note?: string;
  size?: string;
  url?: string;
}

export interface SoftwareApp {
  id: string;
  name: string;
  icon?: string;
  category: string;
  tagline?: string;
  description?: string;
  version?: string;
  size?: string;
  system?: string;
  website?: string;
  github?: string;
  /** 更新提示（可选）：更新频繁 / 链接易失效的软件，在详情页下载区上方显示一条提示 */
  notice?: string;
  /** 应用商店链接（可选）：如 Microsoft Store 网页地址，详情页会给一个"商店下载"入口 */
  store?: string;
  downloads?: DownloadItem[];
  /** 维护者给自己看的备注（来自 JSON 里的"维护备注"字段），网页不显示 */
  maintainerNote?: string;
}

/** 某个数据文件读取失败的信息（顶部红条用） */
export interface DataLoadIssue {
  /** 文件名，如 7-zip.json */
  file: string;
  /** 大概出错行号（能算出来时才有） */
  line?: number;
  /** 给维护者看的中文提示 */
  message: string;
  /** 浏览器原始报错（红条里鼠标悬停可看） */
  detail?: string;
}

/** apps/*.json 里的原始对象（可能带额外字段，如 sort / 维护备注） */
type RawApp = Record<string, unknown> & { sort?: number };

// 以“纯文本”方式收集全部软件文件（不做构建期解析 —— 写坏也不影响打包/启动）
const appModules = import.meta.glob('../../../软件数据/apps/*.json', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

/** 数据加载问题清单：由 App.vue 顶部红条展示 */
export const dataLoadIssues: DataLoadIssue[] = [];

function parseJson(text: string): { ok: true; value: unknown } | { ok: false; line?: number; raw: string } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    // 从浏览器报错里尽量抠出行号/位置
    const lineMatch = raw.match(/line (\d+)/);
    let line = lineMatch ? Number(lineMatch[1]) : undefined;
    if (line === undefined) {
      const posMatch = raw.match(/position (\d+)/);
      if (posMatch) {
        const before = text.slice(0, Number(posMatch[1]));
        line = before.split('\n').length;
      }
    }
    return { ok: false, line, raw };
  }
}

/** 把浏览器报错翻译成人话 */
function friendlyHint(raw: string): string {
  if (raw.includes('Unexpected end of JSON input')) return '文件不完整：可能漏了结尾的 } 或 ]，或末尾多了逗号';
  if (raw.includes('Unterminated string')) return '引号没闭合：字符串少了一个英文双引号 "';
  if (raw.includes('non-whitespace') || raw.includes('Expected') || raw.includes('Unexpected token') || raw.includes('Unexpected string'))
    return '标点/引号有误：常见是字段之间漏了英文逗号，或引号、冒号没配对';
  if (raw.includes('Bad control character')) return '内容里混入了非法控制字符（换行请写在引号外）';
  if (raw.includes('number')) return '数字写法不对';
  return 'JSON 语法错误';
}

const PICK = [
  'id',
  'name',
  'icon',
  'category',
  'tagline',
  'description',
  'version',
  'size',
  'system',
  'website',
  'github',
  'notice',
  'store',
  'downloads',
] as const;

function toApp(raw: RawApp): SoftwareApp {
  const app = {} as SoftwareApp;
  for (const key of PICK) {
    const value = raw[key];
    if (value !== undefined && value !== null && value !== '') {
      (app as unknown as Record<string, unknown>)[key] = value;
    }
  }
  const note = raw['维护备注'];
  if (typeof note === 'string' && note.trim()) app.maintainerNote = note.trim();
  return app;
}

// ── 逐个容错解析 apps/*.json ──────────────────────────────
const parsedApps: { raw: RawApp; file: string }[] = [];
const seenIds = new Map<string, string>();

for (const [filePath, text] of Object.entries(appModules)) {
  const file = filePath.split('/').pop() ?? filePath;
  if (file.startsWith('_')) continue; // 模板/说明文件不参与加载

  const result = parseJson(text);
  if (!result.ok) {
    dataLoadIssues.push({ file, line: result.line, message: friendlyHint(result.raw), detail: result.raw });
    continue;
  }
  const value = result.value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    dataLoadIssues.push({ file, message: '文件最外层不是 { } 对象（可能整体被方括号或引号包住了）' });
    continue;
  }
  const obj = value as RawApp;
  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  if (!id || !name) {
    dataLoadIssues.push({
      file,
      message: '缺少必填字段：id（英文小写标识）或 name（软件名称）',
      detail: `当前 id=${JSON.stringify(obj.id)} name=${JSON.stringify(obj.name)}`,
    });
    continue;
  }
  if (seenIds.has(id)) {
    dataLoadIssues.push({
      file,
      message: `id 重复：与 ${seenIds.get(id)} 里的 id 相同（id 必须全站唯一），本文件已跳过`,
    });
    continue;
  }
  seenIds.set(id, file);
  parsedApps.push({ raw: obj, file });
}

// 按 JSON 里的 sort 数字保持原始排列顺序（数字小的在前）
parsedApps.sort(
  (a, b) =>
    (typeof a.raw.sort === 'number' ? a.raw.sort : Number.MAX_SAFE_INTEGER) -
    (typeof b.raw.sort === 'number' ? b.raw.sort : Number.MAX_SAFE_INTEGER)
);

/** 全部软件（坏文件已自动跳过） */
export const apps: SoftwareApp[] = parsedApps.map((entry) => toApp(entry.raw));

// ── 分类（容错：categories.json 坏了就用软件里出现的分类临时顶替）──
function parseCategories(): DownloadCategory[] | null {
  const result = parseJson(categoriesRaw);
  if (!result.ok) return null;
  const value = result.value;
  if (!Array.isArray(value)) return null;
  const list: DownloadCategory[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null;
    const o = item as Record<string, unknown>;
    if (typeof o.key !== 'string' || typeof o.name !== 'string') return null;
    list.push({ key: o.key, name: o.name, icon: typeof o.icon === 'string' ? o.icon : '' });
  }
  return list.length > 0 ? list : null;
}

let categoriesData = parseCategories();
if (!categoriesData) {
  // 兜底：从软件数据里现推分类（名称暂时显示为英文 key）
  categoriesData = [];
  for (const app of apps) {
    if (app.category && !categoriesData.some((c) => c.key === app.category)) {
      categoriesData.push({ key: app.category, name: app.category, icon: '' });
    }
  }
  dataLoadIssues.push({
    file: 'categories.json',
    message: '分类文件没读进来，已用软件里出现的分类临时顶替（名称显示为英文 key），请检查 软件数据/categories.json 语法',
  });
}

/** 全部分类（左侧导航按此渲染） */
export const categories: DownloadCategory[] = categoriesData;

/** 按 id 查找软件（id 即网址 #/download/<id> 中的 id） */
export const findAppById = (id: string): SoftwareApp | undefined =>
  apps.find((app) => app.id === id);

/** 分类 key → 分类显示名 */
export const categoryName = (key: string): string =>
  categories.find((category) => category.key === key)?.name ?? key;
