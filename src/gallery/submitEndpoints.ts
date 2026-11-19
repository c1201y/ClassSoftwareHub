const SUBMIT_ENDPOINTS = [
  import.meta.env.VITE_CSH_API_BASE ?? 'https://api.classsoftwarehub.cn',
  'https://submit.132614.xyz'
];

/** 单个入口的超时时间：超时后尽快切换下一个入口，避免用户长时间等待（两个入口最坏 20 秒） */
export const SUBMIT_TIMEOUT_MS = 10000;

/** 记住上次成功的入口，下次优先试它 */
const ENDPOINT_CACHE_KEY = 'csh-submit-endpoint';
export function orderedEndpoints(): string[] {
  let remembered = '';
  try {
    remembered = window.localStorage.getItem(ENDPOINT_CACHE_KEY) ?? '';
  } catch {
    remembered = '';
  }
  if (!remembered || !SUBMIT_ENDPOINTS.includes(remembered)) return SUBMIT_ENDPOINTS;
  return [remembered, ...SUBMIT_ENDPOINTS.filter((item) => item !== remembered)];
}

export function rememberEndpoint(base: string) {
  try {
    window.localStorage.setItem(ENDPOINT_CACHE_KEY, base);
  } catch {
    // 隐私模式等场景写不进去，忽略
  }
}
