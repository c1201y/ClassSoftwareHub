/// <reference types="vite/client" />

import { SUBMIT_TIMEOUT_MS, orderedEndpoints, rememberEndpoint } from './submitEndpoints';
import { OSS_SCHEME } from './ossDownload';
import { deviceFingerprint } from './deviceFingerprint';
export const UPLOAD_MAX_BYTES = 2.5 * 1024 * 1024 * 1024;

/** 超过此大小给「文件较大、上传较慢」的提示，但不阻止上传 */
export const UPLOAD_WARN_BYTES = 1024 * 1024 * 1024;

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

/** 上传失败分类：调用方据此选择本地化文案，避免向用户直接展示 OSS 的英文/XML 原始报错 */
export type OssUploadErrorCode =
  | 'too-large' // 本地预检：超过 UPLOAD_MAX_BYTES
  | 'sign-failed' // 签名接口明确拒绝（文件过大 / 服务未配置）
  | 'unreachable' // 签名接口连不上，或回的不是提交服务的响应
  | 'network'
  | 'aborted'
  | 'http'; // OSS 拒绝了这次上传（403 / 400 …）

export class OssUploadError extends Error {
  readonly code: OssUploadErrorCode;
  readonly status: number;
  constructor(code: OssUploadErrorCode, message: string, status = 0) {
    super(message);
    this.name = 'OssUploadError';
    this.code = code;
    this.status = status;
  }
}

export interface UploadProgress {
  loaded: number;
  total: number;
}

/** 本站是否存在可用的上传通道（入口清单非空即可；实际可用性在签发阶段才能确定） */
export function hasOssUpload(): boolean {
  return orderedEndpoints().length > 0;
}

/** 浏览器对不认识的扩展名会给空 type；空值统一当二进制流，服务端也会做同样的兜底 */
function normalizedType(file: File): string {
  const raw = (file.type || '').split(';')[0].trim().toLowerCase();
  return raw || DEFAULT_CONTENT_TYPE;
}

interface SignedTarget {
  url: string;
  key: string;
  contentType: string;
  /** 服务端当前的孤儿回收阈值（分钟）：传完多久之内必须把提交做完。界面据此提示用户 */
  orphanMinutes?: number;
}

interface OssSignReply {
  success?: boolean;
  url?: string;
  key?: string;
  contentType?: string;
  orphanMinutes?: number;
  error?: string;
}

/** 上传用途：软件包（私有、走票据闸门）还是图标（小图、公开只读） */
export type OssUploadPurpose = 'file' | 'icon';
async function requestSignedTarget(
  base: string,
  file: File,
  purpose: OssUploadPurpose
): Promise<SignedTarget> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetch(`${base}/api/oss-sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: normalizedType(file),
          purpose,
          // 服务端据此在登记表里记下「这台设备传的」（只存哈希，不存原始指纹），
          // 将来要按人追溯或清理时才有依据。
          fp: deviceFingerprint()
        }),
        signal: controller.signal
      });
    } catch {
      throw new OssUploadError('unreachable', `${base} 连不上`, 0);
    }

    const data = (await res.json().catch(() => null)) as OssSignReply | null;
    if (!data || typeof data !== 'object') {
      throw new OssUploadError('unreachable', `${base} 返回的不是提交服务响应`, res.status);
    }
    if (data.success !== true || typeof data.url !== 'string' || typeof data.key !== 'string') {
      throw new OssUploadError(
        'sign-failed',
        typeof data.error === 'string' ? data.error : `签发上传地址失败（HTTP ${res.status}）`,
        res.status
      );
    }

    return {
      url: data.url,
      key: data.key,
      contentType: data.contentType || normalizedType(file),
      orphanMinutes: Number(data.orphanMinutes) || undefined
    };
  } finally {
    window.clearTimeout(timer);
  }
}

/** 按「上次成功优先」的顺序依次尝试各入口，取得第一条签名地址后停止 */
async function pickSignedTarget(
  file: File,
  purpose: OssUploadPurpose
): Promise<{ base: string; target: SignedTarget }> {
  let lastError: unknown = null;
  for (const base of orderedEndpoints()) {
    try {
      return { base, target: await requestSignedTarget(base, file, purpose) };
    } catch (error) {
      // 仅当「该入口本身不可用」时才换下一个；服务端已明确拒绝（文件过大等）时不应重试
      if (error instanceof OssUploadError && error.code === 'unreachable') {
        lastError = error;
        continue;
      }
      throw error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new OssUploadError('unreachable', '没有可用的提交入口');
}

/** OSS 的报错为 XML，仅提取 <Code> 错误码展示（响应正文为英文长句，不适合直接展示） */
function ossFailureText(status: number, body: string): string {
  const code = /<Code>([^<]+)<\/Code>/.exec(body || '')?.[1];
  return code ? `HTTP ${status} ${code}` : `HTTP ${status}`;
}
function putToSignedUrl(
  target: SignedTarget,
  file: File,
  onProgress?: (p: UploadProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', target.url, true);
    // 必须与签发时锁定的值完全一致，否则 OSS 回 403 SignatureDoesNotMatch
    xhr.setRequestHeader('Content-Type', target.contentType);
    xhr.upload.onprogress = (e) => {
      if (!onProgress) return;
      // 部分浏览器不提供 lengthComputable（如压缩传输场景），此时以文件大小作为总量兜底
      const total = e.lengthComputable && e.total > 0 ? e.total : file.size;
      onProgress({ loaded: e.loaded, total });
    };
    // 请求体发送完毕但服务端尚未收尾时，部分浏览器不会触发 100% 进度，此处补齐
    xhr.upload.onload = () => {
      if (onProgress) onProgress({ loaded: file.size, total: file.size });
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new OssUploadError('http', ossFailureText(xhr.status, xhr.responseText), xhr.status));
    };
    xhr.onerror = () => reject(new OssUploadError('network', 'network'));
    xhr.onabort = () => reject(new OssUploadError('aborted', 'aborted'));
    xhr.send(file);
  });
}
export async function uploadToOss(
  file: File,
  onProgress?: (p: UploadProgress) => void,
  purpose: OssUploadPurpose = 'file'
): Promise<{ key: string; url: string; orphanMinutes?: number }> {
  // 兜底预检：调用方应先行校验并给出本地化提示，此处再拦截一次以防绕过
  if (file.size > UPLOAD_MAX_BYTES) {
    throw new OssUploadError(
      'too-large',
      `file size ${file.size} exceeds limit ${UPLOAD_MAX_BYTES}`
    );
  }

  const { base, target } = await pickSignedTarget(file, purpose);
  await putToSignedUrl(target, file, onProgress);
  // 上传成功后才记录该入口：签发成功但传输失败时，该入口的可用性存疑
  rememberEndpoint(base);

  if (purpose === 'icon') {
    return {
      key: target.key,
      url: `${base}/api/icon?k=${encodeURIComponent(target.key)}`,
      orphanMinutes: target.orphanMinutes
    };
  }
  return { key: target.key, url: `${OSS_SCHEME}${target.key}`, orphanMinutes: target.orphanMinutes };
}
