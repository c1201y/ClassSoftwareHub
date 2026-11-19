
import type { DownloadItem } from './data';

/** 一条下载项的落地方式 */
export type DownloadKind = 'file' | 'store' | 'netdisk' | 'page';

/** Microsoft Store 的应用页（含协议链接）*/
const STORE_RE =
  /^https?:\/\/(?:apps\.microsoft\.com|(?:www\.)?microsoft\.com\/store|store\.microsoft\.com)\//i;

/** 网盘分享页 —— 这些一律是「跳转」而不是「下载」 */
const NETDISK_RE =
  /^https?:\/\/(?:[\w-]+\.)*(?:pan\.baidu\.com|pan\.quark\.cn|123pan\.com|123684\.com|123865\.com|123912\.com|lanzou[a-z]?\.com|lanzoui\.com|lanzoux\.com|aliyundrive\.com|alipan\.com|cloud\.189\.cn|weiyun\.com|cowtransfer\.com|drive\.uc\.cn|115\.com)\//i;
const FILE_EXT_RE =
  /\.(?:exe|msi|msix|msixbundle|appx|appxbundle|appinstaller|zip|7z|rar|tar|tar\.gz|tgz|tar\.xz|txz|tar\.bz2|tbz2|gz|bz2|xz|zst|dmg|pkg|apk|aab|deb|rpm|iso|img|cab|bin|jar|crx|appimage|flatpak|snap|nupkg)(?:[?#]|$)/i;

/** 本站 OSS 对象（`oss://对象键`）：桶为私有，读取由 ossDownload.ts 负责换票 */
const OSS_OBJECT_RE = /^oss:\/\//i;
const SAFE_URL_RE = /^(?:https?:\/\/|ms-windows-store:)/i;

const DECLARED: readonly DownloadKind[] = ['file', 'store', 'netdisk', 'page'];
export function kindOf(download?: DownloadItem | null): DownloadKind {
  const url = (download?.url || '').trim();

  const declared = (download as { kind?: unknown } | undefined)?.kind;
  if (typeof declared === 'string' && (DECLARED as readonly string[]).includes(declared)) {
    return declared as DownloadKind;
  }

  // 无 url 的项（数据清理后的残留）按网页处理，跳转时不会产生异常
  if (!url) return 'page';
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
export const isSafeNavigateUrl = (url: string): boolean =>
  SAFE_URL_RE.test((url || '').trim());
export function triggerDownload(url: string): void {
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
