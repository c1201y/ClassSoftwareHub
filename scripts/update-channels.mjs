#!/usr/bin/env node
/**
 * scripts/update-channels.mjs
 *
 * 「非 GitHub 来源」的版本来源登记表 —— check-updates.mjs 的第二条腿。
 *
 * ⛔ **2026-09-21 起已停用**（维护者决定：自动更新**只跟 GitHub**）。
 *    行为上等价于这个文件不存在：`channelFor()` 恒返回 null，所有没有 GitHub 仓库的
 *    软件一律走 `BUCKETS` 如实登记「为什么不跟」，不再抓取厂商页面。
 *
 *    为什么保留而不是删掉：这里的 `run()` 都是**在真实站点上实测调出来的**（希沃那个
 *    「文件名会变、对不上就当解析失败」的安全阀尤其费事），删了将来想恢复就得从头调。
 *    想恢复只做两步 —— ① 把下面的 `CHANNELS_ENABLED` 改回 `true`；
 *    ② 删掉 `BUCKETS` 里这 10 个软件的条目（不删也无妨：`channelFor` 优先，条目不会被用到）。
 *
 * 为什么当初需要它：站内约 30 个软件没有 GitHub 仓库，官方站点又大多是
 * JS 渲染的 SPA，脚本抓不到版本锚点，于是它们**永远不进体检**：改没改、新旧与否
 * 全靠人记得去官网看一眼（`geogebra`、希沃白板这几个就是这么漏掉的）。
 *
 * 这个文件做两件事：
 *   1. CHANNELS —— 按软件 id 登记的「来源实现」，每个只做一件事：
 *      `run()` → `{ version, date?, files? }`；拿不到就 **throw**（调用方会转成
 *      「该来源解析失败，退回人工」的待审条目，绝不会因为解析失败去改数据）。
 *   2. BUCKETS  —— 剩下那些**根本没法自动跟踪**的，逐个写明是哪种情况
 *      （微软商店 / 官方固定最新直链 / 有意归档 / 只有网页入口 / 网盘），
 *      这样体检 Issue 才能把「没被检查到的」也如实列出来，而不是假装它们不存在。
 *
 * 三条自我约束（与 check-updates.mjs 的保守原则一致）：
 *  ① **来源必须实测**：每个 `run()` 都在真实站点上跑过，并校验「版本号能对上下载地址里的文件名」
 *     ——对不上就当解析失败（站方改版最典型的症状就是这两者脱钩）。
 *  ② **域名白名单**：provider 给出的链接必须落在写死的域名上，防止页面被改后把流量指向别处。
 *  ③ **失败不改数据**：任何异常一律退回人工，绝不「猜一个版本号写进去」。
 *
 * 用法（本地实测 / CI 自查）：
 *   node scripts/update-channels.mjs              # 跑全部来源，打印结果
 *   node scripts/update-channels.mjs --only=vlc   # 只跑一个
 *   node scripts/update-channels.mjs --json       # 输出 JSON（便于二次处理）
 */

const UA = 'ClassSoftwareHub-UpdateChecker/1.0 (+https://classsoftwarehub.us.ci)'
const cur = (s) => String(s ?? '').trim()

// ── HTTP ────────────────────────────────────────────────────────────────
/**
 * 取文本。`redirect: 'manual'` 专门留给「靠重定向拿版本号」的来源：
 * 跟随后会真的去下 100+ MB 的安装包，只读 Location 头才不会。
 */
async function httpText(url, { headers = {}, manual = false, timeout = 30000 } = {}) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeout)
  try {
    const r = await fetch(url, {
      redirect: manual ? 'manual' : 'follow',
      headers: { 'User-Agent': UA, Accept: '*/*', 'Accept-Language': 'zh-CN,zh;q=0.9', ...headers },
      signal: ctl.signal,
    })
    if (manual) {
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get('location')
        if (!loc) throw new Error(`HTTP ${r.status} 但没有 Location 头`)
        return { redirected: true, url: new URL(loc, url).href, status: r.status, text: '' }
      }
      if (r.status >= 400) throw new Error(`HTTP ${r.status}`)
      return { redirected: false, url: r.url, status: r.status, text: await r.text() }
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return { redirected: false, url: r.url, status: r.status, text: await r.text() }
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error(`请求超时（${Math.round(timeout / 1000)}s）`)
    throw new Error(String(e?.message || e))
  } finally {
    clearTimeout(timer)
  }
}

/** HTML 实体反转义；`&amp;` 必须最后处理，否则 `&amp;quot;` 会被二次还原 */
const unescapeHtml = (s) => String(s)
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')

/**
 * 剥掉 HTML 注释 —— 页面类来源**必须先做这一步**。
 * 实测教训：`browser.360.cn/ee/` 里有两个 `id="loadnew"`，前一个藏在
 * `<!-- ... -->` 里指向上一版（`360cse_23.0.1244.0.exe`），不剥注释就会抓成
 * 「站内要回退到旧版」。整个注释块里挂着历史版本 / 停用按钮是常态，不能靠猜顺序。
 */
const stripComments = (s) => String(s).replace(/<!--[\s\S]*?-->/g, '')

/** 从若干候选里挑版本号最大的（按数字段比） */
function pickMax(rows) {
  const nums = (v) => { const m = /(\d+(?:\.\d+)*)/.exec(cur(v)); return m ? m[1].split('.').map(Number) : null }
  let best = null, bestN = null
  for (const r of rows || []) {
    const n = nums(r.version)
    if (!n) continue
    let newer = !bestN
    if (!newer) {
      for (let i = 0; i < Math.max(n.length, bestN.length); i++) {
        const d = (n[i] ?? 0) - (bestN[i] ?? 0)
        if (d) { newer = d > 0; break }
      }
    }
    if (newer) { best = r; bestN = n }
  }
  return best
}

/** 时间戳 → `YYYY-MM-DD`（按北京时间；站内「5.2.4.10148（2026-08-26）」就是这么来的） */
function dateCN(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n <= 0) return ''
  return new Date(n + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

/** 下载地址里必须真的出现「前缀 + 版本号」，否则说明站方改了字段含义 —— 宁可报错 */
function assertNameMatches(url, prefix, version) {
  const u = (() => { try { return decodeURIComponent(url) } catch { return url } })()
  if (prefix && !u.includes(`${prefix}${version}`)) {
    throw new Error(`下载地址里的文件名与版本号 ${version} 对不上（页面结构可能已变）`)
  }
}

/** 链接必须落在白名单域名上 —— 防御页面被改后指向别处 */
function assertHost(url, hosts) {
  let h = ''
  try { h = new URL(url).hostname.toLowerCase() } catch { throw new Error(`下载地址不是合法 URL：${url.slice(0, 60)}`) }
  if (!hosts.some((x) => h === x || h.endsWith('.' + x))) {
    throw new Error(`下载地址域名 ${h} 不在白名单里（${hosts.join(' / ')}）`)
  }
  return url
}

// ── 来源 1：希沃官方产品清单（一次请求覆盖 5 个软件）─────────────────────
/**
 * `e.seewo.com` 首页内嵌一份**产品清单 JSON**（约 75 条），每条带
 * `softCode` / `softVersion` / `softPublishtime` / `downloadUrl`。
 *
 * 这份来源价值最高：站内希沃那几个软件的直链是**带签名的对象存储地址**
 * （`?sign=q-sign-algorithm=...&q-key-time=...`），以前每次出新版都得人到页面
 * 重新抓一遍签名；现在清单里直接给新签名地址。
 *
 * 注：清单被 HTML 转义过（`&quot;`），且是**扁平对象**（没有嵌套 {}），
 * 所以反转义后用 `\{[^{}]*"softCode"...\}` 就能逐条 `JSON.parse`。
 */
let _seewo = null
function seewoProducts() {
  if (!_seewo) {
    _seewo = (async () => {
      const { text } = await httpText('https://e.seewo.com/', { timeout: 45000 })
      const flat = unescapeHtml(text)
      const map = new Map()
      for (const m of flat.matchAll(/\{[^{}]*"softCode":"([^"]+)"[^{}]*\}/g)) {
        try {
          const o = JSON.parse(m[0])
          if (o?.softCode && !map.has(o.softCode)) map.set(o.softCode, o)
        } catch { /* 单条坏了不影响其它条 */ }
      }
      if (map.size < 20) throw new Error(`希沃清单只解析出 ${map.size} 条（站方可能改版）`)
      return map
    })().catch((e) => { _seewo = null; throw e })
  }
  return _seewo
}

async function seewo(code, prefix) {
  const map = await seewoProducts()
  const o = map.get(code)
  if (!o) throw new Error(`希沃清单里没有 ${code}（站方可能改版）`)
  const version = cur(o.softVersion)
  const url = cur(o.downloadUrl)
  if (!version || !url) throw new Error(`${code} 在希沃清单里缺版本号或下载地址`)
  assertNameMatches(url, prefix, version)
  assertHost(url, ['seewo.com'])
  return { version, date: dateCN(o.softPublishtime), url }
}

// ── 来源 2：VideoLAN 官方目录索引 ───────────────────────────────────────
/** `get.videolan.org/vlc/last/<arch>/` 是 Apache 目录列表，版本与体积都在上面 */
async function videolanDir(arch) {
  const { text } = await httpText(`https://get.videolan.org/vlc/last/${arch}/`)
  const rows = []
  const re = new RegExp(`>vlc-([\\d.]+)-${arch}\\.exe<[^>]*>\\s*(\\d{2}-\\w{3}-\\d{4} \\d{2}:\\d{2})\\s+(\\d+)`, 'g')
  for (const m of text.matchAll(re)) {
    rows.push({
      version: m[1],
      url: `https://get.videolan.org/vlc/last/${arch}/vlc-${m[1]}-${arch}.exe`,
      size: Number(m[3]) || 0,
    })
  }
  const best = pickMax(rows)
  if (!best) throw new Error(`${arch} 目录里没找到 vlc-*-${arch}.exe（目录结构可能已变）`)
  assertHost(best.url, ['videolan.org'])
  return best
}

// ── 来源 3：DiskGenius 官方下载页 ───────────────────────────────────────
/** 更新日志列表里 `class="lk cur"` 那一条就是当前版本（`V6.2.0.1829`） */
async function diskgenius() {
  const { text } = await httpText('https://www.diskgenius.cn/download.php')
  const m = /<li[^>]*class="lk cur"[^>]*>\s*V?(\d+(?:\.\d+)+)\s*</.exec(stripComments(text))
  if (!m) throw new Error('下载页里没找到更新日志的当前版本条目（页面结构可能已变）')
  return { version: m[1] }
}

// ── 来源 4：360 系统急救箱 ──────────────────────────────────────────────
/** 页面里 64 位版本号与直链成对写成 `value="5.1.64.1289" class="left-version64"` */
async function jijiuxiang() {
  const { text } = await httpText('https://weishi.360.cn/jijiuxiang/index.html')
  const html = stripComments(text)
  const v64 = /value="(\d+(?:\.\d+)+)"\s+class="left-version64"/.exec(html)
  const u64 = /value="([^"]*360c0mpkill_[\d.\-]+\.(?:exe|zip))"\s+class="left-url64"/.exec(html)
  if (!v64) throw new Error('页面里没找到 64 位版本号（页面结构可能已变）')
  const out = { version: v64[1] }
  // 站内该项有意指向官网页面（「该应用更新频繁，故引导至官网下载」），所以直链只做校验、不写回
  if (u64) assertHost(new URL(u64[1], 'https://weishi.360.cn/').href, ['360safe.com', '360.cn'])
  return out
}

// ── 来源 5：360 极速浏览器 ──────────────────────────────────────────────
/**
 * 页面上「32位版本」/「64位版本」两个按钮分别带 `id="loadnew"` / `id="loadnew64"`。
 * ⚠️ 两个前提缺一不可：
 *  ① **先剥注释**（见 stripComments）：注释里那个 `id="loadnew"` 指的是上一版；
 *  ② 必须按 id 取 —— 页面里还挂着 XP 版、Beta 版和一堆历史版本的直链，
 *     随手取「第一个出现的 360cse_*.exe」会拿到旧版。
 */
async function speedBrowser() {
  const { text } = await httpText('https://browser.360.cn/ee/')
  const html = stripComments(text)
  const grab = (id) => {
    const m = new RegExp(`href="([^"]*360cse[x]?_\\d[\\d.]*\\.exe)"[^>]*id="${id}"`).exec(html)
    return m ? m[1] : ''
  }
  const x64 = grab('loadnew64')
  const x86 = grab('loadnew')
  if (!x64 && !x86) throw new Error('页面上没找到「32位版本 / 64位版本」按钮的直链（页面结构可能已变）')
  const files = []
  if (x64) files.push({ key: '360csex_', url: assertHost(x64, ['360tpcdn.com', '360safe.com']) })
  if (x86) files.push({ key: '360cse_', url: assertHost(x86, ['360tpcdn.com', '360safe.com']) })
  const head = x64 || x86
  const v = /_(\d+(?:\.\d+)+)\.exe$/.exec(head)
  if (!v) throw new Error('直链文件名里没有版本号')
  return { version: v[1], files }
}

// ── 来源 6：GeoGebra ────────────────────────────────────────────────────
/**
 * `download.geogebra.org/package/win-autoupdate` 会 302 到带版本号的安装包，
 * 跟着 Location 就能读到版本（**不要**跟过去，那会真的下载 130 MB）。
 * 站内两条链都是「永远最新」的官方地址，所以只改版本号、不动链接。
 */
async function geogebra() {
  const { url } = await httpText('https://download.geogebra.org/package/win-autoupdate', { manual: true })
  const m = /GeoGebra-Windows-Installer-(\d+)-(\d+)-(\d+)-(\d+)\.exe$/i.exec(url)
  if (!m) throw new Error(`重定向地址里没有版本号：${url.slice(0, 90)}`)
  return { version: `${m[1]}.${m[2]}.${m[3]}.${m[4]}` }
}

// ── 登记表 ──────────────────────────────────────────────────────────────
/**
 * 每个条目：
 *   label        来源名称（写进报告，维护者一眼知道去哪儿看）
 *   page         人看的页面（报告里给链接）
 *   keepSegments 写回 version 时保留几段（DiskGenius 的 1829 是内部构建号，
 *                站内一直写 `6.2.0`；只在 `6.2.1` 这种真版本变化时才动）
 *   files        'write'（默认）＝ 把 files 里的新直链写回 downloads[]
 *                'keep'          ＝ 来源只给版本号，链接一律不碰
 *   run()        返回 { version, date?, files?: [{key, url, size?}] }
 */
/**
 * ★ 第二腿总开关（2026-09-21）：`false` = 自动更新**只跟 GitHub**。
 *
 * 关掉之后，下面 `CHANNELS` 里的来源一条都不会被调用；对应的 10 个软件改由
 * `BUCKETS` 登记成「只有网页入口」，如实出现在体检 Issue 的「跟不了」分区里。
 * 想恢复第二条腿：把这里改成 `true` 即可（详见文件头注释）。
 */
const CHANNELS_ENABLED = false

export const CHANNELS = {
  vlc: {
    label: 'VideoLAN 官方下载目录',
    page: 'https://get.videolan.org/vlc/last/win64/',
    async run() {
      const [a, b] = await Promise.all([videolanDir('win64'), videolanDir('win32')])
      const best = pickMax([a, b]) || a
      return {
        version: best.version,
        files: [
          { key: 'win64', url: a.url, size: a.size },
          { key: 'win32', url: b.url, size: b.size },
        ],
      }
    },
  },

  geogebra: {
    label: 'GeoGebra 官方 win-autoupdate 重定向',
    page: 'https://www.geogebra.org/download?lang=zh-CN',
    files: 'keep',
    run: geogebra,
  },

  diskgenius: {
    label: 'DiskGenius 官方更新日志',
    page: 'https://www.diskgenius.cn/download.php',
    keepSegments: 3,
    files: 'keep',
    run: diskgenius,
  },

  '360-jijiuxiang': {
    label: '360 急救箱官方页面',
    page: 'https://weishi.360.cn/jijiuxiang/index.html',
    files: 'keep',
    run: jijiuxiang,
  },

  '360-speed-browser': {
    label: '360 极速浏览器官方页面',
    page: 'https://browser.360.cn/ee/',
    run: speedBrowser,
  },

  'class-optimizer': {
    label: '希沃产品清单 · EasiCare_PC',
    page: 'https://e.seewo.com/',
    files: 'keep',
    // 2026-09-20 上游把文件名从 EasiCareSetup_* 改成 EasiCare_PC_*（实测新地址 200）
    run: () => seewo('EasiCare_PC', 'EasiCare_PC_'),
  },

  'xwbb5': {
    label: '希沃产品清单 · EasiNote5',
    page: 'https://e.seewo.com/',
    run: () => seewo('EasiNote5', 'EasiNoteSetup_'),
  },

  'seewo-assistant': {
    label: '希沃产品清单 · SeewoIwbAssistant',
    page: 'https://e.seewo.com/',
    run: () => seewo('SeewoIwbAssistant', 'SeewoIwbAssistant_'),
  },

  xwspztayxingz: {
    label: '希沃产品清单 · EasiCamera',
    page: 'https://e.seewo.com/',
    run: () => seewo('EasiCamera', 'EasiCamera_'),
  },

  xiwopinke: {
    label: '希沃产品清单 · seewoPincoTeacher',
    page: 'https://e.seewo.com/',
    run: () => seewo('seewoPincoTeacher', 'seewoPincoTeacher_'),
  },
}

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
  officetoolplus: { bucket: 'always-latest', reason: '版本字段有意写「跟随官网」、站内只做官网镜像页跳转；上游其实有 GitHub 仓库（YerongAI/Office-Tool），若想让它全自动，把 downloads 换成该仓库的 release 直链即可' },
  'uu-remote': { bucket: 'always-latest', reason: '站内版本字段写「最新版（官网自动更新）」，直链是网易分发接口，永远指向最新包' },
  potplayer: { bucket: 'always-latest', reason: '版本字段写「最新版（官网自动更新）」，三条 daumcdn 直链都在 Version/Latest 下' },
  todesk: { bucket: 'always-latest', reason: '版本字段写「以安装时官网版本为准」；直链是在线安装器，装完自己拉最新版' },
  rammap: { bucket: 'always-latest', reason: '微软 Sysinternals 直链固定为 RAMMap.zip，永远是最新版；要版本号得把包下下来读 PE 信息，不值得' },
  'geek-uninstaller': { bucket: 'always-latest', reason: '官网只给 /geek.zip 固定直链，页面里没有版本号' },
  'driver-ceo': { bucket: 'always-latest', reason: '直链是在线安装器（安装时联网匹配最新驱动），不吃版本号' },
  chrome: { bucket: 'always-latest', reason: '版本字段有意写「跟随官网」，站内只做官网跳转' },
  WPS: { bucket: 'always-latest', reason: '版本字段有意写「跟随官网」，站内只做官网跳转' },
  qq: { bucket: 'always-latest', reason: '版本字段有意写「官网」，站内只做官网跳转' },
  wechat: { bucket: 'always-latest', reason: '版本字段有意写「官网」，站内只做官网跳转' },

  // ── 有意归档 ──
  'wps2019ayxingz': { bucket: 'archive', reason: '有意收录 WPS2019 归档版（2022 年的包），不跟随上游' },
  'bandizip6.29': { bucket: 'archive', reason: '有意收录 6.x 末代无广告版（dl.php?old），只需盯「官方是否撤链」' },

  // ── 原「第二腿」覆盖的 10 个（2026-09-21 起自动更新只跟 GitHub，改由人工看）──
  //    ⚠️ 这 10 个的上游都**没有 GitHub 仓库**，是当初做第二条腿的全部理由。
  //    理由如实写「按决定不再抓」而不是「页面抓不到」—— 后者对 vlc / geogebra / diskgenius /
  //    360 这几个是假话（它们的页面本来解析得出来）。
  vlc: { bucket: 'page-only', reason: '上游没有 GitHub 仓库；官方目录 get.videolan.org 有版本信息，但 2026-09-21 起自动更新只跟 GitHub、不再抓取 —— 要人偶尔看一眼' },
  geogebra: { bucket: 'page-only', reason: '上游没有 GitHub 仓库；官网下载页有版本重定向，但 2026-09-21 起自动更新只跟 GitHub、不再抓取 —— 要人偶尔看一眼' },
  diskgenius: { bucket: 'page-only', reason: '上游没有 GitHub 仓库；官网更新日志有版本信息，但 2026-09-21 起自动更新只跟 GitHub、不再抓取 —— 要人偶尔看一眼' },
  '360-jijiuxiang': { bucket: 'page-only', reason: '上游没有 GitHub 仓库；官网页面有版本信息，但 2026-09-21 起自动更新只跟 GitHub、不再抓取 —— 要人偶尔看一眼' },
  '360-speed-browser': { bucket: 'page-only', reason: '上游没有 GitHub 仓库；官网页面有版本信息（两条直链会随版本变），但 2026-09-21 起自动更新只跟 GitHub、不再抓取 —— 要人偶尔看一眼' },
  'class-optimizer': { bucket: 'page-only', reason: '上游没有 GitHub 仓库；版本在希沃产品清单 e.seewo.com（EasiCare_PC），但 2026-09-21 起自动更新只跟 GitHub、不再抓取 —— 要人偶尔看一眼' },
  xwbb5: { bucket: 'page-only', reason: '上游没有 GitHub 仓库；版本在希沃产品清单 e.seewo.com（EasiNote5），但 2026-09-21 起自动更新只跟 GitHub、不再抓取 —— 要人偶尔看一眼' },
  'seewo-assistant': { bucket: 'page-only', reason: '上游没有 GitHub 仓库；版本在希沃产品清单 e.seewo.com（SeewoIwbAssistant），但 2026-09-21 起自动更新只跟 GitHub、不再抓取 —— 要人偶尔看一眼' },
  xwspztayxingz: { bucket: 'page-only', reason: '上游没有 GitHub 仓库；版本在希沃产品清单 e.seewo.com（EasiCamera），但 2026-09-21 起自动更新只跟 GitHub、不再抓取 —— 要人偶尔看一眼' },
  xiwopinke: { bucket: 'page-only', reason: '上游没有 GitHub 仓库；版本在希沃产品清单 e.seewo.com（seewoPincoTeacher），但 2026-09-21 起自动更新只跟 GitHub、不再抓取 —— 要人偶尔看一眼' },

  // ── 只有网页入口，抓不到版本锚点 ──
  '360-safe-guard-speed': { bucket: 'page-only', reason: '页面只有 setupbeta_jisu.exe，没有版本号锚点' },
  'huorong-security': { bucket: 'page-only', reason: '官网下载页 333 KB 里没有任何版本锚点，版本由 JS 异步加载' },
  dingtalk: { bucket: 'page-only', reason: '页面里唯一带版本的链接是无障碍兜底用的 DingTalk_v8.2.0.exe，比站内还旧；真实版本由 JS 从接口取' },
  'tencent-meeting': { bucket: 'page-only', reason: '下载页是 Next.js、版本走带签名的内部接口，抓不到静态版本锚点（winget 社区清单里有维护，但那是社区来源，未接入）' },
  xrkayxingz: { bucket: 'page-only', reason: '下载页是 Nuxt SSR，抓不到版本锚点；官方也没提供可解析的版本接口' },
  yjxzsayxingz: { bucket: 'page-only', reason: '下载页是 Vue SPA，要逆向接口才能拿到版本' },

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
 * 这个软件走不走非 GitHub 来源。
 * `CHANNELS_ENABLED` 为 `false` 时**恒返回 null** —— 调用方于是走 `classify()` 那条路，
 * 「第二腿已停用」这件事不需要 check-updates.mjs 知道任何细节。
 */
export const channelFor = (id) => (CHANNELS_ENABLED ? CHANNELS[cur(id)] || null : null)

/**
 * 判定一个「没有可用 GitHub 仓库」的软件属于哪一类。
 * 优先用显式登记（理由写得清楚）；没登记的若挂着商店链接，自动归入 store。
 */
export function classify(app) {
  const id = cur(app?.id)
  const hit = BUCKETS[id]
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

// ── CLI：本地实测 / CI 自查 ─────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())
if (isMain) {
  const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').map((s) => s.trim()).filter(Boolean)
  const asJson = process.argv.includes('--json')
  const ids = Object.keys(CHANNELS).filter((id) => !only.length || only.includes(id))
  const out = []
  for (const id of ids) {
    const ch = CHANNELS[id]
    const t0 = Date.now()
    try {
      const r = await ch.run()
      out.push({ id, ok: true, ...r, ms: Date.now() - t0 })
      if (!asJson) {
        const files = (r.files || []).map((f) => `${f.key}→${f.url.split('/').pop()}`).join('  ')
        console.log(`✅ ${id.padEnd(20)} ${r.version.padEnd(14)} ${r.date ? `（${r.date}）` : ''}  ${files}`)
      }
    } catch (e) {
      out.push({ id, ok: false, error: String(e?.message || e), ms: Date.now() - t0 })
      if (!asJson) console.log(`❌ ${id.padEnd(20)} ${String(e?.message || e)}`)
    }
  }
  if (asJson) console.log(JSON.stringify(out, null, 2))
  else {
    const bad = out.filter((x) => !x.ok).length
    console.log(`\n共 ${out.length} 个来源：成功 ${out.length - bad}，失败 ${bad}`)
  }
  process.exitCode = out.some((x) => !x.ok) ? 0 : 0 // 单个来源失败不算脚本失败，由调用方决定
}
