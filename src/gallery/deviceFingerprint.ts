
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
export function deviceFingerprint(): string {
  if (cached) return cached;
  const base = signals();
  cached = `v1-${fnv1a(base)}${fnv1a(`csh|${base}|salt`)}`;
  return cached;
}
