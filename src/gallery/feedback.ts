
/** 一层：反馈大类 */
export type FeedbackKind = 'report' | 'suggestion';
/** 二层：问题子类型（仅 kind === 'report' 时有意义） */
export type ReportSubKind = 'interaction' | 'link' | 'other';

export interface FeedbackKindDef {
  key: FeedbackKind;
  icon: string;
  /** 卡片标题 / 表单页标题的文案 key */
  titleKey: string;
  /** 卡片下方那句说明的文案 key */
  descKey: string;
  /** GitHub Issue 标签名。必须与仓库 Labels 中的名称完全一致（含空格），
   *  不匹配的标签会被 GitHub 静默忽略——既不标注也不报错，难以察觉 */
  label: string;
  /** 标题前缀，便于维护者快速识别类别（标签缺失时仍可分辨） */
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
  /** 联系方式：选填，明文只留在本机（内存 + 本地草稿）；
   *  提交时由页面层在内存里加密成 age 密文，离开本机的那份永远是密文 */
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
export const SITE_ORIGIN = 'https://classsoftwarehub.cn/';

// ── 长度上限 ────────────────────────────────────────────────────────────
/** 标题软上限：超出时提示用户压缩（标题过长会影响 Issue 列表的可读性） */
export const TITLE_MAX = 80;
/** 正文里描述部分的软上限：超过会在拼 URL 时被截断 */
export const DETAIL_MAX = 1800;
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
    lines.push(
      '',
      '### 联系方式（已在本地加密，仅维护者可用私钥解密）',
      '',
      '```',
      draft.contact.trim(),
      '```'
    );
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
    // 二分查找使 URL 落入上限的最大描述长度，优于逐字递减
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
export function validateFeedback(draft: FeedbackDraft): string {
  if (!draft.kind) return 'feedback.error-kind';
  if (draft.kind === 'report' && !draft.subKind) return 'feedback.error-sub-kind';
  if (draft.title.trim().length > TITLE_MAX) return 'feedback.error-title-too-long';
  if (!draft.title.trim() || !draft.detail.trim()) return 'feedback.error-required';
  return '';
}

// ── 草稿持久化（与 SubmitPage.vue 实现一致，隐私模式下静默失败）──────────
const DRAFT_KEY = 'csh-feedback-draft';

export function saveFeedbackDraft(draft: FeedbackDraft): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // 隐私模式或配额已满时静默失败，不影响提交
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
export function clearFeedbackDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // 同上，忽略
  }
}

/** 复制到剪贴板；返回是否成功（浏览器不允许时提示用户手动选择复制） */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
export const CONTACT_PUBLIC_KEY = 'age1l9axcy0sxu6eeanapg0maughsv380fh8nhd4unf9p8d7x20rjqfsgz4dxa';
