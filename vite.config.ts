import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLEFILE=1 时打包成“单文件 HTML”（可离线双击打开，等同旧版 indexV20260831.html 的形态）
const singleFile = process.env.SINGLEFILE === '1';

export default defineConfig({
  base: singleFile ? './' : '/',
  plugins: [vue(), ...(singleFile ? [viteSingleFile()] : [])],
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  build: singleFile
    ? {
        assetsInlineLimit: 100000000,
        cssCodeSplit: false,
        chunkSizeWarningLimit: 4096
      }
    : {}
});
