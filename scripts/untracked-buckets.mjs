
import { RESOLVERS } from './resolve-direct-links.mjs'

const cur = (s) => String(s ?? '').trim()
const AUTO_TRACKED = new Set(Object.keys(RESOLVERS))
export const BUCKETS = {
  // ── 微软商店分发（另 3 个由 downloads 里的 apps.microsoft.com 自动识别）──
  '9wzdncrfjbmp': { bucket: 'store', reason: '收录的就是 Microsoft Store 应用本身' },
  'dism-gui': { bucket: 'store', reason: '只在 Microsoft Store 上架' },
  'easy-pdf': { bucket: 'store', reason: '只在 Microsoft Store 上架' },
  xpfp7f8rl7mb1w: { bucket: 'store', reason: '只在 Microsoft Store 上架' },
  snipaste: { bucket: 'store', reason: '以 Microsoft Store 分发为主；另有 download.snipaste.com 的锁版本直链，官网页面里没有版本锚点' },
  'driver-ceo': { bucket: 'always-latest', reason: '直链是在线安装器（安装时联网匹配最新驱动），不吃版本号；官网页面由 JS 渲染，抓不到版本锚点' },
  todesk: { bucket: 'always-latest', reason: '直链是在线安装器，装完自己拉最新版；winget 清单（Youqu.ToDesk 4.7.4.3）比站内写的 5.x 旧、被降级闸门拦下，版本号暂无人跟' },

  // ── 有意归档 ──
  'wps2019ayxingz': { bucket: 'archive', reason: '有意收录 WPS2019 归档版（2022 年的包），不跟随上游' },
  'bandizip-6-29': { bucket: 'archive', reason: '有意收录 6.x 末代无广告版（dl.php?old），只需盯「官方是否撤链」' },
  //    直链原先挂在 sw.pcmgr.qq.com 的**带签名**地址上（路径里两段十六进制），签名一到期就 403 ——
  //    2026-09-27 实测确已失效，换成腾讯官方 CDN 的免签名同文件地址。只需盯「官方是否撤链」。
  'wxxpayxingz': { bucket: 'archive', reason: '有意收录微信 3.2.1 老版本（给老机器用），不跟随上游；直链已改用腾讯官方 CDN 免签名地址，只需盯「官方是否撤链」' },
  '360-safe-guard-speed': { bucket: 'page-only', reason: '直链已换成官方固定「始终最新」地址 dl.360scdn.com/setupbeta_jisu.exe，无需维护；唯一能读到版本号的 360 软件宝库页（appid 2000003222）比站内还旧（15.0.3.1005 < 15.0.3.1058），登记了也会被降级闸门每次拦下 —— 版本号只能人看' },
  dingtalk: { bucket: 'page-only', reason: 'winget 清单停在 7.1.0、官网页面里那条固定链接是 8.2.0，**两者都比站内 8.5.0 旧**，被解析器的降级闸门拦下 —— 暂只能跳官网，等上游清单跟上' },
  xrkayxingz: { bucket: 'page-only', reason: '下载页是 Nuxt SSR，整页里一个安装包地址都没有（down.oray.com 那条固定名只是 302 回下载页）；也没有可解析的版本接口，**只能跳官网**' },
  yjxzsayxingz: { bucket: 'page-only', reason: '下载页是 Vue SPA，安装包地址由接口下发（yunmdload.hik-cloud.com/…/V\<版本\>/…），要逆向接口才跟得上，**只能跳官网**' },

  'maxhub-whiteboard': { bucket: 'page-only', reason: '疑似 MAXHUB 会议平板内置应用，无独立可下载 PC 版本号对应站内 6.8.0.7815；下载直链是带签名过期的 seewo CDN 链接，版本号只能人看' },

  // ── 网盘 ──
  'directx-repair': { bucket: 'netdisk', reason: '分发在蓝奏云 + 百度网盘；版本号能读，但链接没法自动验证' },
}

export const BUCKET_LABEL = {
  auto: '官方下载源自动跟',
  store: '微软商店分发',
  'always-latest': '官方固定「最新版」直链',
  archive: '有意归档 / 已停更',
  'page-only': '只有网页入口',
  netdisk: '第三方网盘',
}
export function classify(app) {
  const id = cur(app?.id)
  const hit = Object.prototype.hasOwnProperty.call(BUCKETS, id) ? BUCKETS[id] : null
  if (hit) return { bucket: hit.bucket, label: BUCKET_LABEL[hit.bucket] || hit.bucket, reason: hit.reason, explicit: true }
  if (AUTO_TRACKED.has(id)) {
    return {
      bucket: 'auto',
      label: BUCKET_LABEL.auto,
      reason: '直链与版本号由 scripts/resolve-direct-links.mjs 每周从官方源自动刷新',
      explicit: false,
    }
  }
  // ⚠️ 不要写 `(^|\.)` 前缀匹配：站点 URL 是 `https://apps.microsoft.com/...`，
  //    主机名前一个字符是 `/`，那样写会一条都匹配不到（firefox / snipaste 就这样被判成「只有网页入口」过）。
  const storeLink = (app?.downloads || []).find((d) => /apps\.microsoft\.com/i.test(cur(d.url)))
  if (storeLink) {
    return { bucket: 'store', label: BUCKET_LABEL.store, reason: '下载项指向 Microsoft Store', explicit: false }
  }
  return {
    bucket: 'page-only',
    label: BUCKET_LABEL['page-only'],
    reason: '还没登记来源，也没找到可解析的版本锚点',
    explicit: false,
  }
}
