#!/usr/bin/env node
/**
 * scripts/resolve-direct-links.mjs
 *
 * 「把官网下载页换成文件直链」—— 让详情页的按钮对**没有 GitHub 仓库**的软件也能原地下载，
 * 而不是把用户送去官网自己找安装包。
 *
 * 为什么这件事必须放在 CI 而不是网页里：浏览器有同源策略，抓不了别人的官网页面（CORS），
 * 也读不到 302 之后的地址。CI 跑在服务器上，跟重定向、读页面、调接口都不受限 ——
 * **所以不需要自建 Worker。**
 *
 * 五种来源（见下方 RESOLVERS）：
 *   · seewo   厂商按产品码下发的固定接口（e.seewo.com/download/file?code=xxx）
 *             URL 里不带版本号 → 天生「始终最新」，写一次就不用再管
 *   · winget  microsoft/winget-pkgs 官方清单。默认直链带版本号、两边一起刷新；
 *             加 `keepUrl` 的只借它的**版本号**，站内那条「始终最新」直链不动
 *   · probe   探一个「不会变的入口」，从**产物本身**读版本号：
 *             重定向的最终地址（Firefox / 火绒 / GeoGebra）、目录清单（VLC）、
 *             或页面里抠出来的安装包名（DiskGenius）。入口不变，版本号自动跟着走
 *   · rewrite 带 `rewrite` 的 probe —— 链接文件名里带版本号、新版本一发布旧名就 404
 *             的那类（VLC），按模板重建每一条下载项的地址
 *
 * 用法：
 *   node scripts/resolve-direct-links.mjs --report=报告.md      # 只看，不改任何文件
 *   node scripts/resolve-direct-links.mjs --apply --report=报告.md
 *   node scripts/resolve-direct-links.mjs --only=dingtalk,qq    # 只处理指定软件
 *
 * ⚠️ 三条约束，改代码前先读：
 *  1. **只处理没有 `github` 字段的软件** —— 有仓库的由 check-updates.mjs 负责，
 *     两边都写会互相打架。
 *  2. **版本号只向前、不后退** —— 写回的版本必须来自我们**实际分发的那个产物**
 *     （重定向后的地址、Content-Disposition 文件名、页面里抠出的安装包名、winget 清单），
 *     而且只在它比站内更新时才覆盖；上游比站内旧则整条跳过（见 main 里的闸门）。
 *     拿不到可靠版本号就别写 —— `keepVersion` 是给「版本号没法可靠还原」的个例留的出口。
 *  3. 写文件**保持原行尾**（本仓没有 .gitattributes，行尾是混合的），否则整文件重写会产生假 diff。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APPS_DIR = path.join(ROOT, '软件数据', 'apps')
const UA = 'ClassSoftwareHub-Resolver/1.0 (+https://classsoftwarehub.us.ci)'
const TIMEOUT = 20000
const API_BASE = (process.env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/+$/, '')
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''

// ── 参数 ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const has = (n) => args.some((a) => a === `--${n}` || a.startsWith(`--${n}=`))
const val = (n, d = '') => {
  const hit = args.find((a) => a.startsWith(`--${n}=`))
  return hit ? hit.slice(n.length + 3) : d
}
const APPLY = has('apply')
const REPORT_PATH = val('report')
const ONLY = val('only')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// ── 小工具 ──────────────────────────────────────────────────────────────
const cur = (s) => String(s ?? '').trim()

/** 百分号解码，解不开就原样返回 —— 一个畸形的 `%` 不该让整轮解析崩掉 */
function safeDecode(s) {
  try {
    return decodeURIComponent(cur(s))
  } catch {
    return cur(s)
  }
}

/** 字节数格式化，跟随站内主流写法（和 check-updates.mjs 的同名函数保持一致） */
function fmtSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const kb = bytes / 1024
  if (kb < 1000) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  const mb = kb / 1024
  if (mb < 1000) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

/** 版本号比较（数字段逐位比，非数字段按字符串比） */
function cmpVer(a, b) {
  const pa = cur(a).replace(/^v/i, '').split(/[.+-]/)
  const pb = cur(b).replace(/^v/i, '').split(/[.+-]/)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? ''
    const y = pb[i] ?? ''
    const nx = Number(x)
    const ny = Number(y)
    if (Number.isFinite(nx) && Number.isFinite(ny) && x !== '' && y !== '') {
      if (nx !== ny) return nx - ny
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

/** 站内版本号是不是「占位」——一个数字都没有就算（「官网」「跟随官网」「最新版」） */
const isPlaceholderVersion = (s) => !/\d/.test(cur(s))

/**
 * 从版本字符串里取出「纯版本核心」再比大小。
 * 站内版本常带装饰（`5.2.4.11441（2026-09-15）`、`v2.3.3 - Tangram`），
 * 不剥掉这些，`cmpVer` 会退化成字符串比较、得出反的结论。
 */
const verCore = (s) => (cur(s).match(/\d+(?:\.\d+)+/) || [])[0] || cur(s)

/** 只看扩展名的粗判断，用于挑「哪一条下载项还不是直链」（真判定在前端 downloadLink.ts） */const FILE_EXT_RE =
  /\.(?:exe|msi|msix|msixbundle|appx|appxbundle|appinstaller|zip|7z|rar|tar|tar\.gz|tgz|tar\.xz|txz|tar\.bz2|gz|bz2|xz|zst|dmg|pkg|apk|aab|deb|rpm|iso|img|cab|bin|jar|crx|appimage|flatpak|snap|nupkg)(?:[?#]|$)/i

const isFileItem = (item) => {
  const kind = cur(item?.kind)
  if (kind) return kind === 'file'
  const url = cur(item?.url)
  if (!url) return false
  if (/apps\.microsoft\.com|^ms-windows-store:/i.test(url)) return false
  return FILE_EXT_RE.test(url)
}

/** 响应类型是不是「文件」——不是文件就绝不当成直链写回去 */
const FILE_TYPES =
  /octet-stream|msdownload|msdos-program|x-msi|zip|x-7z-compressed|x-rar|x-tar|gzip|x-xz|x-bzip|dmg|diskimage|vnd\.android\.package|flatpak|vnd\.ms-|x-apple/i

const isFileType = (type) => FILE_TYPES.test(cur(type))

/**
 * 把错误说成人话。
 *
 * `fetch` 抛出来的永远只有一句 "fetch failed"，真正的原因藏在 `error.cause` 里 ——
 * 不把它挖出来，报告上就只剩「fetch failed」这种没法排查的字。
 * 常见的两条：`UNABLE_TO_VERIFY_LEAF_SIGNATURE`（本机装了 HTTPS 中间人代理，CI 上不会有）、
 * `ETIMEDOUT` / `ENOTFOUND`（网络不通）。
 */
function errText(error) {
  const cause = error?.cause
  const code = cause?.code || cause?.message || ''
  const message = error?.message || String(error)
  return code && !message.includes(code) ? `${message}（${code}）` : message
}


// ── 网络 ────────────────────────────────────────────────────────────────

/** 带超时的 fetch；body 用完即断，不会把 GB 级安装包真下下来 */
async function fetchWithTimeout(url, options = {}, timeout = TIMEOUT) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 探一个地址：跟完重定向，回报最终地址、类型、体积。
 *
 * 先 HEAD；有些服务器不认 HEAD（回 405 / 空响应），那就退化成 GET —— 但**只读响应头就断开**，
 * 绝不去读 body，否则一个几百 MB 的包会被真的拉下来。
 */
async function probe(url) {
  const headers = { 'User-Agent': UA, Accept: '*/*' }
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetchWithTimeout(url, { method, redirect: 'follow', headers })
      const info = {
        ok: res.ok,
        status: res.status,
        finalUrl: res.url,
        type: res.headers.get('content-type') || '',
        length: Number(res.headers.get('content-length') || 0),
        disposition: res.headers.get('content-disposition') || '',
      }
      if (method === 'GET') {
        try {
          await res.body?.cancel()
        } catch {
          /* 断不断得掉都无所谓，反正没读 */
        }
      }
      if (res.ok) return info
      if (method === 'HEAD') continue
      return info
    } catch (error) {
      if (method === 'GET') return { ok: false, error: String(error?.message || error) }
    }
  }
  return { ok: false, error: '无法连接' }
}

/** 调 GitHub API（带令牌时额度高得多） */
async function ghJson(url) {
  const headers = { 'User-Agent': UA, Accept: 'application/vnd.github+json' }
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`
  const res = await fetchWithTimeout(url, { headers })
  if (res.status === 403 || res.status === 429) {
    // 匿名调用只有 60 次/小时，跑几次就没了。CI 上必须配 GITHUB_TOKEN
    const left = res.headers.get('x-ratelimit-remaining')
    throw new Error(
      `GitHub API 额度用尽${left === null ? '' : `（剩余 ${left}）`}${TOKEN ? '' : ' —— 本地调试请设 GITHUB_TOKEN 环境变量'}`
    )
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/** 取一个文本文件（优先用 contents API 拿原文，避免依赖 raw.githubusercontent） */
async function ghRaw(apiUrl, fallbackUrl) {
  const headers = { 'User-Agent': UA, Accept: 'application/vnd.github.raw' }
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`
  try {
    const res = await fetchWithTimeout(apiUrl, { headers })
    if (res.ok) return await res.text()
  } catch {
    /* 落到备用地址 */
  }
  if (!fallbackUrl) throw new Error('取文件失败')
  const res = await fetchWithTimeout(fallbackUrl, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.text()
}

// ════════════════════════════════════════════════════════════════════════
// 解析器登记表
//
// 一个软件一条。key = 软件 id（软件数据/apps/<id>.json）。
// 想让某个软件也能原地下载 / 自动跟版本，就在这里加一行 —— 不需要动任何其它文件。
//
// 目前**不在这里**、仍然只能跳转的（见 scripts/untracked-buckets.mjs 的登记理由）：
//   xrkayxingz 向日葵     —— 官网 Nuxt SSR，页面里没有安装包地址（down.oray.com 那条
//                            固定名是 302 回下载页的假直链）
//   yjxzsayxingz         —— Vue SPA，要逆向接口
//   dingtalk             —— winget 清单停在 7.1.0，比站内还旧、被闸门拦下
//   '360-jijiuxiang'     —— 抓到的唯一 .exe 是页面里推广的 360 优盘助手，不是本软件
//   '360-safe-guard-speed' —— 直链固定但页面没有版本锚点（winget 也没收录 360）
//   'driver-ceo'         —— 直链是在线安装器，官网页面抓不到版本
//   VirusDetector / directx-repair —— 纯网盘分发，物理上做不到直连
//   仅 Microsoft Store 分发的若干 —— 官方就没有安装包（见 BUCKETS 里的 store 档）
// ════════════════════════════════════════════════════════════════════════
const SEEWO_DL = 'https://e.seewo.com/download/file?code='

export const RESOLVERS = {
  // ── 希沃生态：官方按产品码下发，URL 不带版本号，天生「始终最新」──────────
  'class-optimizer': { kind: 'seewo', code: 'EasiCare_PC' },
  'seewo-assistant': { kind: 'seewo', code: 'SeewoIwbAssistant' },
  xwbb5: { kind: 'seewo', code: 'EasiNote5' },
  xwspztayxingz: { kind: 'seewo', code: 'EasiCamera' },
  xiwopinke: { kind: 'seewo', code: 'seewoPincoTeacher' },

  // ── 稳定入口 + 跟重定向读版本（入口不变，只刷新版本号）──────────────────
  //    Firefox 的 302 直接落在 …/releases/<版本>/… 里 —— 版本号是白拿的。
  //    站点同时用 32 位与 MSI 两条入口，但版本号是同一个，探一条就够。
  firefox: {
    kind: 'probe',
    entry: 'https://download.mozilla.org/?product=firefox-latest&os=win64&lang=zh-CN',
    keepUrl: true,
  },
  //    火绒的 PHP 入口 301 到 down-tencent.huorong.cn/sysdiag-all-x64-<版本>-<日期>.exe
  'huorong-security': {
    kind: 'probe',
    entry: 'https://www.huorong.cn/product/downloadHr60.php?pro=hr60&plat=x64UrlAll',
    keepUrl: true,
  },
  //    GeoGebra 的 302 落在 …/installers/6.0/GeoGebra-Windows-Installer-6-0-930-2.exe，
  //    版本号是「6-0-930-2」这种带连字符的写法，要用 versionFix 换回点号
  geogebra: {
    kind: 'probe',
    entry: 'https://download.geogebra.org/package/win-autoupdate',
    keepUrl: true,
    versionRe: /GeoGebra-Windows-Installer-(\d+(?:-\d+)+)\.exe/i,
    versionFix: (s) => cur(s).replace(/-/g, '.'),
  },
  //    360 极速浏览器：下载页里带着当前版本的安装包名（还会把历史版本一起列出来），
  //    所以取**最大值**；配合「版本只向前」的规则，万一猜低了也不会把版本号写回去。
  '360-speed-browser': {
    kind: 'probe',
    entry: 'https://browser.360.cn/ee/',
    keepUrl: true,
    versionRe: /360csex_(\d+(?:\.\d+){2,})/,
    versionMax: true,
  },
  //    360 系统急救箱：下载页里的安装包是**协议相对**写法（`//dl.360safe.com/…`），
  //    之前只按 `https://` 找链接，所以一直以为它「没有直链」——其实直链和版本号都全。
  //    页面上还挂着一个 360 优盘助手的推广包，用文件名前缀区分开，别抓错。
  '360-jijiuxiang': {
    kind: 'probe',
    entry: 'https://weishi.360.cn/jijiuxiang/index.html',
    pickUrl: /\/\/dl\.360safe\.com\/360c0mpkill_[0-9.\-]+\.zip/gi,
    // 页面上 64 位 / 32 位两条都在，取版本高的那条（顺手也就避开了推广包的干扰）
    pickUrlMax: true,
  },
  //    VLC：链接文件名里带版本号，新版本一发布 `last/` 下的旧文件名直接 500 ——
  //    站内那两条链接就是这么静默失效的。必须按模板重建每条下载项的地址。
  vlc: {
    kind: 'probe',
    entry: 'https://get.videolan.org/vlc/last/win64/',
    versionRe: /vlc-(\d+(?:\.\d+)+)-win64\.exe/,
    rewrite: [
      { match: /win64/, url: (v) => `https://get.videolan.org/vlc/last/win64/vlc-${v}-win64.exe` },
      { match: /win32/, url: (v) => `https://get.videolan.org/vlc/last/win32/vlc-${v}-win32.exe` },
    ],
  },
  //    DiskGenius：中转页首选蓝奏云网盘，但页面里同时留着官方 CDN 直链
  //    （download_cn.eassos.com/DG<版本>_x64.zip）。抠出来当直链最稳；
  //    它的版本号是厂商自己编码过的（DG6201829），没法可靠还原成点号版本，故 keepVersion。
  diskgenius: {
    kind: 'probe',
    entry: 'https://www.diskgenius.cn/download/downloadURL.php?Name=DG_64',
    pickUrl: /https?:\/\/[^"'\s<>]+\.(?:zip|exe)/i,
    keepVersion: true,
  },
  //    HiBit Uninstaller：官网下载页里挂着**当期**的安装包名（HiBitUninstaller-setup-4.0.10.exe），
  //    版本号从页面白拿；但站内用的是官网那条**固定文件名**地址
  //    （…/HiBitUninstaller/HiBitUninstaller-setup.exe，不带版本号、发新版就用同名覆盖，
  //    2026-09-30 实测与当期版本化包的 Last-Modified 完全一致）——
  //    所以 keepUrl：只借页面里的版本号与体积，URL 永不过期。
  'hibit-uninstaller': {
    kind: 'probe',
    entry: 'https://www.hibitsoft.ir/Uninstaller.html',
    keepUrl: true,
    pickUrl: /HiBitUninstaller\/HiBitUninstaller-setup-[0-9.]+\.exe/gi,
    versionRe: /HiBitUninstaller-setup-(\d+(?:\.\d+)+)\.exe/i,
  },
  //    SpaceSniffer：官网首页推荐的**主镜像 dAppCDN 对脚本恒 403**（带 Referer 也没用），
  //    幸好官网「备用下载」页把每个历史版本的直链都列了出来
  //    （files/spacesniffer_2_2_0_27_x64.zip）——取版本号最大的那条即可。
  //    2.x 只有 x64 版；文件名里版本是下划线写法，用 versionFix 换回点号。
  spacesniffer: {
    kind: 'probe',
    entry: 'https://www.uderzo.it/main_products/space_sniffer/download_alt.html',
    pickUrl: /files\/spacesniffer_[0-9_]+_x64\.zip/gi,
    pickUrlMax: true,
    versionRe: /spacesniffer_(\d+(?:_\d+)+)_x64\.zip/i,
    versionFix: (s) => cur(s).replace(/_/g, '.'),
  },

  // ── winget 官方清单：直链带版本号，链接与版本号一起自动刷新 ───────────────
  //    微信 4.x 的安装包换了目录（weixin/Universal/Windows/WeChatWin_<版本>.exe），
  //    老路径 dldir1.qq.com/weixin/Windows/WeChatSetup.exe 已经停在 3.x 不再更新。
  wechat: { kind: 'winget', pkg: 'Tencent.WeChat.Universal' },
  dingtalk: { kind: 'winget', pkg: 'Alibaba.DingTalk' },
  'tencent-meeting': { kind: 'winget', pkg: 'Tencent.TencentMeeting' },
  qq: { kind: 'winget', pkg: 'Tencent.QQ.NT' },
  WPS: { kind: 'winget', pkg: 'Kingsoft.WPSOffice' },

  // ── winget 官方清单：只借版本号，站内那条「始终最新」直链不动 ─────────────
  //    这些软件的官方直链都是「固定文件名 + 永远指向最新版」，换成带版本号的地址反而
  //    更脆；版本号却可以从清单里拿 —— 比站内写「跟随官网」「最新版」有用得多。
  chrome: { kind: 'winget', pkg: 'Google.Chrome', keepUrl: true },
  potplayer: { kind: 'winget', pkg: 'Daum.PotPlayer', keepUrl: true },
  rammap: { kind: 'winget', pkg: 'Microsoft.Sysinternals.RAMMap', keepUrl: true },
  'geek-uninstaller': { kind: 'winget', pkg: 'GeekUninstaller.GeekUninstaller', keepUrl: true },
  'uu-remote': { kind: 'winget', pkg: 'NetEase.UURemote', keepUrl: true },
  todesk: { kind: 'winget', pkg: 'Youqu.ToDesk', keepUrl: true },
}

// ── seewo ───────────────────────────────────────────────────────────────

/**
 * 希沃：`https://e.seewo.com/download/file?code=<产品码>` 会 302 到当期安装包。
 *
 * **写回的是这条 code 地址本身，不是它 302 之后那条**：后者带 sha1 签名
 * （`&sign=q-sign-algorithm%3Dsha1…`，参数被改动一个字符就 403），而 code 地址永远有效。
 * 体积从响应头拿；版本号顺带从 Content-Disposition 的文件名里读出来，只用于报告。
 */
async function resolveSeewo(resolver) {
  if (!resolver.code) return { error: '没登记产品码' }
  const url = SEEWO_DL + resolver.code
  const info = await probe(url)
  if (!info.ok) return { error: `接口探测失败（${info.status ? `HTTP ${info.status}` : info.error}）` }
  if (!isFileType(info.type)) return { error: `接口返回的不是文件（${info.type || '类型未知'}）` }
  // 文件名优先从 Content-Disposition 拿；有些产品（希沃品课）的 CDN 不发这个头，
  // 那就退回最终地址的文件名 —— 版本号就在里面（…/seewoPincoTeacher_1.2.43.7298(…).exe）
  const name = safeDecode(
    (info.disposition.match(/filename\*?=(?:utf-8'')?"?([^";]+)"?/i) || [])[1] ||
      info.finalUrl.split('/').pop().split('?')[0] ||
      ''
  )
  const version = (name.match(/\d+(?:\.\d+){2,}/) || [])[0] || ''
  return {
    url,
    size: fmtSize(info.length),
    version,
    fileName: name,
    source: `希沃产品码 ${resolver.code}`,
  }
}

// ── winget ──────────────────────────────────────────────────────────────

/**
 * 从 winget 的 `.installer.yaml` 里抠安装包（只认这几个字段，不为它引一个 YAML 库）。
 * 缩进是关键：顶层键 0 缩进，安装项里的键是缩进的；`Installers:` 之后才是列表。
 */
function parseInstallerYaml(text) {
  const top = {}
  const installers = []
  let current = null
  for (const line of text.split(/\r?\n/)) {
    const dash = line.match(/^(\s*)-\s+([A-Za-z]+):\s*(.*)$/)
    if (dash) {
      current = { [dash[2].toLowerCase()]: dash[3].replace(/^["']|["']$/g, '') }
      installers.push(current)
      continue
    }
    const kv = line.match(/^(\s*)([A-Za-z][A-Za-z0-9]*):\s*(.*)$/)
    if (!kv) continue
    const [, indent, key, rawValue] = kv
    const value = rawValue.replace(/^["']|["']$/g, '')
    if (indent.length === 0) {
      top[key.toLowerCase()] = value
      if (key.toLowerCase() === 'installers') current = null
      continue
    }
    if (current && value) current[key.toLowerCase()] = value
  }
  return { top, installers }
}

/**
 * 找到并读出一个 winget 包的最新清单。
 *
 * 目录形状并不统一（有 `…/QQ.NT/9.9.9.23424/`，也有 `…/DingTalk/Mainland/8.3.x/`、
 * `…/WPSOffice/12.1.0.x/CN/x64/`），所以这里**逐层下行**：
 * 优先挑「像版本号的目录里最大的那个」，没有版本号目录时再挑 Mainland / zh-CN，
 * 最后才退化成「目录里排序最后一个」；下到某一层出现 `*.installer.yaml` 就停。
 */
async function findWingetManifest(pkg) {
  const segs = String(pkg || '').split('.')
  if (segs.length < 2) throw new Error('包标识格式不对（应为 发布者.软件名）')
  let dir = `manifests/${segs[0][0].toLowerCase()}/${segs.join('/')}`
  const trail = []
  for (let depth = 0; depth < 4; depth++) {
    const items = await ghJson(`${API_BASE}/repos/microsoft/winget-pkgs/contents/${dir}`)
    if (!Array.isArray(items)) throw new Error('清单目录读取失败')
    const yamlItem = items.find((i) => i.type === 'file' && /\.installer\.yaml$/i.test(i.name))
    if (yamlItem) {
      const text = await ghRaw(yamlItem.url, yamlItem.download_url)
      return { text, trail: trail.join('/') }
    }
    const dirs = items.filter((i) => i.type === 'dir')
    if (!dirs.length) throw new Error('清单目录里没有 installer.yaml')
    const versionDirs = dirs.filter((d) => /^\d/.test(d.name)).sort((a, b) => cmpVer(a.name, b.name))
    const chosen =
      (versionDirs.length ? versionDirs[versionDirs.length - 1] : null) ||
      dirs.find((d) => /^(mainland|zh-cn|cn|china)$/i.test(d.name)) ||
      dirs[dirs.length - 1]
    trail.push(chosen.name)
    dir = `${dir}/${chosen.name}`
  }
  throw new Error('下钻层数过深，没找到 installer.yaml')
}

async function resolveWinget(resolver) {
  const { text, trail } = await findWingetManifest(resolver.pkg)
  const { top, installers } = parseInstallerYaml(text)
  const detected = cur(top.packageversion) || cur(trail.split('/').pop())
  const source = `winget ${resolver.pkg}${trail ? `（${trail}）` : ''}`

  // ── `keepUrl`：只借清单里的版本号，站内那条「始终最新」直链一个字都不动 ──
  //    省掉一次对几百 MB 安装包的探测，也避免把耐用的固定地址换成会过期的钉死地址。
  if (resolver.keepUrl) {
    if (!detected) return { error: '清单里没有版本号' }
    return {
      version: detected,
      // 仍然是「钉死版本」：清单写 4.42.1.2835 就说这个版本，交给闸门判是不是比站内旧
      pinnedVersion: detected,
      fileName: '',
      source,
    }
  }

  if (!installers.length) return { error: '清单里没有 Installers 段' }
  // 优先 x64，其次 neutral，再不行拿第一个 —— 站点服务的绝大多数是 64 位 Windows
  const picked =
    installers.find((i) => cur(i.architecture).toLowerCase() === 'x64') ||
    installers.find((i) => cur(i.architecture).toLowerCase() === 'neutral') ||
    installers[0]
  const url = cur(picked.installerurl)
  if (!url) return { error: '清单里没写 InstallerUrl' }

  const info = await probe(url)
  if (!info.ok) return { error: `清单里的安装包探测失败（${info.status ? `HTTP ${info.status}` : info.error}）` }
  if (!isFileType(info.type)) return { error: `清单里的地址不是文件（${info.type || '类型未知'}）` }
  return {
    url,
    size: fmtSize(info.length),
    version: detected,
    // winget 是**版本钉死**的目录（清单写的是哪一个版本，URL 就是哪一个版本的文件），
    // 所以这里报出钉死版本，交给 main() 判「上游是不是比站内还旧」——
    // 真实案例：winget 的 Alibaba.DingTalk 停在 7.1.0，站内已经是 8.5.0。
    pinnedVersion: detected,
    fileName: url.split('/').pop().split('?')[0],
    source,
  }
}

// ── probe ───────────────────────────────────────────────────────────────

/** 默认版本号形状：`156.0.1`、`6.0.12.1` 这种至少带一个小数点的数字串 */
const DEFAULT_VERSION_RE = /\d+(?:\.\d+){1,}/

/**
 * 探一个「不会变的入口」，跟完重定向后把最终地址、类型、体积、以及**正文**一起拿回来。
 *
 * ⚠️ **绝不把安装包的 body 读进来** —— 入口 302 到一个八九十 MB 的 exe 是常态，
 * 只有响应是 html / text / json 这类文本时才读正文（目录清单、下载页）。
 * 不需要正文时不发 GET，避免白白触发一次大文件传输。
 */
async function probeEntry(entryUrl, needBody = false) {
  const headers = { 'User-Agent': UA, Accept: '*/*' }
  let last = null
  for (const method of needBody ? ['GET'] : ['HEAD', 'GET']) {
    try {
      const res = await fetchWithTimeout(entryUrl, { method, redirect: 'follow', headers })
      const type = res.headers.get('content-type') || ''
      const info = {
        ok: res.ok,
        status: res.status,
        finalUrl: res.url || entryUrl,
        type,
        length: Number(res.headers.get('content-length') || 0),
        disposition: res.headers.get('content-disposition') || '',
        body: '',
      }
      if (/text|html|json|xml|javascript/i.test(type)) info.body = await res.text()
      else {
        try {
          await res.body?.cancel()
        } catch {
          /* 根本没读 body，断不断得掉都无所谓 */
        }
      }
      if (info.ok) return info
      last = info
    } catch (error) {
      last = {
        ok: false,
        status: 0,
        error: errText(error),
        finalUrl: entryUrl,
        type: '',
        length: 0,
        disposition: '',
        body: '',
      }
    }
  }
  return last
}

/** 从一段文本里按正则取版本；`versionMax` 时取所有匹配里最大的那个（360 的页面会列出历史版本） */
function pickVersion(re, text, max = false) {
  if (!text) return ''
  if (!max) {
    const m = re.exec(text)
    return m ? cur(m[1] !== undefined ? m[1] : m[0]) : ''
  }
  // 带 g 的正则是有状态的，每次现造一个，免得跨次调用互相干扰
  const all = String(text).match(new RegExp(re.source, 'g')) || []
  const nums = all
    .map((s) => cur((new RegExp(re.source).exec(s) || [])[1] ?? s))
    .filter((s) => /\d/.test(s))
    .sort((a, b) => cmpVer(a, b))
  return nums.length ? nums[nums.length - 1] : ''
}

/**
 * 探「不会变的入口」拿版本号（必要时连下载地址一起重建）。
 *
 *   默认      入口 302 到当期安装包，版本号就在最终地址里         —— Firefox / 火绒
 *   versionRe 版本号要从响应体里抠（目录清单、下载页）              —— VLC / 360 / GeoGebra
 *   pickUrl   响应体里藏着真正的安装包地址，先抠出来再去看它         —— DiskGenius / 360 急救箱
 *             ⚠️ 别忘了**协议相对**写法（`//dl.360safe.com/x.zip`）—— 只按 `https://` 找
 *             会以为人家「没有直链」，360 急救箱就这么被误判了很久。
 *   rewrite   链接文件名带版本号、旧版本会被删，按模板重建每条地址    —— VLC
 */
async function resolveProbe(resolver) {
  if (!resolver.entry) return { error: '没登记入口地址' }
  const needBody = Boolean(resolver.pickUrl || resolver.versionRe)
  const info = await probeEntry(resolver.entry, needBody)
  if (!info.ok) {
    return { error: `入口探测失败（${info.status ? `HTTP ${info.status}` : info.error || '无法连接'}）` }
  }

  // ① 先把「真正的安装包地址」定下来
  let target = info.finalUrl
  let size = fmtSize(info.length)
  let fileName = ''

  if (resolver.pickUrl) {
    // 从页面里抠地址（相对 / 协议相对都交给 new URL 补全）；抠不到就报错，**绝不猜**
    // 一张页面上常同时挂着 32 位 / 64 位甚至历史版本，pickUrlMax 时取版本号最大的那条
    const gather = new RegExp(
      resolver.pickUrl.source,
      resolver.pickUrl.flags.includes('g') ? resolver.pickUrl.flags : `${resolver.pickUrl.flags}g`
    )
    const found = [...new Set(info.body.match(gather) || [])]
    if (!found.length) return { error: '页面里没抠到安装包地址（官网改版了？）' }
    const rank = (list) => {
      if (!resolver.pickUrlMax || list.length === 1) return list[0]
      const re0 = resolver.versionRe || DEFAULT_VERSION_RE
      return list
        .map((u) => ({ u, v: pickVersion(new RegExp(re0.source), safeDecode(u)) }))
        .sort((a, b) => cmpVer(a.v || '0', b.v || '0'))
        .pop().u
    }
    target = new URL(rank(found), info.finalUrl).href
    const probed = await probe(target)
    if (!probed.ok) return { error: `抠出的地址探测失败（${probed.status ? `HTTP ${probed.status}` : probed.error}）` }
    if (!isFileType(probed.type)) return { error: `抠出的地址不是文件（${probed.type || '类型未知'}）` }
    size = fmtSize(probed.length)
    fileName = target.split('/').pop().split('?')[0]
  } else if (isFileType(info.type)) {
    fileName = safeDecode(
      (info.disposition.match(/filename\*?=(?:utf-8'')?"?([^";]+)"?/i) || [])[1] ||
        info.finalUrl.split('/').pop().split('?')[0]
    )
  }

  // ② 再取版本号。给了 versionRe 就允许在响应体里搜；默认只看最终地址与文件名 ——
  //    整页 HTML 里数字太多了，不限定形状必然抠错
  const re = resolver.versionRe
    ? new RegExp(resolver.versionRe.source, resolver.versionRe.flags.replace(/g/g, ''))
    : DEFAULT_VERSION_RE
  const haystack = [fileName, safeDecode(info.disposition), info.finalUrl]
  if (resolver.versionRe && info.body) haystack.push(info.body)
  let version = ''
  for (const text of haystack) {
    version = pickVersion(re, text, Boolean(resolver.versionMax))
    if (version) break
  }
  if (version && resolver.versionFix) version = resolver.versionFix(version)

  // ③ 需要按模板重建下载项地址的（VLC）：先逐条探一遍，探不通就整条放弃 ——
  //    宁可这次不写，也不能把一个 404 的地址写进数据
  let rewrites
  if (resolver.rewrite) {
    if (!version) return { error: '拿不到版本号，无法重建带版本号的下载地址' }
    rewrites = []
    for (const rule of resolver.rewrite) {
      const rebuilt = rule.url(version)
      const probed = await probe(rebuilt)
      if (!probed.ok) {
        return { error: `重建出的地址不可用（${rebuilt} → ${probed.status ? `HTTP ${probed.status}` : probed.error}）` }
      }
      rewrites.push({ match: rule.match, url: rebuilt, size: fmtSize(probed.length) })
    }
  }

  return {
    url: resolver.keepUrl ? undefined : target,
    size,
    version,
    rewrites,
    fileName: fileName || target.split('/').pop().split('?')[0],
    source: `官网页 ${resolver.entry}`,
  }
}

// ── 挑「改哪一条下载项」 ─────────────────────────────────────────────────

/**
 * 一个软件可能有好几条下载项（多平台 / 多架构）。只动**最该动的那一条**：
 *   · seewo：先找本来就是 code 地址的那条（体积要刷新），没有就挑第一条还不是直链的
 *   · 先看显式声明：数据里写 `"kind": "file"` 就是在说「这条是直链」，它优先 ——
 *     否则会被同一页那条「官网下载页」（kind=page）抢走位置。微信就踩过这个坑：
 *     真的要改的是 kind=file 的安装包，不是 kind=page 的官网入口。
 *   · 其余：挑第一条还不是直链的；全都已是直链时挑第一条
 */
function pickTarget(app, resolver) {
  const items = Array.isArray(app.downloads) ? app.downloads : []
  if (!items.length) return null
  const targetable = items.filter((i) => !/apps\.microsoft\.com|^ms-windows-store:/i.test(cur(i.url)))
  const pool = targetable.length ? targetable : items
  if (resolver.kind === 'seewo') {
    const byCode = pool.find((i) => cur(i.url).startsWith(SEEWO_DL))
    if (byCode) return byCode
  }
  const declared = pool.find((i) => cur(i.kind) === 'file')
  if (declared) return declared
  return pool.find((i) => !isFileItem(i)) || pool[0]
}

// ── 主流程 ──────────────────────────────────────────────────────────────

function readApps() {
  const files = fs.readdirSync(APPS_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  return files.map((f) => {
    const full = path.join(APPS_DIR, f)
    const raw = fs.readFileSync(full, 'utf8')
    return {
      file: full,
      name: f,
      raw,
      eol: raw.includes('\r\n') ? '\r\n' : '\n',
      trailingNewline: raw.endsWith('\n'),
      data: JSON.parse(raw),
    }
  })
}

function writeApp(entry) {
  const text =
    JSON.stringify(entry.data, null, 2).split('\n').join(entry.eol) + (entry.trailingNewline ? entry.eol : '')
  fs.writeFileSync(entry.file, text, 'utf8')
}

/**
 * 把「引导至官网下载」这类**占位平台名**换成真名。
 *
 * 这些标签是当年「只能跳官网」时写的（`该应用更新频繁，故引导至官网下载`），
 * 而这一条现在已经变成直链了 —— 标签再那么写就自相矛盾，用户会以为点了要跳走。
 * 标签里本来提到「其他版本」的，把这句话挪进 note，别把信息丢了。
 */
const PLACEHOLDER_PLATFORM = /引导至官网|官网下载页?$|官网获取/

function fixPlatformLabel(item) {
  const label = cur(item.platform)
  if (!PLACEHOLDER_PLATFORM.test(label)) return ''
  if (/其他版本/.test(label) && !cur(item.note)) {
    item.note = '其他版本（macOS / 手机端等）见官网'
  }
  item.platform = 'Windows 安装版'
  return '平台名'
}

/**
 * 把解析结果落回 JSON。返回「做了哪些改动」，供报告使用。
 *
 * 两种落法：
 *   · 有 `result.rewrites` —— 按模板重建**每一条**匹配的下载项（VLC 的 win64 / win32）。
 *   · 否则 —— 只动 `pickTarget` 挑中的那一条：`url` / `kind` / `size`；
 *     `keepUrl` 的解析器只借版本号，这条连 url 都不碰。
 *
 * 版本号是**只向前**的：占位版本（「官网」「跟随官网」）直接填上；已有数字的只在
 * 新版本更大时覆盖 —— 上游偶尔回退一次，也不该把站内已经写好的版本号冲回去。
 */
function applyResolved(app, resolver, result) {
  const changes = []
  const items = Array.isArray(app.downloads) ? app.downloads : []

  if (result.rewrites) {
    for (const rw of result.rewrites) {
      for (const item of items) {
        if (!rw.match.test(cur(item.url))) continue
        if (cur(item.url) !== rw.url) {
          item.url = rw.url
          changes.push(`直链（${cur(item.platform) || '未命名项'}）`)
        }
        if (rw.size && cur(item.size) !== rw.size) {
          item.size = rw.size
          changes.push(`体积 ${rw.size}`)
        }
        if (cur(item.kind) !== 'file') {
          item.kind = 'file'
          changes.push('kind=file')
        }
      }
    }
  } else {
    const item = pickTarget(app, resolver)
    if (item && !resolver.keepUrl) {
      if (result.url && cur(item.url) !== result.url) {
        item.url = result.url
        changes.push('直链')
      }
      if (cur(item.kind) !== 'file') {
        item.kind = 'file'
        changes.push('kind=file')
      }
      const relabel = fixPlatformLabel(item)
      if (relabel) changes.push(relabel)
      if (result.size && cur(item.size) !== result.size) {
        item.size = result.size
        changes.push(`体积 ${result.size}`)
      }
    }
  }

  if (!resolver.keepVersion && result.version) {
    const next = cur(result.version)
    const now = cur(app.version)
    const forward = isPlaceholderVersion(now) || cmpVer(verCore(next), verCore(now)) > 0
    if (next && next !== now && forward) {
      app.version = next
      changes.push(`版本 ${next}`)
    }
  }
  return changes
}

async function main() {
  const entries = readApps()
  const report = []
  const applied = []
  const skipped = []
  const failed = []

  report.push('# 非 GitHub 应用的直链解析报告', '')
  report.push(
    APPLY ? '本次为**写回**模式：能确定的直链与体积已写进 JSON。' : '本次为**只读**模式：没有修改任何文件。',
    ''
  )
  report.push(`- 登记了解析规则的软件：**${Object.keys(RESOLVERS).length}** 个`)
  report.push(`- 本次尝试：**${Object.keys(RESOLVERS).filter((id) => !ONLY.length || ONLY.includes(id)).length}** 个`)
  report.push('')

  for (const [id, resolver] of Object.entries(RESOLVERS)) {
    if (ONLY.length && !ONLY.includes(id)) continue

    const entry = entries.find((e) => path.basename(e.name, '.json') === id)
    if (!entry) {
      failed.push({ id, why: '软件数据/apps 里没有这个 id（是不是改名了？）' })
      continue
    }
    const app = entry.data
    if (cur(app.github)) {
      skipped.push({ id, why: '有 github 字段，归 check-updates.mjs 管' })
      continue
    }
    const target = pickTarget(app, resolver)
    if (!target) {
      skipped.push({ id, why: '没有可处理的下载项' })
      continue
    }

    let result
    try {
      result =
        resolver.kind === 'seewo'
          ? await resolveSeewo(resolver)
          : resolver.kind === 'winget'
            ? await resolveWinget(resolver)
            : resolver.kind === 'probe'
              ? await resolveProbe(resolver)
              : { error: `不认识的解析器类型 ${resolver.kind}` }
    } catch (error) {
      result = { error: errText(error) }
    }

    if (result.error) {
      failed.push({ id, why: result.error, platform: cur(target.platform) })
      continue
    }

    // ── 闸门：上游清单比站内旧，一个字都不许改 ──────────────────────────
    // winget 的清单由社区维护，会落后于厂商（钉钉就停在 7.1.0，而站内已是 8.5.0）。
    // 没有这道闸，一个偷懒的上游会把用户从新版拽回旧版，而且没人看得出来。
    if (
      result.pinnedVersion &&
      !isPlaceholderVersion(app.version) &&
      cmpVer(verCore(result.pinnedVersion), verCore(app.version)) < 0
    ) {
      skipped.push({
        id,
        why: `上游清单**落后于站内**（上游 ${result.pinnedVersion} < 站内 ${cur(app.version)}），本次未修改 —— 需要另找一个更新的来源，或等上游清单跟上`,
      })
      continue
    }

    // 只读模式更要给出「会改什么」：拿一份深拷贝试算，真身一个字都不动
    const before = cur(app.version)
    const changes = applyResolved(APPLY ? app : JSON.parse(JSON.stringify(app)), resolver, result)
    if (APPLY && changes.length) writeApp(entry)

    const head = changes.length
      ? `${APPLY ? '已写回' : '将写回'}：${changes.join('、')}`
      : '无需改动'
    // 上游报了版本、但没覆盖站内那个 —— 说清楚是「本来就不动」还是「只向前所以没动」
    const versionFlag =
      result.version && !changes.some((c) => c.startsWith('版本 ')) && before !== cur(result.version)
        ? `　<sub>站内版本 \`${before}\`，上游报 \`${cur(result.version)}\`（未覆盖）</sub>`
        : ''
    report.push(`- \`${id}\` **${cur(app.name)}**　${head}${versionFlag}`)
    report.push(`  - ${result.fileName || ''}${result.source ? `　（来源：${result.source}）` : ''}`)
    if (APPLY && changes.length) applied.push(id)
  }

  if (failed.length) {
    report.push('', '## 解析失败（需要人工看一眼）', '')
    for (const f of failed) report.push(`- \`${f.id}\`${f.platform ? `（${f.platform}）` : ''} —— ${f.why}`)
  }
  if (skipped.length) {
    report.push('', '<details>', `<summary>跳过 ${skipped.length} 个</summary>`, '')
    for (const s of skipped) report.push(`- \`${s.id}\` —— ${s.why}`)
    report.push('', '</details>')
  }

  const text = report.join('\n') + '\n'
  if (REPORT_PATH) fs.writeFileSync(REPORT_PATH, text, 'utf8')
  process.stdout.write(text)

  console.log(
    `\n统计：写回 ${applied.length} 个，失败 ${failed.length} 个${APPLY ? '' : '（只读模式，未写任何文件）'}`
  )
}

// 直接执行（`node scripts/resolve-direct-links.mjs`）才跑 main()；被 import 进来拿登记表时不跑。
// scripts/untracked-buckets.mjs 就靠这条 import 承认「这些软件的直链与版本号已经有人在跟」，
// 这样「谁在被自动跟踪」只有 RESOLVERS 一处真相，不会两个文件各写一份、慢慢对不上。
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
