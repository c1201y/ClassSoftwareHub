// 提交服务的入口清单，以及「记住上次成功的那个」的选路逻辑。
//
// 投稿（/api/submit）、回声洞、反馈、以及投稿页的 OSS 直传签名（/api/oss-sign）、
// 下载票据（/api/dl-ticket）都挂在同一个后端上，入口只在此处维护一份 —— 多处各留一份
// 易在变更时失同步。
//
// 2026-10-24：后端由 Cloudflare Worker（cshapi / submit.132614.xyz 双域）整体迁移至
// EdgeOne Pages（api.classsoftwarehub.cn）。新后端单入口即可用，选路与记忆逻辑保留：
// 若将来需要备用入口，直接往数组里加即可，调用方无需改动。
const SUBMIT_ENDPOINTS = [
  'https://api.classsoftwarehub.cn'
];

/** 单个入口的超时时间：超时后尽快切换下一个入口，避免用户长时间等待（两个入口最坏 20 秒） */
export const SUBMIT_TIMEOUT_MS = 10000;

/** 记住上次成功的入口，下次优先试它 */
const ENDPOINT_CACHE_KEY = 'csh-submit-endpoint';

/**
 * 按顺序返回要试的入口，上次成功过的排最前。
 * 记在 localStorage（和 githubImport.ts 的 csh-gh-api-base 同一套思路），
 * 这样能连通的用户不必每次都先白等一次失败。
 */
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
