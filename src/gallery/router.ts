import { createRouter, createWebHashHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { TOOLS } from './tools';
const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/home' },
  {
    path: '/home',
    name: 'home',
    component: () => import('./pages/HomePage.vue')
  },
  {
    path: '/download/:id',
    name: 'download-detail',
    component: () => import('./pages/DownloadDetailPage.vue')
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('./pages/SettingsPage.vue')
  },
  {
    // 条款页（用户协议 / 隐私政策 / 免责声明）：内容在根目录「法律文本.ts」，
    // 设置页「关于」区的链接带 ?doc= 跳过来直接定位到对应文档
    path: '/agreement',
    name: 'agreement',
    component: () => import('./pages/LegalPage.vue')
  },
  {
    path: '/echo-cave',
    name: 'echo-cave',
    component: () => import('./pages/EchoCavePage.vue')
  },
  {
    path: '/submit',
    name: 'submit',
    component: () => import('./pages/SubmitPage.vue')
  },
  {
    path: '/feedback',
    name: 'feedback',
    component: () => import('./pages/FeedbackPage.vue')
  },
  {
    path: '/ai',
    name: 'ai',
    component: () => import('./pages/AiNavPage.vue')
  },
  {
    // 下载桌面版：Windows 10/11、Windows 7、安卓三个平台的安装包，
    // 走 GitHub Releases + 本站镜像加速（见 src/gallery/desktopDownload.ts）。
    path: '/desktop',
    name: 'desktop',
    component: () => import('./pages/DesktopPage.vue')
  },
  {
    path: '/tools',
    name: 'tools',
    component: () => import('./tools/ToolsPage.vue')
  },
  // 各内置工具：路由从注册表自动生成（加工具只改 tools/index.ts）
  ...TOOLS.map<RouteRecordRaw>((tool) => ({
    path: `/tools/${tool.id}`,
    name: `tool-${tool.id}`,
    component: tool.load
  })),
  { path: '/:pathMatch(.*)*', redirect: '/home' }
];

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes
});

/** 已预取的路由名（避免 hover 反复触发） */
const prefetchedRoutes = new Set<string>();
export function prefetchRoute(name: string): void {
  if (prefetchedRoutes.has(name)) return;
  const record = router.getRoutes().find((item) => item.name === name);
  const loader = record?.components?.default as unknown as (() => Promise<unknown>) | undefined;
  if (typeof loader !== 'function') return;
  prefetchedRoutes.add(name);
  void Promise.resolve(loader()).catch(() => prefetchedRoutes.delete(name));
}

export default router;
