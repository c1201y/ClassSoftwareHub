
import { orderedEndpoints } from './submitEndpoints';
import { gt } from './localize';

/** 一条加速通道 */
export interface MirrorChannel {
  /** 稳定标识（用于记住用户上次的选择，一经发布不可变更） */
  id: string;
  /** 列表中显示的名称（即域名） */
  name: string;
  /** 前缀，其后直接拼接原始链接（须以 / 结尾） */
  prefix: string;
  /** 本站自建节点（非第三方公益镜像），文案会区别处理 */
  self?: boolean;
  insecure?: boolean;
}
export const MIRROR_CHANNELS: MirrorChannel[] = [
  {
    id: 'self',
    name: gt('mirror.channel-self'),
    prefix: 'https://download.classsoftwarehub.cn/',
    self: true
  },
  { id: 'ghfast', name: 'ghfast.top', prefix: 'https://ghfast.top/' },
  { id: 'ghproxy', name: 'gh-proxy.com', prefix: 'https://gh-proxy.com/' },
  { id: 'ghproxy-net', name: 'ghproxy.net', prefix: 'https://ghproxy.net/' },
  { id: 'ddlc', name: 'gh.ddlc.top', prefix: 'https://gh.ddlc.top/' }
];

/** 自建节点的固定 id（页面需单独标识它，桌面版取版本号时也依赖它） */
export const SELF_CHANNEL_ID = 'self';

/** 存储用户上次选择的通道；未存储或值已失效时回退默认通道 */
const CHANNEL_KEY = 'csh-gh-mirror-channel';

/** 页面本身是不是跑在 HTTPS 上（没有 location 的环境按不安全处理） */
const PAGE_IS_SECURE = typeof location !== 'undefined' && location.protocol === 'https:';
export function isChannelUsable(channel: MirrorChannel): boolean {
  return !(PAGE_IS_SECURE && channel.prefix.startsWith('http:'));
}

/** 当前页面下可用的通道（自建节点未配置 TLS 时自动排除，仅剩公益镜像） */
export function usableChannels(): MirrorChannel[] {
  return MIRROR_CHANNELS.filter(isChannelUsable);
}

/** 可用通道中用户上次选择的一条；未选择过或所选通道不可用时，返回清单第一条 */
export function preferredChannelId(): string {
  const usable = usableChannels();
  try {
    const saved = localStorage.getItem(CHANNEL_KEY);
    if (saved && usable.some((channel) => channel.id === saved)) return saved;
  } catch {
    /* 无痕模式等读不到 localStorage，忽略即可 */
  }
  return (usable[0] || MIRROR_CHANNELS[0]).id;
}

export function rememberChannel(id: string): void {
  try {
    localStorage.setItem(CHANNEL_KEY, id);
  } catch {
    /* 忽略 */
  }
}
export function orderedChannels(preferred = preferredChannelId()): MirrorChannel[] {
  const usable = usableChannels();
  if (!usable.length) return MIRROR_CHANNELS;
  const first = usable.find((channel) => channel.id === preferred);
  if (!first) return usable;
  return [first, ...usable.filter((channel) => channel !== first)];
}

/** 默认加速通道 = 自建节点（业务约定默认走自建，不被 localStorage 旧选择覆盖） */
export function defaultChannel(): MirrorChannel | null {
  const usable = usableChannels();
  return usable.find((channel) => channel.self) || usable[0] || null;
}

/** 预热只做一次，页面内多次调用不重复发请求 */
let downloadOriginWarmed = false;
export function warmUpDownloadOrigin(): void {
  if (downloadOriginWarmed || typeof window === 'undefined') return;
  const self = MIRROR_CHANNELS.find((channel) => channel.self);
  if (!self || self.insecure || window.location.protocol !== 'https:') return;
  downloadOriginWarmed = true;
  // no-cors：只需要头，不需要读响应体；跨域 204 也不会被 CORS 拦掉
  fetch(`${self.prefix}__h3`, { mode: 'no-cors', cache: 'no-store', keepalive: true }).catch(() => {});
}
export function isMirrorableUrl(url?: string): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const host = parsed.hostname.toLowerCase();
  if (host === 'github.com' || host === 'www.github.com') {
    return /^\/[^/]+\/[^/]+\/(releases\/download|archive)\//.test(parsed.pathname);
  }
  return (
    host === 'objects.githubusercontent.com' ||
    host === 'github-releases.githubusercontent.com' ||
    host === 'codeload.github.com' ||
    host === 'raw.githubusercontent.com'
  );
}

/** 原始链接 → 该通道的加速链接 */
export function mirrorUrl(url: string, channel: MirrorChannel): string {
  return channel.prefix + url;
}

/** 签名链接获取的单入口超时（毫秒）：与投稿服务共用入口，连不上时立即换下一个入口 */
const SIGN_TIMEOUT_MS = 8000;
export async function fetchSelfSignedUrl(target: string): Promise<string | null> {
  for (const base of orderedEndpoints()) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), SIGN_TIMEOUT_MS);
    try {
      // 不带自定义头，保持「简单请求」，不触发 CORS 预检
      const response = await fetch(
        `${base}/api/mirror-sign?url=${encodeURIComponent(target)}`,
        { cache: 'no-store', signal: controller.signal }
      );
      if (!response.ok) continue;
      const data: unknown = await response.json();
      const url = (data as { url?: unknown })?.url;
      if (typeof url === 'string' && url) return url;
    } catch {
      /* 这个入口不通，试下一个 */
    } finally {
      window.clearTimeout(timer);
    }
  }
  return null;
}
