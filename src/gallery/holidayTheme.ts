// ════════════════════════════════════════════════════════════════════
// 节日皮肤（补丁模块）
// --------------------------------------------------------------------
// 规则（Nick 定）：**暗色模式 = 中秋主题，亮色模式 = 国庆主题**
//   · 中秋：青色 #0F566C + assets/holiday/midautumn.jpg（深色海报）
//   · 国庆：中国红 #C31D1D + assets/holiday/nationalday.jpg（亮色海报）
// 海报柔和地铺在首页页头后面当背景（样式见 gallery/styles/home-page.css）。
//
// 启用规则：
//   · 落在「档期」（见 HOLIDAY_WINDOW）里 → 设置里的「节日皮肤」开关**默认开启**，
//     进网站自动换上节日主题；档期外**默认关闭**，就是原来默认蓝，什么都没变。
//   · 无论档期内还是档期外，设置里的开关都能**手动打开/关闭**（用户手动改过就一直听他的）。
//
// “不想要了”——删掉本文件，再删掉 App.vue / HomePage.vue / SettingsPage.vue /
// home-page.css 里带 "holiday" 的几处引用即可，不影响其它功能。
//
// 日常改档期：只改下面 HOLIDAY_WINDOW 的 from / to（YYYY-MM-DD，含当天）。
// ════════════════════════════════════════════════════════════════════
import midautumnBanner from '../assets/holiday/midautumn.jpg';
import nationaldayBanner from '../assets/holiday/nationalday.jpg';

export type HolidayKey = 'midautumn' | 'nationalday';

export interface HolidayTheme {
  key: HolidayKey;
  /** 节日名（图片 alt、调试用） */
  label: string;
  /** 对应哪套配色：dark = 深色模式下显示；light = 亮色模式下显示 */
  mode: 'light' | 'dark';
  /** 节日主题色（实际覆盖见 src/styles/holiday.css） */
  accent: string;
  /** 首页背景海报（打包时会内联进单文件版） */
  banner: string;
}

/** 深色模式 → 中秋；亮色模式 → 国庆 */
export const HOLIDAY_THEMES: Record<'dark' | 'light', HolidayTheme> = {
  dark: {
    key: 'midautumn', label: '中秋节', mode: 'dark', accent: '#0F566C',
    banner: midautumnBanner
  },
  light: {
    key: 'nationalday', label: '国庆节', mode: 'light', accent: '#C31D1D',
    banner: nationaldayBanner
  }
};

// ── 档期（档期内自动开启节日皮肤；档期外默认关闭，但设置里仍可手动开启）──
// 日常改档期：只改下面 from / to（YYYY-MM-DD，含当天）。
export const HOLIDAY_WINDOW = { from: '2026-09-20', to: '2026-10-20' };

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** 今天是否在节日档期内（决定「节日皮肤」开关的默认值） */
export const isHolidaySeason = (now: Date = new Date()): boolean => {
  const today = toDateKey(now);
  return today >= HOLIDAY_WINDOW.from && today <= HOLIDAY_WINDOW.to;
};

/** 按“当前是不是深色”解析出该用的节日皮肤（是否启用由开关决定，与档期无关） */
export const resolveActiveHoliday = (isDark: boolean): HolidayTheme =>
  HOLIDAY_THEMES[isDark ? 'dark' : 'light'];

/** 把节日皮肤状态写到 <html> 上（配色由用户在“主题”里自己选），返回命中的节日 */
export const syncHolidayTheme = (enabled: boolean, isDark: boolean): HolidayTheme | null => {
  const root = document.documentElement;
  const active = enabled ? resolveActiveHoliday(isDark) : null;
  root.classList.toggle('holiday-skin', Boolean(active));
  root.classList.toggle('holiday-midautumn', active?.key === 'midautumn');
  root.classList.toggle('holiday-nationalday', active?.key === 'nationalday');
  return active;
};
