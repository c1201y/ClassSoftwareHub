// ════════════════════════════════════════════════════════════════════
// 标题栏搜索框的数据源（搜索范围比“只搜软件名”更大）：
//   ① 应用名称 name
//   ② 一句话简介 tagline（首页卡片上那句）
//   ③ 详细介绍 description（详情页正文）
// 不知道软件名、只记得“它是干嘛的”也能搜到。
//
// 结果选项显示为「软件名（来源）」：
//   - 命中 ① 名称        → 来源 = 应用名称（search.source-name）
//   - 命中 ②③ 简介/介绍 → 来源 = 相关简介（search.source-intro）
// 名称命中的排前面；同一类里按数据里的原有顺序（sort）排。
//
// 日常维护【不要】改本文件 —— 想调搜索文案去根目录 文字设置.ts 的 search.* 键。
// ════════════════════════════════════════════════════════════════════
import { apps } from './data';

export interface SoftwareSearchHit {
  /** 软件 id（#/download/<id>） */
  id: string;
  name: string;
  /** 命中来源：'name' = 应用名称；'intro' = 简介/详细介绍 */
  source: 'name' | 'intro';
}

const normalize = (value: string) => value.trim().toLowerCase();

/**
 * 按关键词搜索软件。空关键词返回 []。
 * @param limit 最多返回多少条（默认 8，防止下拉太长）
 */
export const searchSoftware = (query: string, limit = 8): SoftwareSearchHit[] => {
  const q = normalize(query);
  if (!q) return [];
  const nameHits: SoftwareSearchHit[] = [];
  const introHits: SoftwareSearchHit[] = [];
  for (const app of apps) {
    if (normalize(app.name).includes(q)) {
      nameHits.push({ id: app.id, name: app.name, source: 'name' });
    } else if (
      normalize(app.tagline ?? '').includes(q) ||
      normalize(app.description ?? '').includes(q)
    ) {
      introHits.push({ id: app.id, name: app.name, source: 'intro' });
    }
  }
  return [...nameHits, ...introHits].slice(0, limit);
};
