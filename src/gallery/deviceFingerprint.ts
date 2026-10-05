// ════════════════════════════════════════════════════════════════════
// deviceFingerprint.ts —— 给「这台设备」起一个稳定的名字
//
// 用途只有一个：下载票据会绑到这个值上。同一台设备才拿得走自己领的票，
// 一条链接被转发到别人机器上就失效了 —— 这是挡住「一个下载链接传遍全网」的那道闸。
//
// 为什么不用 IP：手机切 WiFi、宽带重播号、公司出口 NAT，IP 说变就变；
// 反过来同一个出口 IP 后面能坐一整间机房。IP 既不稳也不唯一。
//
// 指纹怎么算：一段「设备信号串」经两轮 FNV-1a 得到 32 位十六进制。
//   信号串 = 本地持久随机 ID（主力）+ 浏览器指纹信号（辅助）
//   前者保证「同一台机器同一浏览器」恒等；后者让「清了缓存换了 ID」也还能认出是同一台。
//
// ⚠️ 这不是安全凭证，只是**标识**：它的作用是让转发出去的链接对别人无效，
//    不是防住铁了心要伪造的人（那需要同源 Service Worker 才能做到的请求头注入）。
//    所以票据另有 15 分钟有效期与每日次数上限兜底。
//
// 隐私：全程在浏览器里算，只有那个哈希值会随领票请求发给提交服务，
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

/** 32 位 FNV-1a，够用且同步（不想为了一个标识去 await 一个异步摘要） */
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
    // 拿不到某几项不影响整体 —— 信号串里还有持久 ID 兜底
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
