const CATEGORIES = ['system', 'schedule', 'teaching', 'other']

// ── 回声洞 ─────────────────────────────────────────────────────────────
// 投稿走和「提交软件」同一条审核管道：
//   前端 POST { text } → 草稿 submissions/echo-<时间戳>.json →
//   create-review-issue.yml 开审核 Issue → 管理员打 approved →
//   review-submission.yml 写进 回声洞/messages/messageN.json（一条一个文件，前端 glob 读取）。
// 也就是说这个接口【只落草稿、不直接上线】；真正的发布在审核通过之后。
const ECHO_MAX_LEN = 200 // 与投稿框 maxlength 一致，服务端再兜一道
const ECHO_MARKER = '回声洞' // 草稿里的 _类型 标记，审核管道据此分流

// ── 反馈中心 ───────────────────────────────────────────────────────────
// 站点「反馈中心」（#/feedback）以前是让用户点开 GitHub 的 issues/new 自己填，
// 现在与「提交软件 / 回声洞」统一走这个 Worker：
//   前端 POST { kind, subKind, appId, title, detail, contact } →
//   草稿 submissions/feedback-<时间戳>-<随机>.json（_类型: 反馈）→
//   create-review-issue.yml 开一张带 `用户反馈` 等标签的 Issue，并顺手收起草稿。
// 与另外两条路由的区别：反馈【没有审核合并】这一步 —— Issue 本身就是它的终点，
// 所以草稿在 Issue 建出来的那一刻就完成了使命（由工作流删掉）。
const FEEDBACK_KINDS = ['report', 'suggestion']
const FEEDBACK_SUBKINDS = ['interaction', 'link', 'other']
const FEEDBACK_TITLE_MAX = 80
const FEEDBACK_DETAIL_MAX = 4000
const FEEDBACK_CONTACT_MAX = 4000
/** age 公钥加密后的 ASCII armor 开头。用来兜住「明文联系方式被误传上来」这种事故 ——
 *  联系方式只有维护者该看见，落进公开的 Issue 就再也收不回来了，宁可拒收。 */
const AGE_ARMOR_PREFIX = '-----BEGIN AGE ENCRYPTED FILE-----'

// ── 阿里云 OSS 直传 ────────────────────────────────────────────────────
// 投稿页的「上传软件文件 / 上传图标」不再经任何后端中转，改成浏览器直传 OSS：
//   前端 POST { name, size, contentType } → 这里签一个【有时效的 PUT 地址】 →
//   浏览器自己 PUT 到 OSS → 把公开直链填回表单。
//
// 为什么放在 Worker 里签，而不是把 AK/SK 写进前端：
//   本站前端是纯静态的公开站点，AK/SK 一旦进前端就等于公开，任何人都能往桶里灌数据刷流量费。
//   AK/SK 只以 Cloudflare Secret 形式存在（OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET），
//   前端拿到的只是一小时后过期、且只能写这一个对象的地址。
//
// 为什么必须用 V4 签名：
//   阿里云自 2025-09-01 起不再对【新建 Bucket】开放 V1 签名，本站这个桶是新的，
//   用 V1 会直接 SignatureDoesNotMatch。
//
// Content-Type 必须参与签名：预签名地址把请求形状锁死，浏览器 PUT 时一定会带
// Content-Type，这里签了哪个值前端就必须原样发哪个值（响应里回传给前端用）。
const OSS_ALGO = 'OSS4-HMAC-SHA256'
/** 签出来的上传地址有效期（秒）。OSS 只校验「请求到达时刻」，不限制传输时长，1 小时足够。 */
const OSS_SIGN_TTL = 3600
/** 服务端兜底的单文件上限：OSS 单次 PUT 硬上限 5 GB。 */
const OSS_MAX_BYTES = 2 * 1024 * 1024 * 1024
/** Content-Type 收敛成 `type/subtype`，不接受参数段（`;charset=…`）与任何引号，免得签出歧义 */
const CONTENT_TYPE_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/
const DEFAULT_CONTENT_TYPE = 'application/octet-stream'

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** RFC 3986 UriEncode：只放过 A-Za-z0-9-_.~ ，其余一律大写百分号编码 */
function uriEncode(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  )
}

function toHex(buffer) {
  const bytes = new Uint8Array(buffer)
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

async function hmacSha256(keyBytes, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const payload = typeof data === 'string' ? new TextEncoder().encode(data) : data
  return crypto.subtle.sign('HMAC', key, payload)
}

const textEncoder = new TextEncoder()

async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', textEncoder.encode(text)))
}

/** 文件名清洗：只用于拼对象键，路径分隔符 / 控制字符一律压掉 */
function ossSafeName(raw) {
  const base = String(raw || '')
    .replace(/^.*[\\/]/, '')
    .replace(/[\u0000-\u001f\u007f\\:*?"<>|]+/g, '_')
    .replace(/^\.+/, '')
    .trim()
  return (base || 'file').slice(0, 100)
}

/**
 * 用 V4 签名算法生成对象的上传地址。
 * 参考《在URL中包含V4签名》，CanonicalRequest 六行：
 *   PUT \n CanonicalURI \n CanonicalQueryString \n CanonicalHeaders \n AdditionalHeaders \n UNSIGNED-PAYLOAD
 */
async function ossPresignPut(env, key, contentType, expiresIn) {
  const bucket = String(env.OSS_BUCKET).trim()
  const region = String(env.OSS_REGION || 'cn-shanghai').trim()
  const endpoint = String(env.OSS_ENDPOINT || `oss-${region}.aliyuncs.com`).trim()
  const host = `${bucket}.${endpoint}`

  const now = new Date()
  const dateStr = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}`
  const amzDate = `${dateStr}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`

  const credentialScope = `${dateStr}/${region}/oss/aliyun_v4_request`
  const canonicalUri = `/${bucket}/${key.split('/').map(uriEncode).join('/')}`

  // 参与签名的额外头：content-type（浏览器必带）+ host（锁死域名，防止签好的地址被换域名复用）
  const additionalHeaders = 'content-type;host'

  const query = {
    'x-oss-additional-headers': additionalHeaders,
    'x-oss-credential': `${env.OSS_ACCESS_KEY_ID}/${credentialScope}`,
    'x-oss-date': amzDate,
    'x-oss-expires': String(expiresIn),
    'x-oss-signature-version': OSS_ALGO,
  }
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join('&')

  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    additionalHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = [
    OSS_ALGO,
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n')

  const secretBytes = textEncoder.encode(`aliyun_v4${env.OSS_ACCESS_KEY_SECRET}`)
  const kDate = await hmacSha256(secretBytes, dateStr)
  const kRegion = await hmacSha256(kDate, region)
  const kService = await hmacSha256(kRegion, 'oss')
  const kSigning = await hmacSha256(kService, 'aliyun_v4_request')
  const signature = toHex(await hmacSha256(kSigning, stringToSign))

  const signedQuery = `${canonicalQuery}&x-oss-signature=${signature}`
  return {
    url: `https://${host}/${key.split('/').map(uriEncode).join('/')}?${signedQuery}`,
    publicUrl: `${String(env.OSS_PUBLIC_BASE || `https://${host}`).replace(/\/+$/, '')}/${key
      .split('/')
      .map(uriEncode)
      .join('/')}`,
    host,
  }
}

/**
 * POST /api/oss-sign → 返回一个只能写单个对象的预签名 PUT 地址 + 上传后的公开直链。
 * 入参：{ name, size, contentType }
 */
async function handleOssSign(request, env) {
  let data
  try {
    data = await request.json()
  } catch {
    return json({ error: '请求格式错误' }, 400, request, env)
  }

  if (!env.OSS_BUCKET || !env.OSS_ACCESS_KEY_ID || !env.OSS_ACCESS_KEY_SECRET) {
    return json({ error: '上传服务未配置' }, 503, request, env)
  }

  const size = Number(data?.size)
  if (!Number.isFinite(size) || size <= 0) {
    return json({ error: '缺少文件大小' }, 400, request, env)
  }
  if (size > OSS_MAX_BYTES) {
    return json({ error: '文件太大' }, 413, request, env)
  }

  // Content-Type 只接受干净的 type/subtype，其余一律按未知类型处理（签名值由本服务定，前端照抄）
  const rawType = String(data?.contentType || '').trim().toLowerCase().split(';')[0].trim()
  const contentType = CONTENT_TYPE_RE.test(rawType) ? rawType : DEFAULT_CONTENT_TYPE

  const now = new Date()
  const stamp = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}`
  const uniq = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const prefix = String(env.OSS_PREFIX || 'upload').replace(/^\/+|\/+$/g, '')
  const key = `${prefix}/${stamp.slice(0, 4)}/${stamp.slice(4, 6)}/${uniq}-${ossSafeName(data?.name)}`

  try {
    const signed = await ossPresignPut(env, key, contentType, OSS_SIGN_TTL)
    return json(
      {
        success: true,
        url: signed.url,
        publicUrl: signed.publicUrl,
        key,
        contentType,
        expiresIn: OSS_SIGN_TTL,
        maxBytes: OSS_MAX_BYTES,
      },
      200,
      request,
      env
    )
  } catch (err) {
    console.error('oss sign error:', err && err.message)
    return json({ error: '签发上传地址失败' }, 500, request, env)
  }
}

function getOrigin(request, env) {
  const raw = (env.ALLOWED_ORIGIN || '').trim()
  if (!raw) return '*'

  const list = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (list.includes('*')) return '*'

  const origin = request.headers.get('Origin') || ''
  return list.includes(origin) ? origin : ''
}

function corsHeaders(request, env) {
  const origin = getOrigin(request, env)
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
  if (origin) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

function json(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) },
  })
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/')
}

/** 写仓库用的公共请求头（handleSubmit 与 handleEchoCave 共用） */
function githubHeaders(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'classsoftwarehub-worker',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function validate(d) {
  const errors = []
  const idRegex = /^[a-z0-9-]+$/

  if (!d.id || !idRegex.test(d.id)) errors.push('id 只能用小写英文、数字、短横线')
  if (d.id && d.id.length > 60) errors.push('id 太长')
  if (!d.name) errors.push('缺少软件名称')
  if (!d.category) errors.push('缺少分类')
  if (d.category && !CATEGORIES.includes(d.category)) errors.push('分类不合法')
  if (!d.tagline) errors.push('缺少一句话简介')
  if (!d.description) errors.push('缺少详细介绍')

  if (d.downloads && !Array.isArray(d.downloads)) errors.push('downloads 必须是数组')

  for (const key of ['icon', 'website', 'github', 'store']) {
    if (d[key] && typeof d[key] === 'string' && !/^https?:\/\//.test(d[key])) {
      errors.push(`${key} 必须以 http:// 或 https:// 开头`)
    }
  }

  return errors
}

async function handleSubmit(request, env) {
  let data
  try {
    data = await request.json()
  } catch {
    return json({ error: '请求格式错误' }, 400, request, env)
  }

  const errors = validate(data)
  if (errors.length) return json({ error: errors.join('；') }, 400, request, env)

  const timestamp = Date.now()
  const filePath = `submissions/${data.id}-${timestamp}.json`
  const apiBase = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents`
  const headers = githubHeaders(env)

  const appsPath = `软件数据/apps/${data.id}.json`
  const appsCheckRes = await fetch(
    `${apiBase}/${encodePath(appsPath)}?ref=${env.GITHUB_BRANCH}`,
    { headers }
  )
  const idAlreadyExists = appsCheckRes.ok

  const downloads = (data.downloads || [])
    .filter(x => x && x.url)
    .map(x => {
      const item = { platform: x.platform || '' }
      if (x.note) item.note = x.note
      if (x.size) item.size = x.size
      // 校验值（选填，纯十六进制、算法按位数识别）：提交页填了就必须原样带进草稿，
      // 否则审核写回的数据缺这一段，详情页也就不会显示校验值。
      // 这里再过滤一次只留十六进制 —— 提交服务是公开接口，不能照单全收。
      const hash = typeof x.hash === 'string' ? x.hash.replace(/[^0-9a-f]/gi, '').toLowerCase() : ''
      if (hash) item.hash = hash
      item.url = x.url
      return item
    })

  const fileContent = {
    id: data.id,
    name: data.name,
    icon: data.icon || '',
    category: data.category,
    tagline: data.tagline,
    description: data.description,
    version: data.version || '',
    size: data.size || '',
    system: data.system || '',
    website: data.website || '',
    github: data.github || '',
    downloads,
    sort: typeof data.sort === 'number' ? data.sort : 99,
  }
  if (data.notice) fileContent.notice = data.notice
  if (data.store) fileContent.store = data.store
  if (data.维护备注) fileContent['维护备注'] = data.维护备注

  const submissionContent = {
    _提交时间: new Date(timestamp).toISOString(),
    _原始ID冲突: idAlreadyExists,
    ...fileContent,
  }

  // 审核用元数据一律以 `_` 开头（提交页必填的「联系方式」就是 `_联系方式`）。上面那段
  // 是按字段白名单重建 JSON 的，入参里的 `_` 键会被整个漏掉 —— 曾导致审核 Issue 里
  // 「联系方式」显示成「未填写」。这里按前缀把入参的 `_` 键原样带回：不逐个列举，
  // 以后再加审核字段也不用动这个服务。
  // 服务自己写的 `_提交时间` / `_原始ID冲突` 已经存在，不允许被入参覆盖。
  for (const key of Object.keys(data)) {
    if (!key.startsWith('_') || key in submissionContent) continue
    const value = data[key]
    if (typeof value === 'string') {
      if (value.trim()) submissionContent[key] = value.trim().slice(0, 300)
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      submissionContent[key] = value
    }
  }

  const content = JSON.stringify(submissionContent, null, 2)

  const createRes = await fetch(`${apiBase}/${encodePath(filePath)}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `submit: ${data.name} (${data.id})`,
      content: toBase64(content),
      branch: env.GITHUB_BRANCH,
    }),
  })

  if (!createRes.ok) {
    const errText = await createRes.text()
    console.error('GitHub API error:', createRes.status, errText)
    return json({ error: '提交失败，请稍后再试' }, 500, request, env)
  }

  return json({
    success: true,
    message: idAlreadyExists
      ? '提交成功！该 ID 已存在，管理员审核后会处理。'
      : '提交成功！管理员审核通过后会自动上线。',
  }, 200, request, env)
}

/**
 * 回声洞投稿：POST { text } → 落到审核草稿 submissions/echo-<时间戳>.json。
 * 与「提交软件」共用同一条审核管道（create-review-issue.yml 开 Issue，
 * review-submission.yml 打 approved 才写进 回声洞/messages/）——本接口不直接上线。
 */
async function handleEchoCave(request, env) {
  let data
  try {
    data = await request.json()
  } catch {
    return json({ error: '请求格式错误' }, 400, request, env)
  }

  const text = typeof data?.text === 'string' ? data.text.trim() : ''
  if (!text) return json({ error: '先写一句话再投稿吧。' }, 400, request, env)
  if (text.length > ECHO_MAX_LEN) {
    return json({ error: `字条太长啦，最多 ${ECHO_MAX_LEN} 个字。` }, 400, request, env)
  }

  const apiBase = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents`
  const headers = githubHeaders(env)

  // 草稿名带时间戳 + 随机后缀：同一毫秒的两次投稿也不会撞车（审核管道认文件路径判重）
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const filePath = `submissions/echo-${stamp}.json`
  const content =
    JSON.stringify(
      { _类型: ECHO_MARKER, text, _提交时间: new Date().toISOString() },
      null,
      2
    ) + '\n'

  const createRes = await fetch(`${apiBase}/${encodePath(filePath)}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'submit: 回声洞字条',
      content: toBase64(content),
      branch: env.GITHUB_BRANCH,
    }),
  })

  if (!createRes.ok) {
    console.error('echo draft error:', createRes.status, await createRes.text())
    return json({ error: '投稿失败，请稍后再试' }, 500, request, env)
  }

  return json(
    { success: true, message: '投稿成功！审核通过后会出现在回声洞里。' },
    200,
    request,
    env
  )
}

/**
 * 反馈中心：POST { kind, subKind, appId, title, detail, contact }
 * → 落到草稿 submissions/feedback-<时间戳>-<随机>.json（`_类型: "反馈"`）。
 * create-review-issue.yml 据此开一张带 `用户反馈` / `报告问题` / `链接失效` … 标签的
 * Issue 并把草稿收起；反馈没有「合并进仓库数据」这一步，所以这里不为审核结果多做约定。
 * 字段名与 src/gallery/feedback.ts 的 FeedbackDraft 一一对应（kind / subKind / appId /
 * title / detail / contact），前端不必为接口另造一份形状。
 */
async function handleFeedback(request, env) {
  let data
  try {
    data = await request.json()
  } catch {
    return json({ error: '请求格式错误' }, 400, request, env)
  }

  const str = (value) => (typeof value === 'string' ? value.trim() : '')
  const kind = str(data?.kind)
  const subKind = str(data?.subKind)
  const appId = str(data?.appId)
  // 标题会同时进 Issue 标题和 Markdown 正文：把其中的换行压成空格，否则标题会被撑成两行
  const title = str(data?.title).replace(/\s+/g, ' ')
  const detail = str(data?.detail)
  const contact = str(data?.contact) // 前端已用 age 公钥加密，这里只当不透明字符串搬运

  if (!FEEDBACK_KINDS.includes(kind)) {
    return json({ error: '请选择反馈类型' }, 400, request, env)
  }
  if (kind === 'report' && !FEEDBACK_SUBKINDS.includes(subKind)) {
    return json({ error: '请选择问题类型' }, 400, request, env)
  }
  if (!title) return json({ error: '请填写标题' }, 400, request, env)
  if (title.length > FEEDBACK_TITLE_MAX) {
    return json({ error: `标题太长啦，最多 ${FEEDBACK_TITLE_MAX} 个字。` }, 400, request, env)
  }
  if (!detail) return json({ error: '请填写详细描述' }, 400, request, env)
  if (detail.length > FEEDBACK_DETAIL_MAX) {
    return json({ error: `描述太长啦，最多 ${FEEDBACK_DETAIL_MAX} 个字。` }, 400, request, env)
  }
  // 软件 id 只是用于在 Issue 里写一行「涉及软件」，但仍按站点 id 约定卡死字符集，
  // 免得它被当成路径或标记塞进仓库
  if (appId && !/^[a-z0-9-]{1,60}$/.test(appId)) {
    return json({ error: '涉及的软件 ID 不合法' }, 400, request, env)
  }
  if (contact.length > FEEDBACK_CONTACT_MAX) {
    return json({ error: '联系方式太长啦。' }, 400, request, env)
  }
  // ⛔ 只收 age 密文。明文宁可拒收也不落进公开的 Issue —— 密文形状不对同样视为异常。
  if (contact && !contact.startsWith(AGE_ARMOR_PREFIX)) {
    return json({ error: '联系方式必须先在本地加密后再提交' }, 400, request, env)
  }

  const draft = {
    _类型: '反馈',
    kind,
    subKind: kind === 'report' ? subKind : '',
    appId,
    title,
    detail,
  }
  if (contact) draft.contact = contact
  draft._提交时间 = new Date().toISOString()

  const apiBase = `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents`
  const headers = githubHeaders(env)
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const filePath = `submissions/feedback-${stamp}.json`
  const content = JSON.stringify(draft, null, 2) + '\n'

  const createRes = await fetch(`${apiBase}/${encodePath(filePath)}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `submit: 反馈 ${title.slice(0, 40)}`,
      content: toBase64(content),
      branch: env.GITHUB_BRANCH,
    }),
  })

  if (!createRes.ok) {
    console.error('feedback draft error:', createRes.status, await createRes.text())
    return json({ error: '提交失败，请稍后再试' }, 500, request, env)
  }

  return json(
    { success: true, message: '反馈已提交！会尽快出现在公开议题列表里。' },
    200,
    request,
    env
  )
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request, env) })
    }

    const url = new URL(request.url)
    if (url.pathname === '/api/submit' && request.method === 'POST') {
      return handleSubmit(request, env)
    }
    if (url.pathname === '/api/echocave' && request.method === 'POST') {
      return handleEchoCave(request, env)
    }
    if (url.pathname === '/api/feedback' && request.method === 'POST') {
      return handleFeedback(request, env)
    }
    if (url.pathname === '/api/oss-sign' && request.method === 'POST') {
      return handleOssSign(request, env)
    }

    return json({ error: 'Not Found' }, 404, request, env)
  },
}
