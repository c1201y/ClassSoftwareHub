import { onBeforeUnmount, ref } from 'vue';

/**
 * 复制到剪贴板 + 底部轻提示，各工具通用。
 * 用法：const { toast, copy, flash } = useCopy();
 *      模板中放置 <div v-if="toast" class="tool-toast">{{ toast }}</div>
 *
 * 显示提示必须调用 flash()（或 copy()），不要直接写 toast.value = '…'：
 * 清除定时器由 flash 负责维护，直接赋值会导致提示永久停留在页面上
 * （此前 Base64 解码失败的提示曾因直接赋值而无法消失，易被误认为程序卡死）。
 */
export function useCopy() {
  const toast = ref('');
  let timer: number | null = null;

  /** 显示一条轻提示，ms 毫秒后自动消失（错误类提示可延长展示时间） */
  const flash = (text: string, ms = 1500) => {
    toast.value = text;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => { toast.value = ''; }, ms);
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
      else flash('复制失败，请手动选择复制', 2600);
    }
  };

  onBeforeUnmount(() => {
    if (timer) window.clearTimeout(timer);
  });

  return { toast, copy, flash };
}
