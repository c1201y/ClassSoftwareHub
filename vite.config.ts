import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { execSync } from 'node:child_process';

// SINGLEFILE=1 时打包成“单文件 HTML”（可离线双击打开，等同旧版 indexV20260831.html 的形态）
const singleFile = process.env.SINGLEFILE === '1';
const buildId = (() => {
  if (process.env.CSH_BUILD_ID) return process.env.CSH_BUILD_ID;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    const commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return dirty ? `${commit}-dirty` : commit;
  } catch {
    return 'dev';
  }
})();
const asciiChunkName = (chunk: { name: string }) =>
  `assets/${chunk.name.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'chunk'}-[hash].js`;
const emitVersion = (): Plugin => ({
  name: 'csh-emit-version',
  apply: 'build',
  generateBundle(_options, bundle) {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ build: buildId, time: new Date().toISOString() }, null, 2)
    });

    const hashed = Object.values(bundle)
      .map((item) => item.fileName)
      .filter((name) => /\.(?:js|css|webp|png|svg|woff2?|ico)$/i.test(name) && !name.endsWith('sw.js'));
    // public/ 下的固定文件不会出现在 bundle 里，按已知清单补上
    const fixed = [
      'legal.json',
      'offline.html',
      'favicon.ico',
      'apple-touch-icon.png',
      'og-cover.png',
      'screenshots/home.png',
      'screenshots/settings.png'
    ];
    this.emitFile({
      type: 'asset',
      fileName: 'precache.json',
      source: JSON.stringify({ build: buildId, files: [...new Set([...fixed, ...hashed])] }, null, 2)
    });
  }
});

export default defineConfig({
  // 相对路径：站点既有「根目录」形态（GitHub Pages / FTP），也有「子目录」形态
  // （OpenList 网盘的 网站/ 文件夹），相对引用两边都能用；hash 路由不会改变文档路径。
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(buildId)
  },
  plugins: [vue(), emitVersion(), ...(singleFile ? [viteSingleFile()] : [])],
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
