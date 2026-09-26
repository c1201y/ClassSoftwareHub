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
 * 三类来源（见下方 RESOLVERS）：
 *   · seewo   厂商按产品码下发的固定接口（e.seewo.com/download/file?code=xxx）
 *             URL 里不带版本号 → 天生「始终最新」，写一次就不用再管
 *   · winget  microsoft/winget-pkgs 官方清单（腾讯会议 / 钉钉 / WPS / QQ 都有维护）
 *             顺带白拿版本号
 *   · page    官网页面里正则抠安装包地址（留作后备，目前没启用）
 *
 * 用法：
 *   node scripts/resolve-direct-links.mjs --report=报告.md      # 只看，不改任何文件
 *   node scripts/resolve-direct-links.mjs --apply --report=报告.md
 *   node scripts/resolve-direct-links.mjs --only=dingtalk,qq    # 只处理指定软件
 *
 * ⚠️ 三条约束，改代码前先读：
 *  1. **只处理没有 `github` 字段的软件** —— 有仓库的由 check-updates.mjs 负责，
 *     两边都写会互相打架。
 *  2. **只写「直链」与「体积」两个字段，绝不碰 `version`** —— 除非站内版本号里一个数字都没有
 *     （「官网」「跟随官网」这类占位）。跨大版本、日期后缀这些判断留给人工，
 *     这也是 check-updates.mjs 一贯的「全有或全无」原则。
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
// 想让某个软件也能原地下载，就在这里加一行 —— 不需要动任何其它文件。
//
// 目前**不在这里、只能跳转**的（见 scripts/untracked-buckets.mjs 的登记理由）：
//   xrkayxingz  向日葵   —— 官网 Nuxt SSR，页面里没有安装包地址
//   huorong-security     —— 版本由 JS 异步加载，页面里没有版本锚点
//   '360-jijiuxiang'     —— 抓到的唯一 .exe 是页面里推广的 360 优盘助手，不是本软件
//   diskgenius           —— 官方现在走蓝奏云网盘分发（downloadURL.php 里是个 JS 跳转）
//   VirusDetector / directx-repair —— 纯网盘分发，物理上做不到直连
// ════════════════════════════════════════════════════════════════════════
const SEEWO_DL = 'https://e.seewo.com/download/file?code='

const RESOLVERS = {
  // ── 希沃生态：官方按产品码下发，URL 不带版本号，天生「始终最新」──────────
  'class-optimizer': { kind: 'seewo', code: 'EasiCare_PC' },
  'seewo-assistant': { kind: 'seewo', code: 'SeewoIwbAssistant' },
  xwbb5: { kind: 'seewo', code: 'EasiNote5' },
  xwspztayxingz: { kind: 'seewo', code: 'EasiCamera' },

  // ── winget 官方清单里有维护的 ─────────────────────────────────────────
  dingtalk: { kind: 'winget', pkg: 'Alibaba.DingTalk' },
  'tencent-meeting': { kind: 'winget', pkg: 'Tencent.TencentMeeting' },
  qq: { kind: 'winget', pkg: 'Tencent.QQ.NT' },
  WPS: { kind: 'winget', pkg: 'Kingsoft.WPSOffice' },
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
  const name = decodeURIComponent(
    (info.disposition.match(/filename\*?=(?:utf-8'')?"?([^";]+)"?/i) || [])[1] || ''
  )
  const version = (name.match(/\d+(?:\.\d+){2,}/) || [])[0] || ''
  return { url, size: fmtSize(info.length), detectedVersion: version, fileName: name }
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
  const detected = cur(top.packageversion) || cur(trail.split('/').pop())
  return {
    url,
    size: fmtSize(info.length),
    detectedVersion: detected,
    // winget 是**版本钉死**的目录（清单写的是哪一个版本，URL 就是哪一个版本的文件），
    // 所以这里报出钉死版本，交给 main() 判「上游是不是比站内还旧」——
    // 真实案例：winget 的 Alibaba.DingTalk 停在 7.1.0，站内已经是 8.5.0。
    pinnedVersion: detected,
    fileName: url.split('/').pop().split('?')[0],
    source: `winget ${resolver.pkg}${trail ? `（${trail}）` : ''}`,
  }
}

// ── 挑「改哪一条下载项」 ─────────────────────────────────────────────────

/**
 * 一个软件可能有好几条下载项（多平台 / 多架构）。只动**最该动的那一条**：
 *   · seewo：先找本来就是 code 地址的那条（体积要刷新），没有就挑第一条还不是直链的
 *   · 其余：挑第一条还不是直链的；全站都已是直链时挑第一条
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
 * 把解析结果落回 JSON。
 *
 * 只动三样：`item.url`、`item.kind`、`item.size`（外加版本占位时的 `app.version`）。
 * 返回「做了哪些改动」，供报告使用。
 */
function applyResolved(app, item, result) {
  const changes = []
  if (cur(item.url) !== result.url) {
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
  // 站内版本是个占位（「官网」「跟随官网」这种一个数字都没有的）时顺手填上；
  // 只要里面已经有数字就**不碰** —— 跨大版本、日期后缀这类判断留给人工
  if (result.detectedVersion && isPlaceholderVersion(app.version)) {
    app.version = result.detectedVersion
    changes.push(`版本 ${result.detectedVersion}`)
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
    const item = pickTarget(app, resolver)
    if (!item) {
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
            : { error: `不认识的解析器类型 ${resolver.kind}` }
    } catch (error) {
      result = { error: errText(error) }
    }

    if (result.error) {
      failed.push({ id, why: result.error, platform: cur(item.platform) })
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
        why: `上游清单**落后于站内**（上游 ${result.detectedVersion} < 站内 ${cur(app.version)}），本次未修改 —— 需要另找一个更新的来源，或等上游清单跟上`,
      })
      continue
    }

    const changes = APPLY ? applyResolved(app, item, result) : []
    if (APPLY && changes.length) writeApp(entry)

    const detected = result.detectedVersion
      ? `，检出最新版本 \`${result.detectedVersion}\``
      : ''
    const versionNote =
      detected && !isPlaceholderVersion(app.version) && result.detectedVersion && result.detectedVersion !== cur(app.version)
        ? `　⚠️ 站内版本 \`${cur(app.version)}\` 与检出不一致，**没有自动改**，请人工核一下`
        : ''
    report.push(
      `- \`${id}\` **${cur(app.name)}**　${APPLY && changes.length ? `已写回：${changes.join('、')}` : '无需改动'}${detected}${versionNote}`
    )
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

await main()
