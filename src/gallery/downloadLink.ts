// ════════════════════════════════════════════════════════════════════
// downloadLink.ts —— 「点击后在本页开始下载」的统一下载判定
//
// 背景：站点内一百余条下载项并不都是文件 —— 有的是官方下载页
// （weixin.qq.com/）、有的是网盘分享页（蓝奏云 / 百度网盘）、有的是商店页。
// 若一律 `window.open(url, '_blank')`，文件也会闪出一个新标签页，而真正的
// 网页与文件在呈现上没有区别，用户点击前无法预知行为。
//
// 统一规则：能直接下载的原地下载，不能的如实告知用户将跳转到哪里。
//
//   file     文件直链    → 隐藏 <a> 触发下载：当前页不跳转、不弹标签
//   store    应用商店    → 交给详情页的商店卡片（apps.microsoft.com）
//   netdisk  第三方网盘  → 必须跳转（需要密码 / 登录 / 客户端，无法直接下载）
//   page     官网下载页  → 必须跳转（链接由 JS 生成或携带签名，浏览器无法直接获取）
//
// 判定顺序为「数据里显式声明 → 再按域名/扩展名推断」，不可颠倒：
//    geogebra 的包地址不带扩展名（/package/win-autoupdate），bandizip 是 .php，
//    uu 远程是 /api/v1/release/dl/1 —— 仅凭 URL 无法推断，必须在 JSON 中声明
//    `"kind": "file"`。字段说明见 软件数据/README-维护手册.md 的 2.4 节。
//
// 本套分类与 CI 脚本 scripts/untracked-buckets.mjs 的口径使用同一套词
// （always-latest / store / archive / page-only / netdisk），需保持一致。
//
// 本文件不产出界面文字 —— 文案在 文字设置.ts 的 detail.* 中。
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
 * 文件扩展名 —— 命中即视为直链。
 *
 * 此处仅作兜底推断：漏判的代价是「文件被当作网页跳转」，误判的代价是
 * 「点击链接导致当前页被导航走」。因此表中只收录确定是安装包/压缩包的
 * 后缀，不放 .php / .html / .asp 等可能返回网页的类型。
 */
const FILE_EXT_RE =
  /\.(?:exe|msi|msix|msixbundle|appx|appxbundle|appinstaller|zip|7z|rar|tar|tar\.gz|tgz|tar\.xz|txz|tar\.bz2|tbz2|gz|bz2|xz|zst|dmg|pkg|apk|aab|deb|rpm|iso|img|cab|bin|jar|crx|appimage|flatpak|snap|nupkg)(?:[?#]|$)/i;

/** 本站 OSS 对象（`oss://对象键`）：桶为私有，读取由 ossDownload.ts 负责换票 */
const OSS_OBJECT_RE = /^oss:\/\//i;

/**
 * 允许写进 href / window.open 的协议白名单。
 *
 * 下载项 URL 的源头有两处：维护者手写的 JSON、投稿工作流从用户 Issue 里抄来的字段。
 * 后者是不可信输入 —— `javascript:alert(1)` 这类串一旦进了 apps/<id>.json，
 * 点一下下载就是存储型 XSS。所以除白名单协议外一律当「不是链接」处理。
 * （服务端 validate() 已经按同一张白名单拒过一次，这里是前端的第二道闸。）
 */
const SAFE_URL_RE = /^(?:https?:\/\/|ms-windows-store:)/i;

const DECLARED: readonly DownloadKind[] = ['file', 'store', 'netdisk', 'page'];

/**
 * 一条下载项该怎么落地。
 *
 * 顺序：数据中显式声明了 kind 且取值合法 → 直接使用；否则按 URL 推断。
 * 数据中的声明永远优先，因为只有维护者知道无扩展名的地址是否为文件。
 */
export function kindOf(download?: DownloadItem | null): DownloadKind {
  const url = (download?.url || '').trim();

  const declared = (download as { kind?: unknown } | undefined)?.kind;
  if (typeof declared === 'string' && (DECLARED as readonly string[]).includes(declared)) {
    return declared as DownloadKind;
  }

  // 无 url 的项（数据清理后的残留）按网页处理，跳转时不会产生异常
  if (!url) return 'page';
  // 白名单以外的协议（javascript: / data: / vbscript: / file: …）一律不导航。
  // 返回 'page' 只是为了让界面按「跳转」显示 —— 真正的拦截在 triggerDownload /
  // 详情页 window.open 那层，它们会认出这不是可导航地址。
  if (!SAFE_URL_RE.test(url) && !OSS_OBJECT_RE.test(url)) return 'page';

  if (STORE_RE.test(url) || /^ms-windows-store:/i.test(url)) return 'store';
  if (NETDISK_RE.test(url)) return 'netdisk';
  // 本站 OSS 对象一律视为文件：对象键末段是否带扩展名无法约束，
  // 但读取方式（换票据后下载）是确定的，交给详情页的 openDownload 处理。
  if (OSS_OBJECT_RE.test(url)) return 'file';
  if (FILE_EXT_RE.test(url)) return 'file';
  return 'page';
}

/** 这条下载项能不能在本页直接下载（详情页主按钮的文案与行为都看它） */
export const isDirectDownload = (download?: DownloadItem | null): boolean =>
  kindOf(download) === 'file';

/**
 * 该地址能否安全地发起导航/下载。
 * 导出供详情页使用：window.open 前先校验，不安全则不打开。
 */
export const isSafeNavigateUrl = (url: string): boolean =>
  SAFE_URL_RE.test((url || '').trim());

/**
 * 触发一次下载。
 *
 * 使用隐藏的 <a> 而不是 window.open：不带 target，因此是「在当前页发起导航」——
 * 响应为文件时浏览器只会弹出下载、页面留在原地（即「本页直接下载」的实现）；
 * 使用 window.open 会多弹一个标签页，且新标签可能被部分浏览器的弹窗拦截。
 * desktopDownload.ts 触发桌面版安装包下载也使用同一手法。
 *
 * 不可添加 download 属性：跨域时它会被浏览器忽略，且会误导维护者以为文件名可控。
 */
export function triggerDownload(url: string): void {
  // oss:// 不是浏览器可识别的协议，直接写入 href 会导致整页导航失败 ——
  // 正常情况下进入此处的 url 已经换票（resolveDownloadUrl）变为 https；
  // 若上游未换票，在此拦截优于将伪协议写入导航。
  if (!isSafeNavigateUrl(url)) {
    console.warn('[download] 拒绝非 http(s) 的下载地址:', url.slice(0, 60));
    return;
  }
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
