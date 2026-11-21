import { apps, categoryName, appName, appTagline, appDescription } from './data';
import type { Locale } from '../components/i18n/index';
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
    key: 'desktop',
    route: 'desktop',
    // 图标 E896(Download)——与左侧导航栏「下载桌面版」用同一个字形
    titleKey: 'search.page-desktop',
    descKey: 'search.page-desktop-desc',
    icon: '\uE896',
    keywords: 'desktop 桌面版 下载 客户端 exe 安装包 win10 win11 win7 安卓 android apk linux 安装 便携版'
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
const tokenize = (value: string): string[] => {
  const text = normalize(value);
  if (!text) return [];
  // 先按空白与标点粗切
  const rough = text
    .split(/[\s,，、。;；:：!！?？|｜/\\()（）\[\]【】{}<>《》"'“”‘’·—…~～@#￥$%&*]+/)
    .filter(Boolean);
  const tokens: string[] = [];
  for (const part of rough) {
    // 保留「C++ / VC++ / msvcp140.dll / 7-zip」这类整体写法
    tokens.push(part);
    if (/[\u4e00-\u9fa5]/.test(part) && part.length > 2) {
      // 只对连续的中文片段切窗口（数字/字母段落不切，避免产生噪声 token）
      const cjk = part.match(/[\u4e00-\u9fa5]+/g) ?? [];
      for (const run of cjk) {
        if (run.length <= 2) continue;
        for (let i = 0; i + 2 <= run.length; i += 1) tokens.push(run.slice(i, i + 2));
      }
    }
  }
  // 去重（保持顺序），并丢掉空串
  return [...new Set(tokens.filter(Boolean))];
};
const scoreMatch = (text: string, groups: string[][]): number => {
  if (!groups.length) return 0;
  const haystack = normalize(text);
  let hits = 0;
  for (const group of groups) {
    if (group.some((token) => haystack.includes(token))) hits += 1;
  }
  return hits;
};
const introMatches = (text: string, groups: string[][]): boolean => {
  if (!groups.length) return false;
  return scoreMatch(text, groups) >= Math.ceil(groups.length * 0.6);
};
const SYNONYMS: Record<string, string[]> = {
  c盘: ['磁盘', '系统盘', 'harddisk', '硬盘'],
  系统盘: ['磁盘', 'c盘', '硬盘'],
  磁盘: ['硬盘', 'disk'],
  硬盘: ['磁盘', 'disk'],
  解压: ['压缩', 'zip', 'rar', '7z', 'unzip', 'decompress'],
  压缩: ['解压', 'zip', 'rar', '7z'],
  杀毒: ['安全', '木马', '病毒', '杀软', 'antivirus'],
  病毒: ['木马', '杀毒', '恶意软件'],
  木马: ['病毒', '杀毒', '恶意软件'],
  远程: ['远控', 'remote', 'teamviewer'],
  壁纸: ['背景', '桌面', 'wallpaper'],
  截图: ['截屏', '捕捉', 'screenshot', 'snip'],
  批注: ['标注', '涂鸦', '划线', 'annotate', 'ink'],
  点名: ['抽签', '随机', '抽取', '选人'],
  抽签: ['点名', '随机', '抽取'],
  倒计时: ['计时', 'countdown', '剩余'],
  课表: ['课程', '课程表', 'schedule', 'timetable'],
  值日: ['卫生', '打扫', 'duty'],
  清理: ['清除', 'clean', 'optimize', '优化'],
  优化: ['清理', '加速', '提速', 'optimize'],
  播放器: ['播放', '视频', '播放软件', 'player'],
  浏览器: ['browser', 'chrome', 'edge', 'firefox'],
  输入法: ['打字', 'ime', 'keyboard'],
  office: ['办公', '文档', 'word', 'excel', 'ppt', 'wps'],
  文档: ['office', 'word', 'excel', 'ppt', 'pdf'],
  运行库: ['运行', 'vc++', 'vcredist', 'dll', '依赖'],
  驱动: ['驱动程序', 'driver'],
  卸载: ['删除', '移除', 'uninstall', '卸载工具'],
  恢复: ['找回', '还原', 'recover', 'restore'],
  搜索: ['查找', '检索', 'find', 'search'],
  查找: ['搜索', '检索', 'find', 'search'],
  看图: ['图片', '图像', '照片', 'image', 'viewer'],
  取色: ['颜色', '吸色', 'color picker'],
  计时: ['倒计时', '定时', 'timer', '秒表'],
  抽奖: ['随机', '抽取', '点名'],
  随机数: ['随机', '抽取', '抽号', 'random'],
  吸色: ['取色', '颜色', 'color picker'],
  找回: ['恢复', '还原', 'recover', 'restore'],
  还原: ['恢复', '找回', 'recover', 'restore'],
  检索: ['搜索', '查找', 'find', 'search'],
  投影: ['投屏', '展台', '实物投影', 'mirroring'],
  背景: ['壁纸', '桌面', 'wallpaper'],
  背景图: ['壁纸', '桌面', 'wallpaper'],
  标注: ['批注', '涂鸦', '划线', 'annotate', 'ink'],
  标注笔: ['批注', '涂鸦', '划线', 'annotate', 'ink'],
  卫生: ['值日', '打扫', 'duty'],
  打字: ['输入法', 'ime', 'keyboard'],
  实物投影: ['展台', '投影', '展示台', 'document camera'],
  无线投屏: ['投屏', '投影', 'mirroring', 'screen share'],
  会议: ['视频会议', '网课', '开会', 'meeting'],
  网课: ['在线课堂', '网课', '直播', '远程教学'],
  白板: ['黑板', '书写', 'whiteboard', '互动'],
  展台: ['投影', '实物投影', '展示台', 'document camera'],
  投屏: ['投影', '无线投屏', 'mirroring', 'screen share']
};

/** 把 token 连同它的同义词一起展开成「命中组」：组内任一命中即算该 token 命中 */
const expandTokens = (tokens: string[]): string[][] =>
  tokens.map((token) => [token, ...(SYNONYMS[token] ?? [])]);

/** 一句话简介太长时截断（卡片只显示一行，避免白白拼一个长字符串） */
const clip = (value: string, max = 90) => {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

/** ① 软件：名称命中的排前面，简介/介绍命中排后面；组内按相关度打分排序 */
export const searchApps = (query: string, locale: Locale = 'zh-CN', limit = 5): GlobalHit[] => {
  const groups = expandTokens(tokenize(query));
  if (!groups.length) return [];
  const nameHits: { hit: GlobalHit; score: number }[] = [];
  const introHits: { hit: GlobalHit; score: number }[] = [];
  const makeHit = (app: (typeof apps)[number], source: 'name' | 'intro'): GlobalHit => ({
    kind: 'app',
    key: app.id,
    title: appName(app, locale),
    subtitle: clip(appTagline(app, locale) || appDescription(app, locale)),
    badge: categoryName(app.category, locale),
    icon: '',
    route: { name: 'download-detail', params: { id: app.id } },
    source
  });

  for (const app of apps) {
    // 两种语言都参与匹配：英文界面下输入中文软件名也能搜到
    const intro = `${app.tagline ?? ''} ${app.taglineEn ?? ''} ${app.description ?? ''} ${app.descriptionEn ?? ''}`;
    const nameScore = scoreMatch(`${app.name} ${app.nameEn ?? ''}`, groups);
    // 名称命中（含同义词，宽松）进名称组；否则简介要求每个原词都命中（严格）
    if (nameScore > 0) {
      nameHits.push({ hit: makeHit(app, 'name'), score: nameScore });
    } else if (introMatches(intro, groups)) {
      introHits.push({ hit: makeHit(app, 'intro'), score: groups.length });
    }
  }
  // 相关度高的在前；同分按数据里的 sort 顺序（apps 已按 sort 排好，稳定排序保持它）
  const byScore = (a: { score: number }, b: { score: number }) => b.score - a.score;
  return [...nameHits.sort(byScore), ...introHits.sort(byScore)]
    .slice(0, limit)
    .map((entry) => entry.hit);
};

/** ② 内置工具：工具名 / 说明 / 分组名（名称命中优先，组内按相关度排序） */
export const searchTools = (
  query: string,
  t: (key: string) => string,
  limit = 5
): GlobalHit[] => {
  const groups = expandTokens(tokenize(query));
  if (!groups.length) return [];
  const nameHits: { hit: GlobalHit; score: number }[] = [];
  const otherHits: { hit: GlobalHit; score: number }[] = [];
  for (const tool of TOOLS) {
    const name = t(tool.nameKey);
    const desc = t(tool.descKey);
    const groupName = t(tool.groupKey);
    const hit: GlobalHit = {
      kind: 'tool',
      key: tool.id,
      title: name,
      subtitle: clip(desc),
      badge: groupName,
      icon: tool.icon,
      route: { name: `tool-${tool.id}` }
    };
    const nameScore = scoreMatch(name, groups);
    if (nameScore > 0) nameHits.push({ hit, score: nameScore });
    else if (introMatches(`${desc} ${groupName}`, groups)) {
      otherHits.push({ hit, score: groups.length });
    }
  }
  const byScore = (a: { score: number }, b: { score: number }) => b.score - a.score;
  return [...nameHits.sort(byScore), ...otherHits.sort(byScore)]
    .slice(0, limit)
    .map((entry) => entry.hit);
};

/** ③ AI 导航：站点名 / 说明 / 域名（名称命中优先，组内按相关度排序） */
export const searchAiSites = (query: string, locale: Locale = 'zh-CN', limit = 5): GlobalHit[] => {
  const groups = expandTokens(tokenize(query));
  if (!groups.length) return [];
  const nameHits: { hit: GlobalHit; score: number }[] = [];
  const otherHits: { hit: GlobalHit; score: number }[] = [];
  for (const site of aiNav.sites) {
    let host = '';
    try {
      host = new URL(site.url).host;
    } catch {
      host = site.url;
    }
    const name = locale === 'en-US' ? (site.nameEn ?? site.name) : site.name;
    const desc = locale === 'en-US' ? (site.descEn ?? site.desc) : site.desc;
    // 匹配时中英都看：英文界面搜中文名、中文界面搜英文名都能命中
    const haystack = `${site.name} ${site.nameEn ?? ''} ${site.desc} ${site.descEn ?? ''} ${host}`;
    const hit: GlobalHit = {
      kind: 'ai',
      key: site.url,
      title: name,
      subtitle: clip(desc),
      badge: host,
      icon: name.trim().slice(0, 1).toUpperCase(),
      url: site.url,
      color: site.color
    };
    const nameScore = scoreMatch(`${site.name} ${site.nameEn ?? ''}`, groups);
    if (nameScore > 0) nameHits.push({ hit, score: nameScore });
    else if (introMatches(haystack, groups)) {
      otherHits.push({ hit, score: groups.length });
    }
  }
  const byScore = (a: { score: number }, b: { score: number }) => b.score - a.score;
  return [...nameHits.sort(byScore), ...otherHits.sort(byScore)]
    .slice(0, limit)
    .map((entry) => entry.hit);
};
export const searchPages = (
  query: string,
  t: (key: string) => string,
  limit = 5
): GlobalHit[] => {
  const groups = expandTokens(tokenize(query));
  const hits: GlobalHit[] = [];
  for (const page of SEARCH_PAGES) {
    const title = t(page.titleKey);
    // 空关键词（面板初始状态）时列出全部页面；否则要求任一 token 组命中标题/说明/关键词
    if (groups.length && scoreMatch(`${title} ${t(page.descKey)} ${page.keywords}`, groups) === 0) continue;    hits.push({
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
export const searchGlobal = (
  query: string,
  t: (key: string) => string,
  locale: Locale = 'zh-CN',
  limitPerKind = 5
): GlobalGroup[] => {
  if (!tokenize(query).length) {
    const pages = searchPages('', t, SEARCH_PAGES.length);
    return pages.length ? [{ kind: 'page', hits: pages }] : [];
  }
  const groups: GlobalGroup[] = [
    { kind: 'app', hits: searchApps(query, locale, limitPerKind) },
    { kind: 'tool', hits: searchTools(query, t, limitPerKind) },
    { kind: 'ai', hits: searchAiSites(query, locale, limitPerKind) },
    { kind: 'page', hits: searchPages(query, t, limitPerKind) }
  ];
  return groups.filter((group) => group.hits.length > 0);
};
