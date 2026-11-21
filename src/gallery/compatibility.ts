// ════════════════════════════════════════════════════════════════════
// compatibility.ts —— 判断「这台电脑能不能装这个软件」
//
// 详情页原先只静态展示「支持系统：Windows 10/11」这行文字，用户得自己
// 对一遍「我是 Win10 还是 Win11」。这里把浏览器能判断的部分自动做掉：
//   · 操作系统（Windows / macOS / Linux / Android / iOS）与版本
//   · 系统架构（x64 / ARM64）
//   · 屏幕尺寸（手机 / 平板 / 桌面）
//
// ⚠️ 边界必须说清楚：浏览器**拿不到**真实硬件信息（CPU 型号、内存、
//    显卡），UA 上报的系统也声明不了全部情况（比如 ARM 版 Windows 会在
//    UA 里伪装成 x64）。所以本模块只输出三档结论：
//      兼容 / 不兼容 / 无法确定
//    「无法确定」比「编一个答案」诚实，页面文案也解释原因。
//
// 本文件不产出界面文字 —— 文案在 文字设置.ts 的 compat.* 中。
// ════════════════════════════════════════════════════════════════════

/** 浏览器能识别出的系统族 */
export type PlatformFamily = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown';

/** 探测结果 */
export interface DeviceProfile {
  family: PlatformFamily;
  /** 人类可读的系统名，如「Windows 11」「macOS」 */
  label: string;
  /** 主版本号，识别不出时为 null（如 Windows 识别不出就 null） */
  majorVersion: number | null;
  /** 架构：'x64' | 'arm64' | null（识别不出） */
  arch: string | null;
  /** 是否为触屏 / 手机形态（用屏幕宽度 + 触点数粗判） */
  mobile: boolean;
}

/** 兼容结论 */
export type CompatVerdict = 'ok' | 'no' | 'unknown';

export interface CompatResult {
  verdict: CompatVerdict;
  /** 命中的是哪个平台 key（platforms.json 里的） */
  platform: PlatformFamily;
  /** 解释性文案的 i18n key */
  reasonKey: string;
  /** 插值参数 */
  reasonParams?: Record<string, string | number>;
}

/**
 * 探测当前设备。
 *
 * 判断顺序：先看 UA（最可靠），再用平台提示兜底。
 * Windows 版本从 UA 里拿不到（Win10 起 UA 冻结在 "Windows NT 10.0"），
 * 所以 majorVersion 只对 macOS / Android / iOS 有意义。
 */
export function detectDevice(): DeviceProfile {
  const ua = navigator.userAgent;
  const uaData = (navigator as { userAgentData?: { platform?: string; mobile?: boolean } }).userAgentData;
  const platformHint = (uaData?.platform || navigator.platform || '').toLowerCase();

  // 手机 / 平板形态：UA 明确说是移动端，或屏幕窄且是触摸设备
  const mobile =
    uaData?.mobile === true ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
    (window.matchMedia?.('(pointer: coarse)').matches === true && window.innerWidth <= 820);

  // ① Android（先判，因为它的 UA 里也带 Linux）
  const android = ua.match(/Android\s+([\d.]+)/i);
  if (android) {
    return {
      family: 'android',
      label: `Android ${android[1]}`,
      majorVersion: Number(android[1].split('.')[0]) || null,
      arch: /arm64|aarch64/i.test(ua) ? 'arm64' : /x86_64/i.test(ua) ? 'x64' : null,
      mobile: true
    };
  }

  // ② iOS / iPadOS
  const ios = ua.match(/(?:iPhone|iPad|iPod).*?OS\s+([\d_]+)/i);
  if (ios || /iPad|iPhone|iPod/.test(ua)) {
    const ver = ios ? ios[1].replace(/_/g, '.') : '';
    return {
      family: 'ios',
      label: ver ? `iOS ${ver}` : 'iOS',
      majorVersion: ver ? Number(ver.split('.')[0]) || null : null,
      arch: /arm64|aarch64/i.test(ua) ? 'arm64' : null,
      mobile: true
    };
  }

  // ③ Windows
  if (/Windows/i.test(ua) || platformHint.includes('win')) {
    // UA 只给 "Windows NT 10.0"，Win10 与 Win11 在 UA 上无法区分
    const nt = ua.match(/Windows NT\s+([\d.]+)/i);
    const ntMajor = nt ? Number(nt[1].split('.')[0]) : null;
    return {
      family: 'windows',
      label: nt ? `Windows NT ${nt[1]}` : 'Windows',
      majorVersion: ntMajor,
      // Windows on ARM 的 UA 通常写 ARM 或 Win64; ARM64
      arch: /ARM64|aarch64/i.test(ua) ? 'arm64' : /Win64|x64|WOW64/i.test(ua) ? 'x64' : null,
      mobile: false
    };
  }

  // ④ macOS
  const mac = ua.match(/Mac OS X\s+([\d_.]+)/i);
  if (mac || platformHint.includes('mac')) {
    const ver = mac ? mac[1].replace(/_/g, '.') : '';
    return {
      family: 'macos',
      label: ver ? `macOS ${ver}` : 'macOS',
      majorVersion: ver ? Number(ver.split('.')[0]) || null : null,
      arch: /ARM64|aarch64/i.test(ua) ? 'arm64' : 'x64',
      mobile: false
    };
  }

  // ⑤ Linux
  if (/Linux/i.test(ua) || platformHint.includes('linux')) {
    return {
      family: 'linux',
      label: 'Linux',
      majorVersion: null,
      arch: /aarch64|arm64/i.test(ua) ? 'arm64' : /x86_64|x64/i.test(ua) ? 'x64' : null,
      mobile: false
    };
  }

  return { family: 'unknown', label: '', majorVersion: null, arch: null, mobile };
}

/**
 * 判断一个软件是否兼容当前设备。
 *
 * @param platforms 软件数据里的 platforms 数组（windows / macos / linux / android / ios / web）
 * @param device    detectDevice() 的结果
 */
export function checkCompat(platforms: string[] | undefined, device: DeviceProfile): CompatResult {
  // 数据里没写 platforms：只能说不确定（老数据可能只有 system 文字）
  if (!platforms || platforms.length === 0) {
    return { verdict: 'unknown', platform: device.family, reasonKey: 'compat.no-platform-data' };
  }

  // 未知系统：不猜
  if (device.family === 'unknown') {
    return { verdict: 'unknown', platform: 'unknown', reasonKey: 'compat.unknown-os' };
  }

  // 网页版软件：任何设备只要能上网就能用
  if (platforms.includes('web')) {
    return { verdict: 'ok', platform: device.family, reasonKey: 'compat.web-app' };
  }

  // 命中当前系统
  if (platforms.includes(device.family)) {
    return {
      verdict: 'ok',
      platform: device.family,
      reasonKey: 'compat.match',
      reasonParams: { os: device.label || device.family }
    };
  }

  // 不命中：说明它支持哪些系统
  return {
    verdict: 'no',
    platform: device.family,
    reasonKey: 'compat.mismatch',
    reasonParams: { os: device.label || device.family }
  };
}

/**
 * 把 platforms key 数组翻成人类可读的系统名（用于「它支持 X」这句）。
 *
 * 用固定的中文名而不是查 platforms.json：那里是给筛选器用的，
 * 名字带版本细节（"Windows 10/11"），在这里会把句子撑得很长。
 */
const PLATFORM_LABEL: Record<string, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  android: 'Android',
  ios: 'iOS',
  web: '网页'
};

export function platformNames(platforms: string[] | undefined): string[] {
  if (!platforms) return [];
  return platforms.map((p) => PLATFORM_LABEL[p] ?? p);
}
