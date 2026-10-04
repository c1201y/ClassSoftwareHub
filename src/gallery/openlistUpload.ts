/// <reference types="vite/client" />

// 上传文件到用户自有的 OpenList 网盘（WebDAV / RFC 4918 + Basic Auth）。
//
// 凭据策略（用户 2026-10-03 明确决定）：账号密码写死在前端，配合 OpenList 侧
// 把该账号设为「只允许上传 + 读取，但不能删除/重命名/建目录」，把凭据万一泄露的
// 影响限制在「只能往上传目录塞文件、读回自己上传的文件」这一最小范围。这是用户
// 已知风险下的取舍。
//
// 凭据默认值（仓库内写死，便于开箱即用）；正式部署可用构建变量覆盖：
//   VITE_OPENLIST_DAV     WebDAV 基址，默认 https://pan.132614.xyz/dav
//   VITE_OPENLIST_USER    账号，默认 csh
//   VITE_OPENLIST_PASS    密码，默认 csh
//   VITE_OPENLIST_DIR     上传目录，默认「CSH 数据」（URL 形态 CSH%20%E6%95%B0%E6%8D%AE）
//   VITE_OPENLIST_PUBLIC  公开直链前缀，默认由 DAV 推导：去掉 /dav 段后补 /d
//                        （即 OpenList 的 /d/ 直链路由，回退形态；优先用下方签名直链）
//
// 目标 OpenList 与部署站点的 OpenList 是【同一台】（pan.132614.xyz）：
// 站点部署在 网站/ 下，上传落在 CSH 数据/ 下，两者互不影响（部署只清 网站/ 的构建产物）。
//
// 关键设计——不依赖「Sign all objects」开关：
//   OpenList 对本实例的对象强制签名。改在【上传成功后】用 csh 登录拿 token →
//   调 /api/fs/get 取回该文件的直链，把它回写给站点。游客持该链接即可直接下载、
//   也可作 <img> 源。
//   ⚠️ fs/get 返回的 raw_url 是【相对】代理路径（形如 /api/p/...，非绝对 URL），
//      必须拼上 OpenList 站点根后才能回写（见 getSignedDirectUrl）。
//   ⚠️ csh 账号若有 base_path，raw_url 的路径段可能被重复前置（如 CSH 数据/CSH 数据），
//      但该路径由服务端给出、实测可正常访问，故原样使用、只做绝对化。
//   前提：csh 对上传目录需有【读取】权限（删除保持关闭）。若登录/取链失败，回退 /d/ 形态。
//
// OpenList 侧还需：① 建 /CSH 数据 目录；② 给 csh 账号「上传 + 读取」权限（删除关）；
// ③ 站点与 OpenList 同域（pan.132614.xyz/网站/）时登录/取签为同源、无 CORS 问题；
//    若站点挂在 GitHub Pages / 自有域名（跨域），需对 pan.132614.xyz 放行 CORS。

const DAV_ENV = (import.meta.env.VITE_OPENLIST_DAV as string | undefined)?.trim();
const USER_ENV = (import.meta.env.VITE_OPENLIST_USER as string | undefined)?.trim();
const PASS_ENV = (import.meta.env.VITE_OPENLIST_PASS as string | undefined)?.trim();
const DIR_ENV = (import.meta.env.VITE_OPENLIST_DIR as string | undefined)?.trim();
const PUBLIC_ENV = (import.meta.env.VITE_OPENLIST_PUBLIC as string | undefined)?.trim();

const DAV_BASE = (DAV_ENV || 'https://pan.132614.xyz/dav').replace(/\/+$/, '');
const USER = USER_ENV || 'csh';
const PASS = PASS_ENV || 'csh';
const UPLOAD_DIR = (DIR_ENV || 'CSH 数据').replace(/^\/+|\/+$/g, '');
// 默认走 OpenList 的 /d/ 直链路由：去掉 /dav 段后补 /d，作为回退形态（签名直链优先）
const PUBLIC_BASE = (PUBLIC_ENV || (DAV_BASE.replace(/\/dav(\/.*)?$/i, '$1') + '/d') || DAV_BASE).replace(/\/+$/, '');
// OpenList 站点根（去掉 /dav 段），用于调登录 / fs/get 等 API
const API_BASE = DAV_BASE.replace(/\/dav(\/.*)?$/i, '') || DAV_BASE;

export interface OpenListConfig {
  davBase: string;
  apiBase: string;
  user: string;
  pass: string;
  publicBase: string;
  uploadDir: string;
}

/** 读取配置；本站采用写死凭据策略，永远返回非空配置 */
export function getOpenListConfig(): OpenListConfig {
  return {
    davBase: DAV_BASE,
    apiBase: API_BASE,
    user: USER,
    pass: PASS,
    publicBase: PUBLIC_BASE,
    uploadDir: UPLOAD_DIR,
  };
}

export interface UploadProgress {
  loaded: number;
  total: number;
}

/**
 * 单文件上传硬上限。
 *
 * 这条链路是「浏览器 → Cloudflare Worker → 139 网盘」，真正的墙在 Worker：
 * 其 PUT 处理是 `Buffer.from(await c.req.arrayBuffer())`，整个文件先读进 isolate
 * 内存（非流式），而 CF Worker 内存固定 128 MB 且被同节点并发请求共享。
 * 实测量到 30 / 60 / 95 / 101 MB 均可成功、CF 套餐请求体上限（≥200 MB）不是瓶颈，
 * 故把硬上限设在 100 MB：既能覆盖实测安全区，又能在真正崩之前给出明确提示。
 */
export const UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

/** 超过此大小给「文件较大、上传较慢」的提示，但不阻止上传 */
export const UPLOAD_WARN_BYTES = 50 * 1024 * 1024;

/** 上传失败分类：调用方据此选本地化文案，避免把英文原始报错直接甩给用户 */
export type OpenListUploadErrorCode =
  | 'too-large'      // 本地预检：超过 UPLOAD_MAX_BYTES
  | 'server-limit'   // 服务端拒绝：CF 413（请求体超套餐上限）或 Worker 1102（内存超限）
  | 'network'
  | 'aborted'
  | 'http';

export class OpenListUploadError extends Error {
  readonly code: OpenListUploadErrorCode;
  readonly status: number;
  constructor(code: OpenListUploadErrorCode, message: string, status = 0) {
    super(message);
    this.name = 'OpenListUploadError';
    this.code = code;
    this.status = status;
  }
}

/** 文件名清洗：去掉路径分隔符等非法字符，加随机前缀防重名/覆盖 */
function safeName(file: File): string {
  const raw = file.name
    .replace(/^.*[\\/]/, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/^\.+/, '');
  const clean = raw || 'file';
  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${stamp}-${clean}`.slice(0, 120);
}

/**
 * 用 csh 登录换取 API token（用于后续 fs/get 取签名直链）。
 * csh 凭据已写死在前端，本调用不引入新敏感信息。
 */
async function openListLogin(cfg: OpenListConfig): Promise<string> {
  const r = await fetch(`${cfg.apiBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: cfg.user, password: cfg.pass }),
  });
  if (!r.ok) throw new Error(`login HTTP ${r.status}`);
  const j = await r.json().catch(() => null);
  const token = j?.data?.token;
  if (!token) throw new Error(`login no token (code=${j?.code})`);
  return token;
}

/**
 * 换取带签名的永久直链（:0 永不过期）。失败返回 null，由调用方回退。
 * 需要 csh 对上传目录有读取权限；游客持返回链接无需鉴权即可访问。
 */
async function getSignedDirectUrl(cfg: OpenListConfig, dir: string, name: string): Promise<string | null> {
  try {
    const token = await openListLogin(cfg);
    const r = await fetch(`${cfg.apiBase}/api/fs/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: token },
      body: JSON.stringify({ path: `/${dir}/${name}`, password: '' }),
    });
    if (!r.ok) return null;
    const j = await r.json().catch(() => null);
    if (j?.code !== 200) return null;
    const raw = j?.data?.raw_url || j?.data?.url;
    if (typeof raw !== 'string' || !raw) return null;
    // OpenList 的 raw_url 通常是【相对】代理路径（如 /api/p/...），必须补上 OpenList
    // 站点根，否则回写进站点的链接会被浏览器解析成「站点自身」的路径而打不开。
    // 若已是绝对 URL（部分存储会直接返回外部签名直链），原样返回。
    if (/^https?:\/\//i.test(raw)) return raw;
    return `${cfg.apiBase}${raw.startsWith('/') ? '' : '/'}${raw}`;
  } catch {
    return null;
  }
}

/**
 * 把文件 PUT 到 OpenList 上传目录（带 Basic Auth），随后尽量换取签名直链。
 * @returns 文件的公开访问 URL（可直接用作下载项 url 或图标 icon）
 * @throws 网络错误 / OpenList 返回非 2xx（PUT 阶段）
 */
export function uploadToOpenList(
  file: File,
  onProgress?: (p: UploadProgress) => void
): Promise<{ url: string }> {
  // 兜底预检：调用方应先自查并给出本地化提示，这里再拦一道，防止绕过
  if (file.size > UPLOAD_MAX_BYTES) {
    return Promise.reject(
      new OpenListUploadError(
        'too-large',
        `file size ${file.size} exceeds limit ${UPLOAD_MAX_BYTES}`
      )
    );
  }
  const cfg = getOpenListConfig();
  const storedName = safeName(file);
  // 目录名可能含中文/空格（如「CSH 数据」），整段统一百分号编码，避免 WebDAV 路径歧义
  const dirSeg = encodeURIComponent(cfg.uploadDir);
  const objectPath = `${dirSeg}/${encodeURIComponent(storedName)}`;
  const davUrl = `${cfg.davBase}/${objectPath}`;
  const fallbackUrl = `${cfg.publicBase}/${objectPath}`;
  const auth = btoa(`${cfg.user}:${cfg.pass}`);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', davUrl, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('Authorization', `Basic ${auth}`);
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
    xhr.onload = async () => {
      if (!(xhr.status >= 200 && xhr.status < 300)) {
        const rawBody = xhr.responseText || '';
        // 平台层报错（CF/Worker）返回的是 HTML 错误页；应用自己的报错是 JSON，不要混为一谈
        const looksHtml = /^\s*<(!doctype|html)/i.test(rawBody);
        const detail = rawBody && !looksHtml ? `: ${rawBody.slice(0, 200)}` : '';
        // 413 = CF 套餐请求体超限；1102 = Worker 内存超限。两者对用户都是「文件太大」
        const isLimit =
          xhr.status === 413 ||
          /1102|exceeded resource limits/i.test(rawBody) ||
          (xhr.status >= 500 && looksHtml);
        reject(
          new OpenListUploadError(
            isLimit ? 'server-limit' : 'http',
            `OpenList 返回 ${xhr.status}${detail}`,
            xhr.status
          )
        );
        return;
      }
      // PUT 成功：尝试换取签名直链（游客无需鉴权即可下载、可作 <img> 源）
      const signed = await getSignedDirectUrl(cfg, cfg.uploadDir, storedName).catch(() => null);
      if (signed) resolve({ url: signed });
      else {
        // 取签失败（多半 csh 无读取权限），回退到 /d/ 形态——至少文件已落盘，可在 OpenList 界面取回
        console.warn('[openlistUpload] 取签名直链失败，回退到 /d/ 形态（请确认 csh 对上传目录有读取权限）');
        resolve({ url: fallbackUrl });
      }
    };
    xhr.onerror = () => reject(new OpenListUploadError('network', 'network'));
    xhr.onabort = () => reject(new OpenListUploadError('aborted', 'aborted'));
    xhr.send(file);
  });
}
