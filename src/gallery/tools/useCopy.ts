import { onBeforeUnmount, ref } from 'vue';

/**
 * 复制到剪贴板 + 底部轻提示。各工具通用。
 * 用法：const { toast, copy, flash } = useCopy();
 *      模板里放 <div v-if="toast" class="tool-toast">{{ toast }}</div>
 *
 * ⚠️ 要显示提示一律调 `flash()`（或 `copy()`），**不要直接写 `toast.value = '…'`** ——
 *    只有 flash 负责装那个 1.5 s 的清除定时器，直写的结果是提示永久挂在页面上
 *    （Base64 解码失败那条就撞过：用户以为程序卡死了，其实只是提示没消失）。
 */
export function useCopy() {
  const toast = ref('');
  let timer: number | null = null;

  /** 显示一条轻提示，`ms` 毫秒后自动消失（错误类可以传长一点） */
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
