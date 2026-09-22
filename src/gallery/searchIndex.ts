// ════════════════════════════════════════════════════════════════════
// 全站搜索索引 —— 标题栏搜索（Ctrl + K）面板的数据源
//
// 搜索范围（四类，结果按类别分组显示）：
//   ① 软件    软件名 / 一句话简介 / 详细介绍（数据在 软件数据/apps/）
//   ② 内置工具 工具名 / 说明 / 分组名（注册表在 src/gallery/tools/index.ts）
//   ③ AI 导航 站点名 / 说明 / 域名（清单在根目录 AI导航文本.ts）
//   ④ 页面    首页 / 内置工具 / AI 导航 / 提交软件 / 反馈中心 / 设置
//
// 规则：不知道软件叫什么、只记得“它是干嘛的”也能搜到 ——
//       名称命中的结果排在同组的简介命中之前；组内不超过 limit 条。
// 文案：结果里的分组名、来源称呼、提示语都在根目录 文字设置.ts 的 search.* 键，
//       本文件只管匹配逻辑，日常维护【不要】改这里。
// ════════════════════════════════════════════════════════════════════
import { apps, categoryName } from './data';
import { TOOLS } from './tools';
import aiNav from '../../AI导航文本';

/** 结果类别 */
export type GlobalHitKind = 'app' | 'tool' | 'ai' | 'page';

export interface GlobalHit {
  kind: GlobalHitKind;
  /** 同一类别内的去重键（软件 id / 工具 id / 站点地址 / 页面路由名） */
  key: string;
  title: string;
  subtitle: string;
  /** 右侧小字：软件=分类名，工具=分组名，AI=域名，页面=打开方式 */
  badge: string;
  /** 软件里图标字体的图标（工具、页面用），或站点色块的首字提示 */
  icon?: string;
  /** 站点内的跳转目标（软件详情页、工具页、普通页面） */
  route?: { name: string; params?: Record<string, string> };
  /** 站外地址（AI 导航的站点） */
  url?: string;
  /** AI 站点色块用的主题色（AI导航文本.ts 里的 color，可能为空） */
  color?: string;
  /** 软件命中来源：name = 名称命中；intro = 简介/介绍命中 */
  source?: 'name' | 'intro';
}

export interface GlobalGroup {
  kind: GlobalHitKind;
  hits: GlobalHit[];
}

/** 页面类结果的注册表（标题与说明都是文案 key，见 文字设置.ts 的 search.page-*） */
interface SearchPageDef {
  key: string;
  route: string;
  titleKey: string;
  descKey: string;
  icon: string;
  /** 额外匹配词（中英都放，方便只记得英文/拼音时也能搜到） */
  keywords: string;
}

const SEARCH_PAGES: SearchPageDef[] = [
  {
    key: 'home',
    route: 'home',
    titleKey: 'search.page-home',
    descKey: 'search.page-home-desc',
    icon: '\uE80F',
    keywords: 'home 首页 主页 全部软件 start'
  },
  {
    key: 'tools',
    route: 'tools',
    titleKey: 'search.page-tools',
    descKey: 'search.page-tools-desc',
    icon: '\uEC7A',
    keywords: 'tools 工具 内置工具 小工具 计时器 二维码 取色'
  },
  {
    key: 'ai',
    route: 'ai',
    titleKey: 'search.page-ai',
    descKey: 'search.page-ai-desc',
    icon: '\uE99A',
    keywords: 'ai 人工智能 大模型 导航 chatgpt deepseek'
  },
  {
    key: 'submit',
    route: 'submit',
    titleKey: 'search.page-submit',
    descKey: 'search.page-submit-desc',
    icon: '\uE11C',
    keywords: 'submit 提交 投稿 收录 添加软件'
  },
  {
    key: 'feedback',
    route: 'feedback',
    // 图标 E7BA(警告三角)——与左侧导航栏「反馈中心」用同一个字形
    titleKey: 'search.page-feedback',
    descKey: 'search.page-feedback-desc',
    icon: '\uE7BA',
    keywords: 'feedback 反馈 报错 出错 问题 bug 建议 意见 issue 修正 有误 失效 打不开'
  },
  {
    key: 'settings',
    route: 'settings',
    titleKey: 'search.page-settings',
    descKey: 'search.page-settings-desc',
    icon: '\uE713',
    keywords: 'settings 设置 主题 外观 深色 浅色 材质 关于'
  }
];

const normalize = (value: string) => value.trim().toLowerCase();

/** 一句话简介太长时截断（卡片只显示一行，避免白白拼一个长字符串） */
const clip = (value: string, max = 90) => {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

/** ① 软件：名称命中的排前面，简介/介绍命中排后面 */
export const searchApps = (query: string, limit = 5): GlobalHit[] => {
  const q = normalize(query);
  if (!q) return [];
  const nameHits: GlobalHit[] = [];
  const introHits: GlobalHit[] = [];
  const makeHit = (app: (typeof apps)[number], source: 'name' | 'intro'): GlobalHit => ({
    kind: 'app',
    key: app.id,
    title: app.name,
    subtitle: clip(app.tagline ?? app.description ?? ''),
    badge: categoryName(app.category),
    icon: '',
    route: { name: 'download-detail', params: { id: app.id } },
    source
  });

  for (const app of apps) {
    if (normalize(app.name).includes(q)) {
      nameHits.push(makeHit(app, 'name'));
    } else if (
      normalize(app.tagline ?? '').includes(q) ||
      normalize(app.description ?? '').includes(q)
    ) {
      introHits.push(makeHit(app, 'intro'));
    }
  }
  return [...nameHits, ...introHits].slice(0, limit);
};

/** ② 内置工具：工具名 / 说明 / 分组名 */
export const searchTools = (query: string, limit = 5): GlobalHit[] => {
  const q = normalize(query);
  if (!q) return [];
  const nameHits: GlobalHit[] = [];
  const otherHits: GlobalHit[] = [];
  for (const tool of TOOLS) {
    const hit: GlobalHit = {
      kind: 'tool',
      key: tool.id,
      title: tool.name,
      subtitle: clip(tool.desc),
      badge: tool.group,
      icon: tool.icon,
      route: { name: `tool-${tool.id}` }
    };
    if (normalize(tool.name).includes(q)) nameHits.push(hit);
    else if (normalize(`${tool.desc} ${tool.group}`).includes(q)) otherHits.push(hit);
  }
  return [...nameHits, ...otherHits].slice(0, limit);
};

/** ③ AI 导航：站点名 / 说明 / 域名 */
export const searchAiSites = (query: string, limit = 5): GlobalHit[] => {
  const q = normalize(query);
  if (!q) return [];
  const nameHits: GlobalHit[] = [];
  const otherHits: GlobalHit[] = [];
  for (const site of aiNav.sites) {
    let host = '';
    try {
      host = new URL(site.url).host;
    } catch {
      host = site.url;
    }
    const hit: GlobalHit = {
      kind: 'ai',
      key: site.url,
      title: site.name,
      subtitle: clip(site.desc),
      badge: host,
      icon: site.name.trim().slice(0, 1).toUpperCase(),
      url: site.url,
      color: site.color
    };
    if (normalize(site.name).includes(q)) nameHits.push(hit);
    else if (normalize(`${site.desc} ${host}`).includes(q)) otherHits.push(hit);
  }
  return [...nameHits, ...otherHits].slice(0, limit);
};

/**
 * ④ 页面：标题与说明要走 i18n，所以把 t 传进来。
 * 空关键词时返回全部页面（面板初始状态显示“去哪”的快捷入口）。
 */
export const searchPages = (
  query: string,
  t: (key: string) => string,
  limit = 5
): GlobalHit[] => {
  const q = normalize(query);
  const hits: GlobalHit[] = [];
  for (const page of SEARCH_PAGES) {
    const title = t(page.titleKey);
    if (q && !normalize(`${title} ${t(page.descKey)} ${page.keywords}`).includes(q)) continue;
    hits.push({
      kind: 'page',
      key: page.key,
      title,
      subtitle: t(page.descKey),
      badge: '',
      icon: page.icon,
      route: { name: page.route }
    });
    if (hits.length >= limit) break;
  }
  return hits;
};

/**
 * 全局搜索：返回已经分好组的结果（顺序 = 软件 → 工具 → AI 导航 → 页面）。
 * 空关键词只返回页面快捷入口；没有任何结果时返回空数组。
 */
export const searchGlobal = (
  query: string,
  t: (key: string) => string,
  limitPerKind = 5
): GlobalGroup[] => {
  if (!normalize(query)) {
    const pages = searchPages('', t, SEARCH_PAGES.length);
    return pages.length ? [{ kind: 'page', hits: pages }] : [];
  }
  const groups: GlobalGroup[] = [
    { kind: 'app', hits: searchApps(query, limitPerKind) },
    { kind: 'tool', hits: searchTools(query, limitPerKind) },
    { kind: 'ai', hits: searchAiSites(query, limitPerKind) },
    { kind: 'page', hits: searchPages(query, t, limitPerKind) }
  ];
  return groups.filter((group) => group.hits.length > 0);
};
