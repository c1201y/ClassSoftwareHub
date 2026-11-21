// ════════════════════════════════════════════════════════════════════
// dict.ts —— 离线词典的数据层（纯逻辑，不依赖 Vue）
//
// 数据来源：桌面版 ClassSoftwareHub 的 Assets/Dict/dict-core.tsv
// （29417 条词条，2 MB 纯文本）。网页端不适合一次拉 2 MB，
// 所以按首字母切成 26 块，每块 gzip 后 0.5–102 KB，**查到哪个字母才下哪块**。
//
// 为什么用 .gz 而不是让服务器压缩：
//   这套站点部署在 GitHub Pages / nginx / ECS 上，前者不支持给静态文件
//   自动加 Content-Encoding，后者要额外配置；所以这里让浏览器自己解压 ——
//   DecompressionStream('gzip') 是 Chrome 80+ / Edge 80+ / Firefox 113+ 原生 API，
//   教室电脑上都是 Win10/11 + Edge，可用性没问题。
//   不支持时（老浏览器）退回明文 .txt 分块。
//
// 本文件不产出界面文字 —— 文案在 文字设置.ts 的 dict.* 中。
// ════════════════════════════════════════════════════════════════════

/** 一个词条 */
export interface DictEntry {
  /** 词头（英文） */
  word: string;
  /** 音标，如 /əˈbʌv/，可能为空 */
  phonetic: string;
  /** 释义（多个义项用 ; 分隔） */
  sense: string;
}

/** 数据的基址：public/dict/ 下的文件。用相对路径，适配任意部署深度。 */
const BASE = './dict/';

/** 已加载的分块（按首字母）。key 是小写字母或 '#'。 */
const cache = new Map<string, DictEntry[]>();

/** 正在加载的分块，避免同一块并发请求两次 */
const loading = new Map<string, Promise<DictEntry[]>>();

/** 取首字母分块 key */
export function blockKeyOf(word: string): string {
  const ch = word.trim().charAt(0).toLowerCase();
  return /[a-z]/.test(ch) ? ch : '#';
}

/** 分块文件名 */
const fileNameOf = (key: string): string => (key === '#' ? '_' : key);

/**
 * 解压 gzip 字节流。
 *
 * 优先用原生 DecompressionStream；不支持时返回 null，由调用方退回明文。
 */
async function gunzip(buffer: ArrayBuffer): Promise<string | null> {
  const Ctor = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream;
  if (!Ctor) return null;
  try {
    const stream = new Blob([buffer]).stream().pipeThrough(new Ctor('gzip'));
    return await new Response(stream).text();
  } catch {
    return null;
  }
}

/** 把一块纯文本解析成词条数组 */
function parseBlock(text: string): DictEntry[] {
  const out: DictEntry[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    // 格式：词 \t 音标 \t 释义
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    out.push({ word: parts[0], phonetic: parts[1], sense: parts[2] });
  }
  return out;
}

/**
 * 加载某个首字母的分块。
 *
 * 先试 .txt.gz（浏览器自己解压）；拿不到或解压失败时退回 .txt（明文）。
 * 两块都不存在就当这个字母没有词条。
 */
export function loadBlock(key: string): Promise<DictEntry[]> {
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);

  const inFlight = loading.get(key);
  if (inFlight) return inFlight;

  const task = (async (): Promise<DictEntry[]> => {
    const name = fileNameOf(key);

    // ① gzip 分块
    try {
      const res = await fetch(`${BASE}${name}.txt.gz`);
      if (res.ok) {
        const text = await gunzip(await res.arrayBuffer());
        if (text) {
          const entries = parseBlock(text);
          cache.set(key, entries);
          return entries;
        }
      }
    } catch {
      // 网络失败或 CORS：继续试明文
    }

    // ② 明文分块（老浏览器 / gzip 不可用时的兜底）
    try {
      const res = await fetch(`${BASE}${name}.txt`);
      if (res.ok) {
        const entries = parseBlock(await res.text());
        cache.set(key, entries);
        return entries;
      }
    } catch {
      // 都不行：当作没有
    }

    cache.set(key, []);
    return [];
  })().finally(() => {
    loading.delete(key);
  });

  loading.set(key, task);
  return task;
}

/**
 * 查词。
 *
 * 只加载这个词所在的字母块，在块内做：
 *   ① 精确匹配（不区分大小写）
 *   ② 前缀匹配（最多 8 条，给「输入到一半」用）
 *
 * 返回 { exact, prefix }：exact 命中时 prefix 为空数组。
 */
export async function lookup(raw: string): Promise<{ exact: DictEntry | null; prefix: DictEntry[] }> {
  const query = raw.trim().toLowerCase();
  if (!query) return { exact: null, prefix: [] };

  const entries = await loadBlock(blockKeyOf(query));

  // ① 精确
  const exact = entries.find((e) => e.word.toLowerCase() === query) ?? null;
  if (exact) return { exact, prefix: [] };

  // ② 前缀（只在查询全是 ASCII 字母/连字符时做，中文不做前缀）
  if (!/^[a-z][a-z\s'-]*$/.test(query)) return { exact: null, prefix: [] };
  const prefix = entries
    .filter((e) => e.word.toLowerCase().startsWith(query))
    .slice(0, 8);
  return { exact: null, prefix };
}

/** 已加载的块数（调试 / 状态显示用） */
export const loadedBlocks = (): string[] => [...cache.keys()].sort();
