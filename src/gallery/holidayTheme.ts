import midautumnBanner from '../assets/holiday/midautumn.jpg';
import nationaldayBanner from '../assets/holiday/nationalday.jpg';

export type HolidayKey = 'midautumn' | 'nationalday';

export interface HolidayTheme {
  key: HolidayKey;
  /** 节日名的文案 key（图片 alt、调试用） */
  labelKey: 'holiday.midautumn' | 'holiday.nationalday';
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
    key: 'midautumn', labelKey: 'holiday.midautumn', mode: 'dark', accent: '#0F566C',
    banner: midautumnBanner
  },
  light: {
    key: 'nationalday', labelKey: 'holiday.nationalday', mode: 'light', accent: '#C31D1D',
    banner: nationaldayBanner
  }
};

// ── 档期（档期内自动开启节日皮肤；档期外默认关闭，但设置里仍可手动开启）──
export const HOLIDAY_WINDOW = { from: '2026-10-19', to: '2026-10-31' };

/** 节日皮肤开关（由维护控制台设置）：auto 按档期 / always 永久显示 / never 永不显示 */
export type HolidayMode = 'auto' | 'always' | 'never';
export const HOLIDAY_MODE = 'auto' as HolidayMode;

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** 今天是否在节日档期内（决定「节日皮肤」开关的默认值） */
export const isHolidaySeason = (now: Date = new Date()): boolean => {
  if (HOLIDAY_MODE === 'always') return true;
  if (HOLIDAY_MODE === 'never') return false;
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
