// ════════════════════════════════════════════════════════════════════
// 反馈中心的纯逻辑（页面是 pages/FeedbackPage.vue）—— 不依赖 Vue，可单独验证
//
// 本站没有后端，所以「提交」= 拼一个 **GitHub Issue 预填链接**，点开就
// 是填好标题/正文/标签的新建 Issue 页，用户点一下 「Submit new issue」即可。
// 不做任何网络请求：既不用白等超时（那两个提交端点对反馈并不存在），
// 也不受网络环境影响。没有 GitHub 账号的用户走「复制反馈内容」。
//
// 分类是两层的，改分类只动下面两个数组 + 文字设置.ts 里的对应文案：
//   一层 kind     ：report（报告问题） / suggestion（提出建议）
//   二层 subKind  ：只有 report 才有（interaction / link / other）
//
// 文案：全部在根目录「文字设置.ts」的 feedback.* 与 search.page-feedback* 键，
//       英文在 src/gallery/Strings/en-US/Resources.ts。本文件只管逻辑。
// ════════════════════════════════════════════════════════════════════

/** 一层：反馈大类 */
export type FeedbackKind = 'report' | 'suggestion';
/** 二层：问题子类型（仅 kind === 'report' 时有意义） */
export type ReportSubKind = 'interaction' | 'link' | 'other';

export interface FeedbackKindDef {
  key: FeedbackKind;
  /** 卡片上的图标标识。页面层据此从 src/assets/feedback/<icon>.png 取图。
   *  这里只放**文件名**不放图片对象：本文件要保持纯逻辑（不依赖 Vue、不依赖 Vite
   *  的资源处理），才好单独验证。 */
  icon: string;
  /** 卡片标题 / 表单页标题的文案 key */
  titleKey: string;
  /** 卡片下方那句说明的文案 key */
  descKey: string;
  /** GitHub Issue 标签名。⚠️ 必须与仓库 Labels 里的名字**一字不差**（含空格），
   *  对不上的标签会被 GitHub 静默忽略——不打上也不报错，很难发现 */
  label: string;
  /** 标题前缀，让维护者一眼看出是哪一类（标签万一没了也还能分辨） */
  tag: string;
}

export interface ReportSubKindDef {
  key: ReportSubKind;
  labelKey: string;
  /** 同上：GitHub 标签名，必须与仓库里完全一致 */
  label: string;
  /** 标题前缀的后半段 */
  tag: string;
}

/**
 * 选择态的两张卡片。加/删卡片只动这里，再去 文字设置.ts 补上 titleKey / descKey、
 * 往 src/assets/feedback/ 丢一张同名 png 即可。
 *
 * 图标是 3D 风格 PNG（透明底），由页面层 import 进来 —— 不是图标字体的码点。
 * 先前用过 SEGOEICONS.TTF（E7BA 警告三角 / E781 灯泡），已整体换成这套图。
 */
export const FEEDBACK_KINDS: FeedbackKindDef[] = [
  {
    key: 'report',
    icon: 'report',
    titleKey: 'feedback.kind-report',
    descKey: 'feedback.kind-report-desc',
    label: '报告问题',
    tag: '报告问题'
  },
  {
    key: 'suggestion',
    icon: 'suggest',
    titleKey: 'feedback.kind-suggestion',
    descKey: 'feedback.kind-suggestion-desc',
    label: '提出建议',
    tag: '提出建议'
  }
];

/**
 * 「报告问题」下面的子类型。建议分支没有子类型（列表为空即可）。
 * ⚠️ 三个 label 要和仓库里的标签名一致；标题前缀会拼成「报告问题 · 链接失效」。
 */
export const REPORT_SUBKINDS: ReportSubKindDef[] = [
  { key: 'interaction', labelKey: 'feedback.sub-interaction', label: '逻辑交互', tag: '逻辑交互' },
  { key: 'link', labelKey: 'feedback.sub-link', label: '链接失效', tag: '链接失效' },
  { key: 'other', labelKey: 'feedback.sub-other', label: '其他问题', tag: '其他问题' }
];

/** 所有反馈共用的总标签，用来把「站点来的反馈」和仓库里其它 Issue 分开 */
export const FEEDBACK_LABEL = '用户反馈';

/** 一次反馈的内容（表单 → Issue 正文 → 草稿，都用这一个形状） */
export interface FeedbackDraft {
  kind: FeedbackKind | '';
  /** 只有 kind === 'report' 时有值 */
  subKind: ReportSubKind | '';
  /** 涉及的软件 id；空串 = 通用反馈（站本身的问题） */
  appId: string;
  title: string;
  detail: string;
  /** 联系方式：选填，会公开显示在 Issue 里 */
  contact: string;
}

export const emptyDraft = (): FeedbackDraft => ({
  kind: '',
  subKind: '',
  appId: '',
  title: '',
  detail: '',
  contact: ''
});

// ── 目标仓库与站点地址 ──────────────────────────────────────────────────
export const FEEDBACK_REPO = 'c1201y/ClassSoftwareHub';
export const REPO_URL = `https://github.com/${FEEDBACK_REPO}`;
/**
 * 站点主域。⚠️ 只用于拼 Issue 正文里的详情页直链。
 *    按仓库约定（见 AGENTS.md「SEO & the share card」），绝对 URL 一律用主域，
 *    两个镜像站会被 canonical 折回主域，所以这里写主域是对的。
 */
export const SITE_ORIGIN = 'https://classsoftwarehub.us.ci/';

// ── 长度上限 ────────────────────────────────────────────────────────────
/** 标题软上限：超过就拦下来让用户自己压（标题太长 Issue 列表里会很难看） */
export const TITLE_MAX = 80;
/** 正文里描述部分的软上限：超过会在拼 URL 时被截断 */
export const DETAIL_MAX = 1800;
/**
 * 整个预填 URL 的长度上限（保守值）。
 * ⚠️ 卡这个不是因为浏览器装不下（Chromium 上限远大于此），而是中间链路
 *    （代理、聊天软件转发、手工复制粘贴）会在某个长度上开始截断，
 *    一旦截断，Issue 正文就是半句话——比主动截断更糟。
 */
export const URL_MAX = 7000;

// ── 正文 / 标题 / URL 拼装 ──────────────────────────────────────────────

/** 取「大类 + 子类型」的中文标签，用于标题前缀与正文表格（suggestion 只有前半段） */
function kindTag(draft: FeedbackDraft): string {
  const kind = FEEDBACK_KINDS.find((k) => k.key === draft.kind);
  if (!kind) return '';
  if (draft.kind !== 'report') return kind.tag;
  const sub = REPORT_SUBKINDS.find((s) => s.key === draft.subKind);
  return sub ? `${kind.tag} · ${sub.tag}` : kind.tag;
}

/**
 * 这条反馈要用到的全部标签（GitHub Issue 的 labels 字段）。
 * 报告问题会带上：用户反馈 + 报告问题 + 子类型（逻辑交互 / 链接失效 / 其他问题）
 * 提出建议会带上：用户反馈 + 提出建议
 */
export function feedbackLabels(draft: FeedbackDraft): string[] {
  const labels = [FEEDBACK_LABEL];
  const kind = FEEDBACK_KINDS.find((k) => k.key === draft.kind);
  if (kind) labels.push(kind.label);
  if (draft.kind === 'report') {
    const sub = REPORT_SUBKINDS.find((s) => s.key === draft.subKind);
    if (sub) labels.push(sub.label);
  }
  return labels;
}

/** 把多行文本转成 Markdown 里的引用块（每行前加 `> `），空行留空 */
function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.trim() ? `> ${line}` : '>'))
    .join('\n');
}

/**
 * 拼 Issue 正文（Markdown）。
 * app 是从 `data/index.ts` 里按 appId 找出来的软件对象，用于注入「涉及软件」区块。
 */
export function buildIssueBody(
  draft: FeedbackDraft,
  app: { id: string; name: string } | null
): string {
  const lines: string[] = [];

  if (draft.detail.trim()) {
    lines.push(quote(draft.detail.trim()), '');
  }

  lines.push('---', '');
  lines.push('| 项目 | 内容 |', '| --- | --- |');
  lines.push(`| 类型 | ${kindTag(draft) || '（未选择）'} |`);
  if (app) {
    lines.push(
      `| 涉及软件 | ${app.name}（\`${app.id}\`）· [详情页](${SITE_ORIGIN}#/download/${app.id}) |`
    );
  } else {
    lines.push('| 涉及软件 | 站点本身 / 未指定 |');
  }
  if (draft.contact.trim()) {
    lines.push(`| 联系方式 | ${draft.contact.trim()} |`);
  }
  lines.push('');
  lines.push('<!-- 由站点「反馈中心」生成（#/feedback）。若标题或正文有误，直接改这里也行。 -->');

  return lines.join('\n');
}

/** Issue 标题：`[报告问题 · 链接失效] 7-Zip 下载链接 404` */
export function buildIssueTitle(draft: FeedbackDraft): string {
  const tag = kindTag(draft);
  const subject = draft.title.trim() || '（未填写标题）';
  return tag ? `[${tag}] ${subject}` : subject;
}

/**
 * 构造 GitHub Issue 新建页的预填链接。
 *
 * 返回实际用到的 body 和「有没有被截断」——页面要据此显示提示条，
 * **绝不能悄悄截断**：维护者看到半句话比看到完整内容还难办。
 *
 * 截断策略：优先砍 detail（保留标题、类型、涉及软件——这三样是分流必需的），
 * 砍完在正文末尾追加一行说明。
 */
export function buildIssueUrl(
  draft: FeedbackDraft,
  app: { id: string; name: string } | null
): { url: string; body: string; truncated: boolean } {
  const title = buildIssueTitle(draft);
  const labels = feedbackLabels(draft);

  const makeUrl = (body: string) => {
    const params = new URLSearchParams();
    params.set('title', title);
    params.set('body', body);
    if (labels.length) params.set('labels', labels.join(','));
    return `${REPO_URL}/issues/new?${params.toString()}`;
  };

  let body = buildIssueBody(draft, app);
  let url = makeUrl(body);
  let truncated = false;

  if (url.length > URL_MAX) {
    // 只砍描述，其余保持原样
    const note = '\n\n（描述过长，已截断；完整内容请点页面上的「复制反馈内容」。）';
    let detail = draft.detail.trim();
    // 二分找到「砍到多少字能让 URL 落进上限」，比逐字减快得多
    let lo = 0;
    let hi = detail.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const trial = { ...draft, detail: detail.slice(0, mid) + note };
      if (makeUrl(buildIssueBody(trial, app)).length <= URL_MAX) lo = mid;
      else hi = mid - 1;
    }
    detail = detail.slice(0, lo) + note;
    body = buildIssueBody({ ...draft, detail }, app);
    url = makeUrl(body);
    truncated = true;
  }

  return { url, body, truncated };
}

/**
 * 校验：返回第一条不满足的**文案 key**，全部通过返回空串。
 * 和 SubmitPage.vue 一样把校验放在 JS 里——提交按钮不是原生 submit，
 * HTML 的 required 根本不会触发。
 */
export function validateFeedback(draft: FeedbackDraft): string {
  if (!draft.kind) return 'feedback.error-kind';
  if (draft.kind === 'report' && !draft.subKind) return 'feedback.error-sub-kind';
  if (draft.title.trim().length > TITLE_MAX) return 'feedback.error-title-too-long';
  if (!draft.title.trim() || !draft.detail.trim()) return 'feedback.error-required';
  return '';
}

// ── 草稿持久化（照抄 SubmitPage.vue 的写法，隐私模式下静默失败）──────────
const DRAFT_KEY = 'csh-feedback-draft';

export function saveFeedbackDraft(draft: FeedbackDraft): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // 隐私模式 / 配额满：写不进去就算了，不影响提交
  }
}

export function readFeedbackDraft(): FeedbackDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FeedbackDraft>;
    // 只取认识的键，避免旧草稿里混进来的字段污染表单
    return {
      kind: (parsed.kind as FeedbackKind) ?? '',
      subKind: (parsed.subKind as ReportSubKind) ?? '',
      appId: typeof parsed.appId === 'string' ? parsed.appId : '',
      title: typeof parsed.title === 'string' ? parsed.title : '',
      detail: typeof parsed.detail === 'string' ? parsed.detail : '',
      contact: typeof parsed.contact === 'string' ? parsed.contact : ''
    };
  } catch {
    return null;
  }
}

/**
 * ⚠️ 故意不提供「成功提交后清草稿」：打开的是 GitHub 的新标签页，
 *    跨域读不到那边到底提交没有。清掉反而危险——用户以为提交了、
 *    其实没点，内容却没了。宁可下次进来多问一句「恢复上次填写」。
 */
export function clearFeedbackDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // 同上，忽略
  }
}

/** 复制到剪贴板；返回是否成功（浏览器不允许时可以提示用户手动选） */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
