#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APPS_DIR = path.join(ROOT, '软件数据', 'apps')
const UA = 'ClassSoftwareHub-Resolver/1.0 (+https://classsoftwarehub.cn)'
const TIMEOUT = 20000
const API_BASE = (process.env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/+$/, '')
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
const OSS_OBJECT_RE = /^oss:\/\//i

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
function errText(error) {
  const cause = error?.cause
  const code = cause?.code || cause?.message || ''
  const message = error?.message || String(error)
  return code && !message.includes(code) ? `${message}（${code}）` : message
}

// ── 网络 ────────────────────────────────────────────────────────────────
function assertHttpUrl(url) {
  let u
  try {
    u = new URL(url)
  } catch {
    throw new Error(`不是合法 URL：${String(url).slice(0, 80)}`)
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`拒绝非 http(s) 地址：${u.protocol}//${u.hostname}`)
  }
  return u
}

/** 带超时的 fetch；body 用完即断，不会把 GB 级安装包真下下来 */
async function fetchWithTimeout(url, options = {}, timeout = TIMEOUT) {
  assertHttpUrl(url)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
async function readTextCapped(res, max = 3 * 1024 * 1024) {
  const reader = res.body.getReader()
  const chunks = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > max) {
      try {
        await reader.cancel()
      } catch {
        /* 断流失败无所谓 */
      }
      throw new Error(`响应体超过 ${max} 字节上限，拒绝读入`)
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}
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
    if (res.ok) return await readTextCapped(res)
  } catch {
    /* 落到备用地址 */
  }
  if (!fallbackUrl) throw new Error('取文件失败')
  const res = await fetchWithTimeout(fallbackUrl, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await readTextCapped(res)
}
const SEEWO_DL = 'https://e.seewo.com/download/file?code='

export const RESOLVERS = {
  // ── 希沃生态：官方按产品码下发，URL 不带版本号，天生「始终最新」──────────
  'class-optimizer': { kind: 'seewo', code: 'EasiCare_PC' },
  'seewo-assistant': { kind: 'seewo', code: 'SeewoIwbAssistant' },
  xwbb5: { kind: 'seewo', code: 'EasiNote5' },
  xwspztayxingz: { kind: 'seewo', code: 'EasiCamera' },
  xiwopinke: { kind: 'seewo', code: 'seewoPincoTeacher' },
  xwgjayxingz: { kind: 'seewo', code: 'SeewoServiceSetup' },
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
  diskgenius: {
    kind: 'probe',
    entry: 'https://www.diskgenius.cn/download/downloadURL.php?Name=DG_64',
    pickUrl: /https?:\/\/[^"'\s<>]+\.(?:zip|exe)/i,
    keepVersion: true,
  },
  'hibit-uninstaller': {
    kind: 'probe',
    entry: 'https://www.hibitsoft.ir/Uninstaller.html',
    keepUrl: true,
    pickUrl: /HiBitUninstaller\/HiBitUninstaller-setup-[0-9.]+\.exe/gi,
    versionRe: /HiBitUninstaller-setup-(\d+(?:\.\d+)+)\.exe/i,
  },
  spacesniffer: {
    kind: 'probe',
    entry: 'https://www.uderzo.it/main_products/space_sniffer/download_alt.html',
    pickUrl: /files\/spacesniffer_[0-9_]+_x64\.zip/gi,
    pickUrlMax: true,
    versionRe: /spacesniffer_(\d+(?:_\d+)+)_x64\.zip/i,
    versionFix: (s) => cur(s).replace(/_/g, '.'),
  },
  winrar: {
    kind: 'probe',
    entry: 'https://www.rarlab.com/download.htm',
    pickUrl: /\/rar\/winrar-x64-(\d{3})sc\.exe/i,
  },
  klite: {
    kind: 'probe',
    entry: 'https://codecguide.com/download_k-lite_codec_pack_full.htm',
    versionRe: /Version\s+(\d+(?:\.\d+)+)\s+Full/i,
    rewrite: [
      { match: /files2\.codecguide\.com\/K-Lite_Codec_Pack_\d+_Full\.exe/i, url: (v) => `https://files2.codecguide.com/K-Lite_Codec_Pack_${v.replace(/\./g, '')}_Full.exe` },
      { match: /files3\.codecguide\.com\/K-Lite_Codec_Pack_\d+_Full\.exe/i, url: (v) => `https://files3.codecguide.com/K-Lite_Codec_Pack_${v.replace(/\./g, '')}_Full.exe` },
      { match: /files2\.codecguide\.com\/K-Lite_Codec_Pack_\d+_Standard\.exe/i, url: (v) => `https://files2.codecguide.com/K-Lite_Codec_Pack_${v.replace(/\./g, '')}_Standard.exe` },
      { match: /files3\.codecguide\.com\/K-Lite_Codec_Pack_\d+_Standard\.exe/i, url: (v) => `https://files3.codecguide.com/K-Lite_Codec_Pack_${v.replace(/\./g, '')}_Standard.exe` },
      { match: /files2\.codecguide\.com\/K-Lite_Codec_Pack_\d+_Mega\.exe/i, url: (v) => `https://files2.codecguide.com/K-Lite_Codec_Pack_${v.replace(/\./g, '')}_Mega.exe` },
      { match: /files3\.codecguide\.com\/K-Lite_Codec_Pack_\d+_Mega\.exe/i, url: (v) => `https://files3.codecguide.com/K-Lite_Codec_Pack_${v.replace(/\./g, '')}_Mega.exe` },
      { match: /files2\.codecguide\.com\/K-Lite_Codec_Pack_\d+_Basic\.exe/i, url: (v) => `https://files2.codecguide.com/K-Lite_Codec_Pack_${v.replace(/\./g, '')}_Basic.exe` },
      { match: /files3\.codecguide\.com\/K-Lite_Codec_Pack_\d+_Basic\.exe/i, url: (v) => `https://files3.codecguide.com/K-Lite_Codec_Pack_${v.replace(/\./g, '')}_Basic.exe` },
    ],
  },
  centbrowser: {
    kind: 'probe',
    entry: 'https://www.centbrowser.cn/index.html',
    versionRe: /版本号：\s*(\d+(?:\.\d+)+)/,
    rewrite: [
      { match: /_x64_portable\.exe/i, url: (v) => `https://static.centbrowser.cn/win_stable/${v}/centbrowser_${v}_x64_portable.exe` },
      { match: /_x64\.exe/i, url: (v) => `https://static.centbrowser.cn/win_stable/${v}/centbrowser_${v}_x64.exe` },
    ],
  },
  idm: {
    kind: 'probe',
    entry: 'https://www.internetdownloadmanager.com/news.html',
    keepUrl: true,
    versionRe: /What's new in version\s+\d+\.\d+\s+Build\s+\d+/i,
    versionFix: (s) => cur(s).replace(/^.*?version\s+/i, '').replace(/\s+Build\s+/i, '.'),
  },
  wechat: { kind: 'winget', pkg: 'Tencent.WeChat.Universal' },
  dingtalk: { kind: 'winget', pkg: 'Alibaba.DingTalk' },
  'tencent-meeting': { kind: 'winget', pkg: 'Tencent.TencentMeeting' },
  qq: { kind: 'winget', pkg: 'Tencent.QQ.NT' },
  wps: { kind: 'winget', pkg: 'Kingsoft.WPSOffice' },
  chrome: { kind: 'winget', pkg: 'Google.Chrome', keepUrl: true },
  potplayer: { kind: 'winget', pkg: 'Daum.PotPlayer', keepUrl: true },
  rammap: { kind: 'winget', pkg: 'Microsoft.Sysinternals.RAMMap', keepUrl: true },
  'geek-uninstaller': { kind: 'winget', pkg: 'GeekUninstaller.GeekUninstaller', keepUrl: true },
  'uu-remote': { kind: 'winget', pkg: 'NetEase.UURemote', keepUrl: true },
  todesk: { kind: 'winget', pkg: 'Youqu.ToDesk', keepUrl: true },
}

// ── seewo ───────────────────────────────────────────────────────────────
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
    pinnedVersion: detected,
    fileName: url.split('/').pop().split('?')[0],
    source,
  }
}

// ── probe ───────────────────────────────────────────────────────────────

/** 默认版本号形状：`156.0.1`、`6.0.12.1` 这种至少带一个小数点的数字串 */
const DEFAULT_VERSION_RE = /\d+(?:\.\d+){1,}/
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
      if (/text|html|json|xml|javascript/i.test(type)) info.body = await readTextCapped(res)
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
function pickTarget(app, resolver) {
  const items = Array.isArray(app.downloads) ? app.downloads : []
  if (!items.length) return null
  const targetable = items.filter((i) => !/apps\.microsoft\.com|^ms-windows-store:/i.test(cur(i.url)))
  const pool = targetable.length ? targetable : items
  if (resolver.kind === 'seewo') {
    const byCode = pool.find((i) => cur(i.url).startsWith(SEEWO_DL))
    if (byCode) return byCode
  }
  // 站内对象（`oss://…`）不能当解析目标：它本来就是「本站自己托管的那份」，
  // 改成上游直链等于把作者上传的包丢掉。全站只有 oss 项时就干脆不解析。
  const upstream = pool.filter((i) => !OSS_OBJECT_RE.test(cur(i.url)))
  if (!upstream.length) return null
  const declared = upstream.find((i) => cur(i.kind) === 'file')
  if (declared) return declared
  return upstream.find((i) => !isFileItem(i)) || upstream[0]
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
function applyResolved(app, resolver, result) {
  const changes = []
  const items = Array.isArray(app.downloads) ? app.downloads : []

  if (result.rewrites) {
    for (const rw of result.rewrites) {
      for (const item of items) {
        // 站内对象不参与模板重建（见 OSS_OBJECT_RE 的说明）
        if (OSS_OBJECT_RE.test(cur(item.url))) continue
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
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
