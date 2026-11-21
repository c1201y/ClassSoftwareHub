import './styles/holiday.css';
import { createApp } from 'vue'
import App from './gallery/App.vue'
import router from './gallery/router'
import './styles/theme.css'
import manifestTemplate from './manifest.json'
import appIconUrl from './assets/AppIcon.ico?url'
import appIcon180Url from './assets/AppIcon-180.png?url'
import appIcon192Url from './assets/AppIcon-192.png?url'
import appIcon512Url from './assets/AppIcon-512.png?url'
import { createI18n, i18nKey } from './components/i18n/index'
import galleryEnUS from './gallery/Strings/en-US/Resources'
import galleryZhCN from '../文字设置'
import { initBrowserCache } from './gallery/browserCache'
import { warmUpDownloadOrigin } from './gallery/githubMirror'
import { initPwaInstall } from './gallery/pwaInstall'
import { bootLocale } from './gallery/localeSetting'

const i18n = createI18n(bootLocale(), {
  'en-US': galleryEnUS,
  'zh-CN': galleryZhCN
})

const manifestResources = manifestTemplate.resources ?? {}
const appTitleKey = manifestResources.title ?? 'app.title'
const appAuthorKey = manifestTemplate.author ?? 'app.author'
const appVersionKey = manifestTemplate.version ?? 'app.version'
document.documentElement.lang = i18n.locale
document.title = i18n.t(appTitleKey)

// manifest 经 blob URL 提供，根相对路径会相对于 blob 解析而被浏览器拒绝。
// 序列化前需将所有 URL 相对页面地址解析。
const resolveManifestUrl = (value: string) => new URL(value, window.location.href).href
const manifestIconUrls: Record<string, string> = {
  '@app-icon': appIconUrl,
  '@app-icon-180': appIcon180Url,
  '@app-icon-192': appIcon192Url,
  '@app-icon-512': appIcon512Url
}

const resolvedManifest = {
  ...manifestTemplate,
  // id / scope / start_url 必须绝对地址：manifest 以 blob: URL 挂载，
  // 相对值会相对 blob: 解析而被浏览器忽略（与图标同一类问题）。
  id: resolveManifestUrl(import.meta.env.BASE_URL),
  scope: resolveManifestUrl(import.meta.env.BASE_URL),
  // PWA 的安装名称固定用品牌名，不随界面语言翻译：
  // 开始菜单 / 桌面快捷方式 / 应用列表里应该始终叫 ClassSoftwareHub。
  name: 'ClassSoftwareHub',
  short_name: 'ClassSoftwareHub',
  author: i18n.t(appAuthorKey),
  version: i18n.t(appVersionKey),
  start_url: resolveManifestUrl(import.meta.env.BASE_URL),
  shortcuts: (manifestTemplate.shortcuts ?? []).map((shortcut) => ({
    ...shortcut,
    name: i18n.t(shortcut.name),
    url: resolveManifestUrl(shortcut.url)
  })),
  // 安装对话框里的应用截图：同样要绝对化，label 走 i18n
  screenshots: (manifestTemplate.screenshots ?? []).map((shot) => ({
    ...shot,
    src: resolveManifestUrl(shot.src),
    label: i18n.t(shot.label)
  })),
  icons: manifestTemplate.icons.map((icon) => ({
    ...icon,
    src: resolveManifestUrl(manifestIconUrls[icon.src] ?? icon.src)
  }))
}

const manifestLink = document.createElement('link')
manifestLink.rel = 'manifest'
manifestLink.href = URL.createObjectURL(new Blob(
  [JSON.stringify(resolvedManifest)],
  { type: 'application/manifest+json' }
))
document.head.appendChild(manifestLink)

// 站点图标（favicon）：单文件版会内联成 data URL，离线也能正常显示
const faviconLink = document.createElement('link')
faviconLink.rel = 'icon'
faviconLink.type = 'image/png'
faviconLink.href = appIcon512Url
document.head.appendChild(faviconLink)

const app = createApp(App)
app.use(router)
app.provide(i18nKey, i18n)
app.config.globalProperties.$t = i18n.t
app.mount('#app')

// 安装提示事件只触发一次，监听必须在页面早期注册
initPwaInstall()

// 让浏览器尽早记住下载节点的 h3（Alt-Svc），首个下载也能走 QUIC
warmUpDownloadOrigin()

// 可选浏览器缓存：首屏渲染完成后再注册，避免与关键资源抢带宽
if (typeof window.requestIdleCallback === 'function') {
  window.requestIdleCallback(() => initBrowserCache(), { timeout: 3000 })
} else {
  setTimeout(() => initBrowserCache(), 1500)
}

document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});
