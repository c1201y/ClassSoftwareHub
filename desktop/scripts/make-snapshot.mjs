#!/usr/bin/env node
/**
 * 把站点产物做成桌面版要用的「内置离线副本」。
 *
 * 输入（站点构建出来的东西）：
 *   dist/index.html     —— 必须是**单文件**产物（根目录 `npm run build:single` 生成）
 *   dist/version.json   —— 站点构建时写出的版本信息（vite.config.ts 里的插件）
 * 输出：
 *   desktop/snapshot/index.html     —— 离线兜底页面（file:// 直接打开就能用）
 *   desktop/snapshot/version.json   —— 这份副本的版本，桌面版启动时拿它跟线上比
 *
 * 用法：node scripts/make-snapshot.mjs [--dist <目录>] [--force]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(here, '..');
const repoRoot = path.resolve(desktopDir, '..');

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const force = argv.includes('--force');

const distDir = path.resolve(repoRoot, argOf('--dist', 'dist'));
const outDir = path.join(desktopDir, 'snapshot');

function readJsonIfExists(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function fail(msg) {
  console.error('[snapshot] ' + msg);
  process.exit(1);
}

const siteHtml = path.join(distDir, 'index.html');
if (!fs.existsSync(siteHtml)) {
  fail(`找不到 ${siteHtml} —— 先在站点根目录跑一次 npm run build:single`);
}

const html = fs.readFileSync(siteHtml, 'utf8');

// 单文件产物不该再引用外部 assets/；引用了说明是做成了多文件版，拿去 file:// 打开会缺资源
const looksMultiFile = /(?:src|href)="\.?\/?assets\//.test(html);
if (looksMultiFile && !force) {
  fail('dist/index.html 看起来是「多文件」产物（仍在引用 ./assets/…）。' +
       '离线副本必须是单文件版：npm run build:single。（确实要用多文件版就加 --force）');
}

fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(siteHtml, path.join(outDir, 'index.html'));

const meta = readJsonIfExists(path.join(distDir, 'version.json')) || {};
const out = {
  app: 'ClassSoftwareHub',
  // 站点版本：vite 插件从根目录「文字设置.ts」解析出来的
  version: meta.version || 'unknown',
  rawVersion: meta.rawVersion || null,
  build: meta.build || null,
  builtAt: meta.builtAt || new Date().toISOString(),
  commit: process.env.GITHUB_SHA || meta.commit || null,
  kind: 'builtin-offline-snapshot'
};

if (!meta.version) {
  console.warn('[snapshot] 警告：dist/version.json 里没有版本号（站点构建时是不是没跑 vite 插件？），' +
               '已写成 unknown —— 桌面版将无法判断这份副本是否落后。');
}

fs.writeFileSync(path.join(outDir, 'version.json'), JSON.stringify(out, null, 2) + '\n', 'utf8');

const kb = (n) => (n / 1024).toFixed(0) + ' KB';
console.log('[snapshot] 离线副本已生成：');
console.log('  snapshot/index.html   ' + kb(fs.statSync(path.join(outDir, 'index.html')).size));
console.log('  snapshot/version.json ' + `v${out.version} · ${out.build || '无构建号'} · ${out.builtAt}`);
