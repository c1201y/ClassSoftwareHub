// ════════════════════════════════════════════════════════════════════
// collection.ts —— 「软件组合」：把多个软件打成一个可分享的清单
//
// 场景：新接手一间教室、给同事配一套机器、开学装机……这类事情要装的软件
// 往往是同一批。桌面版只能把安装包一个个发过去，网页版可以发**一条链接**：
// 对方打开就看到整张清单，逐个点下载。
//
// 链接格式（hash 路由，参数放在 hash 里）：
//   #/collection?ids=7-zip,seewo-whiteboard,potplayer
//
// 为什么不用后端：清单只是几个 id，塞进 URL 就够；不需要账号、不需要存储，
// 也不会因为服务下线而失效。代价是 URL 不能太长 —— 因此限制 30 个软件。
//
// 本文件不产出界面文字 —— 文案在 文字设置.ts 的 collection.* 中。
// ════════════════════════════════════════════════════════════════════

/** 一条组合最多几个软件（URL 长度与实用性的折中） */
export const COLLECTION_MAX = 30;

/** 本地暂存「正在编辑的清单」的 key */
const DRAFT_KEY = 'csh-collection-draft';

/**
 * 把 id 数组编码成 URL 参数值。
 *
 * 只保留合法 id（小写字母/数字/连字符），去重，并截断到上限 ——
 * 用户手改 URL 塞进奇怪的东西时，页面也不该崩。
 */
export function encodeIds(ids: string[]): string[] {
  const clean: string[] = [];
  for (const raw of ids) {
    const id = String(raw).trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(id)) continue;
    if (!clean.includes(id)) clean.push(id);
    if (clean.length >= COLLECTION_MAX) break;
  }
  return clean;
}

/** 清洗后拼成 URL 参数值（逗号分隔） */
export function joinIds(ids: string[]): string {
  return encodeIds(ids).join(',');
}

/** 解析 URL 里的 ids 参数 */
export function decodeIds(value: string | null | undefined): string[] {
  if (!value) return [];
  return encodeIds(value.split(','));
}

/** 生成可分享的完整地址 */
export function buildCollectionUrl(ids: string[], origin = window.location.origin + window.location.pathname): string {
  const query = joinIds(ids);
  // 指向首页（不是独立页面）：收链接的人直接落在软件列表上，
  // 页面会自动进入挑选模式并把这份清单勾好。
  return `${origin}#/home?ids=${query}`;
}

/** 分享文案（粘到群里能看懂） */
export function buildCollectionText(names: string[], url: string): string {
  const head = `【软件组合】共 ${names.length} 个`;
  const list = names.slice(0, 8).map((n, i) => `${i + 1}. ${n}`).join('\n');
  const more = names.length > 8 ? `\n…还有 ${names.length - 8} 个` : '';
  return `${head}\n${list}${more}\n打开：${url}`;
}

/* ── 本地暂存 ─────────────────────────────────────────────────────── */

/**
 * 记住「正在挑的清单」。
 *
 * 挑软件是个断断续续的过程（可能要翻几个分类），刷新页面不该丢。
 * 只存 id 数组，体积很小。
 */
export function readDraft(): string[] {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? encodeIds(parsed.map(String)) : [];
  } catch {
    return [];
  }
}

export function saveDraft(ids: string[]): string[] {
  const clean = encodeIds(ids);
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(clean));
  } catch {
    /* 配额满 / 无痕模式：放弃保存 */
  }
  return clean;
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* 忽略 */
  }
}
