import categoriesRaw from '../../../软件数据/categories.json?raw';
import platformsRaw from '../../../软件数据/platforms.json?raw';
import type { Locale } from '../../components/i18n/index';
import { gt } from '../localize';
import { DOWNLOAD_TEXT_EN } from '../downloadI18n';

export interface DownloadCategory {
  key: string;
  name: string;
  /** 英文显示名（英文界面用；省略时回退 name） */
  nameEn?: string;
  icon: string;
}

export interface SoftwarePlatformVersion {
  key: string;
  name: string;
  /** 英文显示名（省略时回退 name） */
  nameEn?: string;
}

export interface SoftwarePlatform {
  key: string;
  name: string;
  /** 英文显示名（英文界面用；省略时回退 name） */
  nameEn?: string;
  /** 投稿页二级菜单里的版本选项（老到新排序）；首页筛选不使用 */
  versions?: SoftwarePlatformVersion[];
  /** true = 版本是数字区间（可显示「Windows 10+」）；false/省略 = 发行版清单，逐一列出 */
  versionRange?: boolean;
}

export interface DownloadItem {
  platform: string;
  /** 英文平台名（英文界面用；省略时回退 platform） */
  platformEn?: string;
  /** 中文平台名（数据原文是英文时用；省略时回退 platform） */
  platformZh?: string;
  note?: string;
  /** 英文补充说明（省略时回退 note） */
  noteEn?: string;
  /** 中文补充说明（数据原文是英文时用；省略时回退 note） */
  noteZh?: string;
  size?: string;
  /** 中文体积文案（数据原文是英文时用；省略时回退 size） */
  sizeZh?: string;
  /** 校验值（可选）：只写十六进制，算法按长度识别（64=SHA-256 / 128=SHA-512 等）。
      详情页只显示首尾几位，点一下可复制完整值。 */
  hash?: string;
  kind?: 'file' | 'store' | 'netdisk' | 'page';
  url?: string;
}

export interface SoftwareApp {
  id: string;
  name: string;
  /** 英文显示名（英文界面用；省略时回退 name） */
  nameEn?: string;
  /** 中文显示名（数据原文是英文时用；省略时回退 name） */
  nameZh?: string;
  icon?: string;
  category: string;
  tagline?: string;
  taglineEn?: string;
  taglineZh?: string;
  description?: string;
  descriptionEn?: string;
  descriptionZh?: string;
  version?: string;
  versionEn?: string;
  versionZh?: string;
  size?: string;
  sizeEn?: string;
  sizeZh?: string;
  system?: string;
  systemEn?: string;
  systemZh?: string;
  /** 支持运行的系统（platforms.json 里的 key），只用于筛选；展示仍用 system 原文 */
  platforms?: string[];
  website?: string;
  github?: string;
  author?: string;
  authorEn?: string;
  authorZh?: string;
  license?: string;
  licenseEn?: string;
  licenseZh?: string;
  /** 更新提示（可选）：更新频繁 / 链接易失效的软件，在详情页下载区上方显示一条提示 */
  notice?: string;
  noticeEn?: string;
  noticeZh?: string;
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
  if (raw.includes('Unexpected end of JSON input')) return gt('data.issue.json-incomplete');
  if (raw.includes('Unterminated string')) return gt('data.issue.unterminated-string');
  if (raw.includes('non-whitespace') || raw.includes('Expected') || raw.includes('Unexpected token') || raw.includes('Unexpected string'))
    return gt('data.issue.syntax');
  if (raw.includes('Bad control character')) return gt('data.issue.control-char');
  if (raw.includes('number')) return gt('data.issue.number');
  return gt('data.issue.json');
}

const PICK = [
  'id',
  'name',
  'nameEn',
  'nameZh',
  'icon',
  'category',
  'tagline',
  'taglineEn',
  'taglineZh',
  'description',
  'descriptionEn',
  'descriptionZh',
  'version',
  'versionEn',
  'versionZh',
  'size',
  'sizeEn',
  'sizeZh',
  'system',
  'systemEn',
  'systemZh',
  'platforms',
  'website',
  'github',
  'author',
  'authorEn',
  'authorZh',
  'license',
  'licenseEn',
  'licenseZh',
  'notice',
  'noticeEn',
  'noticeZh',
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
    dataLoadIssues.push({ file, message: gt('data.issue.not-object') });
    continue;
  }
  const obj = value as RawApp;
  const id = typeof obj.id === 'string' ? obj.id.trim() : '';
  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  if (!id || !name) {
    dataLoadIssues.push({
      file,
      message: gt('data.issue.missing-fields'),
      detail: gt('data.issue.missing-fields-detail', {
        id: JSON.stringify(obj.id),
        name: JSON.stringify(obj.name)
      }),
    });
    continue;
  }
  if (seenIds.has(id)) {
    dataLoadIssues.push({
      file,
      message: gt('data.issue.duplicate-id', { file: seenIds.get(id) ?? '' }),
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
    const entry: DownloadCategory = { key: o.key, name: o.name, icon: typeof o.icon === 'string' ? o.icon : '' };
    if (typeof o.nameEn === 'string' && o.nameEn.trim()) entry.nameEn = o.nameEn.trim();
    list.push(entry);
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
    message: gt('data.issue.categories'),
  });
}

/** 全部分类（左侧导航按此渲染） */
export const categories: DownloadCategory[] = categoriesData;

// ── 平台（容错：platforms.json 坏了就不显示「系统」筛选，软件照常展示）──
function parsePlatforms(): SoftwarePlatform[] {
  const result = parseJson(platformsRaw);
  if (!result.ok || !Array.isArray(result.value)) {
    dataLoadIssues.push({
      file: 'platforms.json',
      message: gt('data.issue.platforms'),
    });
    return [];
  }
  const list: SoftwarePlatform[] = [];
  for (const item of result.value) {
    if (typeof item !== 'object' || item === null) continue;
    const o = item as Record<string, unknown>;
    if (typeof o.key !== 'string' || typeof o.name !== 'string') continue;
    const platform: SoftwarePlatform = { key: o.key, name: o.name };
    if (typeof o.nameEn === 'string' && o.nameEn.trim()) platform.nameEn = o.nameEn.trim();
    if (Array.isArray(o.versions)) {
      const versions: SoftwarePlatformVersion[] = [];
      for (const raw of o.versions) {
        if (typeof raw !== 'object' || raw === null) continue;
        const v = raw as Record<string, unknown>;
        if (typeof v.key === 'string' && typeof v.name === 'string') {
          const version: SoftwarePlatformVersion = { key: v.key, name: v.name };
          if (typeof v.nameEn === 'string' && v.nameEn.trim()) version.nameEn = v.nameEn.trim();
          versions.push(version);
        }
      }
      if (versions.length) platform.versions = versions;
    }
    if (o.versionRange === true) platform.versionRange = true;
    list.push(platform);
  }
  return list;
}

/** 支持的系统（首页「系统」下拉） */
export const platforms: SoftwarePlatform[] = parsePlatforms();

/** 按 id 查找软件（id 即网址 #/download/<id> 中的 id） */
export const findAppById = (id: string): SoftwareApp | undefined =>
  apps.find((app) => app.id === id);

/** 分类 key → 分类显示名（英文界面优先用 nameEn） */
export const categoryName = (key: string, locale: Locale = 'zh-CN'): string => {
  const category = categories.find((item) => item.key === key);
  if (!category) return key;
  return locale === 'en-US' ? (category.nameEn ?? category.name) : category.name;
};

/** 系统显示名（英文界面优先用 nameEn） */
export const platformName = (platform: SoftwarePlatform, locale: Locale = 'zh-CN'): string =>
  locale === 'en-US' ? (platform.nameEn ?? platform.name) : platform.name;

/** 系统版本显示名（英文界面优先用 nameEn） */
export const platformVersionName = (version: SoftwarePlatformVersion, locale: Locale = 'zh-CN'): string =>
  locale === 'en-US' ? (version.nameEn ?? version.name) : version.name;

const localized = (base: string | undefined, zh: string | undefined, en: string | undefined, locale: Locale): string =>
  locale === 'en-US' ? (en || base || '') : (zh || base || '');

/** 软件显示名（英文界面优先 nameEn，中文界面优先 nameZh） */
export const appName = (app: SoftwareApp, locale: Locale = 'zh-CN'): string =>
  localized(app.name, app.nameZh, app.nameEn, locale);

export const appTagline = (app: SoftwareApp, locale: Locale = 'zh-CN'): string =>
  localized(app.tagline, app.taglineZh, app.taglineEn, locale);

export const appDescription = (app: SoftwareApp, locale: Locale = 'zh-CN'): string =>
  localized(app.description, app.descriptionZh, app.descriptionEn, locale);

export const appSystem = (app: SoftwareApp, locale: Locale = 'zh-CN'): string =>
  localized(app.system, app.systemZh, app.systemEn, locale);

const AUTHOR_EN: Record<string, string> = {
  '希沃（视源股份）': 'Seewo (CVTE)',
  'MAXHUB（视源股份）': 'MAXHUB (CVTE)',
  '阿里巴巴': 'Alibaba',
  '腾讯': 'Tencent',
  '网易': 'NetEase',
  '金山办公': 'Kingsoft Office',
  '系统总裁': 'System CEO',
  '火绒': 'Huorong',
  '青岛飞扬': 'Qingdao Feiyang',
  'Oray（贝锐）': 'Oray (Beirui)',
  '哔哩哔哩': 'Bilibili',
  '海康威视': 'Hikvision'
};

const LICENSE_EN: Record<string, string> = {
  'Source Available（非开源）': 'Source Available (not open source)',
  'GPL-2.0（含 Classpath 例外）': 'GPL-2.0 (with Classpath exception)'
};

const translateVersion = (version: string): string => {
  const updated = version.match(/^上次更新日期\s+(.+)$/);
  if (updated) return `Last updated ${updated[1]}`;
  if (version === '随商店更新' || version === '跟随商店更新') return 'Updates with the Store';
  if (version === '随系统更新') return 'Updates with Windows';
  if (version === '跟随官网') return 'Always latest from the official site';
  if (version === '5.x（以安装时官网版本为准）') return '5.x (version determined by the official site at install time)';
  return version;
};

export const appVersion = (app: SoftwareApp, locale: Locale = 'zh-CN'): string =>
  locale === 'en-US'
    ? (app.versionEn || (app.version ? translateVersion(app.version) : ''))
    : (app.versionZh || app.version || '');

export const appSize = (app: SoftwareApp, locale: Locale = 'zh-CN'): string =>
  locale === 'en-US'
    ? (app.sizeEn || (app.size ? translateDownloadText(app.size, '') : ''))
    : (app.sizeZh || app.size || '');

export const appAuthor = (app: SoftwareApp, locale: Locale = 'zh-CN'): string =>
  locale === 'en-US'
    ? (app.authorEn || (app.author ? (AUTHOR_EN[app.author] ?? app.author) : ''))
    : (app.authorZh || app.author || '');

export const appLicense = (app: SoftwareApp, locale: Locale = 'zh-CN'): string =>
  locale === 'en-US'
    ? (app.licenseEn || (app.license ? (LICENSE_EN[app.license] ?? app.license) : ''))
    : (app.licenseZh || app.license || '');

export const appNotice = (app: SoftwareApp, locale: Locale = 'zh-CN'): string =>
  localized(app.notice, app.noticeZh, app.noticeEn, locale);

/** 下载项里的常见中文标签：整句优先，其次按词替换，仍有中文则回退为通用文案 */
const DOWNLOAD_EXACT: Record<string, string> = {
  '网页': 'Web page',
  '官网页面': 'Official page',
  '视版本而定': 'Varies by version',
  '视版本变化': 'Varies by version',
  '未知': 'Unknown',
  'Windows 安装版': 'Windows installer',
  'Windows x64 安装版': 'Windows x64 installer',
  'Windows x86 安装版': 'Windows x86 installer',
  'Windows ARM64 安装版': 'Windows ARM64 installer',
  'Windows 64位 安装版': 'Windows 64-bit installer',
  'Windows 32位 安装版': 'Windows 32-bit installer',
  'Windows x64 便携版': 'Windows x64 portable',
  'Windows 64位 便携版': 'Windows 64-bit portable',
  'Windows 安装包': 'Windows installer',
  'Windows 压缩包': 'Windows archive',
  '官网下载页': 'Official download page',
  '官方下载页': 'Official download page',
  '官网下载': 'Official download',
  '官方网站': 'Official website',
  '官方链接': 'Official link',
  '官方网页': 'Official web page',
  '官方安装网站': 'Official installer page',
  '官方单文件包': 'Official single-file package',
  '通过 Microsoft Store 下载': 'Download from Microsoft Store',
  '通用 Microsoft Store 安装': 'Install from Microsoft Store',
  'Android（APK）': 'Android (APK)',
  'Android ARM64（APK）': 'Android ARM64 (APK)',
  'Android x86（APK）': 'Android x86 (APK)',
  'Android x64（APK）': 'Android x64 (APK)',
  'Android 通用（APK）': 'Android universal (APK)',
  'Linux x64（.deb）': 'Linux x64 (.deb)',
  'Linux ARM64（.deb）': 'Linux ARM64 (.deb)',
  'Linux x64（.rpm）': 'Linux x64 (.rpm)',
  'Linux ARM64（.rpm）': 'Linux ARM64 (.rpm)',
  'Linux x64（AppImage）': 'Linux x64 (AppImage)',
  'Linux ARM64（AppImage）': 'Linux ARM64 (AppImage)',
  'Linux x64 便携版': 'Linux x64 portable',
  'Linux ARM64 便携版': 'Linux ARM64 portable',
  'Linux x64 压缩包': 'Linux x64 archive',
  'macOS（Apple 芯片）（磁盘映像）': 'macOS (Apple silicon) (disk image)',
  'macOS（Intel）（磁盘映像）': 'macOS (Intel) (disk image)',
  'macOS（磁盘映像）': 'macOS (disk image)',
  'macOS（Apple 芯片）': 'macOS (Apple silicon)',
  'macOS（Intel）': 'macOS (Intel)',
  '全部平台 / 更多版本': 'All platforms / more versions',
  '全平台 / 更多版本': 'All platforms / more versions',
  '其他 压缩包': 'Other archive',
  '其他 便携版': 'Other portable',
  '其他 MSIXBUNDLE': 'Other MSIX bundle',
  '其他 APPINSTALLER': 'Other app installer',
  '其他 LZMS': 'Other LZMS package',
  '其他 XML': 'Other XML',
  '其他 x64 压缩包': 'Other x64 archive',
  '其他 x64 便携版': 'Other x64 portable',
  '其他 x86 APPX': 'Other x86 APPX',
  '其他 x64 APPX': 'Other x64 APPX',
  '安卓': 'Android',
  '网盘下载(官方下载链接)': 'Cloud drive (official link)',
  '123云盘': '123 Cloud Drive',
  '百度网盘': 'Baidu Netdisk',
  '夸克网盘': 'Quark Drive',
  '官方完整版': 'Official full edition',
  '官方组合版': 'Official combined edition',
  '官方基础版': 'Official basic edition',
  '官方固定文件名地址，每次都指向最新版': 'Official fixed-name URL that always points to the latest version',
  '官网下载页面': 'Official download page'
};

const DOWNLOAD_TOKENS: [RegExp, string][] = [
  [/通过 Microsoft Store 下载/g, 'Download from Microsoft Store'],
  [/通用 Microsoft Store 安装/g, 'Install from Microsoft Store'],
  [/Microsoft Store/g, 'Microsoft Store'],
  [/磁盘映像/g, 'disk image'],
  [/离线完整安装包/g, 'offline full installer'],
  [/离线安装包/g, 'offline installer'],
  [/离线包/g, 'offline package'],
  [/在线安装包/g, 'online installer'],
  [/在线包/g, 'online package'],
  [/解压后/g, 'after extraction'],
  [/未解压/g, 'before extraction'],
  [/运行时/g, 'runtime'],
  [/离线安装版/g, 'offline installer'],
  [/在线安装版/g, 'online installer'],
  [/安装版/g, 'installer'],
  [/安装包/g, 'installer'],
  [/安装器/g, 'installer'],
  [/便携版/g, 'portable'],
  [/便携/g, 'portable'],
  [/完整/g, 'full'],
  [/轻量/g, 'lite'],
  [/全部平台/g, 'all platforms'],
  [/全平台/g, 'all platforms'],
  [/更多/g, 'more'],
  [/文件夹/g, 'folder'],
  [/单文件版/g, 'single-file'],
  [/单文件/g, 'single-file'],
  [/绿色版/g, 'portable'],
  [/压缩包/g, 'archive'],
  [/在线安装/g, 'online installer'],
  [/离线安装/g, 'offline installer'],
  [/离线版/g, 'offline edition'],
  [/在线版/g, 'online edition'],
  [/完整版/g, 'full edition'],
  [/精简版/g, 'lite edition'],
  [/增强版/g, 'enhanced edition'],
  [/标准版/g, 'standard edition'],
  [/专业版/g, 'pro edition'],
  [/企业版/g, 'enterprise edition'],
  [/教育版/g, 'education edition'],
  [/正式版/g, 'stable release'],
  [/测试版/g, 'beta'],
  [/预览版/g, 'preview'],
  [/万能网卡版/g, 'universal network edition'],
  [/网卡版/g, 'network edition'],
  [/单文件版/g, 'single-file'],
  [/官方直链/g, 'official direct link'],
  [/官方下载/g, 'official download'],
  [/官方/g, 'official'],
  [/官网下载页/g, 'official download page'],
  [/官网/g, 'official site'],
  [/下载页/g, 'download page'],
  [/下载页面/g, 'download page'],
  [/网页版/g, 'web version'],
  [/网页/g, 'web page'],
  [/压缩包/g, 'archive'],
  [/32\s*位/g, '32-bit'],
  [/64\s*位/g, '64-bit'],
  [/arm64/gi, 'ARM64'],
  [/含运行时/g, 'with runtime'],
  [/自带运行时/g, 'with runtime'],
  [/前置运行时/g, 'runtime prerequisite'],
  [/当前用户/g, 'current user'],
  [/全机器/g, 'all users'],
  [/管理员/g, 'administrator'],
  [/免安装/g, 'no installation'],
  [/解压即用/g, 'extract and run'],
  [/双击安装/g, 'double-click to install'],
  [/批量/g, 'batch '],
  [/静默/g, 'silent '],
  [/部署/g, 'deployment'],
  [/适用于/g, 'for '],
  [/推荐/g, 'recommended'],
  [/老机器/g, 'older PCs'],
  [/老旧/g, 'older '],
  [/使用/g, 'use '],
  [/选这个/g, 'choose this'],
  [/下载/g, 'download'],
  [/加速/g, 'accelerated'],
  [/提取码/g, 'code'],
  [/蓝奏云/g, 'Lanzou Cloud'],
  [/百度网盘/g, 'Baidu Netdisk'],
  [/123\s*云盘/g, '123 Cloud Drive'],
  [/夸克网盘/g, 'Quark Drive'],
  [/版本/g, 'version'],
  [/最新版/g, 'latest version'],
  [/始终最新/g, 'always latest'],
  [/当前版本/g, 'current version'],
  [/官方最新地址/g, 'official latest URL'],
  [/固定地址/g, 'fixed URL'],
  [/源/g, 'source'],
  [/约\s*/g, '~ '],
  [/未知/g, 'Unknown'],
  [/视平台/g, 'platform-dependent'],
  [/视版本而定/g, 'varies by version'],
  [/视版本变化/g, 'varies by version'],
  [/（未压缩）/g, ' (uncompressed)'],
  [/未压缩/g, 'uncompressed'],
  [/离线完整安装包/g, 'offline full installer'],
  [/在线只有/g, 'online is only '],
  [/在线版/g, 'online edition'],
  [/万能网卡版/g, 'universal network edition'],
  [/不含/g, 'without '],
  [/这是/g, 'this is '],
  [/，/g, ', '],
  [/、/g, ', '],
  [/：/g, ': '],
  [/；/g, '; '],
  [/（/g, ' ('],
  [/）/g, ')'],
];

const CJK_TEXT = /[\u4e00-\u9fff]/;

const translateDownloadText = (text: string, fallback: string): string => {
  if (DOWNLOAD_TEXT_EN[text]) return DOWNLOAD_TEXT_EN[text];
  if (DOWNLOAD_EXACT[text]) return DOWNLOAD_EXACT[text];
  if (!CJK_TEXT.test(text)) return text;
  let out = text;
  for (const [pattern, value] of DOWNLOAD_TOKENS) out = out.replace(pattern, value);
  out = out.replace(/\s+/g, ' ').replace(/\s+\)/g, ')').replace(/\(\s+/g, '(').trim();
  return CJK_TEXT.test(out) ? fallback : out;
};

export const downloadPlatformName = (download: DownloadItem, locale: Locale = 'zh-CN'): string =>
  locale === 'en-US'
    ? (download.platformEn || translateDownloadText(download.platform, 'Download'))
    : (download.platformZh || download.platform);

export const downloadNote = (download: DownloadItem, locale: Locale = 'zh-CN'): string =>
  locale === 'en-US'
    ? (download.noteEn || (download.note ? translateDownloadText(download.note, '') : ''))
    : (download.noteZh || download.note || '');

export const downloadSize = (download: DownloadItem, locale: Locale = 'zh-CN'): string =>
  locale === 'en-US'
    ? (download.size ? translateDownloadText(download.size, '') : '')
    : (download.sizeZh || download.size || '');
