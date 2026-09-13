import { createRouter, createWebHashHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';

// 路由一览（对应原单文件版的三个页面 + 提交页）：
//   #/home            首页（软件卡片列表）
//   #/download/:id    软件详情页（id 见数据区的软件 id）
//   #/settings        设置页
//   #/submit          提交新软件页
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
  { path: '/:pathMatch(.*)*', redirect: '/home' }
];

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes
});

export default router;
