#!/usr/bin/env node
// OSS 桶 ↔ 仓库引用的对账（由 .github/workflows/oss-audit.yml 定时触发，也可手动跑）
//
// 为什么需要它：Worker 里的孤儿回收只看得到「我们签发过、又没被任何一次提交认领」的
// upload/ 对象，它不知道仓库里到底引用了什么，也够不着 releases/ 与事后补登的历史对象。
// 只有能同时读「桶」和「仓库」的地方才做得了这件事 —— 那就是这里。
//
// 回答三个问题：
//   ① 断链：apps/ 或 submissions/ 引用了桶里**不存在**的对象。线上点下载会 404，
//      这是唯一会让站点真的坏掉的一类，发现了就以非零码退出（定时任务会发失败通知）。
//   ② 真孤儿：桶里有、仓库里没人引用、且上传超过 STALE_HOURS 小时 —— 白付存储费。
//      **只报告，不删除**：删除不可逆，删哪些由人拍板（见维护手册 2.8 的 /api/purge）。
//   ③ 登记表漂移：顺带调一次 /api/registry-sync，以桶为准把登记表补齐。
//
// 环境变量：PURGE_BASE（默认 https://submit.132614.xyz —— Cloudflare 直连；
// cshapi 那条走 SpeedOnline CDN 回源，2026-10-05 起持续 502）、PURGE_TOKEN（必需）。
// 拿不到数据（网络/中继/未配 token）一律只告警、退出码 0 —— 基础设施抽风不该变成每天的红色告警。

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const BASE = (process.env.PURGE_BASE || 'https://submit.132614.xyz').replace(/\/+$/, '')
const TOKEN = process.env.PURGE_TOKEN || ''
/** 超过这么久还没被任何地方引用的桶对象，才算「真孤儿」（在途的投稿不该被念叨） */
const STALE_HOURS = 24
/** 扫这些前缀。gh-mirror/ 是 8090 加速服务的缓存，不属于本站对象，不看。 */
const PREFIXES = ['upload/', 'releases/', 'icon/']

const line = (s) => console.log(s)
const warn = (s) => console.log(`::warning::${s}`)

function summary(md) {
  const f = process.env.GITHUB_STEP_SUMMARY
  if (f) {
    try {
      fs.appendFileSync(f, md + '\n')
    } catch {
      // 摘要写不进去不影响对账本身
    }
  }
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Purge-Token': TOKEN },
    body: body === undefined ? undefined : JSON.stringify(body),
    // 给每次请求加 60s 超时：Worker 不可达/挂死时快速失败（被下方 try/catch 捕获 → 只告警、退出 0），
    // 避免整条对账卡在网络调用上、跑满 job 上限被 GitHub 取消（见 2026-10-05 那次失败）。
    signal: AbortSignal.timeout(60000),
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    // 非 JSON（网关错误页之类）留给调用方按状态码处理
  }
  return { status: res.status, json, text }
}

/** 从一条下载项 / 图标的写法里反解出桶对象键（与 Worker、前端三处保持一致，改一处要同步） */
function ossKeyOfUrl(url) {
  const raw = String(url ?? '').trim()
  if (!raw) return ''
  const m = /^oss:\/\/(.+)$/i.exec(raw)
  if (m) return decodeURIComponent(m[1].split(/[?#]/)[0].replace(/^\/+/, ''))
  try {
    const u = new URL(raw)
    if (u.pathname === '/api/icon' || u.pathname === '/api/dl') return u.searchParams.get('k') || ''
  } catch {
    // 不是合法 URL，按「不是我们的对象」处理
  }
  return ''
}

/** 扫描仓库里所有引用了桶对象的文件，返回 key → 引用它的文件列表 */
function collectReferences(root) {
  const dirs = [path.join(root, '软件数据', 'apps'), path.join(root, 'submissions')]
  const refs = new Map()
  const add = (key, file) => {
    if (!key) return
    if (!refs.has(key)) refs.set(key, [])
    refs.get(key).push(file)
  }
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.json') || name.startsWith('_')) continue
      const full = path.join(dir, name)
      let data
      try {
        data = JSON.parse(fs.readFileSync(full, 'utf8'))
      } catch {
        warn(`跳过解析失败的文件：${name}`)
        continue
      }
      const rel = `${path.basename(dir)}/${name}`
      add(ossKeyOfUrl(data.icon), rel)
      for (const item of Array.isArray(data.downloads) ? data.downloads : []) {
        add(ossKeyOfUrl(item && item.url), rel)
      }
    }
  }
  return refs
}

function ageHours(iso) {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? (Date.now() - t) / 3600000 : null
}

async function main() {
  const root = process.cwd()
  if (!TOKEN) {
    warn('未配置 PURGE_TOKEN，跳过本次对账')
    return 0
  }

  // ③ 先以桶为准校准登记表（补登桶里有、登记表没有的历史对象；幂等）
  try {
    const r = await api('POST', `${BASE}/api/registry-sync`, { dry: false })
    if (r.status === 200 && r.json) {
      line(
        `登记表同步：桶内 ${r.json.bucket} 个 / 登记表 ${r.json.registry} 个，` +
          `补登 ${r.json.added} 个，桶里有而登记表没有 ${r.json.missingCount} 个，` +
          `登记表有而桶里没有 ${r.json.ghostCount} 个`
      )
    } else {
      warn(`登记表同步失败（HTTP ${r.status}）：${String(r.text).slice(0, 160)}`)
    }
  } catch (e) {
    warn(`登记表同步异常：${e && e.message}`)
  }

  // 桶（权威）
  const objects = []
  for (const prefix of PREFIXES) {
    let r
    try {
      r = await api('GET', `${BASE}/api/files?source=bucket&prefix=${encodeURIComponent(prefix)}`)
    } catch (e) {
      warn(`列桶失败（${prefix}）：${e && e.message} —— 本轮跳过，不做任何判断`)
      return 0
    }
    if (r.status !== 200 || !r.json || !Array.isArray(r.json.objects)) {
      warn(`列桶失败（${prefix}）：HTTP ${r.status} —— 本轮跳过，不做任何判断`)
      return 0
    }
    objects.push(...r.json.objects)
  }

  // 仓库引用
  const refs = collectReferences(root)
  const bucket = new Map(objects.map((o) => [o.key, o]))

  // ① 断链
  const broken = []
  for (const [key, files] of refs) {
    if (!bucket.has(key)) broken.push({ key, files })
  }

  // ② 真孤儿（只报告）
  const orphans = objects.filter((o) => {
    if (refs.has(o.key)) return false
    const h = ageHours(o.lastModified)
    return h !== null && h >= STALE_HOURS
  })

  line('')
  line(`桶内对象 ${objects.length} 个｜仓库引用 ${refs.size} 个键`)
  line(`断链 ${broken.length} 个｜超过 ${STALE_HOURS} 小时没人引用的对象 ${orphans.length} 个`)

  const md = []
  md.push('## OSS 桶对账')
  md.push('')
  md.push(`- 桶内对象：**${objects.length}**`)
  md.push(`- 仓库引用：**${refs.size}** 个键`)
  md.push(`- 断链：**${broken.length}**`)
  md.push(`- 超过 ${STALE_HOURS} 小时无人引用（真孤儿，建议清理）：**${orphans.length}**`)
  md.push('')
  if (broken.length) {
    md.push('### ❌ 断链（线上会 404，必须处理）')
    md.push('')
    md.push('| 对象键 | 引用它的文件 |')
    md.push('| --- | --- |')
    for (const b of broken) md.push(`| \`${b.key}\` | ${b.files.join('<br>')} |`)
    md.push('')
  }
  if (orphans.length) {
    md.push('### 🗑️ 无人引用的桶对象')
    md.push('')
    md.push('> 只报告不删除。确认后可用 `POST /api/purge {"keys":[…]}` 清理（见维护手册 2.8）。')
    md.push('')
    md.push('| 对象键 | 体积 | 上传时间 |')
    md.push('| --- | --- | --- |')
    for (const o of orphans) {
      md.push(`| \`${o.key}\` | ${(o.size / 1024 / 1024).toFixed(2)} MB | ${o.lastModified} |`)
    }
    md.push('')
  }
  summary(md.join('\n'))

  if (broken.length) {
    line('')
    for (const b of broken) line(`  ❌ 断链 ${b.key} ← ${b.files.join(', ')}`)
    line('::error::发现 ' + broken.length + ' 个断链的桶引用，站点上点这些下载会 404')
    return 1
  }
  if (orphans.length) {
    line('')
    for (const o of orphans) line(`  孤儿 ${o.key}（${(o.size / 1024 / 1024).toFixed(2)} MB, ${o.lastModified}）`)
  }
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    // 对账本身崩了不算「站点坏了」，别把它变成红色告警
    warn(`对账异常：${e && e.stack ? e.stack.split('\n')[0] : e}`)
    process.exit(0)
  })
