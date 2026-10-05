#!/usr/bin/env node
// 下载直链存活巡检（清单 #10 的独立版）
//
// 为什么除了「审核通过那一刻探一次」之外还要有它：
//   审核时那次探测只能管住**上线那一刻**。站点上的链接是会被上游改掉的 ——
//   GitHub Release 被作者删掉、官网改版换路径、网盘分享过期。这些都不会有任何通知，
//   站点看起来一切正常，只是用户点开就 404。所以要有一个能随时/定期扫全量的工具。
//
// 用法：
//   node scripts/verify-links.mjs                     # 扫 软件数据/apps/ 下全部
//   node scripts/verify-links.mjs 软件数据/apps/7-zip.json ...
//   node scripts/verify-links.mjs --soft              # 有死链也退 0（用于只做报告的定时任务）
//   node scripts/verify-links.mjs --only github.com   # 只探匹配这个子串的链接
//
// 判定：
//   · 2xx / 3xx            → 活
//   · 4xx（403 除外）/ 5xx → 死链（报出来）
//   · 403 / 405 / 501      → 换 GET + Range: bytes=0-0 再试一次（不少站点不爱 HEAD）
//   · 超时 / DNS / TLS     → **不计死链**，只记「无结论」。一次网络抖动判人死链，比漏判更糟。
//
// 本站对象（oss:// 与 /api/icon）不在这里探：它们的存活由审核迁移与桶对账脚本负责。

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const APPS_DIR = path.join('软件数据', 'apps')
const TIMEOUT_MS = 12000
/** 并发别开大：这是去打别人家的服务器，不是压测 */
const CONCURRENCY = 6

const argv = process.argv.slice(2)
const soft = argv.includes('--soft')
const onlyIdx = argv.indexOf('--only')
const only = onlyIdx >= 0 ? String(argv[onlyIdx + 1] || '') : ''
const files = argv
  .filter((a) => !a.startsWith('--') && a !== only)
  .filter((a) => a.endsWith('.json'))

const line = (s) => console.log(s)
const warn = (s) => console.log(`::warning::${s}`)

function summary(md) {
  const f = process.env.GITHUB_STEP_SUMMARY
  if (!f) return
  try {
    fs.appendFileSync(f, md + '\n')
  } catch {
    // 摘要写不进去不影响巡检本身
  }
}

/** 本站对象（伪协议或本站代理地址）：不是外链，跳过 */
function isLocalRef(url) {
  const raw = String(url ?? '').trim()
  if (!raw) return true
  if (/^oss:\/\//i.test(raw)) return true
  try {
    const u = new URL(raw)
    return u.pathname === '/api/icon' || u.pathname === '/api/dl'
  } catch {
    return false
  }
}

async function probeOnce(url, method, headers) {
  const res = await fetch(url, {
    method,
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  // 只关心状态码：body 一律丢掉，免得把别人的安装包拉下来
  try {
    await res.body?.cancel()
  } catch {
    /* 已经读完或不可取消，无所谓 */
  }
  return res.status
}

/**
 * 探一条链接。
 * @returns {{state:'alive'|'dead'|'unknown', status:number, note:string}}
 */
async function probe(url) {
  try {
    let status = await probeOnce(url, 'HEAD', {})
    if ([400, 403, 405, 501].includes(status)) {
      status = await probeOnce(url, 'GET', { Range: 'bytes=0-0' })
    }
    if (status >= 200 && status < 400) return { state: 'alive', status, note: '' }
    return { state: 'dead', status, note: `HTTP ${status}` }
  } catch (err) {
    // 超时 / DNS / TLS / 连接被拒：**不判死链**（一次网络抖动判人死链，比漏判更糟）。
    // 把 cause 带上：`TypeError: fetch failed` 本身没有任何信息量，
    // 真正的原因（ENOTFOUND / CERT_HAS_EXPIRED / UNABLE_TO_VERIFY_LEAF_SIGNATURE …）在 cause 里。
    const cause = (err && err.cause && (err.cause.code || err.cause.message)) || ''
    const name = (err && err.name) || 'Error'
    return { state: 'unknown', status: 0, note: cause ? `${name}: ${cause}` : name }
  }
}

function resolveFiles() {
  if (files.length) return files
  if (!fs.existsSync(APPS_DIR)) return []
  return fs
    .readdirSync(APPS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(APPS_DIR, f))
    .sort()
}

async function main() {
  const targets = resolveFiles()
  if (!targets.length) {
    line('没有找到任何 apps/*.json，跳过')
    return 0
  }

  /** @type {{app:string, url:string}[]} */
  const jobs = []
  let total = 0
  for (const file of targets) {
    let data
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (e) {
      warn(`读不了 ${file}：${(e && e.message) || e}`)
      continue
    }
    const appId = String(data.id || path.basename(file, '.json'))
    for (const item of Array.isArray(data.downloads) ? data.downloads : []) {
      const url = String((item && item.url) || '').trim()
      if (!url || isLocalRef(url)) continue
      if (!/^https?:\/\//i.test(url)) continue
      if (only && !url.includes(only)) continue
      total += 1
      jobs.push({ app: appId, url })
    }
  }

  // 同一条链接被多个软件引用时只探一次
  const seen = new Map()
  const unique = []
  for (const j of jobs) {
    if (seen.has(j.url)) {
      seen.get(j.url).push(j.app)
      continue
    }
    seen.set(j.url, [j.app])
    unique.push(j)
  }

  line(`外链 ${jobs.length} 条（去重后 ${unique.length} 条，来自 ${targets.length} 个数据文件）`)
  line('')

  const results = []
  let cursor = 0
  const worker = async () => {
    while (cursor < unique.length) {
      const job = unique[cursor++]
      const r = await probe(job.url)
      results.push({ ...job, ...r })
      const mark = r.state === 'alive' ? '✅' : r.state === 'dead' ? '❌' : '⏭️'
      line(`  ${mark} [${job.app}] ${r.note || 'OK'}  ${job.url}`)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker))

  const dead = results.filter((r) => r.state === 'dead')
  const unknown = results.filter((r) => r.state === 'unknown')
  const alive = results.filter((r) => r.state === 'alive')

  line('')
  line(`汇总：活 ${alive.length} / 死链 ${dead.length} / 无结论 ${unknown.length}`)

  const md = [
    '## 下载直链存活巡检',
    '',
    `- 外链 ${jobs.length} 条（去重 ${unique.length} 条）`,
    `- ✅ 存活 ${alive.length}`,
    `- ❌ 死链 ${dead.length}`,
    `- ⏭️ 无结论（超时/网络/TLS，未判死链）${unknown.length}`,
  ]
  if (dead.length) {
    md.push('', '### 死链明细', '')
    for (const d of dead) md.push(`- \`${d.app}\` — ${d.note} — ${d.url}`)
    md.push('', '> 处理：换成新的官方直链，或把该条目改成官网/网盘跳转（见维护手册 2.4）。')
  }
  if (unknown.length) {
    md.push('', '<details><summary>无结论明细（仅供参考）</summary>', '')
    for (const u of unknown) md.push(`- \`${u.app}\` — ${u.note} — ${u.url}`)
    md.push('', '</details>')
  }
  summary(md.join('\n'))

  if (dead.length && !soft) return 1
  return 0
}

main().then(
  (code) => process.exit(code),
  (err) => {
    // 巡检本身崩溃不该被当成「发现了死链」
    warn(`巡检异常：${(err && err.stack) || err}`)
    process.exit(soft ? 0 : 2)
  }
)
