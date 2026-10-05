// 提交服务的入口清单，以及「记住上次成功的那个」的选路逻辑。
//
// 投稿（/api/submit）、回声洞、反馈、以及投稿页的 OSS 直传签名（/api/oss-sign）
// 都挂在同一个 Cloudflare Worker 上，所以入口只在这里写一份 —— 两处各留一份的话，
// 迟早会改一处忘一处。
//
// 为什么要两个入口、还要记路：
//   .workers.dev 域名在国内打不开，面向访客的接口必须走自定义域；而自定义域哪天没生效
//   或临时抽风时得能自动换下一条。所以按顺序试，第一个拿到业务 JSON 响应的就停手，
//   并把成功的那个记进 localStorage，下次直接先试它，省掉一次必然失败的等待。
const SUBMIT_ENDPOINTS = [
  'https://cshapi.132614.xyz',
  'https://submit.132614.xyz'
];

/** 单个入口的超时时间：连不上时尽快换下一个入口，不让用户干等（两个入口最坏 20 秒） */
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
