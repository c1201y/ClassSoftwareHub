// ════════════════════════════════════════════════════════════════════
// share.ts —— 分享用的纯逻辑（不依赖 Vue，便于单独验证）
//
// 网页版相对桌面版最大的优势之一是「可分享」：桌面版发给同事只能发个
// 安装包，网页版发的是**一条能直接打开的链接**。但链接发到 QQ / 微信里
// 只显示域名，看不出是哪个软件 —— 所以这里负责把「这个软件」表达清楚：
//
//   · buildShareText()  纯文本分享文案（粘贴到群里能看懂）
//   · buildShareUrl()   带定位的链接（打开直达该软件详情页）
//   · buildQrSvg()      二维码 SVG（投屏到教室大屏，全班扫码）
//
// 本文件不产出界面文字 —— 文案在 文字设置.ts 的 share.* 中。
// ════════════════════════════════════════════════════════════════════

import qrcode from 'qrcode-generator';

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

/**
 * 该软件在站内的可分享地址。
 *
 * 本站是 hash 路由，`#/download/<id>` 就是唯一能定位到具体软件的形态。
 * 用绝对地址（带域名）而不是相对路径 —— 分享出去要能直接点开。
 */
export function buildShareUrl(id: string): string {
  return `${SHARE_ORIGIN}/#/download/${encodeURIComponent(id)}`;
}

/**
 * 纯文本分享文案。
 *
 * 设计目标：**粘贴到 QQ / 微信群里，不点链接也知道是什么**。
 * 所以名称 + 简介 + 关键信息（版本/体积/系统）都要有；
 * 但整体控制在 4 行以内，太长的文案在手机上会被折成一屏。
 */
export function buildShareText(target: ShareTarget): string {
  const lines: string[] = [];
  lines.push(`【${target.name}】`);

  const tagline = (target.tagline || '').trim();
  if (tagline) lines.push(tagline);

  // 关键信息压成一行，用 · 分隔，跳过空值
  const facts = [target.version, target.size, target.system]
    .map((v) => (v || '').trim())
    .filter(Boolean);
  if (facts.length) lines.push(facts.join(' · '));

  lines.push(`下载：${buildShareUrl(target.id)}`);
  return lines.join('\n');
}

/**
 * 生成二维码（SVG 字符串）。
 *
 * 用站内已有的 qrcode-generator（提交页 / 二维码工具都在用），
 * 不引入新依赖。纠错级别选 M（15% 容错）：教室投影常有反光、
 * 手机对着屏幕扫，M 比 L 明显更稳，体积又不至于像 H 那样稠密。
 */
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
