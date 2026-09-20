#!/usr/bin/env node
/**
 * scripts/update-ignore.mjs
 *
 * 增删「软件信息体检」的忽略清单条目（软件数据/update-ignore.json）。
 * 体检 Issue 里的「点方框」与 `/ignore`、`/unignore` 命令都由
 * `.github/workflows/update-ignore-command.yml` 调它来落地；平时也可以手工跑。
 *
 * 用法：
 *   node scripts/update-ignore.mjs --add=<软件id> [--skip=updates|all] [--reason=理由]
 *   node scripts/update-ignore.mjs --remove=<软件id>
 *   node scripts/update-ignore.mjs --skip-once=<软件id> --key=<问题指纹> [--kind=<类型>]
 *   node scripts/update-ignore.mjs --unskip-once=<软件id>
 *   node scripts/update-ignore.mjs --list
 *
 * 「本次跳过」与「忽略」是两种强度：忽略＝永久静音；本次跳过＝只压住当前这一版问题，
 * 问题内容一变（上游又发新版、直链又换了一批）就自动重新提醒。指纹由 check-updates.mjs
 * 的 pendingKey() 算出，写进 Issue 正文的隐藏标记里，这里只负责搬运入库。
 *
 * 写回时保留原文件的**行尾**（本仓行尾是混合的，别整成一种），
 * 并把 `_` 开头的注释键排在最前、其余按键名排序，避免每次改动都产生无意义 diff。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FILE = process.env.IGNORE_FILE || path.join(ROOT, '软件数据', 'update-ignore.json')
const SCOPES = ['updates', 'all']

const args = process.argv.slice(2)
const has = (n) => args.some((a) => a === `--${n}` || a.startsWith(`--${n}=`))
const val = (n, d = '') => {
  const hit = args.find((a) => a.startsWith(`--${n}=`))
  return hit ? hit.slice(n.length + 3) : d
}

const ADD = val('add').trim()
const REMOVE = val('remove').trim()
const SKIP = val('skip', 'updates').trim()
const REASON = val('reason').trim()
const SKIP_ONCE = val('skip-once').trim()
const UNSKIP_ONCE = val('unskip-once').trim()
const KEY = val('key').trim()
const KIND = val('kind').trim()
const LIST = has('list')

const DOC = [
  '「软件信息体检」的忽略清单：写在这里的软件不会再出现在待人工确认的 Issue 里，也不会被自动改。',
  '用法：在体检 Issue 里**点一下那条下面的方框**就会自动加到这里（也可以回复 `/ignore <软件id> [updates|all] [理由]`，或直接手工加）。',
  '字段：',
  '  skip   = updates | all',
  '           updates（默认）＝ 不再提醒「版本更新 / 仓库信息」这类事；下载直链失效仍会提醒',
  '           all           ＝ 什么提醒都不要（软件已下架、不再维护时用）',
  '  reason = 为什么忽略。会写进体检报告，方便以后回顾，建议写。',
  '  at     = 加进来的日期（YYYY-MM-DD），由体检 Issue 里的勾选 / 命令自动填写。',
  '本文件里 _ 开头的键（如本段 _说明）一律不是忽略条目，只是注释。',
  '  _skip_once = 「本次跳过」的记录，不是忽略条目。结构 { "<软件id>": { keys: [{key, kind, at}] } }。',
  '               key 是体检脚本对**那一条问题**算出的指纹：指纹对得上就继续静默，',
  '               问题有变化（上游又发新版、直链又换了一批）就自动重新提醒。',
  '               在体检 Issue 里点「本次跳过」方框即会写进来；点「恢复提醒」即会清掉。',
  '要取消忽略：在体检 Issue 文末「已忽略」区点一下那条的「恢复提醒」，或回复 `/unignore <软件id>`，也可以把对应那行删掉。',
]

const die = (msg) => { console.error('✗ ' + msg); process.exit(1) }

function readFile() {
  if (!fs.existsSync(FILE)) return { obj: { _说明: DOC }, eol: '\n', trailing: true }
  const raw = fs.readFileSync(FILE, 'utf8')
  let obj
  try {
    obj = JSON.parse(raw)
  } catch (e) {
    die(`忽略清单不是合法 JSON（${FILE}）：${e.message}`)
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) die(`忽略清单格式不对（${FILE}）：顶层应该是对象`)
  return { obj, eol: raw.includes('\r\n') ? '\r\n' : '\n', trailing: raw.endsWith('\n') }
}

function writeFile(obj, eol, trailing) {
  const meta = Object.keys(obj).filter((k) => k.startsWith('_'))
  const rest = Object.keys(obj).filter((k) => !k.startsWith('_')).sort((a, b) => a.localeCompare(b))
  const ordered = {}
  for (const k of [...meta, ...rest]) ordered[k] = obj[k]
  const text = JSON.stringify(ordered, null, 2).split('\n').join(eol) + (trailing ? eol : '')
  fs.writeFileSync(FILE, text, 'utf8')
}

const today = () => new Date().toISOString().slice(0, 10)

// ── list ────────────────────────────────────────────────────────────────
if (LIST || (!ADD && !REMOVE && !SKIP_ONCE && !UNSKIP_ONCE)) {
  const { obj } = readFile()
  const keys = Object.keys(obj).filter((k) => !k.startsWith('_'))
  if (!keys.length) {
    console.log('忽略清单是空的（没有任何软件被忽略）')
  } else {
    console.log(`忽略清单共 ${keys.length} 条：`)
    for (const k of keys) {
      const v = typeof obj[k] === 'string' ? { reason: obj[k] } : obj[k]
      console.log(`  ${k}　${v.skip || 'updates'}　${v.reason || '（未写理由）'}${v.at ? '　' + v.at : ''}`)
    }
  }
  const once = obj._skip_once && typeof obj._skip_once === 'object' ? obj._skip_once : {}
  const onceIds = Object.keys(once).filter((k) => Array.isArray(once[k]?.keys) && once[k].keys.length)
  if (onceIds.length) {
    console.log(`\n「本次跳过」共 ${onceIds.length} 个软件（问题有变化会自动重新提醒）：`)
    for (const k of onceIds) {
      const ks = once[k].keys.map((x) => `${x.kind || '?'}:${x.key}${x.at ? '@' + x.at : ''}`).join('、')
      console.log(`  ${k}　${ks}`)
    }
  }
  process.exit(0)
}

// ── skip-once（「本次跳过」）────────────────────────────────────────────
// 只加不删：同一个软件可能同时有多条待审项，各带各的指纹，所以 keys 是数组。
if (SKIP_ONCE) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(SKIP_ONCE)) die(`软件 id 不合法：${SKIP_ONCE}（只允许小写字母、数字和短横线）`)
  if (!/^[0-9a-f]{6,32}$/.test(KEY)) die(`问题指纹不合法：${KEY || '（空）'}　—— 它应该由体检脚本生成、随 Issue 正文里的隐藏标记带过来`)
  const { obj, eol, trailing } = readFile()
  const box = obj._skip_once && typeof obj._skip_once === 'object' ? obj._skip_once : {}
  const prev = Array.isArray(box[SKIP_ONCE]?.keys) ? box[SKIP_ONCE].keys : []
  if (prev.some((x) => x && x.key === KEY)) {
    console.log(`「本次跳过」里已经有 ${SKIP_ONCE} 这条记录（${KEY}），无需改动`)
    process.exit(0)
  }
  box[SKIP_ONCE] = { keys: [...prev, { key: KEY, kind: KIND, at: today() }] }
  obj._skip_once = box
  writeFile(obj, eol, trailing)
  console.log(`已记为「本次跳过」：${SKIP_ONCE}（指纹 ${KEY}）—— 问题有变化会自动再提醒`)
  process.exit(0)
}

// ── unskip-once ─────────────────────────────────────────────────────────
if (UNSKIP_ONCE) {
  const { obj, eol, trailing } = readFile()
  const box = obj._skip_once
  if (!box || typeof box !== 'object' || !Object.prototype.hasOwnProperty.call(box, UNSKIP_ONCE)) {
    console.log(`「本次跳过」里本来就没有 ${UNSKIP_ONCE}（无需改动）`)
    process.exit(0)
  }
  delete box[UNSKIP_ONCE]
  if (Object.keys(box).length) obj._skip_once = box
  else delete obj._skip_once
  writeFile(obj, eol, trailing)
  console.log(`已恢复提醒：${UNSKIP_ONCE}（不再跳过）`)
  process.exit(0)
}

// ── add ─────────────────────────────────────────────────────────────────
if (ADD) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(ADD)) die(`软件 id 不合法：${ADD}（只允许小写字母、数字和短横线）`)
  if (!SCOPES.includes(SKIP)) die(`skip 只能是 ${SCOPES.join(' / ')}，收到：${SKIP}`)
  const { obj, eol, trailing } = readFile()
  const existed = Object.prototype.hasOwnProperty.call(obj, ADD)
  const prev = existed && typeof obj[ADD] === 'object' ? obj[ADD] : {}
  obj[ADD] = {
    skip: SKIP,
    // 没给新理由就沿用旧理由，避免手滑把之前写的说明抹掉
    reason: REASON || prev.reason || '',
    at: today(),
  }
  writeFile(obj, eol, trailing)
  console.log(`${existed ? '已更新' : '已加入'}忽略清单：${ADD}　范围=${SKIP}${REASON ? `　理由=${REASON}` : ''}`)
  process.exit(0)
}

// ── remove ──────────────────────────────────────────────────────────────
if (REMOVE) {
  const { obj, eol, trailing } = readFile()
  if (!Object.prototype.hasOwnProperty.call(obj, REMOVE) || REMOVE.startsWith('_')) {
    console.log(`忽略清单里本来就没有 ${REMOVE}（无需改动）`)
    process.exit(0)
  }
  delete obj[REMOVE]
  writeFile(obj, eol, trailing)
  console.log(`已从忽略清单移除：${REMOVE}`)
  process.exit(0)
}
