export type LocaleChoice = 'system' | 'zh-CN' | 'en-US';

const LOCALE_KEY = 'csh-locale';

/** 用户显式选择的语言；未设置或读取失败时返回 system */
export const readLocaleChoice = (): LocaleChoice => {
  try {
    const stored = localStorage.getItem(LOCALE_KEY);
    return stored === 'zh-CN' || stored === 'en-US' ? stored : 'system';
  } catch {
    return 'system';
  }
};

/** system = 删除覆盖项，回到浏览器/系统语言 */
export const writeLocaleChoice = (choice: LocaleChoice) => {
  try {
    if (choice === 'system') localStorage.removeItem(LOCALE_KEY);
    else localStorage.setItem(LOCALE_KEY, choice);
  } catch {
    /* 隐私模式禁用存储时保持当前页面语言 */
  }
};

export const bootLocale = (): string => {
  const choice = readLocaleChoice();
  return choice === 'system' ? navigator.language : choice;
};
