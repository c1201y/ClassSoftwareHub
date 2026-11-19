#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');

const SRC = path.join(repo, '法律文本.ts');
const OUT = path.join(repo, 'public', 'legal.json');

/** 客户端按这三个 key 建标签，少一个就会有一档点不动 —— 缺了直接让构建失败，别生成半份。 */
const REQUIRED = ['agreement', 'privacy', 'disclaimer'];

if (!fs.existsSync(SRC)) {
  console.error(`找不到源文件：${SRC}`);
  process.exit(1);
}
let docs;
try {
  const mod = await import(pathToFileURL(SRC).href);
  docs = mod.default;
} catch (e) {
  console.error(`解析 ${path.basename(SRC)} 失败：${e.message}`);
  if (fs.existsSync(OUT)) {
    console.error('  → 保留仓库里现有的 public/legal.json，继续构建。');
    console.error('  → 要重新生成请用 Node 22.6 以上在本机跑一次。');
    process.exit(0);
  }

  console.error('  → 仓库里也没有现成的 legal.json，无法继续（本脚本需要 Node 22.6+）。');
  process.exit(1);
}

if (!Array.isArray(docs) || docs.length === 0) {
  console.error('默认导出不是文档数组 —— 站点那份《法律文本.ts》的导出结构变了？');
  process.exit(1);
}

// ── 2. 校验（宁可构建失败，也不要生成一份让客户端标签错位的 json）────────
const seen = new Set();
for (const d of docs) {
  const key = String(d?.key ?? '');
  if (!REQUIRED.includes(key)) {
    console.error(`未知的文档 key：${key || '(空)'}（只认 ${REQUIRED.join(' / ')}）`);
    process.exit(1);
  }
  if (seen.has(key)) {
    console.error(`文档 key 重复：${key}`);
    process.exit(1);
  }
  seen.add(key);

  if (!d?.zh?.title) {
    console.error(`${key}: 缺少 zh.title`);
    process.exit(1);
  }
  if (!Array.isArray(d.zh.sections) || d.zh.sections.length === 0) {
    console.error(`${key}: zh.sections 为空，条款正文没导出来`);
    process.exit(1);
  }
}

for (const key of REQUIRED) {
  if (!seen.has(key)) {
    console.error(`缺少文档：${key}（三份必须齐全，否则客户端那一档会点不动）`);
    process.exit(1);
  }
}

// ── 3. 组装 ────────────────────────────────────────────────────────────
//  按 REQUIRED 的顺序输出，跟客户端标签顺序、站点「条款」页的标签顺序保持一致。
const ordered = REQUIRED.map((key) => docs.find((d) => d.key === key));

const payload = {
  schema: 1,
  docs: ordered.map((d) => ({
    key: d.key,
    version: String(d.version ?? ''),
    effective: String(d.effective ?? ''),
    title: String(d.zh.title ?? ''),
    intro: String(d.zh.intro ?? ''),
    sections: (d.zh.sections ?? []).map((s) => ({
      heading: String(s?.heading ?? ''),
      items: (s?.items ?? []).map((t) => String(t ?? '')),
    })),
  })),
};

// ── 4. 内容没变就别碰文件（保住原来的 generated，免得 git 天天脏）────────
function readExisting() {
  try {
    return JSON.parse(fs.readFileSync(OUT, 'utf8'));
  } catch {
    return null;
  }
}

const existing = readExisting();
const sameDocs = existing && JSON.stringify(existing.docs) === JSON.stringify(payload.docs);

if (sameDocs) {
  console.log(`条款内容无变化，保留原文件：${path.relative(repo, OUT).replace(/\\/g, '/')}`);
} else {
  // generated 挨着 schema 放（读文件的人第一眼就该知道这份是什么时候产出的）
  const final = { schema: payload.schema, generated: new Date().toISOString(), docs: payload.docs };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  // 先写临时文件再换名：中途失败不会留下半份 json 让客户端解析崩
  const tmp = OUT + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(final, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, OUT);
  console.log(`已生成：${path.relative(repo, OUT).replace(/\\/g, '/')}`);
}

// ── 5. 账目 ────────────────────────────────────────────────────────────
const size = fs.statSync(OUT).size;
for (const d of payload.docs) {
  const n = d.sections.reduce((a, s) => a + s.items.length, 0);
  console.log(`  · ${d.key.padEnd(11)} ${d.title}  ${d.version}  ${d.effective}  ${d.sections.length} 节 / ${n} 条`);
}
console.log(`  · 体积 ${(size / 1024).toFixed(1)} KB`);
