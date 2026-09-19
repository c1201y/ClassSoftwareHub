import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

// SINGLEFILE=1 时打包成“单文件 HTML”（可离线双击打开，等同旧版 indexV20260831.html 的形态）
const singleFile = process.env.SINGLEFILE === '1';

// 构建时写出一份 dist/version.json。
// 用途：桌面版（desktop/）要拿它跟「随包附带的离线副本」比版本，落后就在窗口里报告。
// 版本号仍以根目录「文字设置.ts」的 app.version 为唯一来源，这里只是把它解析出来，不新增第二处真相。
const versionJson = () => ({
  name: 'csh-version-json',
  apply: 'build' as const,
  generateBundle(this: { emitFile: (f: { type: 'asset'; fileName: string; source: string }) => void }) {
    let rawVersion = '';
    try {
      const text = fs.readFileSync(path.join(rootDir, '文字设置.ts'), 'utf8');
      rawVersion = (text.match(/"app\.version"\s*:\s*"([^"]+)"/) || [])[1] || '';
    } catch {
      rawVersion = '';
    }
    const meta = {
      app: 'ClassSoftwareHub',
      version: (rawVersion.match(/v?(\d+\.\d+\.\d+)/) || [])[1] || 'unknown',
      rawVersion: rawVersion || null,
      build: (rawVersion.match(/\(([^)]+)\)/) || [])[1] || null,
      builtAt: new Date().toISOString(),
      commit: process.env.GITHUB_SHA || null
    };
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify(meta, null, 2) + '\n'
    });
  }
});


// 模块文件名里带中文时（根目录「AI导航文本.ts」就是），Rollup 会拆出一个同名 chunk，
// 产出 assets/AI导航文本-xxxxxxxx.js 这种非 ASCII 文件名 —— 部分 FTP / 网盘服务器
// 对百分号编码的中文路径处理不稳，这里统一清洗成 ASCII。
const asciiChunkName = (chunk: { name: string }) =>
  `assets/${chunk.name.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'chunk'}-[hash].js`;

export default defineConfig({
  // 相对路径：站点既有「根目录」形态（GitHub Pages / FTP），也有「子目录」形态
  // （OpenList 网盘的 网站/ 文件夹），相对引用两边都能用；hash 路由不会改变文档路径。
  base: './',
  plugins: [vue(), versionJson(), ...(singleFile ? [viteSingleFile()] : [])],
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: asciiChunkName
      }
    },
    ...(singleFile
      ? {
          assetsInlineLimit: 100000000,
          cssCodeSplit: false,
          chunkSizeWarningLimit: 4096
        }
      : {})
  }
});
