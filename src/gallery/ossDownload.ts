// ════════════════════════════════════════════════════════════════════
// ossDownload.ts —— 把「本站 OSS 对象」换成一条能点的短时下载地址
//
// 桶是私有的，OSS 直链谁都打不开；真正的下载要过一次闸门：
//
//   ① 前端把 { key, 设备指纹 } 发给 /api/dl-ticket；
//   ② 服务端查这台设备今天还剩多少额度（默认 80 次/天），发一张 15 分钟票据；
//   ③ 前端用票据请求 /api/dl，服务端携带中继令牌取流后原样转发。
//
// 地址不直接写死进数据的原因：那等同于为每个软件配置一条永久有效的直链，
// 被外部引用会造成持续的流量消耗。票据 15 分钟即过期，转发后基本无法利用。
//
// 数据中使用 `oss://对象键` 伪协议表示本站对象。详情页触发下载时
// 由本模块识别并换票；其余（网盘/官网）照常走跳转。
// ════════════════════════════════════════════════════════════════════

import { SUBMIT_TIMEOUT_MS, orderedEndpoints, rememberEndpoint } from './submitEndpoints';
import { deviceFingerprint } from './deviceFingerprint';

/** 本站 OSS 对象在数据里的写法 */
export const OSS_SCHEME = 'oss://';

/** 本站 OSS 桶的域名（历史数据里存成公开直链的，也认） */
const OSS_HOST_RE = /(^|\.)oss-[a-z0-9-]+\.aliyuncs\.com$/i;

/** 票据到期前的提前刷新间隔，避免在过期边界上失效 */
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
    if (!key) return null;
    // decodeURIComponent 对不合法的 % 序列会直接抛异常（如数据中误写了 %zz），
    // 异常上抛会导致详情页白屏 —— 捕获后按「不是本站对象」处理。
    // 同时拒绝 .. 段：真正的防线在服务端 objectKeyOk，此处仅为提前失败。
    try {
      const decoded = decodeURIComponent(key);
      if (!decoded || decoded.split('/').includes('..')) return null;
      return decoded;
    } catch {
      return null;
    }
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

/** 对象键 → { 票据地址, 到期时刻 }。同一页面内重复请求时复用票据，避免重复消耗下载额度 */
const ticketCache = new Map<string, ResolvedDownload & { until: number }>();
const inFlight = new Map<string, Promise<ResolvedDownload>>();

interface TicketReply {
  success?: boolean;
  /** 服务端选定的取回通道：relay（经 ECS 中继）或 direct（OSS 短时直链） */
  mode?: 'relay' | 'direct';
  url?: string;
  key?: string;
  size?: number;
  expiresIn?: number;
  error?: string;
  limit?: number;
}

/** 换取到的下载地址，附带通道类型与过期时长 —— 界面据此提示用户 */
export interface ResolvedDownload {
  url: string;
  /**
   * relay：经 ECS 中继转发，票据只在开始下载时校验一次，传多久都不会中途失效。
   * direct：OSS 短时直链，**有效期按体积分层**（≤50MB 5 分钟 … >1GB 30 分钟），
   *         断了要重下就得重新换一条，所以界面要提示「中断了就回站点重新点击下载」。
   */
  mode?: 'relay' | 'direct';
  expiresIn: number;
}

async function requestTicket(base: string, key: string): Promise<ResolvedDownload> {
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
    // 这个 url 会被塞进 <a href> / window.open：服务端被攻破或响应被篡改时，
    // javascript: / data: 一类协议就是存储型 XSS。只认 https。
    if (!/^https:\/\//i.test(data.url)) {
      throw new OssDownloadError('invalid', '服务端返回的下载地址不是 https', res.status);
    }
    return { url: data.url, expiresIn, mode: data.mode === 'direct' ? 'direct' : 'relay' };
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * 取一条可用的下载地址（带内存缓存，在票据有效期内复用）。
 * @throws OssDownloadError
 */
export async function signedDownloadDetail(key: string): Promise<ResolvedDownload> {
  const hit = ticketCache.get(key);
  if (hit && hit.until > Date.now()) return hit;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const task = (async () => {
    let lastError: unknown = null;
    for (const base of orderedEndpoints()) {
      try {
        const detail = await requestTicket(base, key);
        rememberEndpoint(base);
        ticketCache.set(key, { ...detail, until: Date.now() + detail.expiresIn * 1000 - TICKET_SAFETY_MS });
        return detail;
      } catch (error) {
        // 仅当「该入口本身不可用」时才换下一个；服务端已明确拒绝（额度用完等）时不应重试
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

/** 仅返回下载地址（供旧调用点使用） */
export async function signedDownloadUrl(key: string): Promise<string> {
  return (await signedDownloadDetail(key)).url;
}

/** 将 `oss://…` 下载项换取为可直接使用的短时地址；非本站对象时原样返回 */
export async function resolveDownloadDetail(url: string): Promise<ResolvedDownload> {
  const key = ossKeyOf(url);
  if (!key) return { url, expiresIn: 0 };
  return signedDownloadDetail(key);
}

export async function resolveDownloadUrl(url: string): Promise<string> {
  return (await resolveDownloadDetail(url)).url;
}
