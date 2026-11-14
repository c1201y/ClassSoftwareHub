// ════════════════════════════════════════════════════════════════════
// submitValidation.ts —— 投稿表单的「边填边校验」逻辑（纯函数，无 Vue）
//
// 背景：提交页此前是「填完一张表 → 点提交 → 哪里不对才被打回」，
// 用户填了十几个字段最后才发现 ID 格式不对 / 少了个必填项，体验很差。
// 这里把校验规则抽成纯函数，让页面能在**每个字段失焦时**立刻标红，
// 并据此决定提交按钮是否可点。
//
// 设计取舍：
//   · 规则与服务端 / buildPayload 保持同一口径（ID 正则、必填项），
//     但**不替代**最终校验 —— 提交前仍会跑一遍 buildPayload，
//     这里只负责「尽早告诉用户」。
//   · 每条规则返回 i18n 的 key，不返回成品文案：页面文案在
//     文字设置.ts 的 submit.* 里，本文件不产出界面文字。
//   · 分「类型向导」三档：开源项目 / 商业软件 / 本站上传，
//     不同档位要求不同字段（见 kindsOf / missingFor）。
// ════════════════════════════════════════════════════════════════════

/** 投稿类型：决定哪些字段是必需的 */
export type SubmitKind = 'opensource' | 'commercial' | 'upload';

/** 表单里参与校验的字段（与 SubmitPage 的 form 对应，只取校验用得到的） */
export interface SubmitFormLike {
  id: string;
  name: string;
  category: string;
  tagline: string;
  description: string;
  contact: string;
  website: string;
  github: string;
  platforms: string[];
  downloads: { url: string; platform: string }[];
}

/** 单个字段的校验结果：key 为空表示通过 */
export interface FieldError {
  field: string;
  /** i18n key（submit.error-* / submit.field-*） */
  key: string;
  /** 插值参数 */
  params?: Record<string, string | number>;
}

/**
 * ID 正则：小写字母、数字、连字符。
 *
 * 与 SubmitPage.vue 里的 ID_PATTERN **必须一致** —— 那边是最终防线，
 * 这里是为了提前提示。改一处就要改另一处。
 */
export const ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** ID 长度上限（与服务端 MAX_ID_LEN 对齐，避免拼出超长路径） */
export const ID_MAX_LEN = 64;

/**
 * 判断某个投稿类型下，「来源」是否已交代。
 *
 * 与后端 submitGate 的口径一致（2026-11-12 放宽后）：
 *   上传 / GitHub / 官网 / 商店 / downloads 里有合法 http(s) 链接，
 *   满足其一即可。
 */
export function hasAnySource(form: SubmitFormLike): boolean {
  if (form.github.trim()) return true;
  if (form.website.trim()) return true;
  if (form.downloads.some((d) => /^oss:\/\//i.test(d.url.trim()))) return true;
  for (const d of form.downloads) {
    const url = d.url.trim();
    if (!/^https?:\/\//i.test(url)) continue;
    try {
      new URL(url);
      return true;
    } catch {
      /* 不是合法 URL，继续看下一条 */
    }
  }
  return false;
}

/** 该类型下「必需项」的清单（用于决定展示哪些字段、以及还差什么） */
export function requiredFieldsOf(kind: SubmitKind): string[] {
  // 三类共同的必填
  const common = ['id', 'name', 'category', 'tagline', 'description', 'contact', 'platforms'];
  switch (kind) {
    case 'opensource':
      // 开源项目：必须有仓库（下载链接可由它自动生成）
      return [...common, 'github'];
    case 'commercial':
      // 商业软件：必须有官网或商店，且至少一条下载/跳转链接
      return [...common, 'official', 'downloads'];
    case 'upload':
      // 本站上传：必须有上传的安装包
      return [...common, 'uploadedFile'];
    default:
      return common;
  }
}

/** ID 的即时校验（失焦时用） */
export function validateId(id: string): FieldError | null {
  const value = id.trim();
  if (!value) return { field: 'id', key: 'submit.error-id-empty' };
  if (value.length > ID_MAX_LEN) {
    return { field: 'id', key: 'submit.error-id-long', params: { max: ID_MAX_LEN } };
  }
  if (!ID_PATTERN.test(value)) return { field: 'id', key: 'submit.error-id' };
  return null;
}

/** 非空文本字段的通用校验 */
export function validateRequired(value: string, field: string): FieldError | null {
  return value.trim() ? null : { field, key: 'submit.error-required-field' };
}

/** 下载链接的即时校验 */
export function validateDownloadUrl(url: string): FieldError | null {
  const value = url.trim();
  if (!value) return null; // 空链接的行会被 buildPayload 过滤掉，不算错
  if (/^oss:\/\//i.test(value)) return null; // 本站对象，合法
  if (!/^https?:\/\//i.test(value)) {
    return { field: 'downloads', key: 'submit.error-url-scheme' };
  }
  try {
    new URL(value);
  } catch {
    return { field: 'downloads', key: 'submit.error-url-invalid' };
  }
  return null;
}

/**
 * 汇总当前表单的全部问题（用于「提交按钮是否可点」）。
 *
 * 返回的数组里每条都是 FieldError；空数组表示可以提交。
 *
 * ⚠️ 注意：这里只做**页面能做主**的校验。像是「联系方式的加密是否成功」
 * 这类依赖异步操作的，仍由 buildPayload 负责。
 */
export function collectProblems(form: SubmitFormLike, kind: SubmitKind): FieldError[] {
  const out: FieldError[] = [];

  const push = (e: FieldError | null) => {
    if (e) out.push(e);
  };

  push(validateId(form.id));
  push(validateRequired(form.name, 'name'));
  push(validateRequired(form.category, 'category'));
  push(validateRequired(form.tagline, 'tagline'));
  push(validateRequired(form.description, 'description'));
  push(validateRequired(form.contact, 'contact'));

  if (form.platforms.length === 0) {
    out.push({ field: 'platforms', key: 'submit.error-system' });
  }

  // 来源：三类都要，但具体要求不同
  const reqs = requiredFieldsOf(kind);
  if (reqs.includes('github') && !form.github.trim()) {
    out.push({ field: 'github', key: 'submit.error-need-github' });
  }
  if (reqs.includes('official') && !form.website.trim() && !hasAnySource(form)) {
    out.push({ field: 'official', key: 'submit.error-need-official' });
  }
  if (reqs.includes('downloads') && !hasAnySource(form)) {
    out.push({ field: 'downloads', key: 'submit.error-need-download' });
  }
  if (reqs.includes('uploadedFile') && !hasAnySource(form)) {
    out.push({ field: 'uploadedFile', key: 'submit.error-need-upload' });
  }

  // 每条下载链接的格式
  for (const d of form.downloads) {
    push(validateDownloadUrl(d.url));
  }

  return out;
}

/** 还差几项（给「提交按钮」旁的提示用） */
export function missingCount(form: SubmitFormLike, kind: SubmitKind): number {
  // 同一字段只算一次（下载链接可能有多条同类错误）
  const fields = new Set(collectProblems(form, kind).map((p) => p.field));
  return fields.size;
}

/**
 * 从填写内容「猜」投稿类型（进入页面时用于预选向导）。
 *
 * 规则很简单：填了 GitHub 就是开源，选中了上传文件就是本站上传，
 * 否则默认商业软件 —— 因为商业软件的限制最少（不要求仓库、不要求文件）。
 */
export function guessKind(form: SubmitFormLike): SubmitKind {
  if (form.downloads.some((d) => /^oss:\/\//i.test(d.url.trim()))) return 'upload';
  if (form.github.trim()) return 'opensource';
  return 'commercial';
}
