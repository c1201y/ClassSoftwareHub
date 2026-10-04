const CATEGORIES = ['system', 'schedule', 'teaching', 'other']

// ── 回声洞 ─────────────────────────────────────────────────────────────
// 投稿走和「提交软件」同一条审核管道：
//   前端 POST { text } → 草稿 submissions/echo-<时间戳>.json →
//   create-review-issue.yml 开审核 Issue → 管理员打 approved →
//   review-submission.yml 写进 回声洞/messages/messageN.json（一条一个文件，前端 glob 读取）。
// 也就是说这个接口【只落草稿、不直接上线】；真正的发布在审核通过之后。
const ECHO_MAX_LEN = 200 // 与投稿框 maxlength 一致，服务端再兜一道
const ECHO_MARKER = '回声洞' // 草稿里的 _类型 标记，审核管道据此分流

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

    return json({ error: 'Not Found' }, 404, request, env)
  },
}
