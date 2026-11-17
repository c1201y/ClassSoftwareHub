/* eslint-disable */
declare module '*.vue' {
    import type { DefineComponent } from 'vue'
    const component: DefineComponent<{}, {}, any>
    export default component
}

// 构建时由 vite.config.ts 的 define 注入的提交标识
declare const __BUILD_ID__: string;
