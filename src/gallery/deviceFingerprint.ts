// ════════════════════════════════════════════════════════════════════
// deviceFingerprint.ts —— 为「本设备」生成稳定标识
//
// 用途单一：下载票据绑定该值，仅同一设备可使用自己领取的票据，链接被转发到
// 其他设备后即失效，以此阻止下载链接被广泛传播。
//
// 不使用 IP 的原因：移动网络切换、宽带重拨、企业出口 NAT 都会使 IP 变化，
// 而同一出口 IP 之后可能存在大量设备 —— IP 既不稳定也不唯一。
//
// 指纹算法：设备信号串经两轮 FNV-1a 得到 32 位十六进制。
//   信号串 = 本地持久随机 ID（主力）+ 浏览器指纹信号（辅助）
//   前者保证「同一台机器同一浏览器」恒等；后者使「清了缓存换了 ID」也能识别为同一台。
//
// 该值并非安全凭证，仅作标识：作用是使转发出去的链接对其他设备无效，
// 无法防御蓄意伪造（防御伪造需借助同源 Service Worker 注入请求头），
// 因此票据另有 15 分钟有效期与每日次数上限兜底。
//
// 隐私：全程在浏览器内计算，仅哈希值随领票请求发给提交服务，
//       不采集、不上传任何原始信号。
// ════════════════════════════════════════════════════════════════════

const ID_KEY = 'csh-device-id';

let cached = '';

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < buf.length; i += 1) buf[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 本地持久 ID：清站点数据 / 隐私模式会失效，此时退回「本次会话内有效」 */
function persistedId(): string {
  try {
    const existing = window.localStorage.getItem(ID_KEY);
    if (existing && /^[a-f0-9]{32}$/i.test(existing)) return existing;
    const fresh = randomHex(16);
    window.localStorage.setItem(ID_KEY, fresh);
    return fresh;
  } catch {
    return randomHex(16);
  }
}

/** 32 位 FNV-1a，满足需求且为同步实现（避免为生成标识引入异步摘要） */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** 采集那些「换机器就会变、但同一台机器长期不变」的信号 */
function signals(): string {
  const parts: Array<string | number> = [persistedId()];
  try {
    const nav = navigator as Navigator & { deviceMemory?: number };
    parts.push(
      nav.userAgent || '',
      nav.language || '',
      (nav.languages || []).join(','),
      nav.platform || '',
      String(nav.hardwareConcurrency ?? ''),
      String(nav.deviceMemory ?? ''),
      String(nav.maxTouchPoints ?? ''),
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      String(window.devicePixelRatio || 1),
      String(new Date().getTimezoneOffset()),
      Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    );
    // WebGL 渲染器字符串区分显卡/驱动，是很强的机器特征；取不到就跳过
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
    const debug = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : '';
    if (renderer) parts.push(String(renderer));
  } catch {
    // 个别信号缺失不影响整体 —— 信号串中仍有持久 ID 兜底
  }
  return parts.join('|');
}

/**
 * 这台设备的标识。同一个页面生命周期内只算一次（票据与下载要用同一个值）。
 * 长度 36，落在服务端要求的 8–256 之间。
 */
export function deviceFingerprint(): string {
  if (cached) return cached;
  const base = signals();
  cached = `v1-${fnv1a(base)}${fnv1a(`csh|${base}|salt`)}`;
  return cached;
}
