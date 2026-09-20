#!/usr/bin/env node
/**
 * scripts/check-updates.mjs
 *
 * 「软件信息自动更新」：扫描 软件数据/apps/*.json，去上游核对每个软件的最新版本
 * 与下载直链，并把结果写成 Markdown 报告；加 --apply 时再把**能确定**的部分写回 JSON。
 *
 * 两条腿：
 *  ① **GitHub Releases**（本站收录的绝大部分开源软件）—— 认 `github` 字段；
 *  ② **非 GitHub 官方来源**（没有 GitHub 仓库的商业 / 教育软件）—— 认
 *     `scripts/update-channels.mjs` 里的来源登记表（希沃产品清单、VideoLAN 目录、
 *     360 官方页面、DiskGenius 更新日志、GeoGebra 重定向……）。
 *
 * 两条腿哪个都够不着的（微软商店分发、官方固定「最新版」直链、有意归档、
 * 只有网页入口、第三方网盘），**逐个写明是哪一种**，由报告与体检 Issue 如实列出 ——
 * 「没被检查到」不等于「没问题」，所以不能像以前那样让它悄悄消失。
 *
 * 用法：
 *   node scripts/check-updates.mjs --report=update-report.md          # 只体检
 *   node scripts/check-updates.mjs --apply --report=update-report.md  # 体检 + 写回
 *
 * 参数：
 *   --apply            把可安全更新的字段写回 JSON（默认只报告，不动数据）
 *   --report=<path>    把完整 Markdown 报告写到该文件
 *   --pending=<path>   把「必须人工确认」的清单写到该文件（体检 Issue 用的就是它）
 *   --ignore=<path>    忽略清单，默认 软件数据/update-ignore.json
 *   --only=a,b,c       只处理指定 id（逗号分隔）
 *   --no-link          跳过下载直链存活检查（更快、可离线）
 *   --no-channel       跳过非 GitHub 官方来源（只想快速核对 GitHub 那批时用）
 *   --jobs=4           并发请求数（默认 4）
 *   --dump=<path>      把「每个软件落在哪一档、为什么」导出成 JSON
 *                      （排查「Issue 里几个数字对不上账」时全靠它）
 *   --token=xxx        GitHub 令牌；默认读 GITHUB_TOKEN / GH_TOKEN
 *
 * 五条设计原则：
 *  1. 保守 —— 只改「能确定」的东西，判定不了的一律只报告。宁可少改，不可改错。
 *  2. 全有或全无 —— 一个软件的「版本号 + 它的下载直链」是一个整体：
 *     只要有任何一处不能自动处理（跨大版本、下载项带校验值、新 release 里找不到对应文件、
 *     来源解析失败），就**一个字都不改**，整体交给人工。否则会出现
 *     「version 已经是 26.03，下载链接却还是 7z2602」这种自相矛盾的数据。
 *  3. 不破坏 —— 写回时保持原文件的缩进与**行尾**（本仓没有 .gitattributes，行尾是混合的：
 *     多数 JSON 是 LF，但个别文件是 CRLF），绝不能整文件重写。
 *  4. 不碰校验值 —— 带校验值的下载项（`hash` 字段，或早期写在 note 里的）**一律不自动改直链**：
 *     换了文件校验值就失效，留下错的 SHA512 比不更新更糟，那种必须人工核对。
 *  5. 来源失败不改数据 —— 非 GitHub 来源大多靠解析页面，站方一改版就会失效。
 *     这类失败一律变成「退回人工」的待审条目，绝不会顺手写个猜测值进去。
 *  6. 账要对得上 —— 对外（体检 Issue）只给**一套**数字：全部软件按「要不要人管」
 *     分成互斥的四类，相加恒等于总数（见 reconcile()）。内部 state 计数只留在
 *     Actions 完整报告里，绝不和上面那套混着写 —— 两套账摆在一起，
 *     就会出现「已自动更新 7 个」和「站内落后 6 个」互相打脸的场面。
 *
 * 产出分工（配合 check-updates.yml）：
 *   --report  完整报告 → Actions 运行摘要（留档用）
 *   --pending 待审清单 → 体检 Issue（只需人看的那些）＋ 已自动处理摘要 ＋ 覆盖情况一览
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { channelFor, classify, BUCKET_LABEL } from './update-channels.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APPS_DIR = path.join(ROOT, '软件数据', 'apps')
const UA = 'ClassSoftwareHub-UpdateChecker/1.0 (+https://classsoftwarehub.us.ci)'

// ── 参数 ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const has = (n) => args.some((a) => a === `--${n}` || a.startsWith(`--${n}=`))
const val = (n, d = '') => {
  const hit = args.find((a) => a.startsWith(`--${n}=`))
  return hit ? hit.slice(n.length + 3) : d
}
const APPLY = has('apply')
const REPORT_PATH = val('report')
const PENDING_PATH = val('pending')
// 把「每个软件落在哪一档、为什么」原样导出成 JSON —— 排查「Issue 里几个数字对不上账」时全靠它
const DUMP_PATH = val('dump')
const IGNORE_PATH = val('ignore') || path.join(ROOT, '软件数据', 'update-ignore.json')
const NO_LINK = has('no-link')
const NO_CHANNEL = has('no-channel')
const JOBS = Math.max(1, Math.min(8, Number(val('jobs', '4')) || 4))
const ONLY = val('only').split(',').map((s) => s.trim()).filter(Boolean)
const TOKEN = val('token') || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''

// ── 小工具 ──────────────────────────────────────────────────────────────
// 本仓库自己的地址：体检 Issue 里给「打开这个 JSON 直接改」的直达链接（CI 上 GITHUB_REPOSITORY 一定有）
const SELF_REPO = process.env.GITHUB_REPOSITORY || 'c1201y/ClassSoftwareHub'
const GH = (p) => `https://github.com/${p}`
const cur = (s) => String(s ?? '').trim()
const short = (s, n = 46) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 从 `github` 字段解析 owner/repo；解析不了返回 null */
function parseRepo(v) {
  const s = cur(v)
  if (!s) return null
  let m = /github\.com\/([^/\s?#]+)\/([^/\s?#]+)/i.exec(s)
  if (!m) m = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(s)
  if (!m) return null
  const repo = m[2].replace(/\.git$/i, '')
  if (!/^[A-Za-z0-9_.-]+$/.test(m[1]) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null
  return { owner: m[1], repo, slug: `${m[1]}/${repo}` }
}

/** 版本号归一化：去掉 v 前缀与空白，小写 */
const normVer = (s) => cur(s).replace(/^v/i, '').replace(/\s+/g, '').toLowerCase()
/** 抽取版本里的数字段（`2.1.0.1` -> [2,1,0,1]），抽不到返回 null */
function verNums(s) {
  const m = /(\d+(?:\.\d+)*)/.exec(normVer(s))
  return m ? m[1].split('.').map(Number) : null
}
/** a 与 b 的数字段比较：>0 表示 a 比 b 新 */
function cmpVer(a, b) {
  const x = verNums(a), y = verNums(b)
  if (!x || !y) return 0
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d) return d
  }
  return 0
}
const isVerLike = (s) => /^v?\d+(\.\d+)*/i.test(cur(s))

/**
 * 是否预发布。不能只看 release 的 `prerelease` 标志 ——
 * 实测有作者不发预发布标记、只在 tag 名里写 alpha/beta（如 `v2.5.2-alpha.1`）。
 */
const PRE_RE = /(alpha|beta|rc|preview|nightly|canary|insider)/i
const isPre = (r) => !!r && (r.draft || r.prerelease || PRE_RE.test(cur(r.tag_name)) || PRE_RE.test(cur(r.name)))

/** 字节数格式化，跟随站内主流写法（`126 MB` / `1.6 MB` / `512 KB`） */
function fmtSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  const kb = bytes / 1024
  if (kb < 1000) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  const mb = kb / 1024
  if (mb < 1000) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

/**
 * 忽略清单（软件数据/update-ignore.json）：维护者声明「这个软件不用管」。
 * 值是 `{ skip: 'updates'|'all', reason, at }`，也接受直接写一句理由的字符串写法。
 *   updates（默认）＝ 不再提醒版本更新 / 仓库信息这类事，但下载直链失效仍会提醒
 *   all            ＝ 连直链失效也不提醒（软件已下架、不再维护）
 * 键名以 `_` 开头的（如 `_说明`）一律跳过，方便在同一个文件里写注释。
 */
function loadIgnore() {
  const map = new Map()
  let raw
  try {
    if (!fs.existsSync(IGNORE_PATH)) return map
    raw = JSON.parse(fs.readFileSync(IGNORE_PATH, 'utf8'))
  } catch (e) {
    console.error(`忽略清单读不了（${IGNORE_PATH}）：${e.message} —— 本次按「没有清单」处理`)
    return map
  }
  for (const [k, v] of Object.entries(raw || {})) {
    if (k.startsWith('_')) continue
    const o = typeof v === 'string' ? { reason: v } : (v && typeof v === 'object' ? v : {})
    map.set(cur(k), { skip: cur(o.skip) || 'updates', reason: cur(o.reason), at: cur(o.at) })
  }
  return map
}

/**
 * 「本次跳过」记录（同一个文件的 `_skip_once` 键）——**跟「永久忽略」是两种强度**：
 * 勾一次只压住**当前这一版问题**；问题内容一变（上游又发新版、直链又换了一批）
 * 就自动重新出现。为什么要这样设计：只有「永久忽略」时，人面对一条暂时不想管的
 * 提醒只剩两个选择 —— 要么放着被每周提醒一次，要么永久静音（以后真出问题也不提醒了）。
 *
 * 结构：`{ "<软件id>": { keys: [{ key, kind, at }] } }`
 * （一个软件可能同时有多条待审项，所以 key 是数组，不是单个字符串）
 * 键名 `_skip_once` 以 `_` 开头 —— loadIgnore() 会跳过所有 `_` 开头的键，不会误当软件 id。
 */
function loadSkipOnce() {
  const map = new Map()
  try {
    if (!fs.existsSync(IGNORE_PATH)) return map
    const raw = JSON.parse(fs.readFileSync(IGNORE_PATH, 'utf8'))
    const o = raw && raw._skip_once
    if (!o || typeof o !== 'object') return map
    for (const [k, v] of Object.entries(o)) {
      if (!k || k.startsWith('_')) continue
      const keys = Array.isArray(v && v.keys) ? v.keys : []
      const list = keys
        .filter((x) => x && cur(x.key))
        .map((x) => ({ key: cur(x.key), kind: cur(x.kind), at: cur(x.at) }))
      if (list.length) map.set(cur(k), { keys: list })
    }
  } catch {
    // 读不了就当没有：文件本身的报错已经在 loadIgnore() 里说过一次了，不重复刷屏
  }
  return map
}

/** 忽略清单是否压掉某类待审项：更新类（bump/verify/repo）看 updates 就压，其余要 all */
function isMuted(ig, kind) {
  if (!ig) return false
  return ig.skip === 'all' || (ig.skip === 'updates' && kind !== 'dead-link')
}

// ── GitHub API ──────────────────────────────────────────────────────────
let apiCalls = 0
async function ghApi(pathname, { retry = 3 } = {}) {
  const url = 'https://api.github.com' + pathname
  for (let i = 0; i < retry; i++) {
    try {
      apiCalls++
      const r = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
        },
      })
      if (r.status === 404) return { ok: false, status: 404, data: null }
      if ((r.status === 403 || r.status === 429) && i < retry - 1) {
        const wait = Number(r.headers.get('retry-after') || 0) * 1000 || 5000 * (i + 1)
        console.error(`  … 被限流（${r.status}），等 ${Math.round(wait / 1000)}s 重试`)
        await sleep(wait)
        continue
      }
      if (r.status >= 500 && i < retry - 1) { await sleep(1500 * (i + 1)); continue }
      if (!r.ok) return { ok: false, status: r.status, data: null }
      return { ok: true, status: r.status, data: await r.json() }
    } catch (e) {
      if (i === retry - 1) return { ok: false, status: 0, error: String(e?.message || e) }
      await sleep(1500 * (i + 1))
    }
  }
  return { ok: false, status: 0, error: 'retry exhausted' }
}

/** 查上游最新版本：优先 releases，没有 release 就退回 tags */
async function resolveUpstream(slug) {
  const out = { slug, releases: [], tags: [], archived: false, source: 'none', error: '' }

  const rl = await ghApi(`/repos/${slug}/releases?per_page=30`)
  if (!rl.ok && rl.status === 404) {
    // 仓库不存在 / 改名了
    out.error = '仓库 404（可能已改名或删除）'
    return out
  }
  if (!rl.ok) {
    out.error = `releases 拉取失败（HTTP ${rl.status || '网络错误'}${rl.error ? '：' + rl.error : ''}）`
    return out
  }

  const all = Array.isArray(rl.data) ? rl.data : []
  out.releases = all
  out.tags = all.map((r) => cur(r.tag_name)).filter(Boolean)
  out.stable = all.find((r) => !isPre(r)) || null      // 跳过草稿与预发布（含 tag 名里的 alpha/beta）
  out.any = all.find((r) => !r.draft) || null
  out.source = 'releases'

  if (!out.any) {
    const tl = await ghApi(`/repos/${slug}/tags?per_page=50`)
    if (tl.ok && Array.isArray(tl.data)) {
      out.tags = tl.data.map((t) => cur(t.name)).filter(Boolean)
      out.source = out.tags.length ? 'tags' : 'none'
    }
  }

  const info = await ghApi(`/repos/${slug}`)
  if (info.ok && info.data) out.archived = !!info.data.archived
  return out
}

/** 直链存活检查：返回 { status, ok } */
async function checkLink(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': UA } })
    return { status: r.status, ok: r.ok || (r.status >= 200 && r.status < 400) }
  } catch (e) {
    return { status: 0, ok: false, error: String(e?.message || e) }
  }
}

// ── 单个软件的分析 ──────────────────────────────────────────────────────
function analyze(app, up) {
  const res = {
    id: app.id,
    name: app.name || app.id,
    version: cur(app.version),
    state: 'unknown',
    note: '',
    releaseTag: cur((up.stable || up.any)?.tag_name),
    publishedAt: (up.stable || up.any)?.published_at || '',
    // 上游一个正式版都没有、只剩预发布（alpha/beta/rc 或草稿）时，站内是否跟进交给维护者
    prereleaseOnly: !up.stable && !!up.any,
    source: up.source,
    upstreamCount: up.tags.length,
    githubLinks: [],
    deadLinks: [],
  }

  if (up.error) { res.state = 'error'; res.note = up.error; return res }
  if (up.archived) res.note = '上游仓库已归档'
  if (!res.releaseTag) { res.state = 'no-release'; res.note = res.note || '上游没有任何 release / tag'; return res }

  if (!isVerLike(res.version)) {
    res.state = 'manual'
    res.note = `站内版本号是「${res.version}」，不是可比较的版本串（如“跟随官网”），只能人工判断`
    return res
  }
  if (!verNums(res.releaseTag)) {
    res.state = 'manual'
    res.note = `上游 tag「${res.releaseTag}」不是可比较的版本串`
    return res
  }

  // ① 归一化（去 v 前缀 / 空白）完全相同
  if (normVer(res.version) === normVer(res.releaseTag)) { res.state = 'ok'; return res }

  // ② 以**数字段**为准：写法不同但数字一致（`3.5.2` vs `v.3.5.2`、`1.2.0` vs `Release1.2`、
  //    `1.4.1.0 Momokan` vs `v1.4.1.0`）都算同一版本 —— 只有数字段才有可比语义。
  const cmp = cmpVer(res.releaseTag, res.version)
  const inHistory = (up.tags || []).some((t) => normVer(t) === normVer(res.version))

  if (cmp === 0) { res.state = 'ok'; res.note = '写法不同、数字段一致'; return res }

  if (res.prereleaseOnly) {
    res.state = 'manual'
    res.note = `上游最新只有预发布版（${res.releaseTag}），站内是否跟进请人工判断`
    return res
  }

  if (cmp > 0) {
    res.state = 'outdated'
    res.note = inHistory
      ? '站内版本号等于上游某个历史 tag'
      : '上游 tag 数字段更大（写法不同，建议人工确认）'
    return res
  }

  res.state = 'ahead'
  res.note = '站内版本号数字段比上游最新 tag 更大（预发布版 / 自编译版，或上游把更高版本发成了草稿）'
  return res
}

/**
 * 为新版本里的下载项找一个对应的新直链（只做「文件名几乎相同」的替换）。
 *
 * @returns {{status: string, asset?: object, oldTag?: string, oldFile?: string}}
 *   not-ours      链接不指向本仓库的 releases（别的仓库 / 官网 / 镜像）—— 不归脚本管
 *   up-to-date    链接里的 tag 已经是新版，无需改动
 *   no-assets     新 release 里一个附件都没有
 *   no-match      是本仓库的链接，但在新 release 的附件里找不到对应文件 —— 需人工
 *   hit           找到对应的新附件
 */
function matchNewAsset(item, repoSlug, oldTags, newRelease) {
  const url = cur(item.url)
  const m = new RegExp(`github\\.com/${repoSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/releases/download/([^/]+)/(.+)$`, 'i').exec(url)
  if (!m) return { status: 'not-ours' }
  const oldTag = decodeURIComponent(m[1])
  const oldFile = decodeURIComponent(m[2])
  const newTag = cur(newRelease?.tag_name)

  const assets = (newRelease?.assets || []).filter((a) => a && a.name)
  if (!assets.length) return { status: 'no-assets', oldTag, oldFile }
  if (newTag && normVer(oldTag) === normVer(newTag)) return { status: 'up-to-date', oldTag, oldFile }

  // 直接同名
  let hit = assets.find((a) => a.name === oldFile)

  // 把旧 tag 串替换成新 tag 串后同名（`..._2.1.0.1_x64.zip` -> `..._2.1.0.2_x64.zip`）
  if (!hit) {
    const cands = new Set()
    const nt = cur(newRelease.tag_name)
    const sq = (s) => cur(s).replace(/[^0-9a-zA-Z]/g, '')
    for (const ot of [oldTag, normVer(oldTag)]) {
      if (!ot) continue
      for (const rep of [nt, normVer(nt)]) {
        if (rep && oldFile.includes(ot)) cands.add(oldFile.split(ot).join(rep))
      }
      // 版本号在文件名里被「去分隔符压缩」过（7-Zip 风格：tag `26.02` → 文件 `7z2602-x64.msi`）。
      // 只在压缩串恰好出现一次时才替换，避免误伤文件名里的其它数字。
      const otS = sq(ot), ntS = sq(nt)
      if (otS && ntS && oldFile.split(otS).length === 2) cands.add(oldFile.split(otS).join(ntS))
    }
    hit = assets.find((a) => cands.has(a.name))
  }

  // 再去掉版本串后比「骨架」是否唯一相同
  if (!hit) {
    const skel = (s, tags) => {
      let r = s
      for (const t of tags) if (t) r = r.split(t).join('@')
      return r.replace(/\d+(\.\d+)+/g, '@').toLowerCase()
    }
    const want = skel(oldFile, [...oldTags, oldTag, normVer(oldTag)])
    const hits = assets.filter((a) => skel(a.name, [...oldTags, cur(newRelease.tag_name)]) === want)
    if (hits.length === 1) hit = hits[0]
  }

  return hit ? { status: 'hit', asset: hit, oldTag, oldFile } : { status: 'no-match', oldTag, oldFile }
}

/** 找出「仍然带着旧版本号」的非 GitHub 直链 —— 脚本不会改它们，但必须提示，否则会留下版本不一致 */
function findStaleNonGithubLinks(app, version) {
  const out = []
  const v = cur(version)
  if (!v) return out
  const sqv = normVer(v).replace(/[^0-9a-z]/g, '')
  for (const it of app.downloads || []) {
    const u = cur(it.url)
    if (!u || /github\.com/i.test(u)) continue
    const sq = u.replace(/[^0-9a-zA-Z]/g, '')
    if (u.includes(v) || (sqv.length >= 3 && sq.includes(sqv))) {
      out.push({ platform: cur(it.platform), url: u })
    }
  }
  return out
}

/**
 * 找「**已经过期**」的非 GitHub 直链 —— 站内版本已经是新的了，链接里却还印着旧版本号。
 *
 * 为什么需要它：`findStaleNonGithubLinks` 拿的是**升级前**的版本号，只能在「版本要变」的那一刻
 * 提示一句；等版本真的升完（脚本自动改的那种），这条提示就再也不出现了 —— 于是留下
 * 「version 写着 26.03、官网链接还是 7z2602-x64.exe」这种没人再提醒的死角（7-Zip 就中过招）。
 *
 * 判定刻意保守，宁漏不误（误报会污染待审清单）：
 *   - 只看非 github.com 的链接（GitHub 直链由 matchNewAsset 负责，它更准）；
 *   - 站内 version 的数字段至少 4 位才比（`1.2.3` → `123` 太短，容易撞上日期、序号）；
 *   - 要求 URL 里出现**等长**、**前两位相同**、**整体不同**的数字串
 *     （`26.03` → `2603`，撞上 `2602` 报；撞上 `2026` 这类长度不等的不管）。
 */
function findMismatchedVersionLinks(app, version) {
  const out = []
  const v = cur(version)
  const vd = v.replace(/[^0-9]/g, '')
  if (vd.length < 4) return out
  for (const it of app.downloads || []) {
    const u = cur(it.url)
    if (!u || /github\.com/i.test(u)) continue
    // 链接里已经写着站内版本 → 是正确的，别报
    if (u.includes(v) || u.replace(/[^0-9a-zA-Z]/g, '').includes(vd)) continue
    const hit = (u.match(/\d{2,}/g) || []).find(
      (d) => d.length === vd.length && d !== vd && d.slice(0, 2) === vd.slice(0, 2),
    )
    if (hit) out.push({ platform: cur(it.platform), url: u, inUrl: hit, expected: vd })
  }
  return out
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

async function pool(items, n, worker) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++
      out[k] = await worker(items[k], k)
    }
  }))
  return out
}

async function main() {
  const ignore = loadIgnore()
  const entries = readApps().filter((e) => !ONLY.length || ONLY.includes(cur(e.data.id)))
  console.log(`扫描 ${entries.length} 个软件（目录共有 ${fs.readdirSync(APPS_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_')).length} 个）｜忽略清单 ${ignore.size} 条`)
  if (!TOKEN) console.warn('没有 GITHUB_TOKEN / GH_TOKEN：未登录限流只有 60 次/小时，软件多时容易失败')

  const results = []
  const applied = []

  await pool(entries, JOBS, async (e) => {
    const app = e.data
    const ig = ignore.get(cur(app.id)) || null
    const repo = parseRepo(app.github)
    if (!repo) {
      // ── 第二腿：非 GitHub 官方来源（希沃产品清单 / VideoLAN 目录 / 360 页面 …）──
      const ch = channelFor(app.id)
      if (ch) {
        if (NO_CHANNEL) {
          // 只想快速核对 GitHub 那批时用；照旧算「已登记来源」，不误报成「没有来源」
          results.push({
            id: app.id, name: app.name || app.id, version: cur(app.version),
            state: 'no-github', tracker: 'channel', channelLabel: ch.label || '',
            githubLinks: 0, deadLinks: [], ignored: ig, muted: !!ig,
            note: '本次带了 --no-channel，跳过了官方来源检查',
          })
          return
        }
        const res = await runChannel(e, app, ch, APPLY && !ig)
        res.ignored = ig
        res.muted = !!ig
        // 非 GitHub 直链也做存活检查：希沃那两条是**带签名的对象存储地址**，过期了要有人知道
        if (!NO_LINK) {
          for (const it of app.downloads || []) {
            const u = cur(it.url)
            if (!u || !/^https?:/i.test(u)) continue
            const r = await checkLink(u)
            res.linkChecked = (res.linkChecked || 0) + 1
            if (!r.ok) res.deadLinks.push({ platform: it.platform || '', url: u, status: r.status })
          }
        }
        if ((res.applied || []).length) applied.push({ id: app.id, name: res.name, changes: res.applied })
        // 与 GitHub 那条腿一样：升级完成后反过来查「链接里还印着旧版本号」的死角
        res.staleLinks = findMismatchedVersionLinks(app, app.version)
        results.push(res)
        return
      }

      // ── 两条腿都够不着：逐个写明属于哪一类，报告与 Issue 才能如实列出 ──
      const cls = classify(app)
      results.push({
        id: app.id, name: app.name || app.id, version: cur(app.version),
        state: 'no-github', badGithub: !!cur(app.github),
        tracker: null, bucket: cls.bucket, bucketLabel: cls.label, bucketReason: cls.reason,
        githubLinks: 0, deadLinks: [], ignored: ig, muted: !!ig,
        note: app.github ? `github 字段不是仓库地址：${short(cur(app.github), 40)}` : '没有 github 字段',
      })
      return
    }
    const up = await resolveUpstream(repo.slug)
    const res = analyze(app, up)
    res.repo = repo.slug
    res.tracker = 'github'
    res.ignored = ig
    res.muted = !!ig   // 该软件已被维护者在忽略清单里声明「不用管」

    // ── 直链存活检查 ──
    if (!NO_LINK) {
      const ghItems = (app.downloads || []).filter((d) => /^https?:\/\/github\.com\//i.test(cur(d.url)))
      res.githubLinks = ghItems.length
      for (const it of ghItems) {
        const r = await checkLink(it.url)
        if (!r.ok) res.deadLinks.push({ platform: it.platform || '', url: it.url, status: r.status })
      }
    }

    // ── 更新计划：即使不 --apply 也要算，待审清单靠它判断「哪些是脚本搞不定的」──
    if (res.state === 'outdated') {
      const plan = planUpdate(e, app, up, APPLY && !res.muted)
      res.blockers = plan.blockers
      res.staleNonGithub = plan.staleNonGithub
      res.autoUpdatable = plan.ok && !plan.blockers.length
      if (plan.applied.length) applied.push({ id: app.id, name: res.name, changes: plan.applied })
    }

    // ── 非 GitHub 直链与版本号对不对得上 ──
    // staleNonGithub：这次要升级、这些官网/镜像链会随之过期（planUpdate 算的，只在 outdated 时有）
    // staleLinks   ：站内版本**已经是新的**，链接里却还印着旧版本号 —— 升级完成后就再也发现不了的死角
    //                （7-Zip 中过招：version 26.03、两条 7-zip.org 链还写着 7z2602-x64.exe）
    res.staleNonGithub = res.staleNonGithub || []
    res.staleLinks = findMismatchedVersionLinks(app, app.version)
    results.push(res)
  })

  results.sort((a, b) => a.id.localeCompare(b.id))
  const pendingRaw = collectPending(results)
  const skipOnce = loadSkipOnce()
  const { kept: pending, skipped } = applySkipOnce(pendingRaw, skipOnce)
  // 记录只留还在生效的：问题消失了、或问题内容变了（上游又发新版）就该清掉，
  // 否则越积越多，下次再勾同一处还会被陈年记录干扰。只体检（没 --apply）时不碰文件。
  if (APPLY) saveSkipOnce(pruneSkipOnce(pendingRaw, skipOnce))
  const full = buildFullReport(results, applied, ignore, { skipped })
  const pendingMd = buildPendingReport(results, pending, applied, ignore, { skipped, skipOnce })

  if (REPORT_PATH) {
    fs.writeFileSync(REPORT_PATH, full, 'utf8')
    console.log(`\n完整报告已写入 ${REPORT_PATH}`)
  } else {
    console.log('\n' + full)
  }
  if (PENDING_PATH) {
    fs.writeFileSync(PENDING_PATH, pendingMd, 'utf8')
    console.log(`待审清单已写入 ${PENDING_PATH}`)
  }

  // 诊断用：把「每个软件落在哪一档」原样导出。
  // 为什么需要：Issue 顶部那几个数字（要裁决 / 已自动更新 / 自动跟踪 / 跟不了）
  // 和历史遗留的「全部结果」（已是最新 / 站内落后 / 需人工……）口径不同，
  // 光看 Issue 很难判断是渲染错了还是真有两套账 —— 有这份原始数据就能逐条点名核对。
  if (DUMP_PATH) {
    const dump = {
      at: new Date().toISOString(),
      apply: APPLY,
      noLink: NO_LINK,
      total: results.length,
      applied: applied.map((a) => ({ id: a.id, name: a.name, changes: a.changes })),
      pending: pending.map((p) => ({ id: p.id, kind: p.kind, versionChanged: p.versionChanged })),
      results: results.map((r) => ({
        id: r.id,
        name: r.name,
        version: r.version,
        tracker: r.tracker || '',
        state: r.state,
        releaseTag: r.releaseTag || '',
        bucket: r.bucket || '',
        muted: !!r.muted,
        blockers: (r.blockers || []).map((b) => b.kind),
        stale: [...(r.staleNonGithub || []), ...(r.staleLinks || [])].length,
        dead: (r.deadLinks || []).length,
        note: r.note || '',
      })),
    }
    fs.writeFileSync(DUMP_PATH, JSON.stringify(dump, null, 2), 'utf8')
    console.log(`诊断数据已写入 ${DUMP_PATH}`)
  }

  const buckets = results.reduce((m, r) => ((m[r.state] = (m[r.state] || 0) + 1), m), {})
  const cov = coverageOf(results)
  console.log('\n统计：', JSON.stringify(buckets, null, 0), `| GitHub API 调用 ${apiCalls} 次`)
  console.log(`待人工确认 ${pending.length} 条 ｜ 自动更新 ${applied.length} 个软件 ｜ 忽略清单 ${ignore.size} 条 ｜ 本次跳过 ${skipped.length} 条（记录 ${skipOnce.size} 个）`)
  console.log(
    `覆盖：自动跟踪 ${cov.github.length}（GitHub）+ ${cov.channel.length}（官方来源）｜ 不跟 ${cov.untracked.length}` +
    `（${BUCKET_ORDER.filter((b) => cov.byBucket[b]?.length).map((b) => `${b} ${cov.byBucket[b].length}`).join('、') || '无'}）`,
  )
  if (NO_CHANNEL) console.log('（本次带了 --no-channel，非 GitHub 官方来源全部跳过）')

  // 供工作流判断：要不要开 Issue、要不要触发部署
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `pending=${pending.length}\nupdated=${applied.length}\nattention=${pending.length}\n`)
  }
  process.exitCode = 0
}

/** note 里是否嵌了校验值（换了文件就失效，必须人工重算） */
const hasChecksum = (s) => /sha512|sha256|sha-512|sha-256|md5|crc32/i.test(cur(s))

/**
 * 这条下载项带不带校验值 —— 带了就说明「文件换了要人工重算」，脚本不许自动换直链。
 * 两种写法都算：单独的 `hash` 字段（现行写法），早期写在 `note` 里的。
 * 注意 `hash` 里只有十六进制、不含算法名，hasChecksum() 单独查它匹配不到，必须显式判空。
 */
const itemHasChecksum = (item) => hasChecksum(item?.note) || !!cur(item?.hash)

/**
 * 为一个「站内版本落后于上游」的软件出**更新计划**，`apply=true` 时才真的写文件。
 *
 * 策略是「全有或全无」：版本号与它的下载直链是一个整体，
 * 只要有任何一处不能自动处理（blockers 非空），就一个字都不改 ——
 * 否则会出现「version 已经是 26.03，下载链接却还是 7z2602」这种自相矛盾的数据。
 *
 * blockers 的 kind（同类会合并成一条，避免渲染时一屏 12 行）：
 *   bump   {crossMajor, text}  跨大版本（站内可能有意收录旧版，或升级涉及简介/截图等人工内容）
 *   link   {files[]}           是本仓库的 release 链接，但在新版本的附件里找不到对应文件
 *   sha    {platforms[]}       下载项带校验值（hash 字段，或 note 里写着 SHA512/SHA256），换了文件校验值就失效
 *   verify {text}              站内版本号不等于上游任何 tag，搞不清它对应哪个版本，不敢动
 *
 * @returns {{ok: boolean, applied: string[], blockers: {kind: string, text: string}[], staleNonGithub: object[]}}
 */
function planUpdate(entry, app, up, apply) {
  const out = { ok: false, applied: [], blockers: [], staleNonGithub: [] }
  const oldVer = cur(app.version)
  const newTag = cur((up.stable || up.any)?.tag_name)
  // 非 GitHub 的旧直链（官网 / 镜像）脚本不会动，但必须提示，否则会留下版本不一致
  const stale = () => { out.staleNonGithub = findStaleNonGithubLinks(app, oldVer) }

  if (!newTag) {
    out.blockers.push({ kind: 'verify', text: '上游没有任何可用的发行版' })
    return out
  }

  // ── 跨大版本：整体不动 ──
  const a = verNums(oldVer)
  const b = verNums(newTag)
  if (!a || !b || a[0] !== b[0]) {
    out.blockers.push({
      kind: 'bump',
      crossMajor: true,
      text: `上游最新 \`${newTag}\` 与站内 \`${oldVer}\` 的大版本号不同`,
    })
    stale()
    return out
  }

  // ── 版本号能不能改 ──
  const inHistory = (up.tags || []).some((t) => normVer(t) === normVer(oldVer))
  const versionWillChange = inHistory && normVer(oldVer) !== normVer(newTag)
  if (!inHistory) {
    out.blockers.push({ kind: 'verify', text: `站内版本 \`${oldVer}\` 不等于上游任何 tag，不确定它是从哪来的` })
  }

  // ── 逐条下载直链 ──
  const newRelease = (up.releases || []).find((r) => cur(r.tag_name) === newTag) || up.any
  const linkPlan = []
  const shaBlocked = []      // 带校验值的下载项（存平台名）
  const noMatchBlocked = []  // 在上游新版本里找不到对应文件的（存原文件名）
  for (const item of app.downloads || []) {
    const platform = cur(item.platform) || '默认'
    const r = matchNewAsset(item, up.slug, up.tags || [], newRelease)
    // 不指向本仓库 release（官网 / 镜像 / 别的仓库）、或链接里已经写着新版本 —— 都不需要动
    if (r.status === 'up-to-date' || r.status === 'not-ours') { linkPlan.push({ item, r, noChange: true }); continue }
    // 文件真的会变，但这条带校验值 —— 换了文件校验值就失效，不能替维护者做主
    if (itemHasChecksum(item)) { shaBlocked.push(platform); continue }
    if (r.status === 'no-match' || r.status === 'no-assets') { noMatchBlocked.push(r.oldFile || platform); continue }
    linkPlan.push({ item, r, noChange: false })
  }

  // 同类原因合并成一条，避免「12 个下载项……」被写成 12 行
  if (noMatchBlocked.length) out.blockers.push({ kind: 'link', files: noMatchBlocked })
  if (shaBlocked.length) out.blockers.push({ kind: 'sha', platforms: shaBlocked })
  if (!inHistory) out.blockers.push({ kind: 'verify', text: `站内版本 \`${oldVer}\` 不等于上游任何 tag，不确定它是从哪来的` })

  if (out.blockers.length) { stale(); return out }
  if (!versionWillChange && !linkPlan.some((x) => !x.noChange)) { out.ok = true; return out }

  out.ok = true
  if (!apply) { stale(); return out }

  // ── 真的写 ──
  if (versionWillChange) {
    const keepV = /^v/i.test(oldVer)
    const next = keepV ? (newTag.startsWith('v') ? newTag : 'v' + newTag) : normVer(newTag)
    app.version = next
    out.applied.push(`version：${oldVer} → ${next}`)
  }
  for (const { item, r, noChange } of linkPlan) {
    if (noChange) continue
    const platform = cur(item.platform) || '默认'
    const url = cur(r.asset.browser_download_url)
    if (url && url !== cur(item.url)) {
      item.url = url
      out.applied.push(`直链（${platform}）→ ${r.asset.name}`)
    }
    const size = fmtSize(r.asset.size)
    if (size && size !== cur(item.size)) {
      item.size = size
      out.applied.push(`体积（${platform}）→ ${size}`)
    }
  }

  if (out.applied.length) {
    const text = JSON.stringify(app, null, 2).split('\n').join(entry.eol) + (entry.trailingNewline ? entry.eol : '')
    fs.writeFileSync(entry.file, text, 'utf8')
  }
  stale()
  return out
}

// ── 第二腿：非 GitHub 官方来源 ──────────────────────────────────────────
/**
 * 跑一个来源实现（见 scripts/update-channels.mjs），折算成与 GitHub 那条腿
 * **形状完全相同**的结果对象 —— 报告 / 待审清单 / 忽略清单三处都不用为它写特例。
 *
 * 来源失败（页面改版、接口挂了、域名白名单不符）→ `state = 'error'`：
 * 待审清单里会变成一条「上游来源读不到，暂时退回人工」，**数据一个字都不改**。
 */
async function runChannel(entry, app, ch, apply) {
  const res = {
    id: app.id, name: app.name || app.id, version: cur(app.version),
    state: 'unknown', note: '', releaseTag: '', publishedAt: '',
    prereleaseOnly: false, source: 'channel', tracker: 'channel',
    channelLabel: ch.label || '', channelPage: ch.page || '',
    githubLinks: 0, deadLinks: [], applied: [],
  }

  let src = null
  try {
    src = await ch.run()
  } catch (e) {
    res.state = 'error'
    res.note = `${ch.label || '官方来源'} 解析失败：${String(e?.message || e)}`
    return res
  }

  const raw = cur(src?.version)
  if (!raw) {
    res.state = 'error'
    res.note = `${ch.label || '官方来源'} 没有给出可用的版本号`
    return res
  }
  res.rawVersion = raw
  res.releaseTag = raw
  // keepSegments：站内可能只写到某一段（DiskGenius 一直写 `6.2.0`，上游是 `6.2.0.1829`）。
  // 比对与写回都用截断后的值，免得把内部构建号当成版本号写进站内。
  const seg = Number(ch.keepSegments) || 0
  const upVer = seg > 0 ? raw.split('.').slice(0, seg).join('.') : raw
  res.upstreamVersion = upVer

  if (!isVerLike(res.version)) {
    res.state = 'manual'
    res.note = `站内版本号是「${res.version}」，不是可比较的版本串（上游当前 ${raw}），只能人工判断`
    return res
  }
  if (!verNums(upVer)) {
    res.state = 'manual'
    res.note = `上游版本号「${raw}」不是可比较的版本串`
    return res
  }

  const cmp = cmpVer(upVer, res.version)
  if (cmp < 0) {
    res.state = 'ahead'
    res.note = `站内版本号比上游还新（上游 ${raw}）`
    return res
  }

  // ⚠️ 版本号相同也**必须**跑一次计划：来源除了版本号，还会给出「链接该怎么写」——
  //    实测 `360-speed-browser` 的版本号本来就是最新的 `23.1.1253.64`，但站内 32 位直链
  //    还停在 `13.5.2044.0`（差 10 个大版本）。只看版本号的话，这条链永远不会被修。
  const plan = planChannelUpdate(entry, app, ch, { ...src, version: upVer, rawVersion: raw }, apply)
  res.blockers = plan.blockers
  res.staleNonGithub = plan.staleNonGithub
  res.autoUpdatable = plan.ok && !plan.blockers.length
  res.applied = plan.applied

  if (cmp === 0) {
    res.state = 'ok'
    if (plan.applied.length) res.note = '版本号一致，但下载直链有需要修正的地方'
    return res
  }

  res.state = 'outdated'
  res.note = plan.blockers.length ? '上游有更新，但按「全有或全无」暂时没动' : '上游有更新'
  return res
}

/**
 * 站内版本号偶尔带「（发布日期）」后缀（希沃白板就是 `5.2.4.10148（2026-08-26）`）。
 * 来源给了发布日期就顺手换掉；没给就保留原来那一段 —— 总比把旧日期留在新版本号后面强。
 */
function withDateSuffix(oldVer, newVer, date) {
  const m = /^([\d.]+)\s*[（(]\s*([^）)]*)\s*[）)]\s*$/.exec(cur(oldVer))
  if (!m) return newVer
  return `${newVer}（${cur(date) || m[2]}）`
}

/** 从下载地址里抠出给人看的文件名（希沃那种把文件名写在查询参数里） */
function urlFileName(u) {
  const s = (() => { try { return decodeURIComponent(cur(u)) } catch { return cur(u) } })()
  const m = /(?:attname=|filename="?)([^"&;]+?\.(?:exe|msi|zip|7z|dmg|deb|AppImage))/i.exec(s)
  if (m) return m[1]
  const base = s.split('?')[0].split('/').pop()
  return base && base.includes('.') ? base : short(s, 40)
}

/**
 * 非 GitHub 来源的更新计划 —— 与 GitHub 那条腿同样是**「全有或全无」**：
 * 版本号能改，但它下面任何一条直链改不了（带校验值、来源没覆盖、升级后会被落成旧版本），
 * 就整体交给人工，一个字都不写。
 *
 * @returns {{ok: boolean, applied: string[], blockers: object[], staleNonGithub: object[]}}
 */
function planChannelUpdate(entry, app, ch, src, apply) {
  const out = { ok: false, applied: [], blockers: [], staleNonGithub: [] }
  const oldVer = cur(app.version)
  const newVer = cur(src.version)
  // ⚠️ 只有「版本确实要变」时才算 staleNonGithub。`findStaleNonGithubLinks` 的语义是
  //    「这些链接里印着**旧**版本号，升完级就会过期」—— 拿它去比一个**没变**的版本号，
  //    返回的恰好是「写法完全正确的那些链接」，于是 vlc / 希沃 / 360 极速浏览器那几条
  //    正确的直链会被整批误报成「过期」（实测踩过）。现在版本号相同也跑计划
  //    （为了修「版本对、直链错」的情况），所以这个守卫是必须的。
  const verDiffers = normVer(oldVer) !== normVer(newVer)
  const oldLinks = () => { if (verDiffers) out.staleNonGithub = findStaleNonGithubLinks(app, oldVer) }

  const a = verNums(oldVer), b = verNums(newVer)
  if (!a || !b || a[0] !== b[0]) {
    out.blockers.push({
      kind: 'bump',
      crossMajor: true,
      text: `上游最新 \`${src.rawVersion || newVer}\` 与站内 \`${oldVer}\` 的大版本号不同`,
    })
    oldLinks()
    return out
  }

  // 直链：来源明确给了新地址才动；`files: 'keep'`（链接本身永远指向最新）一律不碰
  const linkPlan = []
  const shaBlocked = []
  const unmatched = []
  if (ch.files !== 'keep' && (src.files || []).length) {
    for (const f of src.files) {
      const key = cur(f.key)
      const item = key ? (app.downloads || []).find((it) => cur(it.url).includes(key)) : null
      if (!item) { unmatched.push(key || urlFileName(f.url)); continue }
      if (cur(item.url) === cur(f.url)) continue
      if (itemHasChecksum(item)) { shaBlocked.push(cur(item.platform) || key); continue }
      linkPlan.push({ item, f })
    }
  }

  // 版本要变、但还有直链印着旧版本号却没人管 —— 升级后会留下「版本是新的、链接是旧的」死角
  const uncovered = []
  if (verDiffers) {
    for (const s of findStaleNonGithubLinks(app, oldVer)) {
      if (!linkPlan.some((p) => cur(p.item.url) === s.url)) uncovered.push(s)
    }
  }

  if (unmatched.length) out.blockers.push({ kind: 'link', files: unmatched })
  if (shaBlocked.length) out.blockers.push({ kind: 'sha', platforms: shaBlocked })
  if (uncovered.length) {
    out.blockers.push({
      kind: 'link',
      files: uncovered.map((u) => urlFileName(u.url)),
      text: `${uncovered.length} 条直链里印着旧版本号，而来源没能给出它们的替代地址`,
    })
  }
  if (out.blockers.length) { oldLinks(); return out }

  out.ok = true
  const versionWillChange = normVer(oldVer) !== normVer(newVer)
  if (!versionWillChange && !linkPlan.length) { oldLinks(); return out }
  if (!apply) { oldLinks(); return out }

  // ── 真的写 ──
  if (versionWillChange) {
    const next = withDateSuffix(oldVer, newVer, src.date)
    app.version = next
    out.applied.push(`version：${oldVer} → ${next}`)
  }
  for (const { item, f } of linkPlan) {
    const label = cur(item.platform) || f.key
    const url = cur(f.url)
    if (url && url !== cur(item.url)) {
      item.url = url
      out.applied.push(`直链（${label}）→ ${urlFileName(url)}`)
    }
    const size = fmtSize(f.size)
    if (size && size !== cur(item.size)) {
      item.size = size
      out.applied.push(`体积（${label}）→ ${size}`)
    }
  }

  if (out.applied.length) {
    const text = JSON.stringify(app, null, 2).split('\n').join(entry.eol) + (entry.trailingNewline ? entry.eol : '')
    fs.writeFileSync(entry.file, text, 'utf8')
  }
  oldLinks()
  return out
}

// ── 待人工确认的清单 ────────────────────────────────────────────────────
/**
 * 挑出「脚本不敢自动改」的条目 —— 这些会进体检 Issue，由维护者逐条裁决。
 *
 * kind：
 *   bump       有新版但被阻塞（跨大版本 / 带校验值 / 找不到对应附件 / 版本号来源不明）
 *   verify     版本号对不上，或上游只有预发布版，得人来拍板
 *   repo       GitHub 仓库信息有问题（404 / github 字段不是仓库地址 / 拉取失败）
 *   source     非 GitHub 官方来源读不到（页面改版 / 接口挂了）—— 这条腿暂时退回人工
 *   stale      非 GitHub 直链（官网 / 镜像）与站内版本号对不上 —— 脚本不会改这些链接，只能人换
 *   dead-link  下载直链失效（HTTP 非 2xx/3xx）—— 这个即使被 /ignore 也仍然提醒
 *
 * 忽略清单里声明过的软件会被压掉（`skip: all` 连 dead-link 也压）。
 *
 * ⚠️ 「两条腿都够不着」的软件（store / always-latest / archive / page-only / netdisk）
 *    在这里**不产生待审条目** —— 它们不是「待确认」，而是「本来就跟踪不了」，
 *    由 buildPendingReport 的「覆盖情况」分区如实列出，免得 Issue 里堆一堆点了也没用
 *    的方框（那才是真正的噪音）。
 */
function collectPending(results) {
  const items = []
  const push = (r, o) => items.push({
    id: r.id, name: r.name, version: r.version, releaseTag: r.releaseTag || '',
    repo: r.repo || '', note: r.note || '', muted: !!r.muted, ...o,
  })

  for (const r of results) {
    const ig = r.ignored || null

    if (r.state === 'error') {
      const kind = r.tracker === 'channel' ? 'source' : 'repo'
      if (!isMuted(ig, kind)) push(r, { kind })
      continue
    }
    if (r.state === 'no-github' && r.badGithub) {
      if (!isMuted(ig, 'repo')) push(r, { kind: 'repo' })
      continue
    }
    if (r.state === 'manual' && !isMuted(ig, 'verify')) push(r, { kind: 'verify' })
    // ⚠️ 不看 state：版本号相同也可能有 blockers —— 来源指出「直链写的是旧文件」时就是这样
    //    （`360-speed-browser` 的 32 位链）。只看 outdated 会把这类问题整批漏掉。
    if ((r.blockers || []).length && !isMuted(ig, 'bump')) {
      // ⚠️ 这里**不再**带上 staleNonGithub：非 GitHub 直链过期是独立的一类问题，
      //    挂在 bump 上会有一个致命后果 —— 一旦脚本把版本自动升好（blockers 为空），
      //    这条提示就再也不会出现，也没人会想起来去改那几条官网链（7-Zip 就这样漏掉了两条）。
      push(r, { kind: 'bump', blockers: r.blockers, versionChanged: r.state === 'outdated' })
    }
    // 非 GitHub 直链和版本号对不上：官网 / 镜像链还印着旧版本，脚本不会改，必须有人去换
    const stale = [...(r.staleNonGithub || []), ...(r.staleLinks || [])]
    if (stale.length && !isMuted(ig, 'stale')) {
      push(r, { kind: 'stale', stale, upgraded: r.state === 'outdated' && !(r.blockers || []).length })
    }
    if ((r.deadLinks || []).length && !isMuted(ig, 'dead-link')) {
      push(r, { kind: 'dead-link', deadLinks: r.deadLinks })
    }
  }

  const order = { bump: 0, verify: 1, repo: 2, source: 3, stale: 4, 'dead-link': 5 }
  items.sort((a, b) => (order[a.kind] - order[b.kind]) || a.id.localeCompare(b.id))
  return items
}

/**
 * 一条待审项的「问题指纹」——「本次跳过」靠它判断**问题有没有变化**。
 * 只取能代表问题本身的东西（涉及哪些链接 / 上游版本 / 阻塞类型），
 * 刻意**不含 HTTP 状态码**：网络抖动会让 403 / 404 来回变，那不算「情况变了」，
 * 含进去会让人点了跳过又被下周一叫醒一次。
 */
function pendingKey(it) {
  let parts
  if (it.kind === 'bump') {
    parts = [`up=${cur(it.releaseTag)}`, `b=${(it.blockers || []).map((x) => x.kind).sort().join(',')}`]
  } else if (it.kind === 'stale') {
    parts = (it.stale || []).map((s) => cur(s.url)).sort()
  } else if (it.kind === 'dead-link') {
    parts = (it.deadLinks || []).map((d) => cur(d.url)).sort()
  } else if (it.kind === 'verify') {
    parts = [`site=${cur(it.version)}`, `up=${cur(it.releaseTag)}`]
  } else {
    parts = [cur(it.note).slice(0, 160)]
  }
  return createHash('sha256').update(`${it.kind}|${parts.join('|')}`).digest('hex').slice(0, 12)
}

/**
 * 应用「本次跳过」：指纹一致的压掉，进 skipped（Issue 里单列一区）。
 * ⚠️ 必须比对指纹，不能只看 id —— 只按 id 压就等于「永久忽略」的另一种写法，
 *    上游一发新版就再也提醒不了，那正是「本次跳过」要避免的事。
 * 顺带把 key 挂到每一条上：Issue 渲染「本次跳过」方框时要把它埋进隐藏标记。
 */
function applySkipOnce(items, skipOnce) {
  const kept = []
  const skipped = []
  for (const it of items) {
    it.key = pendingKey(it)
    const rec = skipOnce.get(it.id)
    if (rec && rec.keys.some((x) => x.key === it.key)) skipped.push({ ...it, skipAt: rec.keys.find((x) => x.key === it.key).at })
    else kept.push(it)
  }
  return { kept, skipped }
}

/** 清掉已经不再生效的「本次跳过」记录：问题消失了、或问题内容变了（指纹对不上）就该清 */
function pruneSkipOnce(rawItems, skipOnce) {
  const live = new Map()
  for (const it of rawItems) {
    const rec = skipOnce.get(it.id)
    if (!rec || !rec.keys.length) continue
    const keys = rec.keys.filter((x) => x.key === it.key)
    if (keys.length) live.set(it.id, { keys })
  }
  return live
}

/**
 * 把「本次跳过」记录写回忽略清单（只在 --apply 时调用）。
 * 保持原文件的**行尾**，并把 `_` 开头的键排在最前 —— 与 update-ignore.mjs 的写法一致，
 * 否则两边交替写会把整个文件抖成一团无意义 diff。
 */
function saveSkipOnce(records) {
  if (!fs.existsSync(IGNORE_PATH)) return
  const raw = fs.readFileSync(IGNORE_PATH, 'utf8')
  let obj
  try {
    obj = JSON.parse(raw)
  } catch {
    return
  }
  if (!obj || typeof obj !== 'object') return
  const before = JSON.stringify(obj._skip_once || null)
  if (!records.size) delete obj._skip_once
  else {
    const next = {}
    for (const id of [...records.keys()].sort((a, b) => a.localeCompare(b))) next[id] = records.get(id)
    obj._skip_once = next
  }
  if (JSON.stringify(obj._skip_once || null) === before) return
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const trailing = raw.endsWith('\n')
  const meta = Object.keys(obj).filter((k) => k.startsWith('_'))
  const rest = Object.keys(obj).filter((k) => !k.startsWith('_')).sort((a, b) => a.localeCompare(b))
  const ordered = {}
  for (const k of [...meta, ...rest]) ordered[k] = obj[k]
  fs.writeFileSync(IGNORE_PATH, JSON.stringify(ordered, null, 2).split('\n').join(eol) + (trailing ? eol : ''), 'utf8')
  console.log(`「本次跳过」记录已更新（${records.size} 条）`)
}

/**
 * ★ 对账：对外只给**一套**数字 —— 全部软件按「要不要人管」分成互斥的四类。
 *
 * 为什么必须有这个函数：以前 Issue 顶部写「要你裁决 N 条 / 已自动更新 M 个 /
 * 自动跟踪 K 个 / 跟不了 J 个」，文末「全部结果」又写一套「已是最新 / 站内落后 /
 * 比上游新 / 需人工 / 查询失败 / 跟不了」。两套账口径不同、互不解释：
 *   · 「要你裁决」的 N 是**条目数**且会被忽略清单过滤，「需人工」是**软件数**；
 *   · 「已自动更新 M 个」是写回**之后**的事实，「站内落后」是检查**那一刻**的快照；
 *   · 同一条软件可以既是「已自动更新」又「要你裁决」（vlc：直链修好了、官网页面仍打不开）；
 *   · 「查询失败」那 1 条在顶部根本没有对应格子，读者找不到它去哪了。
 * 结果就是用户看到「已自动更新 7 个 / 站内落后 6 个 / 跟不了 28 / 需人工 2」——
 * 同一个 Issue 里三套数字互相打脸，谁也不知道该信哪个。
 *
 * 现在的划分（互斥，优先级从上到下）：
 *   1. need        要你处理      —— 产生了待审条目的软件。**即使本次也修好了一部分**
 *                                  （vlc）也只算一次，因为它仍然要人看一眼。
 *   2. fixed       本次自动修好  —— 写回成功、且没留下待审条目的。
 *   3. rest        跟踪中、不用管 —— 其余在跟踪的（已最新 / 比上游新 / 上游暂无发行版 /
 *                                  查询失败但已被忽略）。用减法算，保证账目天然守恒。
 *   4. notFollowed 本来就不跟    —— 两条腿都够不着的，与「跟不了」一节同源。
 * 1+2+3+4 恒等于软件总数（`balanced` 就是这个断言的结论）。
 */
function reconcile(results, pending, applied) {
  const cov = coverageOf(results)
  const need = new Set(pending.map((p) => p.id))
  const fixed = new Set()
  for (const a of applied) if (!need.has(a.id)) fixed.add(a.id)
  const notFollowed = new Set()
  for (const r of cov.untracked) if (!need.has(r.id) && !fixed.has(r.id)) notFollowed.add(r.id)
  const rest = new Set()
  for (const r of results) if (!need.has(r.id) && !fixed.has(r.id) && !notFollowed.has(r.id)) rest.add(r.id)
  const n = need.size + fixed.size + rest.size + notFollowed.size
  return {
    need: [...need].sort(),
    fixed: [...fixed].sort(),
    rest: [...rest].sort(),
    notFollowed: [...notFollowed].sort(),
    total: results.length,
    tracked: cov.github.length + cov.channel.length,
    balanced: n === results.length,
  }
}

/** 把 blockers 渲染成短句（同类已归并，不会一屏 12 行） */
function blockerTexts(blockers) {
  const q = (arr) => arr.map((s) => `\`${s}\``).join('、')
  const out = []
  for (const b of blockers) {
    if (b.kind === 'bump') {
      out.push(b.text)
    } else if (b.kind === 'sha') {
      out.push(`${b.platforms.length} 个下载项带校验值（hash 字段或 note 里的 SHA512/SHA256），文件一换校验值就失效、必须人工重算`)
    } else if (b.kind === 'link') {
      out.push(`${b.files.length} 条下载直链找不到对应文件（${q(b.files.slice(0, 2))}${b.files.length > 2 ? ' 等' : ''}）—— 上游可能换了文件名，或站内这条数据被改过`)
    } else if (b.kind === 'verify') {
      out.push(b.text)
    }
  }
  return out
}

/** 给一条 bump 待审项写「要跟进时怎么改」 */
function bumpAdvice(it) {
  const lines = []
  const kinds = new Set(it.blockers.map((b) => b.kind))
  const cross = it.blockers.some((b) => b.crossMajor)
  const file = `软件数据/apps/${it.id}.json`
  // 「版本号一致、只是直链要修」的那种，别教人去改 version（改了反而错）
  const verChanged = it.versionChanged !== false

  // 跨大版本：站内很可能是**有意**留着的旧版，先劝人考虑忽略，别一上来就教人升级
  if (cross) {
    lines.push('先判断一下：站内是不是**有意保留旧版**？（比如 id 里带版本号、或专门给老系统留的版本）—— 是的话直接忽略本条就行')
    lines.push(`确实要升级：把 \`${file}\` 的 \`version\` 改成 \`${it.releaseTag}\`，同步替换 \`downloads[].url\` 与 \`size\`；大版本更新往往连 \`tagline\` / \`description\` / \`notice\` 都要跟着改，建议照上游 release notes 过一遍`)
    return lines
  }

  if (verChanged && it.releaseTag) {
    lines.push(`在 \`${file}\` 里把 \`version\` 改成 \`${it.releaseTag}\`，并同步更新 \`downloads[].url\`（换成上游本次 release 的附件地址）与 \`size\``)
  } else {
    lines.push(`版本号不用动（站内 \`${it.version}\` 就是最新的），要修的是 \`downloads[].url\``)
  }
  if (kinds.has('link')) {
    for (const b of it.blockers.filter((x) => x.kind === 'link')) {
      lines.push(`去上游 \`${it.releaseTag}\` 的附件列表里找这些文件的新版本：${b.files.map((f) => `\`${f}\``).join('、')}；上游换了文件名的话，\`downloads[].url\` 要手工填新地址`)
    }
  }
  if (kinds.has('sha')) {
    const b = it.blockers.find((x) => x.kind === 'sha')
    lines.push(`**带校验值的 ${b.platforms.length} 个下载项**（${b.platforms.slice(0, 3).map((p) => `\`${p}\``).join('、')}${b.platforms.length > 3 ? ' 等' : ''}）：下载新包 → 重新计算 SHA512 → 连 \`downloads[].hash\`（早期写法是 note 里的校验值）一起改`)
  }
  if (kinds.has('verify')) lines.push('站内版本号不在上游 tag 里，先确认它对应哪个版本，再决定怎么改')
  return lines
}

/** 「点一下就执行」的隐藏标记：GitHub 不渲染 HTML 注释，所以人眼里只有复选框
 *  （不用记命令、不用复制 id），而 API 读到的正文里带着软件 id ——
 *  .github/workflows/update-ignore-command.yml 的 `issues.edited` 分支就是靠它把勾选映射回 id。
 *  action：`ignore`＝永久忽略 / `unignore`＝恢复提醒 / `recheck`＝「我改完了，重跑一次体检」。
 *  ⚠️ 改这里的格式必须同步改那个工作流里的正则。 */
const tick = (action, id) => `<!-- ${action}:id=${id} -->`

/** 带「问题指纹」的标记：「本次跳过」必须记下**当时是哪一版问题**，
 *  否则下次没法判断「还是老问题（继续静默）」还是「情况变了（重新提醒）」。
 *  ⚠️ 与 update-ignore-command.yml 的正则一一对应，改一边必须同步改另一边。 */
const tick2 = (action, id, key) => `<!-- ${action}:id=${id} key=${key} -->`

/** 生成一条待审项的 markdown。
 *  正文刻意压得很短：标题、一行「为什么没自动改」、两个勾选框，长步骤收进折叠区。
 *  两个框对应维护者的两条出路：
 *    「已改好 → 重新检测」去别处（网页改 JSON / 本地改完推）改完，回来点一下，机器立刻重跑体检确认；
 *    「不用跟进」        不想管，点一下＝永久忽略。
 *  清单每次体检都会整体重写（勾选状态留不住）—— 那是刻意的：勾选在这里是**一次性动作**，不是待办状态。 */
function renderPendingItem(it, index) {
  const L = []
  const ver = cur(it.version).replace(/\s+/g, ' ') || '—'
  const tag = cur(it.releaseTag)
  const file = `软件数据/apps/${it.id}.json`
  const jsonUrl = `${GH(SELF_REPO)}/edit/main/${encodeURI(file)}`
  const relUrl = it.repo && tag ? `${GH(it.repo)}/releases/tag/${encodeURIComponent(tag)}` : ''

  L.push(`#### ${index}. ${it.name}　\`${it.id}\``, '')
  // 版本号本身没问题的两种：stale（链接印着旧版号）、以及「版本一致但直链要修」的 bump
  if (it.kind === 'stale' || (it.kind === 'bump' && it.versionChanged === false)) {
    L.push(`站内 \`${ver}\`　·　版本号没问题，要处理的是下面这些直链`, '')
  } else if (it.kind !== 'repo' && it.kind !== 'source') {
    const up = tag ? (relUrl ? `**[${tag}](${relUrl})**` : `**${tag}**`) : '—'
    L.push(`站内 \`${ver}\` → 上游 ${up}`, '')
  }

  // 「为什么没自动改」只留一行，让人一眼扫完就知道该不该管
  let why
  if (it.kind === 'bump') why = blockerTexts(it.blockers).join('；')
  else if (it.kind === 'verify' || it.kind === 'repo' || it.kind === 'source') why = cur(it.note)
  else if (it.kind === 'stale') {
    why = it.upgraded
      ? `版本号已经自动升到 \`${ver}\`，但下面这些不在 GitHub 上的直链脚本不会去动，很可能还指着旧版文件`
      : `${it.stale.length} 条不在 GitHub 上的直链，里面的版本号跟站内 \`${ver}\` 对不上`
  } else why = `${it.deadLinks.length} 条下载直链已经打不开（装软件的人会点到 404）`
  L.push(`> **没自动改**：${why}`, '')

  // ★ 决策只有一步：点一下勾选框（点勾＝编辑 Issue 正文＝触发工作流，幂等）。
  //   跟进那条路**不用在这里动手** —— 人是去别处改 JSON 的，这里只负责「改完回来说一声」。
  //   两个框之间不留空行：留了 markdown 会把它们当成"松散列表"，中间多出一段间距
  L.push(`- [ ] **已改好 → 重新检测**（去别处改完并提交后，回来点这里，机器立刻重跑一次体检）${tick('recheck', it.id)}`)
  // 「本次跳过」＝ 中等强度的第三条路：不修、也不永久静音，只是这次别再来烦我。
  // 方框里带着**问题指纹**（tick2），工作流把它原样存下来，下次体检比对得上就继续静默。
  // ⚠️ 指纹缺失时**不渲染这个框**：勾了也存不进有效记录（工作流那边会因为 key 不合法而拒绝），
  //    与其给个点了没反应的方框，不如不给。
  if (it.key) L.push(`- [ ] **本次跳过**（这次先不管；等它有变化了再提醒）${tick2('skip', it.id, it.key)}`)
  L.push(`- [ ] **不用跟进**（勾上＝永久忽略，以后不再提醒）${tick('ignore', it.id)}`, '')

  // 要跟进的具体步骤收进折叠区：真打算动手时才展开
  const advice = []
  if (it.kind === 'bump') {
    advice.push(...bumpAdvice(it))
  } else if (it.kind === 'stale') {
    advice.push('这些链接不在 GitHub 上（官网 / 镜像），脚本没法从 release 附件推出新地址，只能手工换')
    for (const s of it.stale) {
      const wrote = s.inUrl ? `　（链接里写着 \`${s.inUrl}\`，站内版本是 \`${s.expected}\`）` : ''
      advice.push(`\`${s.platform || '默认'}\`：${s.url}${wrote}`)
    }
    advice.push('去上游官网 / 镜像站找新版本的下载地址，替换 `downloads[].url`（文件名里的版本号通常也要一起改）；官网还没上新版就先留着，下次体检还会提醒')
  } else if (it.kind === 'verify') {
    // 站内 version 经常被写成「上次更新日期 2026/8/18」这类记事文字，而不是版本号
    if (/\d{4}\s*[-/年.]\s*\d{1,2}/.test(ver)) {
      advice.push(`这软件的 \`version\` 填的是**日期而不是版本号**，脚本没法比对 —— 要么改成上游的版本号（当前是 \`${tag}\`），要么就忽略本条`)
    } else {
      advice.push(`确认最新版本后，改 \`version\`（上游当前是 \`${tag}\`）`)
    }
  } else if (it.kind === 'repo') {
    advice.push('确认仓库地址后改 `github`；如果这软件本来就没有 GitHub 仓库，把 `github` 那行删掉即可（删掉后就不再进体检）')
  } else if (it.kind === 'source') {
    // 非 GitHub 来源靠解析官方页面，站方一改版就会失效 —— 这里要说清「不是数据坏了」
    advice.push('这类软件的版本来自官方页面 / 接口（见 `scripts/update-channels.mjs` 的来源登记表），脚本**读不到**它，所以这次没有比对、也没有改任何数据')
    advice.push('先打开来源页面看一眼：上游是不是改版了、或换了地址？确认没问题的话，去 `scripts/update-channels.mjs` 里对应那条来源调一下解析规则即可（改完下次体检自动恢复）')
    advice.push(`实在修不动就先点「不用跟进」把这条压掉 —— 但那样该软件的版本就没人跟了，记得偶尔手工看一眼 ${jsonUrl}`)
  } else {
    for (const d of it.deadLinks) {
      advice.push(`\`${d.platform || '默认'}\`：HTTP ${d.status || '网络错误'}　${d.url}`)
    }
    advice.push('换一条可用的直链；上游已停止分发的话，考虑改用别的平台或下架该条目')
  }

  L.push('<details>', '<summary>要跟进的话，怎么改（点开看步骤）</summary>', '')
  for (const a of advice) L.push(`- ${a}`)
  L.push(`- 要改的文件：[在网页上打开 \`${file}\`](${jsonUrl})`)
  L.push('- **改完记得提交**（网页上就点 Commit changes），然后回上面点一下「已改好 → 重新检测」：机器会立刻重跑一次体检，改对了这条就从本清单消失；没消失就再点开这里看新的「没自动改」原因')
  L.push(`- 也可以照旧在评论区回 \`/ignore ${it.id}\`（等价于点「不用跟进」）`)
  L.push('', '</details>', '')
  return L
}

// ── 覆盖情况：谁在跟踪、谁没被跟踪 ─────────────────────────────────────
/**
 * 把「自动跟踪」与「本来就跟踪不了」分开算清楚 —— 报告与体检 Issue 共用。
 *
 * 为什么要单列：以前这两类在报告里都是「未纳入检查」，混在一个数字里，
 * 于是「微软商店自己会更新」和「官网是 SPA 抓不到版本」看起来一模一样，
 * 维护者既不知道该管哪些，也看不出站内到底被覆盖了多少。
 */
function coverageOf(results) {
  const github = results.filter((r) => r.tracker === 'github')
  const channel = results.filter((r) => r.tracker === 'channel')
  const untracked = results.filter((r) => !r.tracker)
  const byBucket = {}
  for (const r of untracked) {
    const b = r.bucket || 'page-only'
    byBucket[b] = byBucket[b] || []
    byBucket[b].push(r)
  }
  return { github, channel, untracked, byBucket }
}

/** 展示顺序 = 该操心的排前面：只有网页入口的最需要人看，商店/固定直链的其实不用管 */
const BUCKET_ORDER = ['page-only', 'store', 'always-latest', 'archive', 'netdisk']
const BUCKET_DESC = {
  'page-only': '只有官网 / 下载页入口，页面里没有可解析的版本锚点或入口失效 —— **这一档要人偶尔看一眼**',
  store: '微软商店分发：商店自己会推送更新，站内只做跳转 —— **不需要跟**',
  'always-latest': '官方固定「最新版」直链：URL 永不过期，装完软件自己也会更新 —— **天生不需要跟**',
  archive: '**有意保留**的旧版 / 归档包（id 里带版本号就是信号）—— 只需盯「官方是否撤链」',
  netdisk: '第三方网盘分发：版本号能读，但链接没法自动验证 —— 只能人去看发布页',
}

/** 体检 Issue 里那行「为什么不跟」的短句（长解释留给 BUCKET_DESC / 完整报告） */
const BUCKET_SHORT = {
  'page-only': '页面里没有现成版本号，得人偶尔看一眼',
  store: '商店自己会更新',
  'always-latest': 'URL 永不过期，装了也会自己更新',
  archive: '有意留的旧版',
  netdisk: '网盘，链接没法自动验',
}

/** 覆盖情况的分区正文（体检 Issue 用；summaryLine=true 时只给汇总表） */
function coverageLines(results, { withDetail = true } = {}) {
  const L = []
  const { github, channel, untracked, byBucket } = coverageOf(results)
  const tracked = github.length + channel.length

  L.push('| 类别 | 个数 | 谁在跟 |', '|---|---|---|')
  L.push(`| 自动跟踪 · GitHub Releases | **${github.length}** | 脚本（每周五） |`)
  L.push(`| 自动跟踪 · 官方来源 | **${channel.length}** | 脚本（每周五） |`)
  for (const b of BUCKET_ORDER) {
    const list = byBucket[b]
    if (!list?.length) continue
    L.push(`| ${BUCKET_LABEL[b] || b} | ${list.length} | 没人跟（就是这样设计的） |`)
  }
  L.push('', `合计 **${results.length}** 个软件，其中 **${tracked}** 个在自动跟踪、**${untracked.length}** 个不跟。`, '')

  if (!withDetail) return L

  // 需要人看的那一档排最前，并且**不折叠** —— 这是「没法自动检查」里唯一真该操心的
  for (const b of BUCKET_ORDER) {
    const list = byBucket[b]
    if (!list?.length) continue
    L.push(`### ${BUCKET_LABEL[b] || b}（${list.length}）`, '')
    if (BUCKET_DESC[b]) L.push(`> ${BUCKET_DESC[b]}`, '')
    for (const r of [...list].sort((x, y) => String(x.id).localeCompare(String(y.id)))) {
      const why = r.bucketReason || r.note || ''
      L.push(`- \`${r.id}\` **${r.name}**　v${r.version || '—'}${why ? `　—— ${why}` : ''}`)
    }
    L.push('')
  }

  // 在自动跟踪的清单：一般不用看，折叠起来
  L.push('<details>', `<summary>正在自动跟踪的 ${tracked} 个（点开看来源）</summary>`, '')
  L.push(`**GitHub Releases（${github.length}）**`, '')
  L.push(github.length ? github.map((r) => `\`${r.id}\``).join('、') : '（无）', '')
  L.push('', `**官方来源（${channel.length}）** —— 实现在 \`scripts/update-channels.mjs\`，站方改版会导致解析失败并自动退回人工`, '')
  L.push('| 软件 | 来源 |', '|---|---|')
  for (const r of channel) L.push(`| \`${r.id}\` ${r.name} | ${r.channelLabel || '—'} |`)
  L.push('', '</details>', '')
  return L
}

function buildPendingReport(results, pending, applied, ignore, ctx = {}) {
  const { skipped = [], skipOnce = new Map() } = ctx
  const L = []
  const now = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
  const cov = coverageOf(results)
  const rec = reconcile(results, pending, applied)
  // 账目不平就是渲染逻辑出了问题，宁可当场喊出来，也别把两套打架的数字发到 Issue 上让人猜
  if (!rec.balanced) console.error(`⚠️ 账目不平：${rec.need.length}+${rec.fixed.length}+${rec.rest.length}+${rec.notFollowed.length} ≠ ${rec.total}`)
  const groups = [
    ['bump', '有新版本，但要人工确认', '这些不是「改个版本号」那么简单（跨大版本、带校验值、附件换了名字……），脚本按规矩一个字都没动。'],
    ['verify', '版本号对不上，需要拍板', '站内版本号跟上游对不上，脚本无法判断谁新谁旧。'],
    ['repo', 'GitHub 仓库信息有问题', '这些软件的 `github` 字段有问题（仓库查不到、或填的根本不是仓库地址），体检跑不下去。'],
    ['source', '上游来源读不到，暂时退回人工', '这些软件的版本来自官方页面 / 接口（非 GitHub 来源），这次没解析出来 —— **没有比对、也没有改任何数据**。多半是站方改版，去 `scripts/update-channels.mjs` 调一下规则即可。'],
    ['stale', '官网直链还指着旧版本', '版本号已经更新了，但不在 GitHub 上的下载直链（官网 / 镜像）脚本不会去动 —— 装软件的人可能会下到旧版文件。'],
    ['dead-link', '下载直链失效', '这些链接已经打不开了，装软件的人会点到 404。'],
  ]

  L.push('# 软件体检', '')
  // ★ 这四个数字是**唯一**一套账：互斥、可相加（见 reconcile）。文末「本次账目」逐条列出 id，
  //   读者随时可以自己核对 —— 不再出现第二套口径不同的统计。
  L.push(`要你处理 **${rec.need.length}** 条　｜　本次自动修好 **${rec.fixed.length}** 个　｜　跟踪中、不用管 **${rec.rest.length}** 个　｜　本来就不跟 **${rec.notFollowed.length}** 个`)
  L.push('', `_${now}　·　共 ${results.length} 个软件　·　四类互不重复，合计即总数（文末「本次账目」可逐条核对）_`, '')
  if (!pending.length) {
    L.push('## 要你处理：没有需要处理的条目', '')
    L.push('> 本次没有需要人工确认的条目。', '')
  } else {
    L.push(`## 要你处理（${pending.length} 条）`, '')
    L.push('> 每条**三选一点一下方框**就完事，不用打字：**已改好** → 点开「怎么改」照做 → 提交 → 回来点「已改好 → 重新检测」；**这次不想管** → 点「本次跳过」（问题有变化会自动回来）；**以后都不想管** → 点「不用跟进」（永久忽略）。')
    L.push('> 方框是**一次性开关**，点完这条就消失（本清单每次体检整体重写）；全部处理完本 Issue 会自动关闭，点错了在评论区回 `/unignore <软件id>`。', '')
    // ⚠️ 手动触发时可以把「自动写回」关掉，那就一条都没改 —— 不说明会让人以为数据已经动过了
    if (!APPLY) L.push('**本次只体检、没有写回任何数据**（自动写回关着）。', '')
    let n = 0
    for (const [kind, title, desc] of groups) {
      const list = pending.filter((p) => p.kind === kind)
      if (!list.length) continue
      L.push(`### ${title}（${list.length}）`, '')
      L.push(`> ${desc}`, '')
      for (const it of list) L.push(...renderPendingItem(it, ++n))
    }
  }

  if (applied.length) {
    L.push('<details>', `<summary>本次已自动更新（${applied.length} 个）</summary>`, '')
    for (const a of applied) {
      // 同一条软件可能「修好一部分、又留下一条要人看的」（vlc：下载直链已修、官网页面仍打不开）。
      // 不标出来，读者会以为它既彻底修好了又还没修好 —— 这正是被抱怨「数据不一样」的来源之一。
      const also = rec.need.includes(a.id) ? '　—— 本次只修好了其中一部分，另有一条仍在上面等你处理' : ''
      L.push(`- **${a.name}**（\`${a.id}\`）：${a.changes.join('；')}${also}`)
    }
    L.push('', '</details>', '')
  }

  // ★ 「跟不了」= 脚本不会去跟的那些（不是坏了）。按原因分档点名，明细折叠起来。
  //   一个都没有时整节不出现（顶部那行已经写了「本来就不跟 0 个」），免得留一个空标题。
  if (cov.untracked.length) {
    L.push(`## 跟不了（${cov.untracked.length} 个）`, '')
    // ⚠️ 这里的数字必须能跟顶部那行对上：跟踪中共 tracked 个，其中需要人管的只有 need 条，
    //    直接写「其余 tracked 个」会让人拿它跟顶部「跟踪中、不用管」相减后对不上账。
    L.push(`> 这一档脚本**不会**去跟，不是出了问题。另外 **${rec.tracked}** 个在自动跟踪（GitHub Releases ${cov.github.length} ＋ 官方来源 ${cov.channel.length}）—— 其中只有上面那 **${rec.need.length}** 条要你处理，剩下的不用管。`, '')
    L.push('<details>', '<summary>点开看是哪些、为什么不跟</summary>', '')
    L.push('| 为什么不跟 | 个数 | 哪些软件 |', '|---|---|---|')
    for (const b of BUCKET_ORDER) {
      const list = cov.byBucket[b]
      if (!list?.length) continue
      const ids = [...list]
        .sort((x, y) => String(x.id).localeCompare(String(y.id)))
        .map((r) => `\`${r.id}\``)
        .join('、')
      L.push(`| **${BUCKET_LABEL[b] || b}** —— ${BUCKET_SHORT[b] || ''} | ${list.length} | ${ids} |`)
    }
    L.push('', '</details>', '')
  }

  // ★ 「本次跳过」的记录必须列出来：否则一条提醒静默消失，人只会以为脚本坏了。
  //   这里同时给「恢复提醒」的方框 —— 跳错了点一下就回来。
  if (skipped.length || skipOnce.size) {
    L.push('<details>', `<summary>本次跳过（${skipped.length} 条命中，清单里还有 ${skipOnce.size} 个软件记着）</summary>`, '')
    if (skipped.length) {
      L.push('这次没提醒，因为**问题跟上次跳过时一模一样**；只要它有变化就会自动回来。', '')
      for (const s of skipped) L.push(`- \`${s.id}\` **${s.name}**　${{ bump: '有新版本待确认', verify: '版本号对不上', repo: '仓库信息有问题', source: '上游来源读不到', stale: '官网直链指着旧版', 'dead-link': '下载直链失效' }[s.kind] || s.kind}${s.skipAt ? `（${s.skipAt} 跳过）` : ''}`)
    } else {
      L.push('记录着的软件这次都没再出问题 —— 下次再出现时会照常提醒。', '')
    }
    L.push('', '想恢复提醒就点一下对应那行（点完即生效）：', '')
    for (const id of [...skipOnce.keys()].sort((a, b) => a.localeCompare(b))) {
      L.push(`- [ ] 恢复 \`${id}\` 的提醒（不再跳过）${tick('unskip', id)}`)
    }
    L.push('', '</details>', '')
  }

  const ignoredList = [...ignore.entries()]
  if (ignoredList.length) {
    L.push('<details>', `<summary>已忽略（${ignoredList.length} 条）</summary>`, '')
    L.push('| 软件 id | 范围 | 理由 |', '|---|---|---|')
    for (const [id, v] of ignoredList) {
      L.push(`| \`${id}\` | ${v.skip === 'all' ? '全部忽略' : '仅版本类'} | ${v.reason || '—'} |`)
    }
    L.push('', '**想恢复提醒**就点一下对应那行（点完即生效）：', '')
    for (const [id, v] of ignoredList) {
      L.push(`- [ ] 恢复 \`${id}\` 的提醒${v.reason ? `（原本的理由：${v.reason}）` : ''}${tick('unignore', id)}`)
    }
    L.push('', '</details>', '')
  }

  // ★ 这是顶部那行数字的明细版：**四类互斥、相加等于总数**。
  //   以前这里写的是另一套 state 计数（已是最新 / 站内落后 / 需人工 / 查询失败），
  //   口径与顶部不同、又没有任何说明，于是同一份 Issue 里出现两套互相矛盾的数字。
  const counts = results.reduce((m, r) => ((m[r.state] = (m[r.state] || 0) + 1), m), {})
  const idList = (ids) => (ids.length ? ids.map((i) => `\`${i}\``).join('、') : '（无）')
  L.push('<details>', `<summary>本次账目（${results.length} 个软件，逐条可核对）</summary>`, '')
  L.push('| 归属 | 个数 | 哪些软件 |', '|---|---|---|')
  L.push(`| 要你处理 | **${rec.need.length}** | ${idList(rec.need)} |`)
  L.push(`| 本次自动修好 | **${rec.fixed.length}** | ${idList(rec.fixed)} |`)
  L.push(`| 跟踪中、不用管 | **${rec.rest.length}** | ${idList(rec.rest)} |`)
  L.push(`| 本来就不跟（见上「跟不了」） | **${rec.notFollowed.length}** | ${idList(rec.notFollowed)} |`)
  L.push(`| **合计** | **${rec.total}** | 四类互不重复，相加即总数 |`)
  L.push('', `体检状态细分（**同一批软件的另一种看法，不另外计数**）：已是最新 ${counts.ok || 0}　｜　站内落后 ${counts.outdated || 0}　｜　比上游新 ${counts.ahead || 0}　｜　上游查询失败 ${counts.error || 0}　｜　仓库无发行版 ${counts['no-release'] || 0}`)
  L.push('', '完整报告见 Actions 运行摘要。', '', '</details>', '')
  L.push('---', '', '<sub>由 `scripts/check-updates.mjs` 自动生成 · 工作流 `.github/workflows/check-updates.yml`</sub>')
  return L.join('\n')
}

// ── 完整报告（跑在 Actions 摘要里，留档用）──────────────────────────────
function buildFullReport(results, applied, ignore, ctx = {}) {
  const { skipped = [] } = ctx
  const L = []
  const now = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
  const outdated = results.filter((r) => r.state === 'outdated')
  const ahead = results.filter((r) => r.state === 'ahead')
  const manual = results.filter((r) => r.state === 'manual' || r.state === 'diff')
  const errors = results.filter((r) => r.state === 'error')
  const dead = results.filter((r) => (r.deadLinks || []).length)
  const ok = results.filter((r) => r.state === 'ok')
  const noRelease = results.filter((r) => r.state === 'no-release')
  const cov = coverageOf(results)
  // ⚠️ 必须跟着忽略清单过滤：被忽略的软件**不会**进待审 Issue，
  //    这里若照旧列出来，报告就会说「已进体检 Issue 待确认」而人去了 Issue 找不到它
  //    （classisland-17 就撞过这个：明明已忽略，报告还在催）。
  const blocked = results.filter((r) => (r.blockers || []).length && !r.muted)

  L.push('# 软件信息体检报告', '')
  L.push(`检查时间：${now}　|　共 ${results.length} 个软件`, '')
  L.push('| 结果 | 数量 |', '|---|---|')
  L.push(`| 有新版本 | ${outdated.length} |`)
  L.push(`| 下载直链可能失效 | ${dead.length} |`)
  L.push(`| 需人工确认 | ${manual.length} |`)
  L.push(`| 站内版本比上游新 | ${ahead.length} |`)
  L.push(`| 上游查询失败 | ${errors.length} |`)
  L.push(`| 已是最新 | ${ok.length} |`)
  L.push(`| 没得跟（微软商店 / 固定直链 / 归档 / 仅网页 / 网盘） | ${cov.untracked.length} |`)
  if (skipped.length) L.push(`| 本次跳过（问题没变化，已压掉） | ${skipped.length} |`)
  L.push(`| 仓库在、但没有发行版 | ${noRelease.length} |`, '')

  if (outdated.length) {
    L.push('## 有新版本', '')
    L.push('| 软件 | id | 站内版本 | 上游最新 | 发布时间 | 自动处理 | 说明 |', '|---|---|---|---|---|---|---|')
    for (const r of outdated) {
      // 已忽略的优先显示：它既不会被自动改，也不会进待审 Issue，写「✋ 未动手」会让人白等
      // ⚠️ 「✅ 已自动」要跟着 APPLY 走：只体检（没 --apply）时一个字都没写，
      //    照旧写「已自动」会让人以为数据已经动过了
      const auto = r.muted ? '已忽略'
        : (r.blockers || []).length ? '未动手'
          : APPLY ? '已自动' : '可自动（本次未写回）'
      L.push(`| ${r.name} | \`${r.id}\` | ${r.version} | **${r.releaseTag}** | ${(r.publishedAt || '').slice(0, 10)} | ${auto} | ${r.note} |`)
    }
    L.push('')
  }
  if (blocked.length) {
    L.push('## 检测到但特意没动手（已进体检 Issue 待确认）', '')
    for (const r of blocked) {
      L.push(`- **${r.name}**（\`${r.id}\`）`)
      for (const b of r.blockers) L.push(`  - ${b.text}`)
    }
    L.push('')
  }
  // 非 GitHub 直链（官网 / 镜像）与版本号对不上 —— 脚本不会改，只能人换，也要留档
  const staleRows = results
    .map((r) => ({ r, links: [...(r.staleNonGithub || []), ...(r.staleLinks || [])] }))
    .filter((x) => x.links.length)
  if (staleRows.length) {
    L.push('## 非 GitHub 直链与版本号对不上（官网 / 镜像，需人工替换）', '')
    for (const { r, links } of staleRows) {
      L.push(`- **${r.name}**（\`${r.id}\`，站内 \`${r.version}\`）${r.muted ? '　（已忽略）' : ''}`)
      for (const s of links) L.push(`  - ${s.platform || '默认'}：${short(s.url, 70)}`)
    }
    L.push('')
  }
  if (dead.length) {
    L.push('## 下载直链可能失效（GitHub HEAD 非 2xx/3xx）', '')
    L.push('| 软件 | 平台 | HTTP | 链接 |', '|---|---|---|---|')
    for (const r of dead) for (const d of r.deadLinks) {
      L.push(`| ${r.name} | ${d.platform} | ${d.status || '网络错误'} | ${short(d.url, 70)} |`)
    }
    L.push('')
  }
  if (errors.length) {
    L.push('## 上游查询失败', '')
    for (const r of errors) {
      // 被忽略的（比如 everything 的仓库本来就是 404）标一下，免得人以为还得去修
      const tag = r.muted ? '　（已在忽略清单里，不会进待审 Issue）' : ''
      const src = r.tracker === 'channel' ? `官方来源：${r.channelLabel || '—'}` : (r.repo || '无仓库')
      L.push(`- ${r.name}（\`${r.id}\`，${src}）：${r.note}${tag}`)
    }
    L.push('')
  }
  if (manual.length) {
    L.push('## 需人工确认', '')
    for (const r of manual) L.push(`- ${r.name}（\`${r.id}\`）：站内 \`${r.version}\` / 上游 \`${r.releaseTag}\` —— ${r.note}`)
    L.push('')
  }
  if (ahead.length) {
    L.push('## 站内版本比上游新', '')
    for (const r of ahead) L.push(`- ${r.name}（\`${r.id}\`）：站内 \`${r.version}\` / 上游 \`${r.releaseTag}\``)
    L.push('')
  }
  if (applied.length) {
    L.push('## 本次自动写回', '')
    for (const a of applied) {
      L.push(`- **${a.name}**（\`${a.id}\`）`)
      for (const c of a.changes) L.push(`  - ${c}`)
    }
    L.push('')
  }
  if (ignore.size) {
    L.push(`## 已忽略（${ignore.size}）`, '')
    for (const [id, v] of ignore) L.push(`- \`${id}\`（${v.skip === 'all' ? '全部忽略' : '忽略更新提醒'}）：${v.reason || '未写理由'}`)
    L.push('')
  }
  if (ok.length) {
    L.push(`## 已是最新（${ok.length}）`, '')
    // ★ 标出「版本号没变、但直链被修正了」的那种 —— 否则这种修正会完全看不见
    L.push(ok.map((r) => `${r.name}（\`${r.id}\`）${(r.applied || []).length ? ' ★本次修正了直链' : ''}`).join('、'), '')
  }
  // ★ 覆盖情况：以前这些全挤在「未纳入检查」一个折叠区里，看不出「谁在跟踪 / 谁为什么没跟」
  L.push('## 覆盖情况', '')
  L.push(...coverageLines(results))
  L.push('---', '', '<sub>由 `scripts/check-updates.mjs` 自动生成。判定不了的条目**不会**改数据，请人工确认后再提交。</sub>')
  return L.join('\n')
}

main().catch((e) => {
  console.error('脚本异常：', e)
  process.exit(1)
})
