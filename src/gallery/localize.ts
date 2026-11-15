import {
  normalizeLocale,
  type I18nValues,
  type Locale
} from '../components/i18n/index';
import enUS from './Strings/en-US/Resources';
import zhCN from '../../文字设置';

/**
 * 非组件模块（数据层 / 网络层）里的文案。
 *
 * 这些模块拿不到 Vue 的 inject 上下文，但主入口就是用 navigator.language
 * 创建 i18n 的，所以这里用同一个来源检测语言，保证两处文案一致。
 * 注意不要改读 document.documentElement.lang：index.html 里写死的是 zh-CN，
 * 模块求值可能早于 main.ts 的赋值。
 */
const resources: Record<Locale, Record<string, string>> = {
  'en-US': enUS,
  'zh-CN': zhCN
};

export const messageLocale = (): Locale =>
  normalizeLocale(typeof navigator !== 'undefined' ? navigator.language : 'en-US');

const format = (value: string, values?: I18nValues) => {
  if (!values) return value;
  return value.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
};

export const gt = (key: string, values?: I18nValues): string => {
  const locale = messageLocale();
  const value = resources[locale][key] ?? resources['en-US'][key] ?? key;
  return format(value, values);
};
