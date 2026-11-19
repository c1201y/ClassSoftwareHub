
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
