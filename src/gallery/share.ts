
import qrcode from 'qrcode-generator';
import type { Locale } from '../components/i18n/index';

/** 主域名：分享链接一律用它（镜像域名靠 canonical 归并，不作为分享目标） */
export const SHARE_ORIGIN = 'https://classsoftwarehub.cn';

export interface ShareTarget {
  /** 软件 id（详情页路由参数） */
  id: string;
  /** 软件名 */
  name: string;
  /** 一句话简介（数据里可能缺失，允许 undefined） */
  tagline?: string;
  /** 分类中文名（可选） */
  category?: string;
  /** 版本（可选） */
  version?: string;
  /** 体积（可选） */
  size?: string;
  /** 系统限制（可选） */
  system?: string;
}
export function buildShareUrl(id: string): string {
  return `${SHARE_ORIGIN}/#/download/${encodeURIComponent(id)}`;
}
export function buildShareText(target: ShareTarget, locale: Locale = 'zh-CN'): string {
  const lines: string[] = [];
  lines.push(locale === 'en-US' ? `[${target.name}]` : `【${target.name}】`);

  const tagline = (target.tagline || '').trim();
  if (tagline) lines.push(tagline);

  // 关键信息压成一行，用 · 分隔，跳过空值
  const facts = [target.version, target.size, target.system]
    .map((v) => (v || '').trim())
    .filter(Boolean);
  if (facts.length) lines.push(facts.join(' · '));

  lines.push(`${locale === 'en-US' ? 'Download: ' : '下载：'}${buildShareUrl(target.id)}`);
  return lines.join('\n');
}
export function buildQrSvg(text: string): string {
  // typeNumber 0 = 自动选择最小版本
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  // 对象形式只接受 cellSize / margin / scalable / alt（库的类型定义所限），
  // 尺寸交给外层 CSS 控制（.detail-share-qr-img 固定 148px）。
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

/** 该链接能否被「直接打开」（用于决定是否显示「打开」而不是「复制」） */
export function isShareableUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
