import { onBeforeUnmount, ref } from 'vue';
import { useI18n } from '../../components/i18n/index';
export function useCopy() {
  const { t } = useI18n();
  const toast = ref('');
  let timer: number | null = null;

  /** 显示一条轻提示，ms 毫秒后自动消失（错误类提示可延长展示时间） */
  const flash = (text: string, ms = 1500) => {
    toast.value = text;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => { toast.value = ''; }, ms);
  };

  const copy = async (value: string, label?: string) => {
    const done = () => flash(label ? t('common.copied-label', { label }) : t('common.copied'));
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        done();
        return;
      }
      throw new Error('no-clipboard');
    } catch {
      // 隐私模式 / 非安全上下文降级
      const area = document.createElement('textarea');
      area.value = value;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      area.remove();
      if (ok) done();
      else flash(t('common.copy-failed'), 2600);
    }
  };

  onBeforeUnmount(() => {
    if (timer) window.clearTimeout(timer);
  });

  return { toast, copy, flash };
}
