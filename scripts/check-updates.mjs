#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { classify, BUCKET_LABEL } from './untracked-buckets.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const APPS_DIR = path.join(ROOT, '软件数据', 'apps')
const UA = 'ClassSoftwareHub-UpdateChecker/1.0 (+https://classsoftwarehub.cn)'

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
const JOBS = Math.max(1, Math.min(8, Number(val('jobs', '4')) || 4))
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
function latestTag(tags) {
  const list = (tags || []).filter(Boolean)
  if (!list.length) return ''
  const verLike = list.filter((t) => isVerLike(t) && verNums(t))
  if (!verLike.length) return list[0]
  return verLike.reduce((best, t) => (cmpVer(t, best) > 0 ? t : best), verLike[0])
}

/** 这个软件本次**没能检查**（连不上 / 被限流 / 服务端错误）—— 不算数据问题，不进待人工清单 */
const isNotChecked = (r) => !!(r.unreachable || r.deferred)

const isVerLike = (s) => /^v?\d+(\.\d+)*/i.test(cur(s))
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
const API_BASE = (process.env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/+$/, '')

async function ghApi(pathname, { retry = 3 } = {}) {
  const url = API_BASE + pathname
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
  const out = { slug, releases: [], tags: [], archived: false, source: 'none', error: '',
                unreachable: false, deferred: false, tagLatest: '' }

  const rl = await ghApi(`/repos/${slug}/releases?per_page=30`)
  if (!rl.ok && rl.status === 404) {
    // 仓库不存在 / 改名了 —— 这是**服务器明确答复**，可信
    out.error = '仓库 404（可能已改名或删除）'
    return out
  }
  if (!rl.ok) {
    if (!rl.status) {
      out.unreachable = true
      out.error = `连不上 API（${rl.error || '网络错误'}）—— 本次没能检查，不代表仓库有问题`
      return out
    }
    out.unreachable = true
    out.deferred = true
    const why = rl.status === 401 ? '，令牌无效或过期'
      : (rl.status === 403 || rl.status === 429) ? '，被限流'
      : rl.status >= 500 ? '，GitHub 服务端错误' : ''
    out.error = `本次没能检查（HTTP ${rl.status}${why}）—— 不代表仓库有问题`
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
      out.tagLatest = latestTag(out.tags)
      out.source = out.tagLatest ? 'tags' : 'none'
    }
  }

  const info = await ghApi(`/repos/${slug}`)
  if (info.ok && info.data) out.archived = !!info.data.archived
  return out
}
async function checkLink(url, tries = 3) {
  let last = { status: 0, ok: false, answered: false, error: 'not-tried', tries: 0 }
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': UA } })
      if (r.ok || (r.status >= 200 && r.status < 400)) {
        return { status: r.status, ok: true, answered: true, tries: i + 1 }
      }
      last = { status: r.status, ok: false, answered: true, error: '', tries: i + 1 }
      if (r.status < 500) return last   // 4xx：服务器已经把话说死了，重试无意义
    } catch (e) {
      const why = String(e?.cause?.message || e?.cause?.code || e?.message || e)
      last = { status: 0, ok: false, answered: false, error: why, tries: i + 1 }
    }
    if (i < tries - 1) await sleep(800 * (i + 1))   // 线性退避，躲开瞬时抖动
  }
  return last
}

// ── 单个软件的分析 ──────────────────────────────────────────────────────
function analyze(app, up) {
  const res = {
    id: app.id,
    name: app.name || app.id,
    version: cur(app.version),
    state: 'unknown',
    note: '',
    releaseTag: cur((up.stable || up.any)?.tag_name) || cur(up.tagLatest),
    publishedAt: (up.stable || up.any)?.published_at || '',
    // 上游一个正式版都没有、只剩预发布（alpha/beta/rc 或草稿）时，站内是否跟进交给维护者
    prereleaseOnly: !up.stable && !!up.any,
    source: up.source,
    upstreamCount: up.tags.length,
    githubLinks: [],
    deadLinks: [],
  }

  // 「没能检查」不是数据问题，单独标出来 —— collectPending 靠它决定不进待人工清单。
  // 两种成因：unreachable（根本没连上）/ deferred（服务器答复了，但说的是我们这边不行）
  if (up.error) {
    res.state = 'error'
    res.note = up.error
    res.unreachable = !!up.unreachable
    res.deferred = !!up.deferred
    return res
  }
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

/** decodeURIComponent 的兜底版：链接里混进不合法的 % 序列（手滑写成 %zz）时不炸整轮检查 */
const safeDecode = (s) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
function matchNewAsset(item, repoSlug, oldTags, newRelease) {
  const url = cur(item.url)
  const m = new RegExp(`github\\.com/${repoSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/releases/download/([^/]+)/(.+)$`, 'i').exec(url)
  if (!m) return { status: 'not-ours' }
  const oldTag = safeDecode(m[1])
  const oldFile = safeDecode(m[2])
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
  const entries = readApps()
  console.log(`扫描 ${entries.length} 个软件（目录共有 ${fs.readdirSync(APPS_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('_')).length} 个）｜忽略清单 ${ignore.size} 条`)
  if (!TOKEN) console.warn('没有 GITHUB_TOKEN / GH_TOKEN：未登录限流只有 60 次/小时，软件多时容易失败')

  const results = []
  const applied = []

  await pool(entries, JOBS, async (e) => {
    const app = e.data
    const ig = ignore.get(cur(app.id)) || null
    const repo = parseRepo(app.github)
    if (!repo) {
      // ── 没有可用的 GitHub 仓库：逐个写明属于哪一类（见 scripts/untracked-buckets.mjs）──
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
        if (r.ok) continue
        // 同上游那条腿：服务器答复非 2xx 才叫失效，连不上只记「本次没能验证」
        if (r.answered) res.deadLinks.push({ platform: it.platform || '', url: it.url, status: r.status })
        else res.unverifiedLinks = [...(res.unverifiedLinks || []), { platform: it.platform || '', url: it.url, error: r.error || '连不上' }]
      }
    }

    // ── 更新计划：即使不 --apply 也要算，待审清单靠它判断「哪些是脚本搞不定的」──
    if (res.state === 'outdated') {
      const plan = planUpdate(e, app, up, APPLY && !res.muted)
      res.blockers = plan.blockers
      res.staleNonGithub = plan.staleNonGithub
      res.autoUpdatable = plan.ok && !plan.blockers.length
      // ⚠️ 以前这里只把结果推进全局 applied、从没写回 res —— 于是报告里
      //    `(r.applied || []).length` 恒为 0，「已是最新」区那句「★本次修正了直链」永不出现。
      res.applied = plan.applied
      if (plan.applied.length) applied.push({ id: app.id, name: res.name, changes: plan.applied })
    } else if (res.state === 'ok') {
      const plan = planUpdate(e, app, up, APPLY && !res.muted, { linkOnly: true })
      res.applied = plan.applied
      if (plan.applied.length) applied.push({ id: app.id, name: res.name, changes: plan.applied })
    }
    res.staleNonGithub = res.staleNonGithub || []
    res.staleLinks = findMismatchedVersionLinks(app, app.version)
    results.push(res)
  })

  results.sort((a, b) => a.id.localeCompare(b.id))
  const pendingRaw = collectPending(results)
  const skipOnce = loadSkipOnce()
  const { kept: pending, skipped } = applySkipOnce(pendingRaw, skipOnce)
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
  // 只剩 GitHub 一条腿，所以这里不再有「＋ 官方来源」
  console.log(
    `覆盖：自动跟踪 ${cov.github.length}（GitHub）+ ${cov.auto.length}（官方下载源）｜ 不跟 ${cov.untracked.length}` +
    `（${BUCKET_ORDER.filter((b) => cov.byBucket[b]?.length).map((b) => `${b} ${cov.byBucket[b].length}`).join('、') || '无'}）`,
  )

  // 供工作流判断：要不要开 Issue、要不要触发部署
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `pending=${pending.length}\nupdated=${applied.length}\nattention=${pending.length}\n`)
  }
  process.exitCode = 0
}

/** note 里是否嵌了校验值（换了文件就失效，必须人工重算） */
const hasChecksum = (s) => /sha512|sha256|sha-512|sha-256|md5|crc32/i.test(cur(s))
const itemHasChecksum = (item) => hasChecksum(item?.note) || !!cur(item?.hash)
function planUpdate(entry, app, up, apply, opts = {}) {
  const linkOnly = !!opts.linkOnly
  const out = { ok: false, applied: [], blockers: [], staleNonGithub: [] }
  const oldVer = cur(app.version)
  // 与 analyze() 取同一个「上游最新版本」：release 优先，零 release 时用退回的 tag
  // （否则这类仓库永远走到下面 `!newTag` 那条「上游没有任何可用的发行版」上）
  const newTag = cur((up.stable || up.any)?.tag_name) || cur(up.tagLatest)
  // 非 GitHub 的旧直链（官网 / 镜像）脚本不会动，但必须提示，否则会留下版本不一致
  const stale = () => { out.staleNonGithub = findStaleNonGithubLinks(app, oldVer) }

  if (!newTag) {
    out.blockers.push({ kind: 'verify', text: '上游没有任何可用的发行版' })
    return out
  }

  // ── 跨大版本：整体不动 ──（linkOnly 不看版本号，只修直链）
  const a = verNums(oldVer)
  const b = verNums(newTag)
  if (!linkOnly && (!a || !b || a[0] !== b[0])) {
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
  const versionWillChange = !linkOnly && inHistory && normVer(oldVer) !== normVer(newTag)
  if (!linkOnly && !inHistory) {
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

  if (!linkOnly) {
    // 同类原因合并成一条，避免「12 个下载项……」被写成 12 行
    if (noMatchBlocked.length) out.blockers.push({ kind: 'link', files: noMatchBlocked })
    if (shaBlocked.length) out.blockers.push({ kind: 'sha', platforms: shaBlocked })
    if (!inHistory) out.blockers.push({ kind: 'verify', text: `站内版本 \`${oldVer}\` 不等于上游任何 tag，不确定它是从哪来的` })
    if (out.blockers.length) { stale(); return out }
  }

  if (!versionWillChange && !linkPlan.some((x) => !x.noChange)) { out.ok = true; return out }

  out.ok = true
  if (!apply) { if (!linkOnly) stale(); return out }

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

  // linkOnly 不参与「版本升级会带旧官网链过期」那套提示（版本没动，也就没有过期一说）
  if (!linkOnly) stale()
  return out
}

// ── 待人工确认的清单 ────────────────────────────────────────────────────
function collectPending(results) {
  const items = []
  const push = (r, o) => items.push({
    id: r.id, name: r.name, version: r.version, releaseTag: r.releaseTag || '',
    repo: r.repo || '', note: r.note || '', muted: !!r.muted, ...o,
  })

  for (const r of results) {
    const ig = r.ignored || null

    if (r.state === 'error') {
      if (isNotChecked(r)) continue
      // 到这里就只剩 404 一类「服务器明确说这个仓库不存在」了，才算「仓库信息有问题」
      if (!isMuted(ig, 'repo')) push(r, { kind: 'repo' })
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
    // 「在自动跟踪」= GitHub Releases + 官方下载源（直链解析），两者都是脚本每周在跟
    tracked: cov.github.length + cov.auto.length,
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
const tick = (action, id) => `<!-- ${action}:id=${id} -->`
const tick2 = (action, id, key) => `<!-- ${action}:id=${id} key=${key} -->`
function renderPendingItem(it, index) {
  const L = []
  const ver = cur(it.version).replace(/\s+/g, ' ') || '—'
  const tag = cur(it.releaseTag)
  const file = `软件数据/apps/${it.id}.json`
  const jsonUrl = `${GH(SELF_REPO)}/edit/main/${encodeURI(file)}`
  const relUrl = it.repo && tag ? `${GH(it.repo)}/releases/tag/${encodeURIComponent(tag)}` : ''

  L.push(`#### ${index}. ${it.name}　\`${it.id}\``, '')
  const sameAsUpstream = !!tag && normVer(ver) === normVer(tag)
  if (it.kind === 'stale' || (it.kind === 'bump' && it.versionChanged === false)) {
    L.push(`站内 \`${ver}\`　·　版本号没问题，要处理的是下面这些直链`, '')
  } else if (it.kind !== 'repo') {
    if (sameAsUpstream) {
      L.push(`站内 \`${ver}\`　·　与上游同版本，要处理的是下面这些直链`, '')
    } else if (!tag) {
      L.push(`站内 \`${ver}\``, '')
    } else {
      const up = relUrl ? `**[${tag}](${relUrl})**` : `**${tag}**`
      L.push(`站内 \`${ver}\` → 上游 ${up}`, '')
    }
  }

  // 「为什么没自动改」只留一行，让人一眼扫完就知道该不该管
  let why
  if (it.kind === 'bump') why = blockerTexts(it.blockers).join('；')
  else if (it.kind === 'verify' || it.kind === 'repo') why = cur(it.note)
  else if (it.kind === 'stale') {
    why = it.upgraded
      ? `版本号已经自动升到 \`${ver}\`，但下面这些不在 GitHub 上的直链脚本不会去动，很可能还指着旧版文件`
      : `${it.stale.length} 条不在 GitHub 上的直链，里面的版本号跟站内 \`${ver}\` 对不上`
  } else why = `${it.deadLinks.length} 条下载直链已失效（用户点击后将无法下载）`
  L.push(`> **未自动修改的原因**：${why}`, '')
  L.push(`- [ ] **已改好 → 重新检测**（在别处修改并提交后勾选，将立即重跑一次体检）${tick('recheck', it.id)}`)
  if (it.key) L.push(`- [ ] **本次跳过**（本次暂不处理；问题一旦有变化将自动恢复提醒）${tick2('skip', it.id, it.key)}`)
  L.push(`- [ ] **不用跟进**（勾选即永久忽略，此后不再提醒）${tick('ignore', it.id)}`, '')

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
    advice.push('确认仓库地址后改 `github`；如果这软件本来就没有 GitHub 仓库（不是 GitHub 分发的），把 `github` 那行删掉即可 —— 删掉后它会自动落进「不纳入自动跟踪」那一档，由 `scripts/untracked-buckets.mjs` 登记说明，不再进待处理清单')
  } else {
    for (const d of it.deadLinks) {
      advice.push(`\`${d.platform || '默认'}\`：HTTP ${d.status || '网络错误'}　${d.url}`)
    }
    advice.push('换一条可用的直链；上游已停止分发的话，考虑改用别的平台或下架该条目')
  }

  L.push('<details>', '<summary>如需处理，点开查看具体步骤</summary>', '')
  for (const a of advice) L.push(`- ${a}`)
  L.push(`- 需要修改的文件：[在网页上打开 \`${file}\`](${jsonUrl})`)
  L.push('- **修改后请提交**（网页上即 Commit changes），再回到上方勾选「已改好 → 重新检测」：机器会立即重跑一次体检，改动正确则本条从清单消失；若未消失，可再点开此处查看新的「未自动修改的原因」')
  L.push(`- 也可在评论区回复 \`/ignore ${it.id}\`（等同于勾选「不用跟进」）`)
  L.push('', '</details>', '')
  return L
}

// ── 覆盖情况：谁在跟踪、谁没被跟踪 ─────────────────────────────────────
function coverageOf(results) {
  const github = results.filter((r) => r.tracker === 'github')
  const rest = results.filter((r) => !r.tracker)
  const auto = rest.filter((r) => r.bucket === 'auto')
  const untracked = rest.filter((r) => r.bucket !== 'auto')
  const byBucket = {}
  for (const r of untracked) {
    const b = r.bucket || 'page-only'
    byBucket[b] = byBucket[b] || []
    byBucket[b].push(r)
  }
  return { github, auto, untracked, byBucket }
}

/** 展示顺序 = 该操心的排前面：只有网页入口的最需要人看，商店/固定直链的其实不用管 */
const BUCKET_ORDER = ['page-only', 'store', 'always-latest', 'archive', 'netdisk']
const BUCKET_DESC = {
  'page-only': '只有官网 / 下载页入口 —— 页面里没有可解析的版本锚点，或上游根本没有 GitHub 仓库 —— **这一档要人偶尔看一眼**',
  store: '微软商店分发：商店自己会推送更新，站内只做跳转 —— **不需要跟**',
  'always-latest': '官方固定「最新版」直链：URL 永不过期，装完软件自己也会更新 —— **天生不需要跟**',
  archive: '**有意保留**的旧版 / 归档包（id 里带版本号就是信号）—— 只需盯「官方是否撤链」',
  netdisk: '第三方网盘分发：版本号能读，但链接没法自动验证 —— 只能人去看发布页',
}

/** 体检 Issue 里那行「为什么不跟」的短句（长解释留给 BUCKET_DESC / 完整报告） */
const BUCKET_SHORT = {
  // 这一档混着两类：页面抓不到版本号的，和上游没有 GitHub 仓库的 ——
  // 短句要同时罩得住，逐条的准确理由见 scripts/untracked-buckets.mjs 的登记
  'page-only': '页面无可用版本号，或上游无 GitHub 仓库，需人工偶尔查看',
  store: '由 Microsoft Store 自行更新',
  'always-latest': 'URL 永不过期，安装后自动更新',
  archive: '有意保留的旧版',
  netdisk: '第三方网盘分发，链接无法自动校验',
}

/** 覆盖情况的分区正文（体检 Issue 用；summaryLine=true 时只给汇总表） */
function coverageLines(results, { withDetail = true } = {}) {
  const L = []
  const { github, auto, untracked, byBucket } = coverageOf(results)

  L.push('| 类别 | 个数 | 谁在跟 |', '|---|---|---|')
  L.push(`| 自动跟踪 · GitHub Releases | **${github.length}** | 脚本（每周五） |`)
  if (auto.length) {
    L.push(`| 自动跟踪 · 官方下载源（直链解析） | **${auto.length}** | 脚本（每周五） |`)
  }
  for (const b of BUCKET_ORDER) {
    const list = byBucket[b]
    if (!list?.length) continue
    L.push(`| ${BUCKET_LABEL[b] || b} | ${list.length} | 没人跟（就是这样设计的） |`)
  }
  L.push('', `合计 **${results.length}** 个软件，其中 **${github.length + auto.length}** 个在自动跟踪、**${untracked.length}** 个不跟。`, '')

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

  // 在自动跟踪的清单：一般不用看，折叠起来。**两条腿分开列** —— 混成一句会让人以为
  // 「官方下载源」那批也找回 GitHub 仓库了。
  const trackedTotal = github.length + auto.length
  L.push('<details>', `<summary>正在自动跟踪的 ${trackedTotal} 个（点开看是哪些）</summary>`, '')
  L.push(`**GitHub Releases（${github.length}）**：${github.length ? github.map((r) => `\`${r.id}\``).join('、') : '（无）'}`, '')
  if (auto.length) {
    L.push(`**官方下载源 · 直链解析（${auto.length}）**：${auto.map((r) => `\`${r.id}\``).join('、')}`, '')
  }
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
    ['dead-link', '① 下载直链已失效', '更换下载链接', '这些地址已返回 404 或拒绝访问，用户点击后无法下载。**优先级最高。**'],
    ['bump', '② 上游有新版本，需人工裁决', '决定是否升级', '脚本遵循「全有或全无」原则，本次未改动该软件的任何字段 —— 逐条原因见下（跨大版本、下载项带校验值、附件改名等）。'],
    ['verify', '③ 站内版本号与上游不一致', '确认版本归属', '站内 `version` 与上游任何发布都对不上（常见于把版本号填成了日期），脚本无法判断是否应当更新。'],
    ['repo', '④ 仓库信息有误', '修改或删除 `github` 字段', '`github` 字段无法解析为有效仓库，该软件的体检无法进行。非 GitHub 分发的软件，删除该字段即可。'],
    ['stale', '⑤ 官网直链仍指向旧版本', '手工更新非 GitHub 链接', '站内版本号已是新版，但非 GitHub 的下载直链（官网 / 镜像）不在脚本管辖范围内，用户可能下载到旧版文件。'],
  ]

  L.push('# 软件信息体检报告', '')
  // ★ 这四个数字是**唯一**一套账：互斥、可相加（见 reconcile）。文末「本次账目」逐条列出 id，
  //   读者随时可以自己核对 —— 不再出现第二套口径不同的统计。
  L.push(`**本次结论**：共检查 **${results.length}** 个软件 —— 需人工处理 **${rec.need.length}** 条，已自动修复 **${rec.fixed.length}** 个，正常跟踪 **${rec.rest.length}** 个，不纳入自动跟踪 **${rec.notFollowed.length}** 个。`)
  L.push('', `_${now}　·　数据来源 \`软件数据/apps/*.json\`　·　由 \`scripts/check-updates.mjs\` 自动生成_`, '')
  L.push('> 上述四类**互不重复、相加即总数**；文末「本次账目」逐条列出软件 id，可自行核对。', '')
  if (!pending.length) {
    L.push('## 一、待人工处理', '')
    L.push('本次**没有**需要人工处理的条目。', '')
    L.push('> GitHub Releases 与官方下载源两条跟踪链路能自动处理的，本次均已处理完毕。', '')
  } else {
    L.push(`## 一、待人工处理（${pending.length} 条）`, '')
    // ★ 先给一张「哪几档、各几条、要做什么」的导航表：
    //   条目多的时候人需要一个总览决定从哪开始，而不是从头往下滚。
    L.push('### 处理方式', '')
    L.push('以下三种处理方式都只需**勾选**，不需要输入文字：', '')
    L.push('| 勾选项 | 作用 | 适用情形 |', '|---|---|---|')
    L.push('| **已改好 → 重新检测** | 按下方指引修改后勾选，下次体检复核结果 | 本次即着手修改 |')
    L.push('| **本次跳过** | 本次不再提醒；问题一旦有变化会自动恢复 | 暂缓处理 |')
    L.push('| **不用跟进** | 永久忽略该软件的此类问题 | 属有意保留，并非问题 |')
    L.push('')
    L.push('> 勾选框为**一次性开关**，勾选后该条目即从本清单移除（本清单每次体检整体重写）。全部处理完毕后本 Issue 会自动关闭；若误勾，可在评论区回复 `/unignore <软件id>` 恢复。')
    L.push('')
    // ⚠️ 手动触发时可以把「自动写回」关掉，那就一条都没改 —— 不说明会让人以为数据已经动过了
    if (!APPLY) L.push('> ⚠️ **本次仅体检、未写回任何数据**（自动写回处于关闭状态）。', '')
    L.push('### 分档概览', '')
    L.push('| 分档 | 条数 | 需采取的行动 |', '|---|---|---|')
    for (const [kind, title, action] of groups) {
      const c = pending.filter((p) => p.kind === kind).length
      if (c) L.push(`| ${title} | **${c}** | ${action} |`)
    }
    L.push('')
    L.push('### 条目明细', '')
    let n = 0
    for (const [kind, title, action, desc] of groups) {
      const list = pending.filter((p) => p.kind === kind)
      if (!list.length) continue
      L.push(`### ${title}（${list.length}）`, '')
      L.push(`> **需采取的行动**：${action}。${desc}`, '')
      for (const it of list) L.push(...renderPendingItem(it, ++n))
    }
  }

  // ★ 固定骨架：即使本次没有自动修复，这一节也照常出现 ——
  //   每周的报告结构一致，读者不用每次先找「这周少的是哪一段」。
  L.push(`## 二、本次已自动修复（${applied.length} 个）`, '')
  if (applied.length) {
    L.push('<details>', '<summary>点开看是哪些软件、改了什么</summary>', '')
    for (const a of applied) {
      // 同一条软件可能「修好一部分、又留下一条要人看的」（vlc：下载直链已修、官网页面仍打不开）。
      // 不标出来，读者会以为它既彻底修好了又还没修好 —— 这正是被抱怨「数据不一样」的来源之一。
      const also = rec.need.includes(a.id) ? '　—— 本次只修好了其中一部分，另有一条仍在上面等你处理' : ''
      L.push(`- **${a.name}**（\`${a.id}\`）：${a.changes.join('；')}${also}`)
    }
    L.push('', '</details>', '')
  } else {
    L.push('本次没有自动修改任何数据。', '')
  }

  // ★ 「不纳入自动跟踪」= 脚本不会去跟的那些（不是坏了）。按原因分档点名，明细折叠起来。
  //   同样固定出现，保持报告骨架一致。
  L.push(`## 三、不纳入自动跟踪（${cov.untracked.length} 个）`, '')
  if (cov.untracked.length) {
    // ⚠️ 这里的数字必须能跟顶部那行对上：跟踪中共 tracked 个，其中需要人管的只有 need 条，
    //    直接写「其余 tracked 个」会让人拿它跟顶部「正常跟踪」相减后对不上账。
    L.push(`> 这一档脚本**不会**去跟踪，**这不是问题**（属设计如此）。另有 **${rec.tracked}** 个在自动跟踪（GitHub Releases + 官方下载源）—— 其中只有上面那 **${rec.need.length}** 条需要你处理。`, '')
    L.push('<details>', '<summary>点开看是哪些软件、为什么不跟踪</summary>', '')
    L.push('| 为什么不跟踪 | 个数 | 哪些软件 |', '|---|---|---|')
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
  } else {
    L.push('本次所有软件都在自动跟踪范围内。', '')
  }
  const unreachable = results.filter(isNotChecked)
  const unverified = results.filter((r) => (r.unverifiedLinks || []).length)
  const ignoredList = [...ignore.entries()]
  // ★ 固定骨架：所有「例外情况」（连不上 / 直链没能验证 / 本次跳过 / 已忽略）统一收在第四节，
  //   一条都没有时也给一句明确结论 —— 读者不必猜「这周为什么少了这一段」。
  L.push('## 四、本次检查的例外情况', '')
  if (!unreachable.length && !unverified.length && !skipped.length && !skipOnce.size && !ignoredList.length) {
    L.push('本次没有任何例外：全部软件都完成了检查与直链验证，也没有跳过或忽略记录。', '')
  }
  if (unreachable.length) {
    L.push('<details>', `<summary>本次有 ${unreachable.length} 个软件未能完成检查（连接失败 / 被限流 / GitHub 服务端错误；不代表数据有问题）</summary>`, '')
    L.push('> 两种成因都说明不了站内数据有问题：① **根本没连上**（DNS / 超时 / TLS / 被拦）；'
      + '② **连上了但对方没给答复**（令牌无效或过期、次级限流、5xx）—— 后者是运行环境的问题，'
      + '跟这个软件的 `github` 字段毫无关系。', '')
    L.push('> 所以它们既不当成「仓库信息有问题」、也不进上面的待处理清单，下次体检会重试。', '')
    L.push('> 一两个软件这样是抖动；**全都这样**就说明本次运行环境本身出了问题（网络或令牌）—— '
      + '换一次运行、或检查工作流用的 `GITHUB_TOKEN` 即可。', '')
    L.push('')
    L.push('| 软件 | 仓库 | 原因 |', '|---|---|---|')
    for (const r of unreachable) {
      L.push(`| ${r.name} | \`${r.repo}\` | ${short(r.note, 60)} |`)
    }
    L.push('', '</details>', '')
  }

  if (unverified.length) {
    const n = unverified.reduce((s, r) => s + r.unverifiedLinks.length, 0)
    L.push('<details>', `<summary>本次有 ${n} 条下载直链未能验证（连接失败；不代表链接已失效）</summary>`, '')
    L.push('> 只是连不上（DNS / 超时 / TLS / 被拦），**没有**收到服务器的明确答复 —— 因此既不当成失效、也不进上面的待处理清单。下次体检会重试。', '')
    L.push('')
    L.push('| 软件 | 平台 | 原因 | 链接 |', '|---|---|---|---|')
    for (const r of unverified) for (const d of r.unverifiedLinks) {
      L.push(`| ${r.name} | ${d.platform} | ${short(d.error, 36)} | ${short(d.url, 58)} |`)
    }
    L.push('', '</details>', '')
  }

  // ★ 「本次跳过」的记录必须列出来：否则一条提醒静默消失，人只会以为脚本坏了。
  //   这里同时给「恢复提醒」的方框 —— 跳错了点一下就回来。
  if (skipped.length || skipOnce.size) {
    L.push('<details>', `<summary>本次跳过（命中 ${skipped.length} 条；清单中另有 ${skipOnce.size} 个软件的记录）</summary>`, '')
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

  if (ignoredList.length) {
    L.push('<details>', `<summary>已忽略的软件（${ignoredList.length} 条）</summary>`, '')
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
  const idList = (ids) => (ids.length ? ids.map((i) => `\`${i}\``).join('、') : '（无）')
  L.push('## 附录、本次账目', '')
  L.push('<details>', `<summary>${results.length} 个软件的归属，点开可逐条核对</summary>`, '')
  L.push('| 归属 | 个数 | 哪些软件 |', '|---|---|---|')
  L.push(`| 需人工处理（见第一节） | **${rec.need.length}** | ${idList(rec.need)} |`)
  L.push(`| 本次已自动修复（见第二节） | **${rec.fixed.length}** | ${idList(rec.fixed)} |`)
  L.push(`| 正常跟踪、无需干预 | **${rec.rest.length}** | ${idList(rec.rest)} |`)
  L.push(`| 不纳入自动跟踪（见第三节） | **${rec.notFollowed.length}** | ${idList(rec.notFollowed)} |`)
  L.push(`| **合计** | **${rec.total}** | 四类互不重复，相加即总数 |`)
  L.push('', '完整报告见 Actions 运行摘要。', '', '</details>', '')
  L.push('---', '', '<sub>本报告由 `scripts/check-updates.mjs` 自动生成，工作流 `.github/workflows/check-updates.yml`；正文请勿手工编辑（勾选框除外）。</sub>')
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
  // ⚠️ 必须把「本次没能检查」（连不上 / 被限流 / 令牌过期 / 5xx）从「查询失败」里拆出来：
  //    它们的成因是**运行环境**，不是站内数据，混成一行会让人以为有一批仓库信息要修。
  const notChecked = errors.filter(isNotChecked)
  const repoErrors = errors.filter((r) => !isNotChecked(r))
  const dead = results.filter((r) => (r.deadLinks || []).length)
  const ok = results.filter((r) => r.state === 'ok')
  const noRelease = results.filter((r) => r.state === 'no-release')
  const cov = coverageOf(results)
  const blocked = results.filter((r) => (r.blockers || []).length && !r.muted)

  L.push('# 软件信息体检报告', '')
  L.push(`检查时间：${now}　|　共 ${results.length} 个软件`, '')
  L.push('| 结果 | 数量 |', '|---|---|')
  L.push(`| 有新版本 | ${outdated.length} |`)
  L.push(`| 下载直链可能失效 | ${dead.length} |`)
  L.push(`| 需人工确认 | ${manual.length} |`)
  L.push(`| 站内版本比上游新 | ${ahead.length} |`)
  L.push(`| 仓库信息有问题（404 等） | ${repoErrors.length} |`)
  L.push(`| 本次没能检查（连不上 / 限流 / 令牌 / 5xx） | ${notChecked.length} |`)
  L.push(`| 已是最新 | ${ok.length} |`)
  L.push(`| 没得跟（微软商店 / 固定直链 / 归档 / 仅网页 / 网盘） | ${cov.untracked.length} |`)
  L.push(`| 自动跟踪 · 官方下载源（直链解析，非 GitHub） | ${cov.auto.length} |`)
  if (skipped.length) L.push(`| 本次跳过（问题没变化，已压掉） | ${skipped.length} |`)
  L.push(`| 仓库在、但没有发行版 | ${noRelease.length} |`, '')

  if (outdated.length) {
    L.push('## 有新版本', '')
    L.push('| 软件 | id | 站内版本 | 上游最新 | 发布时间 | 自动处理 | 说明 |', '|---|---|---|---|---|---|---|')
    for (const r of outdated) {
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
    L.push('## 下载直链可能失效（服务器明确答复非 2xx/3xx，已重试 3 次）', '')
    L.push('| 软件 | 平台 | HTTP | 链接 |', '|---|---|---|---|')
    for (const r of dead) for (const d of r.deadLinks) {
      L.push(`| ${r.name} | ${d.platform} | ${d.status} | ${short(d.url, 70)} |`)
    }
    L.push('')
  }
  // ⚠️ 「没能验证」必须与「失效」分开写。以前混在一起，把中国 CDN 对海外 runner
  //    的超时、代理拦截全报成「链接打不开」，维护者照着去换链，换掉的却是好链。
  const unverified = results.filter((r) => (r.unverifiedLinks || []).length)
  if (unverified.length) {
    L.push('## 本次没能验证的直链（网络原因，**不代表失效**）', '')
    L.push('> 连不上（DNS / 超时 / TLS / 被拦），**没有**收到服务器的明确答复 —— 不当成失效、不进待审 Issue。')
    L.push('')
    L.push('| 软件 | 平台 | 原因 | 链接 |', '|---|---|---|---|')
    for (const r of unverified) for (const d of r.unverifiedLinks) {
      L.push(`| ${r.name} | ${d.platform} | ${short(d.error, 40)} | ${short(d.url, 70)} |`)
    }
    L.push('')
  }
  if (repoErrors.length || notChecked.length) {
    L.push('## 上游查询情况', '')
    if (repoErrors.length) {
      L.push('**仓库信息有问题**（服务器明确答复：仓库不存在 / 已改名，得人去改 `github` 字段）：', '')
      for (const r of repoErrors) {
        // 被忽略的（比如 everything 的仓库本来就是 404）标一下，免得人以为还得去修
        const tag = r.muted ? '　（已在忽略清单里，不会进待审 Issue）' : ''
        const src = r.repo || '无仓库'
        L.push(`- ${r.name}（\`${r.id}\`，${src}）：${r.note}${tag}`)
      }
      L.push('')
    }
    if (notChecked.length) {
      L.push('**本次没能检查**（运行环境问题：连不上 / 被限流 / 令牌无效或过期 / GitHub 5xx；'
        + '不代表站内数据有问题，下次体检会自动重试）：', '')
      for (const r of notChecked) {
        const src = r.repo || '无仓库'
        L.push(`- ${r.name}（\`${r.id}\`，${src}）：${r.note}`)
      }
      L.push('')
    }
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
