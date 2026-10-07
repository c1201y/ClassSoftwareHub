// ════════════════════════════════════════════════════════════════════
// githubMirror.ts —— GitHub 下载链接的「国内加速」通道
//
// 为什么需要它：站点里 148 条下载链接有 62 条指向 github.com，而国内直连
// GitHub 下 Releases 常常只有几十 KB/s 甚至断流。这里提供几条加速通道，
// 把原始链接**原样转发**一份，国内下载通常快很多。
//
// 原理很简单 —— 把完整原始链接接在镜像域名后面：
//   https://github.com/a/b/releases/download/v1/x.exe
//   → https://ghfast.top/https://github.com/a/b/releases/download/v1/x.exe
//
// 通道分两类：
//   · 自建节点（self）—— 本站维护的那台中转服务器，排在最前、优先用；
//   · 第三方公益镜像 —— 自建节点不通时的备用路，随时可能失效或限速。
//
// ⚠️ **混合内容这条红线（改之前务必先读）**：
//    浏览器禁止「HTTPS 页面下载 HTTP 文件」——Chrome 88+ 与 Firefox 都会把
//    这种下载判为 mixed content download **直接拦掉**（控制台报 Mixed Content，
//    下载面板里什么都不出现，用户只会以为按钮坏了）。本站是 HTTPS，所以任何
//    `http://` 的镜像通道在站上都是**点不动的**。
//    本文件因此有 isChannelUsable() 守卫：https 页面下自动跳过 http 通道。
//    目前所有通道都是 https，守卫不会拦任何一条 —— 但**别删**：以后临时加一个
//    还没配证书的节点，全靠它兜住，否则表现是「点下去毫无反应」这种最难排查的故障。
//    判断只留在这里一处，页面与桌面版都调它，不要各写一份。
//
// 本文件不产出界面文字 —— 文案都在 文字设置.ts 的 detail.mirror-* 里。
// ════════════════════════════════════════════════════════════════════

/** 一条加速通道 */
export interface MirrorChannel {
  /** 稳定标识（用于记住用户上次的选择，**定了就别改**） */
  id: string;
  /** 列表里显示的名字 —— 就是域名，用户认的就是这个 */
  name: string;
  /** 前缀，后面直接拼原始链接（注意要以 / 结尾） */
  prefix: string;
  /** 本站自建节点（不是第三方公益）—— 文案会区别对待 */
  self?: boolean;
  /**
   * 这条通道目前只有 http（还没配 TLS）。
   * HTTPS 页面上浏览器会按混合内容把它的下载拦掉，所以 isChannelUsable() 会在
   * https 页面下跳过它。**配上证书后：prefix 换成 https:// 、删掉这一行即可。**
   */
  insecure?: boolean;
}

/**
 * 通道清单 —— 按推荐顺序排，第一个是「没选过」时的默认值。
 *
 * ┌─ 怎么加 / 删一条通道 ─────────────────────────────────────────┐
 * │ 照抄一行改掉 id / name / prefix 就行。                         │
 * │ prefix 后面拼的是**完整原始链接**（带 https://）——这是本项目   │
 * │ 已经在用的写法，githubImport.ts 里那两个镜像同款。              │
 * │ ⚠️ 加之前先实测一遍（别照抄网上的名单）：                        │
 * │    HEAD 应返回 200 + Content-Type: application/octet-stream；  │
 * │    GET 带 Range 应返回 206（支持断点续传）；                    │
 * │    再完整下一个小文件比对官方 sha256，确认内容没被改动。          │
 * │    只回 30x / HTML 页面的一律不要 —— 那种多半是域名被抢注了。    │
 * │ 域名挂了就直接删掉那一行，别留着。                             │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 2026-09-19 实测（完整下载 7z2603-x64.msi 比对 sha256，全部与官方一致）：
 *   通过 ghfast.top / gh-proxy.com / ghproxy.net / gh.ddlc.top / gh.xxooo.cf
 *   删除 gh-proxy.net —— 域名已被抢注：HEAD 返回 302 跳 survey-smiles.com
 *        （广告站），GET 返回一个 JS 跳转页，连裸域名都跳。
 *
 * 2026-10-06 实测自建节点（日本东京，nginx 反代 + Let's Encrypt 证书）：
 *   2026-10-07 起换成固定域名 https://download.classsoftwarehub.cn/（不再用裸 IP，
 *   省去 IP 证书 160 小时续期的运维负担）。
 *   ⚠️ 节点端有**防盗链**：① Referer 白名单（站内各域名已放行）；
 *   ② 需要签名链接（不带签名返回 403「需使用签名链接」）——签名方案待定，
 *   未接上前这条通道会 403，用户可走「换个镜像」用公益镜像兜底。
 *   老地址 https://209.33.174.187/ 与本域名是同一台服务器，行为一致。
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

/** 自建节点的固定 id（页面要单独标它、桌面版取版本号也认它） */
export const SELF_CHANNEL_ID = 'self';

/** 用户上次用的通道存在这里；没存过 / 存的值已经不认识了，就退回默认那条 */
const CHANNEL_KEY = 'csh-gh-mirror-channel';

/** 页面本身是不是跑在 HTTPS 上（没有 location 的环境按不安全处理） */
const PAGE_IS_SECURE = typeof location !== 'undefined' && location.protocol === 'https:';

/**
 * 这条通道在当前页面下能不能用。
 *
 * 唯一的否决理由就是混合内容：https 页面上不能下载 http 文件。
 * 别把这条判断删掉 —— 删了的表现是「按钮点下去毫无反应」，
 * 而且只有打开开发者工具才看得到原因，最难排查。
 */
export function isChannelUsable(channel: MirrorChannel): boolean {
  return !(PAGE_IS_SECURE && channel.prefix.startsWith('http:'));
}

/** 当前页面下可用的通道（自建节点没配 TLS 时会自动隐身，只剩公益镜像） */
export function usableChannels(): MirrorChannel[] {
  return MIRROR_CHANNELS.filter(isChannelUsable);
}

/** 可用的通道里，用户上次选的那条；没选过 / 选的那条不可用，就给清单里第一条 */
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
 * 上次用过的通道排到最前，其余按清单顺序 —— 常用的话能少点一下。
 *
 * `preferred` 可以显式传（页面里存成 ref，这样换过通道后能跟着重排）；
 * 不传就现读一次 localStorage（桌面版那种一次性的调用点）。
 */
export function orderedChannels(preferred = preferredChannelId()): MirrorChannel[] {
  const usable = usableChannels();
  if (!usable.length) return MIRROR_CHANNELS;
  const first = usable.find((channel) => channel.id === preferred);
  if (!first) return usable;
  return [first, ...usable.filter((channel) => channel !== first)];
}

/** 默认加速通道 = 自建节点（用户明确要求默认走自建，不被 localStorage 旧选择覆盖） */
export function defaultChannel(): MirrorChannel | null {
  const usable = usableChannels();
  return usable.find((channel) => channel.self) || usable[0] || null;
}

/**
 * 这个下载链接能不能走镜像。
 *
 * 只认「GitHub 上的文件地址」——仓库主页、别人的官网直链都不该出现加速按钮：
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
