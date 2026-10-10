/// <reference types="vite/client" />

// 上传文件到本站的阿里云 OSS —— 浏览器直传，不经任何后端中转。
//
// 链路：
//   ① 把 { name, size, contentType, purpose, fp } 发给提交服务的 /api/oss-sign，换回一条
//      「只能写这一个对象、一小时后过期」的预签名 PUT 地址；
//   ② 浏览器直接 PUT 到 OSS（上传进度即该步骤的进度）；
//   ③ 回填的是对象键而不是公开直链 —— 桶为私有，公开直链任何访问均返回 403。
//
// 两种 purpose，落两个前缀、走两条完全不同的读取路径：
//   file（默认）→ upload/…  私有，读取需经过 /api/dl 的短时票据闸门（见 ossDownload.ts）
//   icon        → icon/…    小图，走 /api/icon 公开只读（审核 Issue 中需可直接打开）
//
// 签名放在服务端完成的原因：
//   本站是纯静态的公开站点，OSS 的 AccessKey 一旦写入前端即等同于公开 —— 任何人都能
//   拿其向桶内写入数据并产生流量费用。AK/SK 仅以 Cloudflare Secret 存储，
//   前端拿到的只是一条有时效、且只能写单个对象的地址。
//
// 为什么 Content-Type 必须原样照抄服务端回传的值：
//   预签名地址把「请求形状」锁死了，Content-Type 是签名的一部分。浏览器 PUT 时一定会带
//   这个头，发的值和签的值对不上就会被 OSS 打回 403 SignatureDoesNotMatch。
//
// 为什么不再有 100 MB 的限制：
//   旧链路需经 Cloudflare Worker 中转，而 Worker 会将整个文件读入 128 MB 的 isolate 内存
//   （非流式），因此当时上限为 100 MB。现在浏览器直连 OSS，中转环节已移除，上限仅取决于
//   OSS 本身（单次 PUT 5 GB）。下方仍保留一道本站自身的闸门。

import { SUBMIT_TIMEOUT_MS, orderedEndpoints, rememberEndpoint } from './submitEndpoints';
import { OSS_SCHEME } from './ossDownload';
import { deviceFingerprint } from './deviceFingerprint';

/**
 * 单文件上限。
 *
 * 该链路中已不存在「中转节点内存」限制，门槛按本站愿意接收的投稿体量确定：
 * 2.5 GB。更大的文件（超大型游戏、整套离线镜像）既增加存储成本又占用下行流量，
 * 且单次 PUT 中途断网需要整体重传 —— 此类文件引导用户填写官网 / GitHub Releases
 * 直链更合理，因此上限定为 2.5 GB，界面同时提示「超限时改用官网直链」。
 *
 * 修改此处需同步修改 Worker 的 OSS_MAX_BYTES（服务端兜底；两侧可以不一致，
 * 但前端上限不得大于服务端，否则用户上传完成后才被拒绝）。
 * 硬上限为 OSS 单次 PUT 的 5 GB；超出则必须改用分片上传。
 */
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

/**
 * 向单个入口请求预签名地址。
 * 仅接受提交服务的 JSON 响应：连不上、超时、或返回其他内容（如回源尚未生效时的
 * nginx HTML 错误页）均视为该入口不可用，由上层换下一个入口。
 */
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

/**
 * 把文件 PUT 到预签名地址，带上传进度。
 * 使用 XHR 而非 fetch —— fetch 不提供上传进度事件。
 */
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

/**
 * 把文件传到 OSS。
 *
 * @returns `{ key, url, orphanMinutes }`：
 *   - key 为对象键（审核流程与删除接口据此定位文件）；
 *   - url 写入数据，表示该对象的读取方式：
 *       软件包 → `oss://对象键`（详情页点下载时换票据，见 ossDownload.ts）
 *       图标   → 提交服务的 /api/icon 公开只读地址（能直接塞进 <img>）
 *   - orphanMinutes 是服务端此刻的回收阈值：对象传上来之后，**这么久之内必须完成提交**，
 *     否则会被当成「传了没提交」的垃圾自动清掉（详见 Worker 的 runGc）。
 *     界面需如实展示该值 —— 该阈值可在线调整，前端硬编码会与服务端不一致。
 * @throws OssUploadError（见 OssUploadErrorCode）
 */
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
