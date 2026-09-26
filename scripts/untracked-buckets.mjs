/**
 * scripts/untracked-buckets.mjs
 *
 * 「哪些软件根本没在自动跟踪、为什么」的**唯一登记表**。
 *
 * 2026-09-21 起，本站的软件信息自动更新**只跟 GitHub Releases 一条腿**。
 * 原先还有第二条腿（抓希沃产品清单 / VideoLAN 目录 / 360 页面 / GeoGebra 下载页…），
 * 因厂商一改版就得跟着改解析规则、维护成本不划算，已整体删除（见 git 历史）。
 *
 * 于是所有**没有可用 GitHub 仓库**的软件都落进这里的分档，由体检 Issue 如实点名 ——
 * 「没被检查到」不等于「没问题」，所以不能像以前那样让它悄悄消失。
 * 只有 `page-only` 那一档是真要人偶尔看一眼的；其余几档是「天生不用跟」，写清楚就好。
 *
 * 本文件只做**登记与判定**，不发任何网络请求。
 */

const cur = (s) => String(s ?? '').trim()

/**
 * 无法自动跟踪的软件，逐个写明**为什么**。体检 Issue 靠它把话说清楚：
 * 「没被检查到」不等于「没问题」，更不等于「提交者漏填」。
 *
 * bucket 的四个取值就是 Issue 里分区的依据：
 *   store        微软商店分发 —— 商店自己会更新，站内不跟版本
 *   always-latest 官方固定「最新版」直链 —— URL 永不过期，天生不需要跟
 *   archive      有意归档 / 已停更 —— 刻意留着老版本
 *   page-only    只有官网 / 下载页入口，页面里没有可解析的版本锚点
 *   netdisk      第三方网盘分发 —— 版本能读、链接没法自动化
 *
 * `store` 一类不必手工登记：只要 downloads[] 里出现 apps.microsoft.com 就自动归入。
 */
export const BUCKETS = {
  // ── 微软商店分发（另 3 个由 downloads 里的 apps.microsoft.com 自动识别）──
  '9wzdncrfjbmp': { bucket: 'store', reason: '收录的就是 Microsoft Store 应用本身' },
  'dism-gui': { bucket: 'store', reason: '只在 Microsoft Store 上架' },
  'easy-pdf': { bucket: 'store', reason: '只在 Microsoft Store 上架' },
  xpfp7f8rl7mb1w: { bucket: 'store', reason: '只在 Microsoft Store 上架' },
  snipaste: { bucket: 'store', reason: '以 Microsoft Store 分发为主；另有 download.snipaste.com 的锁版本直链，官网页面里没有版本锚点' },

  // ── 官方固定「最新版」直链 ──
  officetoolplus: { bucket: 'always-latest', reason: '版本字段有意写「跟随官网」、站内只做官网镜像页跳转；上游其实有 GitHub 仓库（YerongAI/Office-Tool），若想让它全自动，把 downloads 换成该仓库的 release 直链即可' },
  'uu-remote': { bucket: 'always-latest', reason: '站内版本字段写「最新版（官网自动更新）」，直链是网易分发接口，永远指向最新包' },
  potplayer: { bucket: 'always-latest', reason: '版本字段写「最新版（官网自动更新）」，三条 daumcdn 直链都在 Version/Latest 下' },
  todesk: { bucket: 'always-latest', reason: '版本字段写「以安装时官网版本为准」；直链是在线安装器，装完自己拉最新版' },
  rammap: { bucket: 'always-latest', reason: '微软 Sysinternals 直链固定为 RAMMap.zip，永远是最新版；要版本号得把包下下来读 PE 信息，不值得' },
  'geek-uninstaller': { bucket: 'always-latest', reason: '官网只给 /geek.zip 固定直链，页面里没有版本号' },
  'driver-ceo': { bucket: 'always-latest', reason: '直链是在线安装器（安装时联网匹配最新驱动），不吃版本号' },
  chrome: { bucket: 'always-latest', reason: '版本字段有意写「跟随官网」，站内只做官网跳转' },
  WPS: { bucket: 'always-latest', reason: '版本字段有意写「跟随官网」，站内只做官网跳转' },
  qq: { bucket: 'always-latest', reason: '版本字段有意写「官网」，站内只做官网跳转' },
  wechat: { bucket: 'always-latest', reason: '版本字段有意写「官网」，站内只做官网跳转' },

  // ── 有意归档 ──
  'wps2019ayxingz': { bucket: 'archive', reason: '有意收录 WPS2019 归档版（2022 年的包），不跟随上游' },
  'bandizip6.29': { bucket: 'archive', reason: '有意收录 6.x 末代无广告版（dl.php?old），只需盯「官方是否撤链」' },

  // ── 上游只有厂商页面、没有 GitHub 仓库的 10 个（2026-09-21 起改由人工看）──
  //    ⚠️ 这 10 个的上游都**没有 GitHub 仓库**，是当初做第二条腿的全部理由。
  //    理由如实写「按决定不再抓」而不是「页面抓不到」—— 后者对 vlc / geogebra / diskgenius /
  //    360 这几个是假话（它们的页面本来解析得出来）。
  vlc: { bucket: 'page-only', reason: '上游没有 GitHub 仓库；官方目录 get.videolan.org 有版本信息，但自动更新只跟 GitHub、这类页面已不再抓取 —— 要人偶尔看一眼' },
  geogebra: { bucket: 'page-only', reason: '上游没有 GitHub 仓库；官网下载页有版本重定向，但自动更新只跟 GitHub、这类页面已不再抓取 —— 要人偶尔看一眼' },
  diskgenius: { bucket: 'page-only', reason: '上游没有 GitHub 仓库；官网更新日志有版本信息，但自动更新只跟 GitHub、这类页面已不再抓取 —— 要人偶尔看一眼' },
  '360-jijiuxiang': { bucket: 'page-only', reason: '上游没有 GitHub 仓库；官网页面有版本信息，但自动更新只跟 GitHub、这类页面已不再抓取 —— 要人偶尔看一眼' },
  '360-speed-browser': { bucket: 'page-only', reason: '上游没有 GitHub 仓库；官网页面有版本信息（两条直链会随版本变），但自动更新只跟 GitHub、这类页面已不再抓取 —— 要人偶尔看一眼' },
  'class-optimizer': { bucket: 'page-only', reason: '上游没有 GitHub 仓库；版本在希沃产品清单 e.seewo.com（EasiCare_PC），但自动更新只跟 GitHub、这类页面已不再抓取 —— 要人偶尔看一眼' },
  xwbb5: { bucket: 'page-only', reason: '上游没有 GitHub 仓库；版本在希沃产品清单 e.seewo.com（EasiNote5），但自动更新只跟 GitHub、这类页面已不再抓取 —— 要人偶尔看一眼' },
  'seewo-assistant': { bucket: 'page-only', reason: '上游没有 GitHub 仓库；版本在希沃产品清单 e.seewo.com（SeewoIwbAssistant），但自动更新只跟 GitHub、这类页面已不再抓取 —— 要人偶尔看一眼' },
  xwspztayxingz: { bucket: 'page-only', reason: '上游没有 GitHub 仓库；版本在希沃产品清单 e.seewo.com（EasiCamera），但自动更新只跟 GitHub、这类页面已不再抓取 —— 要人偶尔看一眼' },
  xiwopinke: { bucket: 'page-only', reason: '上游没有 GitHub 仓库；版本在希沃产品清单 e.seewo.com（seewoPincoTeacher），但自动更新只跟 GitHub、这类页面已不再抓取 —— 要人偶尔看一眼' },

  // ── 只有网页入口，抓不到版本锚点 ──
  '360-safe-guard-speed': { bucket: 'page-only', reason: '页面只有 setupbeta_jisu.exe，没有版本号锚点' },
  'huorong-security': { bucket: 'page-only', reason: '官网下载页 333 KB 里没有任何版本锚点，版本由 JS 异步加载' },
  dingtalk: { bucket: 'page-only', reason: '页面里唯一带版本的链接是无障碍兜底用的 DingTalk_v8.2.0.exe，比站内还旧；真实版本由 JS 从接口取' },
  'tencent-meeting': { bucket: 'page-only', reason: '下载页是 Next.js、版本走带签名的内部接口，抓不到静态版本锚点（winget 社区清单里有维护，但那是社区来源，未接入）' },
  xrkayxingz: { bucket: 'page-only', reason: '下载页是 Nuxt SSR，抓不到版本锚点；官方也没提供可解析的版本接口' },
  yjxzsayxingz: { bucket: 'page-only', reason: '下载页是 Vue SPA，要逆向接口才能拿到版本' },

  // ── 网盘 ──
  'directx-repair': { bucket: 'netdisk', reason: '分发在蓝奏云 + 百度网盘；版本号能读，但链接没法自动验证' },
}

export const BUCKET_LABEL = {
  store: '微软商店分发',
  'always-latest': '官方固定「最新版」直链',
  archive: '有意归档 / 已停更',
  'page-only': '只有网页入口',
  netdisk: '第三方网盘',
}

/**
 * 判定一个「没有可用 GitHub 仓库」的软件属于哪一类。
 * 优先用显式登记（理由写得清楚）；没登记的若挂着商店链接，自动归入 store。
 */
export function classify(app) {
  const id = cur(app?.id)
  // ⚠️ 必须用 hasOwnProperty 而不是 `BUCKETS[id]` 直接读：BUCKETS 是普通对象字面量，
  //    id 为 `constructor` / `toString` / `__proto__` 时会顺着原型链命中 Object.prototype，
  //    拿回一个「看起来登记过、bucket 却是 undefined」的假记录（下游会静默退化成 page-only）。
  //    站点数据里目前没有这种 id，但 id 来自外部提交，不能假设它永远干净。
  const hit = Object.prototype.hasOwnProperty.call(BUCKETS, id) ? BUCKETS[id] : null
  if (hit) return { bucket: hit.bucket, label: BUCKET_LABEL[hit.bucket] || hit.bucket, reason: hit.reason, explicit: true }
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
