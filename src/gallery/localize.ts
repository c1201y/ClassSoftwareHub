import {
  normalizeLocale,
  type I18nValues,
  type Locale
} from '../components/i18n/index';
import enUS from './Strings/en-US/Resources';
import zhCN from '../../文字设置';
import { bootLocale } from './localeSetting';
const resources: Record<Locale, Record<string, string>> = {
  'en-US': enUS,
  'zh-CN': zhCN
};

export const messageLocale = (): Locale =>
  normalizeLocale(typeof navigator !== 'undefined' ? bootLocale() : 'en-US');

const format = (value: string, values?: I18nValues) => {
  if (!values) return value;
  return value.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
};

export const gt = (key: string, values?: I18nValues): string => {
  const locale = messageLocale();
  const value = resources[locale][key] ?? resources['en-US'][key] ?? key;
  return format(value, values);
};
