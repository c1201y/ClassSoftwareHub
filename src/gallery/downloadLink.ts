// ════════════════════════════════════════════════════════════════════
// downloadLink.ts —— 「点一下就在本页开始下载」的统一下载判定
//
// 为什么需要它：站点里 170 多条下载项并不都是文件 —— 有的是官方下载页
// （weixin.qq.com/）、有的是网盘分享页（蓝奏云 / 百度网盘）、有的是商店页。
// 以前详情页一律 `window.open(url, '_blank')`，于是**文件也会闪一个新标签**，
// 而真正是网页的又和文件长得一模一样，用户点之前根本不知道会去哪。
//
// 现在的规矩只有一条：**能直下的就原地下，不能的就如实告诉用户要去哪。**
//
//   file     文件直链    → 隐藏 <a> 触发下载：当前页不动、不闪标签
//   store    应用商店    → 交给详情页的商店卡片（apps.microsoft.com）
//   netdisk  第三方网盘  → 必须跳转（要密码 / 登录 / 客户端，物理上做不到直下）
//   page     官网下载页  → 必须跳转（链接由 JS 生成或带签名，浏览器取不到）
//
// ⚠️ 判定顺序是「数据里显式声明 → 再按域名/扩展名推断」，不是反过来：
//    geogebra 的包地址不带扩展名（/package/win-autoupdate），bandizip 是 .php，
//    uu 远程是 /api/v1/release/dl/1 —— 光看 URL 推不出来，必须在 JSON 里写
//    `"kind": "file"`。字段说明见 软件数据/README-维护手册.md 的 2.4 节。
//
// 这套分档和 CI 里的口径是**同一套词**（scripts/untracked-buckets.mjs 的
// always-latest / store / archive / page-only / netdisk），别另起炉灶。
//
// 本文件不产出界面文字 —— 文案在 文字设置.ts 的 detail.* 里。
// ════════════════════════════════════════════════════════════════════

import type { DownloadItem } from './data';

/** 一条下载项的落地方式 */
export type DownloadKind = 'file' | 'store' | 'netdisk' | 'page';

/** Microsoft Store 的应用页（含协议链接）*/
const STORE_RE =
  /^https?:\/\/(?:apps\.microsoft\.com|(?:www\.)?microsoft\.com\/store|store\.microsoft\.com)\//i;

/** 网盘分享页 —— 这些一律是「跳转」而不是「下载」 */
const NETDISK_RE =
  /^https?:\/\/(?:[\w-]+\.)*(?:pan\.baidu\.com|pan\.quark\.cn|123pan\.com|123684\.com|123865\.com|123912\.com|lanzou[a-z]?\.com|lanzoui\.com|lanzoux\.com|aliyundrive\.com|alipan\.com|cloud\.189\.cn|weiyun\.com|cowtransfer\.com|drive\.uc\.cn|115\.com)\//i;

/**
 * 文件扩展名 —— 命中就当直链。
 *
 * 这里只是**兜底推断**，宁可多列几个冷门后缀：漏判的代价是「明明是文件却要跳转」，
 * 而误判的代价是「点了链接把当前页导航走了」，所以表里只放「确定是安装包/压缩包」
 * 的后缀，不放 .php / .html / .asp 这类可能返回网页的。
 */
const FILE_EXT_RE =
  /\.(?:exe|msi|msix|msixbundle|appx|appxbundle|appinstaller|zip|7z|rar|tar|tar\.gz|tgz|tar\.xz|txz|tar\.bz2|tbz2|gz|bz2|xz|zst|dmg|pkg|apk|aab|deb|rpm|iso|img|cab|bin|jar|crx|appimage|flatpak|snap|nupkg)(?:[?#]|$)/i;

const DECLARED: readonly DownloadKind[] = ['file', 'store', 'netdisk', 'page'];

/**
 * 一条下载项该怎么落地。
 *
 * 顺序：数据里显式写了 kind 且取值合法 → 用它；否则按 URL 推断。
 * 数据里的声明**永远优先**，因为只有维护者知道那个没扩展名的地址到底是不是文件。
 */
export function kindOf(download?: DownloadItem | null): DownloadKind {
  const url = (download?.url || '').trim();

  const declared = (download as { kind?: unknown } | undefined)?.kind;
  if (typeof declared === 'string' && (DECLARED as readonly string[]).includes(declared)) {
    return declared as DownloadKind;
  }

  // 没有 url 的项（维护者删剩的壳）当作网页处理，跳转时也不会出事
  if (!url) return 'page';

  if (STORE_RE.test(url) || /^ms-windows-store:/i.test(url)) return 'store';
  if (NETDISK_RE.test(url)) return 'netdisk';
  if (FILE_EXT_RE.test(url)) return 'file';
  return 'page';
}

/** 这条下载项能不能在本页直接下载（详情页主按钮的文案与行为都看它） */
export const isDirectDownload = (download?: DownloadItem | null): boolean =>
  kindOf(download) === 'file';

/**
 * 触发一次下载。
 *
 * 用隐藏的 <a> 而不是 window.open：**不带 target**，所以是「在当前页发起导航」——
 * 响应是文件时浏览器只会弹出下载、页面留在原地（这正是「本页直接下载」的实现）；
 * 用 window.open 会多闪一个标签页，而且新标签会被部分浏览器的弹窗拦截吃掉。
 * desktopDownload.ts 里触发桌面版安装包用的也是这个手法。
 *
 * 注意不要加 download 属性：跨域时它会被浏览器忽略，加了反而让人误以为文件名可控。
 */
export function triggerDownload(url: string): void {
  if (!url) return;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
