// 下载体验反馈：自建加速下载开始 5 秒后弹小悬浮窗，结果发往观测台。
// 同一浏览器 48 小时内最多提示一次（展示/关闭/提交都会写入冷却时间）。

import { runningBuild } from './appUpdate';

export type DownloadFeedbackRating = 'good' | 'bad';

export interface DownloadFeedbackDraft {
  rating: DownloadFeedbackRating;
  detail: string;
  contact: string;
}

export interface DownloadFeedbackContext {
  app?: string;
  target?: string;
}

const LAST_KEY = 'csh-dl-feedback-at';
const COOLDOWN_MS = 48 * 3600000;
const ASK_DELAY_MS = 5000;

export const DOWNLOAD_FEEDBACK_EVENT = 'csh:download-feedback';
export const DOWNLOAD_FEEDBACK_ENDPOINT = '/api/dl-feedback';

function readLast(): number {
  try {
    return Number(localStorage.getItem(LAST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function downloadFeedbackAllowed(now = Date.now()): boolean {
  return now - readLast() >= COOLDOWN_MS;
}

export function markDownloadFeedbackShown(at = Date.now()): void {
  try {
    localStorage.setItem(LAST_KEY, String(at));
  } catch {
    // 存储被禁用时放弃冷却
  }
}

let pending = 0;

export function noteAcceleratedDownload(context: DownloadFeedbackContext = {}): void {
  if (pending || !downloadFeedbackAllowed()) return;
  pending = window.setTimeout(() => {
    pending = 0;
    if (!downloadFeedbackAllowed()) return;
    markDownloadFeedbackShown();
    window.dispatchEvent(new CustomEvent(DOWNLOAD_FEEDBACK_EVENT, { detail: context }));
  }, ASK_DELAY_MS);
}

export function normalizeDetail(value: string): string {
  return String(value).replace(/\s+/g, ' ').trim().slice(0, 800);
}

export function normalizeContact(value: string): string {
  return String(value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 120);
}

export function validateDraft(draft: DownloadFeedbackDraft): 'rating' | 'detail' | null {
  if (draft.rating !== 'good' && draft.rating !== 'bad') return 'rating';
  if (normalizeDetail(draft.detail).length < 2) return 'detail';
  return null;
}

export async function submitDownloadFeedback(
  draft: DownloadFeedbackDraft,
  context: DownloadFeedbackContext = {}
): Promise<boolean> {
  const body = {
    v: 1,
    rating: draft.rating,
    detail: normalizeDetail(draft.detail),
    contact: normalizeContact(draft.contact),
    app: String(context.app || '').slice(0, 120),
    target: String(context.target || '').slice(0, 240),
    page: window.location.hash.slice(0, 200),
    locale: document.documentElement.lang || navigator.language || '',
    build: runningBuild
  };
  try {
    const response = await fetch(DOWNLOAD_FEEDBACK_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true
    });
    return response.ok;
  } catch {
    return false;
  }
}
