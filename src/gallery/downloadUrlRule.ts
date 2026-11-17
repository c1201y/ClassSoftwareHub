// ════════════════════════════════════════════════════════════════════
// downloadUrlRule.ts —— 投稿表单里「下载链接」的协议与格式判定
//
// 从 SubmitPage 的 buildPayload 里抽出来，原因有二：
//   · 真正的提交发生在加密联系方式之后，没法在页面上单独回归这条规则；
//   · 规则本身是纯函数，单独成文件就能直接跑用例（scripts 里也不需要 Vue）。
//
// 与服务端/详情页口径一致：本站对象是 oss://，其余必须是可解析的 http(s)。
// 空串不算错 —— buildPayload 会先把空行过滤掉。
// ════════════════════════════════════════════════════════════════════

export type DownloadUrlProblem = 'scheme' | 'invalid' | null;

export function downloadUrlProblem(raw: string): DownloadUrlProblem {
  const value = (raw || '').trim();
  if (!value) return null;
  if (/^oss:\/\//i.test(value)) return null;
  if (!/^https?:\/\//i.test(value)) return 'scheme';
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return null;
  } catch {
    return 'invalid';
  }
}
