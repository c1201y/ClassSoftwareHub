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
 * ⚠️ 2026-09-26 起，**下载直链**这件事已经和本表分家 —— 交给
 * `scripts/resolve-direct-links.mjs`（跑在 CI 上，不依赖 Worker）：它按厂商产品码
 * （希沃 e.seewo.com/download/file?code=xxx）或 winget 官方清单，把「官网下载页」
 * 换成文件直链，让详情页能原地下载而不是把用户送去官网。
 * **本表只回答「版本号为什么跟不了」** —— 有了直链不等于有了版本跟踪，别把两件事混起来。
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
  // officetoolplus：2026-09-26 起**已脱离本表** —— 补上了 github 字段（YerongAI/Office-Tool）
  // 与该仓库的 release 直链，现由 check-updates.mjs 正常跟踪，不再需要人工登记「跟不了」。
  'uu-remote': { bucket: 'always-latest', reason: '站内版本字段写「最新版（官网自动更新）」，直链是网易分发接口，永远指向最新包' },
  potplayer: { bucket: 'always-latest', reason: '版本字段写「最新版（官网自动更新）」，三条 daumcdn 直链都在 Version/Latest 下' },
  todesk: { bucket: 'always-latest', reason: '版本字段写「以安装时官网版本为准」；直链是在线安装器，装完自己拉最新版' },
  rammap: { bucket: 'always-latest', reason: '微软 Sysinternals 直链固定为 RAMMap.zip，永远是最新版；要版本号得把包下下来读 PE 信息，不值得' },
  'geek-uninstaller': { bucket: 'always-latest', reason: '官网只给 /geek.zip 固定直链，页面里没有版本号' },
  'driver-ceo': { bucket: 'always-latest', reason: '直链是在线安装器（安装时联网匹配最新驱动），不吃版本号' },
  chrome: { bucket: 'always-latest', reason: '直链是谷歌固定「始终最新」离线包（standalonesetup64.exe，地址里无版本号），装了 Chrome 自己也会更新；站内版本字段写「跟随官网」，不跟' },
  WPS: { bucket: 'always-latest', reason: '直链由 scripts/resolve-direct-links.mjs 从 winget 清单解析（带版本号，每周自动刷新）；版本号随之自动填，天生不需要人工跟' },
  qq: { bucket: 'always-latest', reason: '直链由 scripts/resolve-direct-links.mjs 从 winget 清单解析（带版本号，每周自动刷新）；版本号随之自动填，天生不需要人工跟' },
  wechat: { bucket: 'always-latest', reason: '直链是腾讯固定「始终最新」地址（dldir1.qq.com/weixin/Windows/WeChatSetup.exe，路径里无版本号）；微信自己也会提示更新，站内版本字段写「官网」' },

  // ── 有意归档 ──
  'wps2019ayxingz': { bucket: 'archive', reason: '有意收录 WPS2019 归档版（2022 年的包），不跟随上游' },
  'bandizip6.29': { bucket: 'archive', reason: '有意收录 6.x 末代无广告版（dl.php?old），只需盯「官方是否撤链」' },

  // ── 上游只有厂商页面、没有 GitHub 仓库的 10 个（2026-09-21 起改由人工看）──
  //    ⚠️ 这 10 个的上游都**没有 GitHub 仓库**，是当初做第二条腿的全部理由。
  //    理由如实写「按决定不再抓」而不是「页面抓不到」—— 后者对 vlc / geogebra / diskgenius /
  //    360 这几个是假话（它们的页面本来解析得出来）。
  //    → 其中 vlc / geogebra / 360-safe-guard-speed 的**直链**已在站内（固定「最新版」地址），
  //      xwbb5 / seewo-assistant / class-optimizer / xwspztayxingz 的直链由
  //      resolve-direct-links.mjs 用产品码自动保鲜；**这里剩下的都是「版本号」没人跟**。
  vlc: { bucket: 'page-only', reason: '上游没有 GitHub 仓库；官方目录 get.videolan.org 有版本信息，但自动更新只跟 GitHub、这类页面已不再抓取 —— 要人偶尔看一眼' },
  geogebra: { bucket: 'page-only', reason: '上游没有 GitHub 仓库；官网下载页有版本重定向，但自动更新只跟 GitHub、这类页面已不再抓取 —— 要人偶尔看一眼' },
  diskgenius: { bucket: 'page-only', reason: '直链已补（download_cn.eassos.com/DG6201829_x64.zip，官方 CDN），但文件名带版本号、上游无 GitHub 仓库、winget 清单（Eassos.DiskGenius）还停在 6.0.0 比站内旧 —— 新版发布后直链要人工更新，体检 Issue 会提醒' },
  '360-jijiuxiang': { bucket: 'page-only', reason: '上游没有 GitHub 仓库；官网页面有版本信息，但自动更新只跟 GitHub、这类页面已不再抓取 —— 要人偶尔看一眼' },
  '360-speed-browser': { bucket: 'page-only', reason: '上游没有 GitHub 仓库；官网页面有版本信息（两条直链会随版本变），但自动更新只跟 GitHub、这类页面已不再抓取 —— 要人偶尔看一眼' },
  'class-optimizer': { bucket: 'page-only', reason: '直链已由 resolve-direct-links.mjs 用产品码 EasiCare_PC 自动保鲜；版本号页面里没有锚点，**仍需人偶尔看一眼**' },
  xwbb5: { bucket: 'page-only', reason: '直链已由 resolve-direct-links.mjs 用产品码 EasiNote5 自动保鲜；版本号页面里没有锚点，**仍需人偶尔看一眼**' },
  'seewo-assistant': { bucket: 'page-only', reason: '直链已由 resolve-direct-links.mjs 用产品码 SeewoIwbAssistant 自动保鲜；版本号页面里没有锚点，**仍需人偶尔看一眼**' },
  xwspztayxingz: { bucket: 'page-only', reason: '直链已由 resolve-direct-links.mjs 用产品码 EasiCamera 自动保鲜；版本号页面里没有锚点，**仍需人偶尔看一眼**' },
  xiwopinke: { bucket: 'page-only', reason: '上游没有 GitHub 仓库；版本在希沃产品清单 e.seewo.com（seewoPincoTeacher），但自动更新只跟 GitHub、这类页面已不再抓取 —— 要人偶尔看一眼' },

  // ── 只有网页入口，抓不到版本锚点 ──
  '360-safe-guard-speed': { bucket: 'page-only', reason: '直链已换成官方固定「始终最新」地址 dl.360scdn.com/setupbeta_jisu.exe（页面里没有版本号锚点，版本号只能人看）' },
  'huorong-security': { bucket: 'page-only', reason: '直链已补（官网 downloadHr60.php?plat=x64UrlAll 固定入口，301 到最新版 CDN，无需维护），但版本号只在 301 的 Location 里、页面本身没有锚点 —— 版本仍要人看' },
  dingtalk: { bucket: 'page-only', reason: '页面里唯一带版本的链接是无障碍兜底用的 DingTalk_v8.2.0.exe，比站内还旧；真实版本由 JS 从接口取。winget 清单停在 7.1.0，**比站内 8.5.0 还旧，已被解析器拦下**，暂只能跳官网' },
  'tencent-meeting': { bucket: 'page-only', reason: '直链已由 resolve-direct-links.mjs 从 winget 清单解析并每周刷新；版本号随之自动填，**基本不用人管**' },
  xrkayxingz: { bucket: 'page-only', reason: '下载页是 Nuxt SSR，抓不到版本锚点；官方也没提供可解析的版本接口，**只能跳官网**' },
  yjxzsayxingz: { bucket: 'page-only', reason: '下载页是 Vue SPA，要逆向接口才能拿到版本，**只能跳官网**' },

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
