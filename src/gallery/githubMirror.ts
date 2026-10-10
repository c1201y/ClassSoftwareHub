// ════════════════════════════════════════════════════════════════════
// githubMirror.ts —— GitHub 下载链接的「国内加速」通道
//
// 背景：站点内大量下载链接指向 github.com，而国内直连 GitHub 下载 Releases
// 常常只有几十 KB/s 甚至断流。本文件提供若干加速通道，将原始链接原样
// 拼接转发，国内下载速度通常显著提升。
//
// 原理：把完整原始链接接在镜像域名后面：
//   https://github.com/a/b/releases/download/v1/x.exe
//   → https://ghfast.top/https://github.com/a/b/releases/download/v1/x.exe
//
// 通道分两类：
//   · 自建节点（self）—— 本站维护的中转服务器，排最前、优先使用；
//   · 第三方公益镜像 —— 自建节点不可用时的备用通道，随时可能失效或限速。
//
// 混合内容约束（修改前务必确认）：
//    浏览器禁止「HTTPS 页面下载 HTTP 文件」——Chrome 88+ 与 Firefox 都会把
//    这种下载判定为 mixed content download 并直接拦截（控制台报 Mixed Content，
//    下载面板无任何提示，用户只会认为按钮失效）。本站为 HTTPS，任何
//    `http://` 的镜像通道在站内均不可用。
//    因此本文件提供 isChannelUsable() 守卫：https 页面下自动跳过 http 通道。
//    目前所有通道均为 https，守卫不会拦截任何一条 —— 但不可删除：以后临时
//    接入未配置证书的节点时依赖它兜底，否则表现为「点击后毫无反应」这类最难排查的故障。
//    该判断仅保留在此一处，页面与桌面版均调用它，不重复实现。
//
// 本文件不产出界面文字 —— 文案均在 文字设置.ts 的 detail.mirror-* 中。
// ════════════════════════════════════════════════════════════════════

import { orderedEndpoints } from './submitEndpoints';

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
  /**
   * 该通道目前仅有 http（未配置 TLS）。
   * HTTPS 页面上浏览器会按混合内容规则拦截其下载，isChannelUsable() 会在
   * https 页面下跳过它。配置证书后：prefix 改为 https:// 并删除本字段。
   */
  insecure?: boolean;
}

/**
 * 通道清单 —— 按推荐顺序排列，第一条是「未选择过」时的默认值。
 *
 * ┌─ 通道增删规范 ────────────────────────────────────────────────┐
 * │ 复制一行并修改 id / name / prefix 即可。                       │
 * │ prefix 后面拼接的是完整原始链接（带 https://），写法与        │
 * │ githubImport.ts 中两个镜像一致。                              │
 * │ 新增前必须实测验证（不可照抄网上的名单）：                     │
 * │    HEAD 应返回 200 + Content-Type: application/octet-stream；  │
 * │    GET 带 Range 应返回 206（支持断点续传）；                   │
 * │    完整下载一个小文件并比对官方 sha256，确认内容未被篡改。      │
 * │    仅返回 30x / HTML 页面的一律不收录 —— 通常是域名被抢注。    │
 * │ 域名失效后应立即删除对应条目。                                 │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 自建节点部署于日本东京（nginx 反代 + Let's Encrypt 证书），使用固定域名
 *   https://download.classsoftwarehub.cn/。
 * 节点端启用双重防盗链，不能使用「前缀直拼」方式（拼接后返回 403）：
 *   ① Referer 白名单（站内各域名已放行，浏览器下载时自动携带）；
 *   ② 下载必须携带限时签名（HMAC-SHA256，默认 15 分钟过期）。签发接口 /sign
 *   需要 X-Api-Key 鉴权，密钥不能进入公开前端 —— 由本站 Worker 代签：
 *   前端 GET {入口}/api/mirror-sign?url=<直链> → Worker 使用密钥调用节点 /sign
 *   → 返回 /d?u=..&e=..&s=.. 临时链接。见下方 fetchSelfSignedUrl()。
 */
export const MIRROR_CHANNELS: MirrorChannel[] = [
  {
    id: 'self',
    name: '本站加速节点',
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

/**
 * 该通道在当前页面下是否可用。
 *
 * 唯一的否决理由是混合内容：https 页面上不能下载 http 文件。
 * 此判断不可删除 —— 删除后的表现为「点击后毫无反应」，
 * 且仅打开开发者工具才能看到原因，极难排查。
 */
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

/**
 * 上次使用的通道排最前，其余按清单顺序。
 *
 * `preferred` 可显式传入（页面将其存为 ref，切换通道后能跟随重排）；
 * 不传则读取一次 localStorage（适用于桌面版等一次性调用场景）。
 */
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

/**
 * 该下载链接能否走镜像。
 *
 * 仅识别「GitHub 上的文件地址」——仓库主页、第三方官网直链不显示加速按钮：
 *   github.com/o/r/releases/download/...   各版本安装包（站点里的绝大多数）
 *   github.com/o/r/archive/...             仓库源码压缩包
 *   objects.githubusercontent.com / codeload.github.com / raw...  文件真正落地的域名
 */
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

/**
 * 向本站 Worker 要自建节点的限时签名下载链接。
 *
 * 自建节点开了「无签名一律 403」的防盗链，签发接口又要 X-Api-Key 鉴权 ——
 * 密钥不能进公开前端，所以由 Worker 代签（服务端到服务端），前端只拿到
 * 一个 15 分钟后过期、只能下这一个文件的临时链接。接口入口复用投稿服务
 * 那两个域名（orderedEndpoints 会记住上次成功的那个）。
 *
 * @returns 签名后的完整下载地址；所有入口均不可用（未配置 / 节点失效 / 超时）时
 *          返回 null，调用方应退回公益镜像，不得将原始直链拼接到 self 前缀上。
 */
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
