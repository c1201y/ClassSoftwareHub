
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(available: boolean) => void>();
let initialized = false;

const isStandalone = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true);

const notify = () => {
  const available = !!deferredPrompt && !isStandalone();
  for (const listener of listeners) listener(available);
};

/** 在 main.ts 启动时调用一次（需在页面加载早期） */
export function initPwaInstall(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    // 拦下浏览器自带的迷你提示条，改由设置页统一提供入口
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

/** 当前能否弹出安装提示（已安装 / 浏览器不支持时为 false） */
export const canInstallPwa = (): boolean => !!deferredPrompt && !isStandalone();

/** 订阅「是否可安装」的变化；返回取消订阅函数 */
export function onInstallAvailability(listener: (available: boolean) => void): () => void {
  listeners.add(listener);
  listener(canInstallPwa());
  return () => listeners.delete(listener);
}

/** 弹出浏览器安装对话框；返回用户的选择 */
export async function promptInstallPwa(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  const prompt = deferredPrompt;
  deferredPrompt = null;
  notify();
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    return choice.outcome;
  } catch {
    return 'dismissed';
  }
}
