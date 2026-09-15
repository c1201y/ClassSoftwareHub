import { onBeforeUnmount, ref } from 'vue';

/**
 * 复制到剪贴板 + 底部轻提示。各工具通用。
 * 用法：const { toast, copy } = useCopy();
 *      模板里放 <div v-if="toast" class="tool-toast">{{ toast }}</div>
 */
export function useCopy() {
  const toast = ref('');
  let timer: number | null = null;

  const flash = (text: string) => {
    toast.value = text;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => { toast.value = ''; }, 1500);
  };

  const copy = async (value: string, label?: string) => {
    const done = () => flash(`已复制 ${label ?? value}`);
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
      else flash('复制失败，请手动选择复制');
    }
  };

  onBeforeUnmount(() => {
    if (timer) window.clearTimeout(timer);
  });

  return { toast, copy };
}
