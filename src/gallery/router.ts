import { createRouter, createWebHashHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { TOOLS } from './tools';

// 路由一览（对应原单文件版的三个页面 + 提交页 + 内置工具）：
//   #/home              首页（软件卡片列表）
//   #/download/:id      软件详情页（id 见数据区的软件 id）
//   #/settings          设置页
//   #/submit            提交新软件页
//   #/feedback          反馈中心（报告问题 / 提出建议 → 生成 GitHub Issue 预填链接）
//   #/ai                AI 导航（国产 AI 网址，一行一个、整行可点）
//   #/tools             内置工具（工具集合入口，卡片式）
//   #/tools/<工具id>     具体工具（路由由 tools/index.ts 注册表自动生成）
// 说明：空地址（#/ 或没带 hash）→ 重定向首页；未知地址 → 回首页。
// “欢迎弹窗”不占路由：进入网站落在首页时由 App.vue 弹出一次（见 WelcomeDialog.vue）。
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

export default router;
