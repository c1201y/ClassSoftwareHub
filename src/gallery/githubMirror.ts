// ════════════════════════════════════════════════════════════════════
// githubMirror.ts —— GitHub 下载链接的「国内加速」通道
//
// 为什么需要它：站点里 148 条下载链接有 62 条指向 github.com，而国内直连
// GitHub 下 Releases 常常只有几十 KB/s 甚至直接断流。这里提供几条第三方
// 公益镜像，把原始链接**原样转发**一份，国内下载通常快很多。
//
// 原理很简单 —— 把完整原始链接接在镜像域名后面：
//   https://github.com/a/b/releases/download/v1/x.exe
//   → https://ghfast.top/https://github.com/a/b/releases/download/v1/x.exe
//
// ⚠️ 这些是第三方公益镜像，**不是本站服务**：本站只做链接拼接，不中转、
//    不缓存、不改动任何文件；镜像域名随时可能失效或限速，所以详情页的
//    主按钮永远是 GitHub 官方直链，加速只是额外一条路。
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
 */
export const MIRROR_CHANNELS: MirrorChannel[] = [
  { id: 'ghfast', name: 'ghfast.top', prefix: 'https://ghfast.top/' },
  { id: 'ghproxy', name: 'gh-proxy.com', prefix: 'https://gh-proxy.com/' },
  { id: 'ghproxy-net', name: 'ghproxy.net', prefix: 'https://ghproxy.net/' },
  { id: 'ddlc', name: 'gh.ddlc.top', prefix: 'https://gh.ddlc.top/' }
];

/** 用户上次用的通道存在这里；没存过 / 存的值已经不认识了，就退回清单第一个 */
const CHANNEL_KEY = 'csh-gh-mirror-channel';

export function preferredChannelId(): string {
  try {
    const saved = localStorage.getItem(CHANNEL_KEY);
    if (saved && MIRROR_CHANNELS.some((channel) => channel.id === saved)) return saved;
  } catch {
    /* 无痕模式等读不到 localStorage，忽略即可 */
  }
  return MIRROR_CHANNELS[0].id;
}

export function rememberChannel(id: string): void {
  try {
    localStorage.setItem(CHANNEL_KEY, id);
  } catch {
    /* 忽略 */
  }
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
