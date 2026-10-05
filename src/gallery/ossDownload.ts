// ════════════════════════════════════════════════════════════════════
// ossDownload.ts —— 把「本站 OSS 对象」换成一条能点的短时下载地址
//
// 桶是私有的，OSS 直链谁都打不开；真正的下载要过一次闸门：
//
//   ① 前端把 { key, 设备指纹 } 发给 /api/dl-ticket；
//   ② 服务端查这台设备今天还剩多少额度（默认 80 次/天），发一张 15 分钟票据；
//   ③ 前端用票据请求 /api/dl，服务端在服务端带中继令牌取流后原样转发。
//
// 为什么地址不直接写死进数据里：那等于给每个软件配一条**永久有效**的直链，
// 被人挂到别处就是持续的流量账单。票据 15 分钟就过期，转发出去基本来不及用。
//
// 数据里怎么表示一个本站对象：用 `oss://对象键` 这种伪协议。详情页点下载时
// 由这里认出来并换票；其余（网盘/官网）照旧走跳转。
// ════════════════════════════════════════════════════════════════════

import { SUBMIT_TIMEOUT_MS, orderedEndpoints, rememberEndpoint } from './submitEndpoints';
import { deviceFingerprint } from './deviceFingerprint';

/** 本站 OSS 对象在数据里的写法 */
export const OSS_SCHEME = 'oss://';

/** 本站 OSS 桶的域名（历史数据里存成公开直链的，也认） */
const OSS_HOST_RE = /(^|\.)oss-[a-z0-9-]+\.aliyuncs\.com$/i;

/** 票据用掉前多久就提前换新的，别卡在过期边界上 */
const TICKET_SAFETY_MS = 60 * 1000;

export type OssDownloadErrorCode =
  | 'unreachable' // 所有提交入口都连不上
  | 'quota' // 今天的下载额度用完了
  | 'refused' // 服务端明确拒绝（key 非法 / 服务未配置）
  | 'invalid'; // 响应形状不对

export class OssDownloadError extends Error {
  readonly code: OssDownloadErrorCode;
  readonly status: number;
  constructor(code: OssDownloadErrorCode, message: string, status = 0) {
    super(message);
    this.name = 'OssDownloadError';
    this.code = code;
    this.status = status;
  }
}

/**
 * 从一个下载项 URL 里认出「本站 OSS 对象」，取出对象键。
 * 支持三种写法：
 *   oss://upload/2026/10/xxx.exe           ← 现在用的
 *   https://submit.132614.xyz/api/dl?k=... ← 票据地址（反解出 key）
 *   https://<bucket>.oss-cn-shanghai.aliyuncs.com/upload/... ← 历史公开直链
 * 认不出来就返回 null（调用方按原来的跳转逻辑走）。
 */
export function ossKeyOf(url: string): string | null {
  const raw = (url || '').trim();
  if (!raw) return null;

  if (raw.toLowerCase().startsWith(OSS_SCHEME)) {
    const key = raw.slice(OSS_SCHEME.length).replace(/^\/+/, '').split(/[?#]/)[0];
    return key ? decodeURIComponent(key) : null;
  }

  try {
    const parsed = new URL(raw);
    if (parsed.pathname === '/api/dl') {
      const key = parsed.searchParams.get('k');
      return key || null;
    }
    if (OSS_HOST_RE.test(parsed.hostname)) {
      const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
      return key || null;
    }
  } catch {
    return null;
  }
  return null;
}

/** 键 → { 票据地址, 到期时刻 }。同一页面里连点两次不该重复消耗额度 */
const ticketCache = new Map<string, { url: string; until: number }>();
const inFlight = new Map<string, Promise<string>>();

interface TicketReply {
  success?: boolean;
  url?: string;
  key?: string;
  expiresIn?: number;
  error?: string;
  limit?: number;
}

async function requestTicket(base: string, key: string): Promise<{ url: string; expiresIn: number }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(`${base}/api/dl-ticket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, fp: deviceFingerprint() }),
        signal: controller.signal
      });
    } catch {
      throw new OssDownloadError('unreachable', `${base} 连不上`, 0);
    }

    const data = (await res.json().catch(() => null)) as TicketReply | null;
    if (!data || typeof data !== 'object') {
      throw new OssDownloadError('unreachable', `${base} 返回的不是提交服务响应`, res.status);
    }
    if (res.status === 429) {
      throw new OssDownloadError(
        'quota',
        typeof data.error === 'string' ? data.error : '今天的下载额度已用完',
        429
      );
    }
    if (data.success !== true || typeof data.url !== 'string') {
      throw new OssDownloadError(
        'refused',
        typeof data.error === 'string' ? data.error : `领取下载票据失败（HTTP ${res.status}）`,
        res.status
      );
    }
    const expiresIn = Number(data.expiresIn) || 900;
    return { url: data.url, expiresIn };
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * 取一条可用的下载地址（带内存缓存，15 分钟票据在有效期内复用）。
 * @throws OssDownloadError
 */
export async function signedDownloadUrl(key: string): Promise<string> {
  const hit = ticketCache.get(key);
  if (hit && hit.until > Date.now()) return hit.url;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const task = (async () => {
    let lastError: unknown = null;
    for (const base of orderedEndpoints()) {
      try {
        const { url, expiresIn } = await requestTicket(base, key);
        rememberEndpoint(base);
        ticketCache.set(key, { url, until: Date.now() + expiresIn * 1000 - TICKET_SAFETY_MS });
        return url;
      } catch (error) {
        // 只有「这个入口本身不通」才值得换下一个；服务端已明确拒绝（额度用完等）就别再试
        if (error instanceof OssDownloadError && error.code === 'unreachable') {
          lastError = error;
          continue;
        }
        throw error;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new OssDownloadError('unreachable', '没有可用的提交入口');
  })();

  inFlight.set(key, task);
  try {
    return await task;
  } finally {
    inFlight.delete(key);
  }
}

/** 把一条 `oss://…` 下载项换成可以直接点的短时地址；不是本站对象就原样返回 */
export async function resolveDownloadUrl(url: string): Promise<string> {
  const key = ossKeyOf(url);
  if (!key) return url;
  return signedDownloadUrl(key);
}
