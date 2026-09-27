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

import { RESOLVERS } from './resolve-direct-links.mjs'

const cur = (s) => String(s ?? '').trim()

/**
 * 已经有人在跟的软件 —— **唯一真相是 resolve-direct-links.mjs 的 RESOLVERS**。
 * 这里只是把那张登记表读过来，不再手抄一份 id 清单，免得两边慢慢对不上。
 */
const AUTO_TRACKED = new Set(Object.keys(RESOLVERS))

/**
 * 无法自动跟踪的软件，逐个写明**为什么**。体检 Issue 靠它把话说清楚：
 * 「没被检查到」不等于「没问题」，更不等于「提交者漏填」。
 *
 * bucket 的取值就是 Issue 里分区的依据：
 *   auto         官方源自动跟 —— 直链与版本号由 resolve-direct-links.mjs 每周刷新
 *   store        微软商店分发 —— 商店自己会更新，站内不跟版本
 *   always-latest 官方固定「最新版」直链 —— URL 永不过期，天生不需要跟
 *   archive      有意归档 / 已停更 —— 刻意留着老版本
 *   page-only    只有官网 / 下载页入口，页面里没有可解析的版本锚点
 *   netdisk      第三方网盘分发 —— 版本能读、链接没法自动化
 *
 * `store` 与 `auto` **都不必手工登记**：
 *   · 下载项里出现 apps.microsoft.com → 自动归入 store
 *   · id 出现在 scripts/resolve-direct-links.mjs 的 RESOLVERS 登记表里 → 自动归入 auto
 *     ⚠️ 所以**不要**再给那批软件在这里写一份「跟不了」的理由：显式登记会盖掉 auto，
 *     让体检报告以为它们没人跟 —— 那正是这报告最容易被骂不准的地方。
 *     只有「登记了、但当前跟不动」的个例（钉钉 / ToDesk）才值得显式写下来。
 */
export const BUCKETS = {
  // ── 微软商店分发（另 3 个由 downloads 里的 apps.microsoft.com 自动识别）──
  '9wzdncrfjbmp': { bucket: 'store', reason: '收录的就是 Microsoft Store 应用本身' },
  'dism-gui': { bucket: 'store', reason: '只在 Microsoft Store 上架' },
  'easy-pdf': { bucket: 'store', reason: '只在 Microsoft Store 上架' },
  xpfp7f8rl7mb1w: { bucket: 'store', reason: '只在 Microsoft Store 上架' },
  snipaste: { bucket: 'store', reason: '以 Microsoft Store 分发为主；另有 download.snipaste.com 的锁版本直链，官网页面里没有版本锚点' },

  // ── 官方固定「最新版」直链，且上游没有可用的版本源 ──
  //    注：chrome / potplayer / rammap / geek-uninstaller / uu-remote / WPS / qq / wechat
  //    都已登记进 resolve-direct-links.mjs（直链 + 版本号每周自动刷新）→ 自动落进 auto，
  //    本表不再列它们。todesk 虽也登记了，但上游清单比站内旧、被降级闸门拦下，所以留在这里。
  'driver-ceo': { bucket: 'always-latest', reason: '直链是在线安装器（安装时联网匹配最新驱动），不吃版本号；官网页面由 JS 渲染，抓不到版本锚点' },
  todesk: { bucket: 'always-latest', reason: '直链是在线安装器，装完自己拉最新版；winget 清单（Youqu.ToDesk 4.7.4.3）比站内写的 5.x 旧、被降级闸门拦下，版本号暂无人跟' },

  // ── 有意归档 ──
  'wps2019ayxingz': { bucket: 'archive', reason: '有意收录 WPS2019 归档版（2022 年的包），不跟随上游' },
  'bandizip6.29': { bucket: 'archive', reason: '有意收录 6.x 末代无广告版（dl.php?old），只需盯「官方是否撤链」' },
  //    直链原先挂在 sw.pcmgr.qq.com 的**带签名**地址上（路径里两段十六进制），签名一到期就 403 ——
  //    2026-09-27 实测确已失效，换成腾讯官方 CDN 的免签名同文件地址。只需盯「官方是否撤链」。
  'wxxpayxingz': { bucket: 'archive', reason: '有意收录微信 3.2.1 老版本（给老机器用），不跟随上游；直链已改用腾讯官方 CDN 免签名地址，只需盯「官方是否撤链」' },

  // ── 只有网页入口：既抓不到直链、也抓不到版本号 ──
  //    原先列在这里的 vlc / geogebra / diskgenius / 360 急救箱 / 360 极速浏览器 /
  //    huorong-security / tencent-meeting / 希沃 5 个，都已登记进 resolve-direct-links.mjs，
  //    直链与版本号每周自动刷新 → 自动落进 auto，不再需要人偶尔看一眼。
  '360-safe-guard-speed': { bucket: 'page-only', reason: '直链已换成官方固定「始终最新」地址 dl.360scdn.com/setupbeta_jisu.exe，无需维护；但页面里没有任何版本锚点、winget 也没收录 360 —— 版本号只能人看' },
  dingtalk: { bucket: 'page-only', reason: 'winget 清单停在 7.1.0、官网页面里那条固定链接是 8.2.0，**两者都比站内 8.5.0 旧**，被解析器的降级闸门拦下 —— 暂只能跳官网，等上游清单跟上' },
  xrkayxingz: { bucket: 'page-only', reason: '下载页是 Nuxt SSR，整页里一个安装包地址都没有（down.oray.com 那条固定名只是 302 回下载页）；也没有可解析的版本接口，**只能跳官网**' },
  yjxzsayxingz: { bucket: 'page-only', reason: '下载页是 Vue SPA，安装包地址由接口下发（yunmdload.hik-cloud.com/…/V\<版本\>/…），要逆向接口才跟得上，**只能跳官网**' },

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
  // ── 登记进 resolve-direct-links.mjs 的：直链与版本号每周自动刷新，属于「有人在跟」──
  //    必须排在显式登记**之后**：钉钉 / ToDesk 也登记了，但上游清单比站内旧、被闸门拦下，
  //    那两个在 BUCKETS 里显式写明「跟不动」，不能被这一条盖成 auto 假装有人跟。
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
