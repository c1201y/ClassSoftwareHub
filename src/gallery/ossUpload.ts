/// <reference types="vite/client" />

// 上传文件到本站的阿里云 OSS —— 浏览器直传，不经任何后端中转。
//
// 链路：
//   ① 把 { name, size, contentType, purpose, fp } 发给提交服务的 /api/oss-sign，换回一条
//      「只能写这一个对象、一小时后过期」的预签名 PUT 地址；
//   ② 浏览器自己 PUT 到 OSS（上传进度就是这一步的进度）；
//   ③ 回填的是**对象键**而不是公开直链 —— 桶已经是私有的，直链谁打开都是 403。
//
// 两种 purpose，落两个前缀、走两条完全不同的读取路径：
//   file（默认）→ upload/…  私有，读要过 /api/dl 的短时票据闸门（见 ossDownload.ts）
//   icon        → icon/…    小图，走 /api/icon 公开只读（审核 Issue 里要能直接点开）
//
// 为什么签名放在服务端做：
//   本站是纯静态的公开站点，OSS 的 AccessKey 一旦写进前端就等于公开 —— 任何人都能拿去
//   往桶里灌数据、把流量费烧在别人身上。AK/SK 只以 Cloudflare Secret 存在，
//   前端拿到的只是一条有时效、且只能写单个对象的地址。
//
// 为什么 Content-Type 必须原样照抄服务端回传的值：
//   预签名地址把「请求形状」锁死了，Content-Type 是签名的一部分。浏览器 PUT 时一定会带
//   这个头，发的值和签的值对不上就会被 OSS 打回 403 SignatureDoesNotMatch。
//
// 为什么不再有那个 100 MB 的坎：
//   旧链路要经 Cloudflare Worker 中转，而 Worker 会把整个文件读进 128 MB 的 isolate 内存
//   （非流式），所以当时卡在 100 MB。现在浏览器直连 OSS，中转这一环没了，上限只取决于
//   OSS 本身（单次 PUT 5 GB）。下面仍留一道本站自己的闸门。

import { SUBMIT_TIMEOUT_MS, orderedEndpoints, rememberEndpoint } from './submitEndpoints';
import { OSS_SCHEME } from './ossDownload';
import { deviceFingerprint } from './deviceFingerprint';

/**
 * 单文件上限。
 *
 * 这条链路里已经没有「中转节点内存」这种墙了，所以门槛按「本站到底愿意收多大的投稿」来定：
 * **2.5 GB**。比它大的东西（超大型游戏、整套离线镜像）既压存储费又压下行流量，
 * 而且单次 PUT 中途断网要从头重传 —— 这类交给用户填官网 / GitHub Releases 直链更划算，
 * 所以闸门定在 2.5 GB，界面同时引导「超限就改用官网直链」。
 *
 * 改这里要同时改 Worker 的 OSS_MAX_BYTES（服务端兜底；两边可以不一样大，但不能反着来：
 * 前端比服务端大 = 用户白传半天才被拒）。
 * ⚠️ 天花板是 OSS 单次 PUT 的 5 GB；再大就必须改成分片上传。
 */
export const UPLOAD_MAX_BYTES = 2.5 * 1024 * 1024 * 1024;

/** 超过此大小给「文件较大、上传较慢」的提示，但不阻止上传 */
export const UPLOAD_WARN_BYTES = 1024 * 1024 * 1024;

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

/** 上传失败分类：调用方据此选本地化文案，避免把 OSS 的英文/XML 原始报错直接甩给用户 */
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

/** 本站有没有可用的上传通道（入口清单非空即可；真正的可用性在签发那一步才知道） */
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
 * 向单个入口要一条预签名地址。
 * 只认提交服务的 JSON 响应：连不上、超时、或拿到别的东西（比如回源还没生效时的 nginx
 * HTML 错误页）都算这个入口不可用，由上层换下一个入口。
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

/** 按「上次成功过的优先」的顺序挨个入口试，拿到第一条签好的地址就停 */
async function pickSignedTarget(
  file: File,
  purpose: OssUploadPurpose
): Promise<{ base: string; target: SignedTarget }> {
  let lastError: unknown = null;
  for (const base of orderedEndpoints()) {
    try {
      return { base, target: await requestSignedTarget(base, file, purpose) };
    } catch (error) {
      // 只有「这个入口本身不可用」才值得换下一个；服务已经明确拒绝（文件太大等）就别再试了
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

/** OSS 的报错是 XML，只把 <Code> 抠出来给人看（正文本身是英文长句，不适合直接展示） */
function ossFailureText(status: number, body: string): string {
  const code = /<Code>([^<]+)<\/Code>/.exec(body || '')?.[1];
  return code ? `HTTP ${status} ${code}` : `HTTP ${status}`;
}

/**
 * 把文件 PUT 到预签名地址，带上传进度。
 * 走 XHR 而不是 fetch —— fetch 至今没有上传进度事件。
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
      // 部分浏览器不给 lengthComputable（如压缩传输），此时用文件大小兜底当总量
      const total = e.lengthComputable && e.total > 0 ? e.total : file.size;
      onProgress({ loaded: e.loaded, total });
    };
    // 请求体发完但服务端还在收尾时，有些浏览器不会给最后一帧 100%，这里补齐
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
 *   - key 是对象键（审核流程与删除接口用它定位文件）；
 *   - url 是要写进数据的「怎么读它」：
 *       软件包 → `oss://对象键`（详情页点下载时换票据，见 ossDownload.ts）
 *       图标   → 提交服务的 /api/icon 公开只读地址（能直接塞进 <img>）
 *   - orphanMinutes 是服务端此刻的回收阈值：对象传上来之后，**这么久之内必须完成提交**，
 *     否则会被当成「传了没提交」的垃圾自动清掉（详见 Worker 的 runGc）。
 *     界面要把这个数如实显示出来 —— 它是可以在线调的，写死 15 分钟迟早会对不上。
 * @throws OssUploadError（见 OssUploadErrorCode）
 */
export async function uploadToOss(
  file: File,
  onProgress?: (p: UploadProgress) => void,
  purpose: OssUploadPurpose = 'file'
): Promise<{ key: string; url: string; orphanMinutes?: number }> {
  // 兜底预检：调用方应先自查并给出本地化提示，这里再拦一道，防止绕过
  if (file.size > UPLOAD_MAX_BYTES) {
    throw new OssUploadError(
      'too-large',
      `file size ${file.size} exceeds limit ${UPLOAD_MAX_BYTES}`
    );
  }

  const { base, target } = await pickSignedTarget(file, purpose);
  await putToSignedUrl(target, file, onProgress);
  // 传完了才把入口记下来：签发成功但传输失败，说明这个入口未必好用
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
