#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════
//  法律文本 → public/legal.json（给桌面客户端拉的纯数据版）
//
//  【为什么要有这个文件】
//  条款的唯一真源是根目录的 `法律文本.ts`（站点「条款」页 #/agreement 直接用它）。
//  桌面客户端以前是「构建期同步成 C# 常量打进程序集」，后果是**改一次条款就要发一次版**，
//  装在用户机器上的旧版本永远显示旧条款。改成运行时拉一份 json 之后，站点改完提交即生效，
//  旧版本客户端下次打开也能看到最新条款。
//
//  【为什么不让客户端直接拉 .ts】
//  那是 TypeScript 源码，不是数据格式：单引号字符串、`\'` 转义、行内注释、尾逗号，
//  C# 里要手写一个解析器去啃它，站点哪天改个写法就全崩。json 是机器格式，反过来只有好处。
//
//  【只导中文】
//  站点是中英双语（zh / en 两版结构一一对应），客户端界面全中文，en 没人读 ⇒ 不导，
//  体积直接减半，也少一份「两版不同步」的隐患。
//
//  【用法】
//      node scripts/gen-legal-json.mjs
//      npm run build        （build 前自动跑一次；见 package.json 的 legal:json）
//
//  ⚠️ 产物要**提交进仓库**：客户端除了站点域名，还会从 raw.githubusercontent.com /
//     jsDelivr 那几条线路取同一份文件（见桌面端 Services/LegalTextSource.cs 的线路表），
//     不提交的话那几条线路就是 404。
//
//  ⚠️ 内容没变就不重写：`generated` 是时间戳，每次 build 都刷新会让 git 永远脏。
//     所以这里比对的是去掉 generated 之后的 docs 部分。
// ══════════════════════════════════════════════════════════════════════

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

// ── 1. 取源 ────────────────────────────────────────────────────────────
//  Node 22.6 起自带类型擦除，可以直接 import .ts（本机 v22.22 实测可用）。
//  ⛔ 不要退回手写正则解析 —— 条款里有大量引号、括号、中文标点，正则迟早咬手。
let docs;
try {
  const mod = await import(pathToFileURL(SRC).href);
  docs = mod.default;
} catch (e) {
  console.error(`解析 ${path.basename(SRC)} 失败：${e.message}`);

  // ⚠️ 这条路径是给 CI 兜底的：直接 import .ts 要 Node 22.6+（自带类型擦除）。
  //    CI（deploy.yml）写的是 node-version: 22，正常够用；但万一解析到 22.0~22.5，
  //    这里不能把整站构建带崩 —— 仓库里已经有一份能用的 json，保留它继续构建即可。
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
