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
import { connect } from 'cloudflare:sockets'

const OSS_ALGO = 'OSS4-HMAC-SHA256'
/** 签出来的上传地址有效期（秒）。OSS 只校验「请求到达时刻」，不限制传输时长，1 小时足够。 */
const OSS_SIGN_TTL = 3600
/**
 * 服务端兜底的单文件上限：2.5 GB（与前端 src/gallery/ossUpload.ts 的 UPLOAD_MAX_BYTES 同口径）。
 * 为什么不再放到 4 GB：这条链路的成本是「存储费 + 下行流量费」，而超过 2.5 GB 的产物
 * （超大型游戏、整套离线镜像）几乎总能找到官方直链 —— 让用户填官网 / GitHub Releases 更划算，
 * 也免了「一次 PUT 传到 90% 断网、从头再来」这种必然的客诉。
 */
const OSS_MAX_BYTES = 2.5 * 1024 * 1024 * 1024

/* ── /api/oss-sign 签发限流 ────────────────────────────────────────
 * 这个接口不需要登录就能换到一条预签名 PUT 地址，本身就是「免费上传通道」。
 * 限流不能根治（真正的兜底是下面的孤儿回收：传了没提交的 15 分钟就删），但必须把
 * 「一个人能灌多少」和「一天总共能灌多少」按住 —— 否则存储费/流量费是站长替攻击者买单。
 *
 * ⚠️ 申报体积（`size`）不可信：预签名 PUT 不带 content-length 约束，攻击者可以申报 1 字节
 *    再传满 5 GB。所以体积只作粗粒度阀门，真正的红线是**次数**。
 */
const SIGN_PER_IP_PER_DAY = 20
const SIGN_GLOBAL_PER_DAY = 3000
const SIGN_GLOBAL_BYTES_PER_DAY = 20 * 1024 * 1024 * 1024
/** 限流计数在 DO 里的键前缀（一天一个键，不做定时任务也能自然收敛） */
const SIGN_DAY_KEY_PREFIX = 'sg:'
/* ── 下载闸门（/api/dl-ticket + /api/dl）─────────────────────────────
 * 桶是私有的，浏览器拿不到直链；中继令牌也绝不发给前端。
 * 前端拿「设备指纹」换一张 15 分钟票据 → 用票据请求 /api/dl，
 * Worker 在服务端带令牌、走原生 TCP 向 ECS 中继取流并原样转发。
 */
/** 票据有效期（秒） */
const DL_TICKET_TTL = 900
/** 每台设备每天最多能领多少张下载票据（与签发限流同量级：一台设备一天下不完 25 个自制软件） */
const DL_DAILY_LIMIT = 25
/** 允许用同名环境变量覆盖（改了要重新部署），没设就用上面的常量 */
function dlDailyLimit(env) {
  return pickNum(null, env && env.DL_DAILY_LIMIT, DL_DAILY_LIMIT)
}
/**
 * 允许下载的对象键前缀。
 *   upload/   —— 投稿直传，**待审核**状态，没通过审核的东西不该被长期引用；
 *   releases/ —— 审核通过后由 /api/promote 从 upload/ 复制过来的正式副本；
 *   soft/     —— 历史上直接传到桶里的对象（早于直传链路），仍在用，不能拒。
 */
const DL_KEY_PREFIX = /^(?:upload|soft|releases)\//
/** 正式发布前缀：审核通过后对象从 upload/ 迁到这里（存储费一分不省，纯粹是目录语义） */
const RELEASE_PREFIX = 'releases'
/** 中继监听端口（默认 8091） */
const DL_RELAY_PORT = 8091
/* ── 双通道取回 ────────────────────────────────────────────────────
 * 同一个对象有两条互不相干的取回路径，各自吃一份「免费额度」，谁先用满就换另一条：
 *
 *   relay  —— Worker 走原生 TCP 找 ECS 中继，中继再用 OSS **内网**端点取对象：
 *             OSS 侧零流量费，代价记在 ECS 的公网带宽上。
 *   direct —— Worker 直接签一条**短时 OSS 预签名 GET 直链**交给浏览器，
 *             浏览器自己去 OSS 取，全程不经过 ECS（省下那条带宽），代价记在 OSS 出网上。
 *
 * auto 模式下的取舍：默认先用 relay；若 relay 月度额度用满、或探活失败，就降级到 direct。
 * 额度只在换票时按登记表里的体积估算 —— 用来分流够用，不追求账本级精确。
 */
/** 取回通道：relay / direct / auto（不设则 auto）。运行时可被 /api/dl-mode 覆盖（存在 DO 里）。 */
const DL_MODE_DEFAULT = 'auto'
/* ── direct 直链的有效期按体积分层 ──────────────────────────────────
 * 先说清一个常被误解的点：OSS 预签名只在「请求到达那一刻」校验一次，点开之后流式传完，
 * 中途不会被踢。所以这张表管的不是「传一半会不会断」，而是两件事：
 *   ① 断点续传 / 中断后重新点开，要再发一次请求，那时 URL 不能已经过期；
 *   ② 直链**不绑设备指纹**，窗口越短，「地址被转手」能用的时间就越短。
 * 小文件给 5 分钟就够（秒开秒完），大文件才需要半小时的窗口。
 */
const DIRECT_TTL_TIERS = [
  [50 * 1024 * 1024, 300],
  [250 * 1024 * 1024, 900],
  [1024 * 1024 * 1024, 1200],
  [Infinity, 1800],
]

/**
 * 按对象体积取 direct 直链的有效期（秒）。
 * ⚠️ **体积未知（登记表里没这条，size=0）时给最长那一档**，不能当成"小文件"：
 *    把它当 0 字节就会只给 5 分钟，一个 4 GB 的老对象刚点开就过期 —— 宁长勿短。
 */
function directTtlFor(size) {
  const max = DIRECT_TTL_TIERS[DIRECT_TTL_TIERS.length - 1][1]
  const n = Number(size) || 0
  if (n <= 0) return max
  for (const [limit, ttl] of DIRECT_TTL_TIERS) if (n <= limit) return ttl
  return max
}

/* ── 孤儿对象回收（scheduled cron）──────────────────────────────────
 * 场景：访客在投稿页传完文件，却**没点提交**（改主意了 / 关掉页面了）。
 * 对象已经躺在桶里，会一直产生存储费，也没有任何 Issue 引用它。
 *
 * 判据是「三件事同时成立」，缺一不可：
 *   ① 登记表里有这条（= 是我们亲手签出去的对象，不是历史遗留、不是别人塞的）；
 *   ② claimed 为空（= 没有哪次 /api/submit 引用过它）；
 *   ③ synced 为空（= 不是 /api/registry-sync 事后补登的）且 超过 GC_ORPHAN_MINUTES 分钟没提交。
 *
 * ⚠️ 时间基准用**桶里的 lastModified（上传完成时刻）**，不是签发时刻：
 *    一个 3 GB 的包光上传就可能要 20 分钟，拿签发时刻当基准会在传的过程中把它删掉。
 */
const GC_ORPHAN_MINUTES = 15
/** 一次 cron 最多删多少个。突然冒出几百个候选说明多半是判据出问题了，宁可停下也不清场。 */
const GC_MAX_DELETE = 100
/**
 * 「登记了、但桶里根本没有这个对象」的记录，超过这么久就丢掉。
 *
 * 为什么需要它：签发上传地址时会先记一笔（用来估体积、判定是不是孤儿）。如果用户签完
 * 名却没真传（关页面 / 网络断在 PUT 之前），或对象被别的方式删掉了，这条记录就永远
 * 卡在「待认领」状态 —— 孤儿回收只看**桶里存在的对象**，根本轮不到它。
 * 结果就是 `pending` 这个观测指标只涨不落，慢慢变成纯噪声。
 *
 * 24 小时是刻意的宽限：一个 2.5 GB 的包在慢链路上传几个小时都正常，不能因为
 * 「现在还没看到」就把记录当成垃圾扔掉。
 */
const GC_STALE_RECORD_HOURS = 24
/** 登记表与用量计数所在的固定 DO 实例名（设备计数用指纹，这里用常量） */
const REGISTRY_ID = '__index__'
/** DO storage 里登记表的键前缀 */
const FILE_KEY_PREFIX = 'f:'
/** DO storage 里月度用量计数的键前缀 */
const BYTES_KEY_PREFIX = 'm:'
/** DO storage 里运行时配置的键（目前只存取回通道 mode） */
const CFG_KEY = 'cfg'
/** 登记表一次最多列这么多条（翻页靠 marker，够这个体量用） */
const FILE_LIST_MAX = 1000
/**
 * 一次「按目录清」最多删多少个。
 * 每个 DELETE 都是一次 TCP 往返，几百个叠起来能把一次请求拖到几十秒 —— 与其闷头删
 * 半小时让人以为是卡住了，不如提前说清楚「这个前缀下有 N 个，超过上限」。
 */
const MAX_PURGE_BATCH = 200
/** 图标对象前缀：小图走公开只读端点 /api/icon，不进下载闸门 */
const ICON_PREFIX = 'icon'
/** 图标体积上限：只读公开，必须防着有人往这个前缀里塞大文件刷流量 */
const ICON_MAX_BYTES = 5 * 1024 * 1024
/**
 * 签发上传地址时就卡住的图标上限。
 *
 * 比上面那条「读取上限」紧得多，是因为图标在站内只以 44 / 72 px 的磁贴出现：
 * 一张 2 MB 的原图换不来任何清晰度，只会让每个访客都白等一次。前端会先在本地
 * 缩到 128 px 再传，这里是不信前端的兜底。
 */
const ICON_SIGN_MAX_BYTES = 1024 * 1024
/**
 * `/api/icon` 在 Cloudflare 边缘缓存多久（秒）。
 *
 * 必须自己做这一层：**Cloudflare 不会自动缓存 Worker 直接返回的响应**，
 * 于是每个访客、每次浏览都会打回 ECS 中继取一遍图标 —— 纯粹白烧中转的出网流量。
 * 图标键里带日期与随机串（`icon/2026/10/<随机>-<名字>`），内容一旦写入就不再变，
 * 所以可以放心按「不可变」长缓存。
 */
const ICON_EDGE_TTL = 604800

/** Content-Type 收敛成 `type/subtype`，不接受参数段（`;charset=…`）与任何引号，免得签出歧义 */
const CONTENT_TYPE_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/
const DEFAULT_CONTENT_TYPE = 'application/octet-stream'

/* ── 投稿准入（防审核队列被垃圾灌满）───────────────────────────────
 * /api/submit 是匿名开放的：没有登录、没有验证码，所以挡批量投稿只能靠行为特征。
 * 这三条阈值和开关都能在线改（DO 的 cfg），不用重新部署。
 */
/** 单个软件最多几个下载项（与前端 SubmitPage.vue 的 MAX_DOWNLOADS 同口径） */
const MAX_DOWNLOADS_PER_APP = 5
/** 必须带本站上传的附件、或填了 GitHub 仓库，才受理（false 可关闭这道门槛） */
const SUBMIT_REQUIRE_SOURCE = true
/** 同一投稿人同时最多挂几个「待审核」Issue */
const SUBMIT_MAX_PENDING = 3
/** 同一投稿人在一个滑动窗口内最多提交几次，挡「一秒灌 100 个」 */
const SUBMIT_MAX_PER_DAY = 6
/** 上面那个滑动窗口的长度 */
const SUBMIT_WINDOW_MS = 24 * 3600 * 1000
/** DO storage 里投稿限流计数的键前缀 */
const SUBMIT_KEY_PREFIX = 's:'

// ── 教室喊话（/api/announce/send + /api/announce/poll + /api/announce/list）──
// 桌面端（ClassSoftwareHub Win7/Win10 版）在教室机上开启后按 30s 轮询 poll；
// 老师（手机浏览器）在站点「教室喊话」页输入 6 位配对码 + 一句话发送。
// 状态全部落在 DownloadGate 的 __announce__ 固定实例（键前缀 ann:）——
// 不新开 DO 类，省一次迁移声明（见 DownloadGate 类头注释）。
// 消息消费即删 + TTL 兜底，服务端不留存任何喊话内容。
/** 喊话状态专用的固定 DO 实例名（一个实例串行读写，天然免并发竞争） */
const ANN_ID = '__announce__'
/** 配对码 → 设备注册表的键前缀（值 = { deviceId: { t: 最近轮询时刻, n: 机器名 } }，轮询续期，超期剪枝） */
const ANN_BIND_PREFIX = 'ann:d:'
/** 配对码 → 当前待播消息的键前缀（一次一条，新的顶掉旧的；consumed 记已取走的设备） */
const ANN_MSG_PREFIX = 'ann:m:'
/** 发送限流计数的键前缀（键里存最近一次发送时刻，窗口外即放行） */
const ANN_RL_PREFIX = 'ann:r:'
/** 喊话正文的字节上限（字符数，服务端再兜一道） */
const ANN_TEXT_MAX = 100
/** 署名长度上限 */
const ANN_FROM_MAX = 20
/** 消息存活秒数（全员取走即提前删；TTL 是兜底，须盖过最长退避间隔 120s） */
const ANN_TTL = 180
/** 设备注册有效期（秒）：超过这么久没轮询的设备从注册表剪枝；配对码下无设备则拒发 */
const ANN_BIND_TTL = 12 * 3600
/** 发送限流窗口（毫秒）：同一配对码两次发送至少间隔这么久 */
const ANN_RATE_MS = 10 * 1000
/** 弹窗停留秒数的取值范围 */
const ANN_DURATION_MIN = 10
const ANN_DURATION_MAX = 120
const ANN_DURATION_DEFAULT = 30

/**
 * 文件名里一律不该出现的字符：控制字符、Unicode 双向覆写（能把 exe 显示成 xep）、
 * 零宽字符、以及 Windows 上的非法字符。
 */
/**
 * 文件名的禁用字符。除了路径分隔符 / 保留字符 / 控制符，这里**必须**去掉 `%` 和 `#`：
 * 对象键在数据里写成 `oss://<key>`，而读回来时要先 `.split(/[?#]/)[0]` 再 `decodeURIComponent`
 * —— 键里带 `#` 会被截断、带 `%` 会让解码抛 URIError。上传时文件名完全合法（`50%off.exe`、
 * `a#b.exe`），下载按钮却永久失效。发布前就归一化掉，比事后在三处补救可靠。
 */
const UNSAFE_NAME_RE = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\\:*?"<>|%#]+/g

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

/**
 * 文件名清洗：只用于拼对象键。
 *
 * 顺序要紧：**先取 basename**，`../../etc/passwd` 这种就只剩 `passwd`；再去掉控制字符、
 * 双向覆写 / 零宽字符（它们在文件名里唯一的作用就是骗人）、折叠连续点（不留 `..` 语义）、
 * 去掉结尾的点和空格（Windows 上会被静默吞掉，和桶里的键就对不上了）。
 */
function ossSafeName(raw) {
  const base = String(raw || '')
    .replace(/^.*[\\/]/, '')
    .replace(UNSAFE_NAME_RE, '_')
    .replace(/^\.+/, '')
    .replace(/\.{2,}/g, '.')
    .replace(/[ .]+$/, '')
    .trim()
  return (base || 'file').slice(0, 100)
}

/**
 * 用户自由文本落库前的清洗。
 *
 * 为什么要做：这些字符串会一路流进「审核 Issue 的正文」和「最终写进仓库的 JSON」，
 * 而 Issue 正文是 Markdown。控制字符（日志/终端注入）、Unicode 双向覆写字符、零宽字符
 * 在这里没有任何正当用途，一律删掉；换行保留（详细介绍要多段），但连续空行压成一段，
 * 免得有人用几千个空行把 Issue 撑爆。
 * Markdown 的元字符（反引号 / 竖线 / HTML 尖括号）不在这里处理 —— 那是**渲染**问题，
 * 由生成 Issue 正文的工作流统一转义（见 create-review-issue.yml 的 mdSafe）。
 */
function cleanText(raw, max) {
  const s = String(raw ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return typeof max === 'number' ? s.slice(0, max) : s
}

/**
 * 按魔数认图片格式，**只认位图**。
 *
 * SVG / HTML / XML 一律返回空串：它们能在某些上下文里跑脚本，而这条链路
 * （Issue 正文直贴、<img> 引用、边缘缓存）没有任何一处需要矢量图，所以干脆不收。
 */
function sniffImage(bytes) {
  const b = new Uint8Array(bytes)
  // 越界的比较自然为 false，所以各分支不必再单独判长度
  const at = (i, arr) => arr.every((v, k) => b[i + k] === v)
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (at(0, [0x47, 0x49, 0x46, 0x38])) return 'image/gif'
  if (at(0, [0x42, 0x4d])) return 'image/bmp'
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp'
  if (at(0, [0x00, 0x00, 0x01, 0x00])) return 'image/x-icon'
  return ''
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

  // 参与签名的额外头：这里只订 host（锁死域名，防止签好的地址被换域名复用）。
  // Content-Type 不能写进来 —— 它本就「存在即自动参与签名」，写进 x-oss-additional-headers
  // 反而会让 Additional Headers 那一行多一个值而对不上（官方 SDK 的 fixAdditionalHeaders
  // 就是显式把 content-type / content-md5 / x-oss-* 过滤掉的）。
  const additionalHeaders = 'host'

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
 * 生成对象的**下载**地址（V4 预签名 GET）。
 *
 * 与上传版的差别有三处：方法换成 GET、CanonicalHeaders 只剩 host（GET 不订 content-type）、
 * 额外把 `response-content-disposition` 一起签进查询串 —— 这是 OSS 支持的子资源，
 * 会让 OSS 自己在响应里带上保存名，等于「直链」也具备下载语义。
 *
 * 这条地址就是**直连通道**：浏览器拿着它直接去 OSS 取，Worker 与 ECS 都不在链路上。
 * 所以有效期必须短（跟票据同寿 15 分钟），否则被转发出去就是一条长期有效的公开直链。
 */
async function ossPresignGet(env, key, expiresIn, fileName) {
  const bucket = String(env.OSS_BUCKET).trim()
  const region = String(env.OSS_REGION || 'cn-shanghai').trim()
  const endpoint = String(env.OSS_ENDPOINT || `oss-${region}.aliyuncs.com`).trim()
  const host = `${bucket}.${endpoint}`

  const now = new Date()
  const dateStr = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}`
  const amzDate = `${dateStr}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`
  const credentialScope = `${dateStr}/${region}/oss/aliyun_v4_request`

  const query = {
    'x-oss-additional-headers': 'host',
    'x-oss-credential': `${env.OSS_ACCESS_KEY_ID}/${credentialScope}`,
    'x-oss-date': amzDate,
    'x-oss-expires': String(expiresIn),
    'x-oss-signature-version': OSS_ALGO,
  }
  if (fileName) {
    query['response-content-disposition'] =
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`
  }
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join('&')

  const canonicalUri = `/${bucket}/${key.split('/').map(uriEncode).join('/')}`
  const canonicalHeaders = `host:${host}\n`
  const additionalHeaders = 'host'
  const canonicalRequest = [
    'GET',
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

  return `https://${host}/${key.split('/').map(uriEncode).join('/')}?${canonicalQuery}&x-oss-signature=${signature}`
}

/* ── 对象登记表 ────────────────────────────────────────────────────
 * 把「我们亲手签出去过的每一个对象键」记一份，供三件事用：
 *   ① 审核不通过时按投稿的 issue 号反查该删哪些对象（不用只靠 JSON 里抠出来的地址）；
 *   ② 换票时知道对象体积，好按月度额度在 relay / direct 两条通道之间分流；
 *   ③ 站长随时列一下桶里到底有什么、各自多大、谁传的。
 *
 * 存在 DownloadGate 这个 DO 的固定实例上（KEY 前缀 f:）—— 与设备计数同一个类，
 * 不必再开一次 Durable Object 迁移。
 *
 * 登记是**尽力而为**：登记表挂了绝不能让上传/下载跟着挂，所以这里把异常全吞掉，
 * 调用点也一律不 await 它的失败。
 */
async function registryOp(env, payload) {
  if (!env.DL_GATE) return null
  try {
    const id = env.DL_GATE.idFromName(REGISTRY_ID)
    const res = await env.DL_GATE.get(id).fetch('https://dl-gate/op', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return await res.json()
  } catch (err) {
    console.error('registry op error:', err && err.message)
    return null
  }
}

/** 记一条对象（同键重复登记视为覆盖更新） */
function registryPut(env, record) {
  return registryOp(env, { op: 'file-put', record })
}

/** 取一条对象的登记信息（换票时用来估体积） */
async function registryGet(env, key) {
  const out = await registryOp(env, { op: 'file-get', key })
  return (out && out.file) || null
}

/**
 * 认领：把一批对象键标记为「已被某次提交引用」。
 *
 * 这是孤儿回收的**唯一免死金牌**。投稿页的流程是「先传文件、再填表、最后提交」，
 * 中间可能隔着很久；`/api/submit` 一成功就立刻认领，于是哪怕审核要等几天，
 * 这些对象也不会被 cron 当成「没提交的垃圾」删掉。
 */
function registryClaim(env, keys) {
  const list = [...new Set((keys || []).filter(Boolean))]
  if (!list.length) return null
  return registryOp(env, { op: 'file-claim', keys: list })
}

/** 列出「登记过、但从来没被认领过」的对象（孤儿回收的候选池） */
async function registryUnclaimed(env) {
  const out = await registryOp(env, { op: 'unclaimed-list' })
  return out && Array.isArray(out.files) ? out.files : null
}

/** 运行时配置（目前只有取回通道） */
async function registryCfgGet(env) {
  const out = await registryOp(env, { op: 'cfg-get' })
  return (out && out.cfg) || null
}

function registryCfgSet(env, patch) {
  return registryOp(env, { op: 'cfg-set', cfg: patch })
}

/**
 * 从一条下载项 / 图标的写法里反解出桶对象键。
 *
 * 数据里本站对象只有两种写法（与前端 src/gallery/ossDownload.ts、工作流的
 * `ossKeyOfUrl` 三处保持一致 —— 改一处必须同步另两处）：
 *   `oss://upload/…`                      软件包
 *   `https://<域名>/api/icon?k=icon/…`     图标
 * 网盘 / 官网直链不是我们的对象，一律返回空串，绝不能去删。
 */
function ossKeyOfUrl(url) {
  const raw = String(url ?? '').trim()
  if (!raw) return ''
  const key = (() => {
    const m = /^oss:\/\/(.+)$/i.exec(raw)
    if (m) {
      const body = m[1].split(/[?#]/)[0].replace(/^\/+/, '')
      // 投稿人可以随便写 `oss://%`。解码失败绝不能把调用方（提交校验 / 审核清理）炸掉：
      // 解不出来就当「不是我们的对象」，返回空串即可。
      try {
        return decodeURIComponent(body)
      } catch {
        return ''
      }
    }
    try {
      const u = new URL(raw)
      if (u.pathname === '/api/icon' || u.pathname === '/api/dl') {
        return u.searchParams.get('k') || ''
      }
    } catch {
      // 不是合法 URL，按「不是我们的对象」处理
    }
    return ''
  })()
  // 只放行「形状正常」的键：`..`、反斜杠、控制字符这种畸形键不可能对应真实对象，
  // 提前挡掉可以省一次 DO 往返，也避免畸形串进日志。
  if (!key || key.includes('..') || /[\u0000-\u001f\u007f\\]/.test(key)) return ''
  return key
}

/** 一份投稿数据引用到的所有桶对象键（图标 + 各下载项），去重后返回 */
function collectOssKeys(data) {
  const keys = [ossKeyOfUrl(data?.icon)]
  for (const item of Array.isArray(data?.downloads) ? data.downloads : []) {
    keys.push(ossKeyOfUrl(item?.url))
  }
  return [...new Set(keys.filter(Boolean))]
}

/** 取值优先级：DO 运行时配置 > 环境变量 > 代码常量（前两者为空/非法就往下掉） */
function pickNum(cfgValue, envValue, fallback) {
  for (const v of [cfgValue, envValue]) {
    if (v === null || v === undefined || v === '') continue
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function pickBool(cfgValue, envValue, fallback) {
  for (const v of [cfgValue, envValue]) {
    if (v === true || v === 'true' || v === 1 || v === '1') return true
    if (v === false || v === 'false' || v === 0 || v === '0') return false
  }
  return fallback
}

/**
 * 键在登记表里吗（且没被删）？
 *
 * ⚠️ **三态**：true = 有 / false = 没有 / null = 登记表不可用（DO 故障）。
 * 调用方必须把 null 当「不知道」而不是「没有」—— 否则 DO 抖一下，所有投稿都被拒。
 */
async function registryHas(env, key) {
  const out = await registryOp(env, { op: 'file-get', key })
  if (out === null) return null
  const f = out.file
  return !!(f && !f.deleted)
}

/** 投稿人标识：把前端给的设备指纹哈希成短 id（原值不落库、不进日志） */
async function submitterIdOf(data) {
  const raw = String((data && (data._设备 || data.fp)) || '').trim()
  if (raw.length < 8 || raw.length > 256) return ''
  return (await sha256Hex(raw)).slice(0, 16)
}

/**
 * 数「这个投稿人现在有几个待审核 Issue」。
 *
 * Issue 是工作流建的（不是 Worker 建的），所以只能反查：草稿里带 `_提交指纹`，
 * 工作流把它以 HTML 注释写进正文，这里用 Search API 按注释里的标记数。
 * 查不到（GitHub 挂了 / 索引没跟上）返回 -1 = 「不知道」，由调用方决定放行。
 */
async function countPendingIssues(env, sid) {
  if (!sid) return -1
  const q = `repo:${env.GITHUB_OWNER}/${env.GITHUB_REPO} is:issue is:open label:待审核 "csh-submitter:${sid}"`
  try {
    const res = await fetch(
      `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=1`,
      { headers: githubHeaders(env) }
    )
    if (!res.ok) {
      console.error('pending search failed:', res.status)
      return -1
    }
    const j = await res.json()
    const n = Number(j && j.total_count)
    return Number.isFinite(n) ? n : -1
  } catch (err) {
    console.error('pending search error:', err && err.message)
    return -1
  }
}

/**
 * 投稿准入：三层，任何一层不过就拒。
 *
 *   ① 来源门槛 —— 必须带本站上传的附件，或填了 GitHub 仓库。纯手填一条外链的成本
 *      几乎为零，也正是批量灌 Issue 最常见的形态。
 *   ② 瞬时配额 —— 同一投稿人在滑动窗口内最多 N 次，挡「一秒发 100 个」。
 *   ③ 待审上限 —— 同一投稿人在审核队列里最多同时挂 N 个，挡「一次开 1000 个 Issue」。
 *
 * 拿不到设备指纹时（老版本前端 / 脚本直连）只做第①层就放行 —— 这是刻意的：
 * 宁可漏挡，也不要把「指纹拿不到」变成一条谁也提交不了的路。
 */
async function submitGate(env, data, sid) {
  const cfg = await registryCfgGet(env)
  const requireSource = pickBool(cfg && cfg.requireSource, env.SUBMIT_REQUIRE_SOURCE, SUBMIT_REQUIRE_SOURCE)
  const maxPending = pickNum(cfg && cfg.maxPending, env.SUBMIT_MAX_PENDING, SUBMIT_MAX_PENDING)
  const maxPerDay = pickNum(cfg && cfg.maxPerDay, env.SUBMIT_MAX_PER_DAY, SUBMIT_MAX_PER_DAY)

  if (requireSource) {
    const hasUpload = collectOssKeys(data).some((k) => /^upload\//.test(k))
    const hasGithub = !!String(data.github || '').trim()
    if (!hasUpload && !hasGithub) {
      return {
        ok: false,
        status: 403,
        error:
          '本站只受理「上传了安装包」或「填写了 GitHub 仓库」的投稿。' +
          '只填外链的话，请直接到仓库提 Issue，或先把安装包上传到本站。',
      }
    }
  }

  if (!sid) return { ok: true }

  if (maxPerDay > 0) {
    const tick = await registryOp(env, { op: 'submit-tick', sid })
    if (tick && tick.ok && Number(tick.used) > maxPerDay) {
      return {
        ok: false,
        status: 429,
        error: `提交太频繁：同一台设备 24 小时内最多提交 ${maxPerDay} 次，请稍后再试。`,
      }
    }
  }

  if (maxPending > 0) {
    const n = await countPendingIssues(env, sid)
    if (n >= 0 && n >= maxPending) {
      return {
        ok: false,
        status: 429,
        error: `你还有 ${n} 条投稿在等待审核（上限 ${maxPending} 条），请等管理员处理完再提交新的。`,
      }
    }
  }

  return { ok: true }
}

/**
 * 上传签发闸门：按「来源哈希 + 当天」计数，另加全局日上限。
 *
 * 复用 DL_GATE 这个 DO 类，换一个固定实例名 `__sign__` 专门计数（同一个类换实例名，
 * 不必再声明第二个 DO 类）。来源只存**哈希前 24 位**，原始 IP 不落库。
 *
 * ⚠️ 一律**失败放行**：DO 抖一下不该让正常用户传不了文件（与 submitGate 同一套哲学）。
 */
async function signGate(env, src, bytes) {
  if (!env.DL_GATE) return { allowed: true }
  try {
    const id = env.DL_GATE.idFromName('__sign__')
    const res = await env.DL_GATE.get(id).fetch('https://dl-gate/sign-check', {
      method: 'POST',
      body: JSON.stringify({
        // DO 按 body.op 分流；漏了这个会静默落进默认 check 分支（设备额度），
        // 限流变成永远放行 —— 单测抓出来过一次，别再丢。
        op: 'sign-check',
        ip: src,
        bytes: Math.max(0, Number(bytes) || 0),
        // 上限允许用 env 覆盖（运维调参 / 测试用），默认取常量
        perIp: pickNum(null, env.SIGN_PER_IP_PER_DAY, SIGN_PER_IP_PER_DAY),
        perDay: pickNum(null, env.SIGN_GLOBAL_PER_DAY, SIGN_GLOBAL_PER_DAY),
        bytesPerDay: pickNum(null, env.SIGN_GLOBAL_BYTES_PER_DAY, SIGN_GLOBAL_BYTES_PER_DAY),
      }),
    })
    const out = await res.json()
    if (out && out.allowed === false) {
      return {
        allowed: false,
        scope: out.scope || 'global',
        message:
          out.scope === 'ip'
            ? '上传请求过于频繁，请稍后再试。'
            : '今天的上传配额已用完，请明天再试，或改用官网 / GitHub 外链。',
      }
    }
    return { allowed: true }
  } catch (err) {
    console.error('sign gate error:', err && err.message)
    return { allowed: true }
  }
}

/**
 * POST /api/oss-sign → 返回一个只能写单个对象的预签名 PUT 地址 + 上传后的公开直链。
 * 入参：{ name, size, contentType, purpose, fp }
 */
async function handleOssSign(request, env, ctx) {
  let data
  try {
    data = await request.json()
  } catch {
    return json({ error: '请求格式错误' }, 400, request, env)
  }

  if (!env.OSS_BUCKET || !env.OSS_ACCESS_KEY_ID || !env.OSS_ACCESS_KEY_SECRET) {
    return json({ error: '上传服务未配置' }, 503, request, env)
  }

  const isIcon = String(data?.purpose || '') === 'icon'
  const size = Number(data?.size)
  if (!Number.isFinite(size) || size <= 0) {
    return json({ error: '缺少文件大小' }, 400, request, env)
  }
  // 图标与软件包走两条完全不同的读取路径，上限也就该分开：软件包能被下载，放宽到 4 GB；
  // 图标是公开只读的，收得越紧越好（上限见 ICON_SIGN_MAX_BYTES 的注释）。
  const sizeLimit = isIcon ? ICON_SIGN_MAX_BYTES : OSS_MAX_BYTES
  if (size > sizeLimit) {
    return json({ error: isIcon ? '图标文件太大' : '文件太大' }, 413, request, env)
  }

  // ── 签发限流 ────────────────────────────────────────────────────
  // 这条接口无需登录即可换预签名地址，不加闸门就是一条免费的公共上传通道（存储费 + 流量费
  // 都记在本站头上）。来源取 CF 边缘给的连接 IP，只存哈希；拿不到就退化成固定串，
  // 宁可把闸门收紧也不留空档。
  const srcRaw = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'unknown'
  const src = (await sha256Hex(String(srcRaw).split(',')[0].trim())).slice(0, 24)
  const gate = await signGate(env, src, size)
  if (!gate.allowed) {
    return json({ error: gate.message, scope: gate.scope }, 429, request, env)
  }

  // Content-Type 只接受干净的 type/subtype，其余一律按未知类型处理（签名值由本服务定，前端照抄）
  const rawType = String(data?.contentType || '').trim().toLowerCase().split(';')[0].trim()
  const contentType = CONTENT_TYPE_RE.test(rawType) ? rawType : DEFAULT_CONTENT_TYPE

  const now = new Date()
  const stamp = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}`
  const uniq = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  // 图标走独立前缀：/api/icon 只读公开，软件包走 /api/dl 票据闸门
  const prefix = isIcon ? ICON_PREFIX : String(env.OSS_PREFIX || 'upload').replace(/^\/+|\/+$/g, '')
  const key = `${prefix}/${stamp.slice(0, 4)}/${stamp.slice(4, 6)}/${uniq}-${ossSafeName(data?.name)}`

  // 签发即登记：这个键是本 Worker 亲手造的，所以登记表里的东西一定都是「本站对象」，
  // 不会混进历史外链。指纹只留 16 位哈希，原始值不落库。
  const fph = data?.fp ? (await sha256Hex(String(data.fp))).slice(0, 16) : ''
  const regTask = registryPut(env, {
    key,
    size,
    name: ossSafeName(data?.name),
    ctype: contentType,
    origin: isIcon ? ICON_PREFIX : 'file',
    fph,
    ts: Date.now(),
    deleted: 0,
  })
  // 有 ExecutionContext 就丢给 waitUntil，别让一次 DO 往返拖慢签发
  if (ctx) ctx.waitUntil(regTask)
  else await regTask

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
        maxBytes: sizeLimit,
        // 一并告诉前端「多久之内必须把提交做完，否则这个附件会被自动清理」——
        // 让界面能显示真实阈值，而不是写死一个 15 分钟（阈值可以在线改）。
        orphanMinutes: await gcOrphanMinutes(env),
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

const MIRROR_SIGN_HOST = 'download.classsoftwarehub.cn'

/** 与前端 githubMirror.ts 的 isMirrorableUrl 同一套白名单：只给 GitHub 文件直链签名，
 *  不给节点当开放代理（免得有人拿本 Worker 签任意网址刷节点的流量）。 */
function isGithubFileUrl(raw) {
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  const host = parsed.hostname.toLowerCase()
  if (host === 'github.com' || host === 'www.github.com') {
    return /^\/[^/]+\/[^/]+\/(releases\/download|archive)\//.test(parsed.pathname)
  }
  return (
    host === 'objects.githubusercontent.com' ||
    host === 'github-releases.githubusercontent.com' ||
    host === 'codeload.github.com' ||
    host === 'raw.githubusercontent.com'
  )
}

/**
 * GET /api/mirror-sign?url=<GitHub直链> → { success, url, expiresAt, ttl }
 *
 * 自建加速节点（gh-stream）开了双雷防盗链：Referer 白名单 + 限时签名
 * （HMAC-SHA256，默认 15 分钟）。签发接口 /sign 要 X-Api-Key 鉴权，密钥不能进
 * 公开前端 —— 这里由 Worker 代签：拿 SIGN_API_KEY 调节点的 /sign，把签好的
 * 临时下载链接（/d?u=..&e=..&s=..）原样回给前端触发下载。
 * 没配 SIGN_API_KEY 时报 503，前端会自动退到公益镜像，节点不受影响。
 */
async function handleMirrorSign(request, env) {
  if (!env.SIGN_API_KEY) {
    return json({ error: '加速服务未配置' }, 503, request, env)
  }

  const target = (new URL(request.url).searchParams.get('url') || '').trim()
  if (!isGithubFileUrl(target)) {
    return json({ error: '仅支持 GitHub 文件直链' }, 400, request, env)
  }

  try {
    const srcIp = (request.headers.get('CF-Connecting-IP') || (request.headers.get('x-forwarded-for') || '').split(',')[0] || '').trim()
    const res = await fetch(
      `https://${MIRROR_SIGN_HOST}/sign?url=${encodeURIComponent(target)}${srcIp ? `&ip=${encodeURIComponent(srcIp)}` : ''}`,
      {
        headers: {
          'X-Api-Key': env.SIGN_API_KEY,
          'User-Agent': 'classsoftwarehub-worker',
        },
      }
    )
    if (!res.ok) {
      console.error('mirror sign error:', res.status, (await res.text()).slice(0, 200))
      return json({ error: '签发加速链接失败' }, 502, request, env)
    }
    const data = await res.json()
    if (!data || !data.url) {
      return json({ error: '签发加速链接失败' }, 502, request, env)
    }
    return json(
      {
        success: true,
        url: data.url,
        expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : null,
        ttl: typeof data.ttl === 'number' ? data.ttl : null,
      },
      200,
      request,
      env
    )
  } catch (err) {
    console.error('mirror sign error:', err && err.message)
    return json({ error: '签发加速链接失败' }, 502, request, env)
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

/**
 * 软件 id 的形状：**与前端 SubmitPage.vue 的 ID_PATTERN 完全一致**。
 *
 * 以前这里是 `^[a-z0-9-]+$`，比前端松 —— `-`、`--x` 这类前端与审核工作流都会拒的 id
 * 能穿过服务端写进草稿。服务端才是真正的信任边界，两边不一致就是给绕开校验留门。
 */
const ID_RE = /^[a-z0-9][a-z0-9-]*$/

/**
 * 下载项地址允许的协议。
 *
 * 这里是**防存储型 XSS 的唯一服务端闸门**：`downloads[].url` 会一路走到详情页的
 * 「下载」按钮（`triggerDownload` 直接塞进 `<a>.href` 并 click）与 `window.open`，
 * 前端漏一处就是个能在站点源上执行的 `javascript:`。所以除了 http(s) 与本站伪协议
 * `oss://`，其余一概不收。
 * 注意用「有协议头就白名单」的写法：**没有协议头的相对路径放行**，这样也不会误伤
 * 以后可能加的同源相对地址。
 */
const ALLOWED_URL_SCHEMES = new Set(['http', 'https', 'oss', 'ms-windows-store'])

function urlSchemeOk(url) {
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(String(url).trim())
  if (!m) return true // 没有协议头 = 相对路径，交给页面自己解析
  return ALLOWED_URL_SCHEMES.has(m[1].toLowerCase())
}

function validate(d) {
  const errors = []

  if (!d.id || !ID_RE.test(d.id)) errors.push('id 只能用小写英文、数字、短横线，且以字母或数字开头')
  if (d.id && d.id.length > 60) errors.push('id 太长')
  if (!d.name) errors.push('缺少软件名称')
  if (!d.category) errors.push('缺少分类')
  if (d.category && !CATEGORIES.includes(d.category)) errors.push('分类不合法')
  if (!d.tagline) errors.push('缺少一句话简介')
  if (!d.description) errors.push('缺少详细介绍')

  if (d.downloads && !Array.isArray(d.downloads)) errors.push('downloads 必须是数组')
  // 下载项上限：50 个版本/架构堆在一个软件里，详情页渲染会卡、审核 Issue 也会长到没人看。
  // 前端按钮到 5 个就禁用了，这里是服务端兜底（前端可以绕过）。
  if (Array.isArray(d.downloads) && d.downloads.length > MAX_DOWNLOADS_PER_APP) {
    errors.push(`下载项最多 ${MAX_DOWNLOADS_PER_APP} 个，更多版本请在详情里给官网或 GitHub Releases 链接`)
  }
  if (d.name && String(d.name).length > 120) errors.push('软件名称太长（最多 120 字）')
  if (d.tagline && String(d.tagline).length > 300) errors.push('一句话简介太长（最多 300 字）')
  if (d.description && String(d.description).length > 8000) errors.push('详细介绍太长（最多 8000 字）')

  for (const key of ['icon', 'website', 'github', 'store']) {
    if (d[key] && typeof d[key] === 'string' && !/^https?:\/\//.test(d[key])) {
      errors.push(`${key} 必须以 http:// 或 https:// 开头`)
    }
  }

  // 下载项地址的协议白名单 —— 见 ALLOWED_URL_SCHEMES 的注释（防存储型 XSS）。
  if (Array.isArray(d.downloads)) {
    d.downloads.forEach((item, i) => {
      const url = item && typeof item.url === 'string' ? item.url.trim() : ''
      if (url && !urlSchemeOk(url)) {
        errors.push(`第 ${i + 1} 个下载项的地址协议不受支持（只允许 http(s):// 或 oss://）`)
      }
    })
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

  // ── 准入闸门（防审核队列被批量垃圾灌满）──────────────────────────
  const sid = await submitterIdOf(data)
  const gate = await submitGate(env, data, sid)
  if (!gate.ok) return json({ error: gate.error }, gate.status, request, env)

  // 只认「本 Worker 亲手签出去」的对象键。伪造（或手写）一个 oss:// 键提交上来，
  // 轻则线上 404，重则把审核引向一个不属于本站、也无法被回收管理的对象 ——
  // 登记表里查不到就拒。登记表本身不可用（DO 故障）时放行：基础设施问题不该算用户的错。
  const unknown = []
  for (const k of collectOssKeys(data)) {
    if (!/^upload\//.test(k)) continue
    if ((await registryHas(env, k)) === false) unknown.push(k)
  }
  if (unknown.length) {
    return json(
      {
        error:
          '下载项里有本站未登记的文件地址（可能已被自动清理，或不是由本站上传的）。' +
          '请重新在页面上传一次再提交。',
        invalid: unknown,
      },
      400,
      request,
      env
    )
  }

  // 附件还在不在？
  //
  // 孤儿回收会把「传完 15 分钟还没提交」的对象清掉（见 runGc），于是完全可能出现
  // 「表单填到一半，附件已经被清掉了，不校验的话就提交成功、然后线上那个键 404」。
  // 这里当场问一次桶：**明确的 404 就报错让用户重传**；问不到（中继不可用 / 5xx）
  // 一律放行 —— 基础设施故障不该被算成用户的错，渠道问题留给回收任务自己去发现。
  const referenced = collectOssKeys(data).filter((k) => /^upload\//.test(k))
  if (referenced.length) {
    const gone = []
    for (const k of referenced) {
      try {
        const probe = await relayOpen(env, k, 'HEAD')
        if (probe.reader) {
          try { probe.reader.releaseLock() } catch {}
          try { probe.socket.close() } catch {}
          if (probe.status === 404) gone.push(k)
        }
      } catch (err) {
        console.error('submit probe error:', err && err.message)
      }
    }
    if (gone.length) {
      const mins = await gcOrphanMinutes(env)
      return json(
        {
          error: `附件已因长时间未提交被自动清理（上传后 ${mins} 分钟内需完成提交），请重新上传后再提交`,
          missing: gone,
        },
        409,
        request,
        env
      )
    }
  }

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
      const item = { platform: cleanText(x.platform, 120) }
      const note = cleanText(x.note, 500)
      if (note) item.note = note
      const sizeLabel = cleanText(x.size, 60)
      if (sizeLabel) item.size = sizeLabel
      // 校验值（选填，纯十六进制、算法按位数识别）：提交页填了就必须原样带进草稿，
      // 否则审核写回的数据缺这一段，详情页也就不会显示校验值。
      // 这里再过滤一次只留十六进制 —— 提交服务是公开接口，不能照单全收。
      const hash = typeof x.hash === 'string' ? x.hash.replace(/[^0-9a-f]/gi, '').toLowerCase() : ''
      if (hash) item.hash = hash
      item.url = cleanText(x.url, 1000)
      return item
    })

  const fileContent = {
    id: data.id,
    name: cleanText(data.name, 120),
    icon: cleanText(data.icon, 1000),
    category: data.category,
    tagline: cleanText(data.tagline, 300),
    description: cleanText(data.description, 8000),
    version: cleanText(data.version, 60),
    size: cleanText(data.size, 60),
    system: cleanText(data.system, 200),
    website: cleanText(data.website, 1000),
    github: cleanText(data.github, 1000),
    downloads,
    sort: typeof data.sort === 'number' ? data.sort : 99,
  }
  const notice = cleanText(data.notice, 1000)
  if (notice) fileContent.notice = notice
  const store = cleanText(data.store, 1000)
  if (store) fileContent.store = store
  const maintainerNote = cleanText(data.维护备注, 1000)
  if (maintainerNote) fileContent['维护备注'] = maintainerNote

  const submissionContent = {
    _提交时间: new Date(timestamp).toISOString(),
    _原始ID冲突: idAlreadyExists,
    ...fileContent,
  }
  // 投稿人标识（设备指纹的哈希）：工作流会把它以 HTML 注释写进审核 Issue，
  // 于是「同一台设备最多挂 3 条待审」这条规则才数得出来（见 countPendingIssues）。
  // 存的是哈希，原始指纹只在本机生成、从不落库。
  if (sid) submissionContent._提交指纹 = sid

  // 审核用元数据以 `_` 开头（提交页必填的「联系方式」就是 `_联系方式`）。上面那段是按
  // 字段白名单重建 JSON 的，入参里的 `_` 键会被整个漏掉 —— 曾导致审核 Issue 里「联系方式」
  // 显示成「未填写」。所以要把入参的 `_` 键带回。
  //
  // ⚠️ 但**必须用白名单，不能「凡 `_` 皆放行」**：`_类型` 是审核管道的分流开关
  //    （回声洞 / 反馈 / 软件），投稿人自己塞一个 `_类型: "回声洞"` 就能把草稿劫持到
  //    另一条流水线 —— 开出一张不对应的 Issue、绕开软件字段校验，且从此既不会被合并
  //    也不会被清理，永久滞留在 submissions/。白名单里的键才允许带回。
  // 服务自己写的 `_提交时间` / `_原始ID冲突` / `_提交指纹` 已存在，不允许被入参覆盖。
  /** 允许投稿人带入草稿的审核元数据字段（新增字段请加在这里，别改回「按前缀放行」） */
  const SUBMISSION_META_KEYS = new Set(['_联系方式'])
  for (const key of Object.keys(data)) {
    if (!SUBMISSION_META_KEYS.has(key) || key in submissionContent) continue
    const value = data[key]
    if (typeof value === 'string') {
      // ⚠️ 长度上限按字段分开：`_联系方式` 是本机加密后的 age ASCII armor 密文，
      //    短则六七百字、长则几千字。以前所有 `_` 键统一 slice(0, 300)，
      //    等于把密文拦腰截断 —— 管理员拿私钥也解不出来。
      const limit = key === '_联系方式' ? 4000 : 300
      const cleaned = cleanText(value, limit)
      if (cleaned) submissionContent[key] = cleaned
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

  // 草稿真的写进去了才认领。这一步是孤儿回收的免死金牌：投稿页是「先传文件、再填表、
  // 最后提交」，中间可能隔着很久；只要提交成功，这些对象就不再是「传了没提交的垃圾」，
  // 哪怕审核要拖几天也不会被 cron 清掉。
  // 认领失败不影响投稿本身（登记表是尽力而为的旁路），所以只记日志、不改响应。
  try {
    const claimed = await registryClaim(env, collectOssKeys(fileContent))
    if (claimed && Array.isArray(claimed.claimed) && claimed.claimed.length) {
      console.log('claimed:', claimed.claimed.length)
    }
  } catch (err) {
    console.error('claim error:', err && err.message)
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

/* ═════════════ 下载闸门实现 ═════════════ */

/** 对象键白名单校验：只允许 upload/ 与 soft/ 两个前缀，挡掉穿越与奇怪的键 */
function dlKeyOk(key) {
  if (typeof key !== 'string') return false
  if (key.length < 8 || key.length > 400) return false
  if (!DL_KEY_PREFIX.test(key)) return false
  if (key.includes('..') || key.includes('//')) return false
  if (/[\u0000-\u001f\u007f\\]/.test(key)) return false
  return true
}

/** 下载时给浏览器的文件名：默认取对象键末段，可由 ?n= 覆盖（只影响保存名，不参与签名） */
function dlFileName(key, override) {
  const raw = (override && String(override)) || key.split('/').pop() || 'download'
  const clean = raw
    .replace(/^.*[\\/]/, '')
    .replace(/[\u0000-\u001f\u007f\\:*?"<>|]+/g, '_')
    .replace(/^\.+/, '')
    .trim()
  return clean || 'download'
}

/** 票据签名：secret 是 CF secret，前端拿不到，改不动票据里的任何一个字段 */
async function dlTicketSig(env, exp, fpHash, key) {
  const secret = textEncoder.encode(String(env.DL_SIGN_SECRET || ''))
  return toHex(await hmacSha256(secret, `${exp}|${fpHash}|${key}`)).slice(0, 32)
}

function indexOfCrlfCrlf(buf) {
  for (let i = 3; i < buf.length; i++) {
    if (buf[i - 3] === 13 && buf[i - 2] === 10 && buf[i - 1] === 13 && buf[i] === 10) return i - 3
  }
  return -1
}

/**
 * 向 ECS 中继要一个对象。
 *
 * 为什么不用 fetch()：Cloudflare Workers 的 fetch 不允许请求「裸 IP」，会直接回
 * 1003（Direct IP access not allowed）；中继只有 IP、没有域名，所以走原生 TCP socket。
 * 用 HTTP/1.0 + Connection: close 让中继按 Content-Length/EOF 收尾，不必解 chunked。
 */
async function relayOpen(env, key, method, range) {
  return relayOpenPath(env, '/' + key.split('/').map(encodeURIComponent).join('/'), method, range)
}

/** 同上，但直接给一条原始路径 —— 用于 `/?list&prefix=…` 这种带查询串的请求 */
async function relayOpenPath(env, path, method, range) {
  const host = String(env.RELAY_HOST || '').trim()
  const token = String(env.RELAY_TOKEN || '')
  if (!host || !token) return { status: 503, text: '下载服务未配置' }

  const port = Number(env.RELAY_PORT) || DL_RELAY_PORT
  const socket = connect({ hostname: host, port }, { secureTransport: 'off' })

  // 中继的鉴权头以官方文档为准（X-Api-Key）。中继同时也认 X-Relay-Token，
  // 但只写文档里的那个，免得哪天别名被去掉后这里突然全挂。
  //
  // ⚠️ 令牌只走**请求头**，绝不放查询串：
  //    URL 会原样落进中继的 access log（nginx 默认就记 `$request`），而请求头不会；
  //    一旦进了日志，等于把一个能读整个桶的凭据抄在了磁盘上，还跟着日志轮转到处跑。
  //    同理：这个 `head` 变量（含令牌）**任何情况下都不许打印 / 记日志 / 放进错误消息**，
  //    调试网络问题时只打印 host 与 port。
  let head = `${method} ${path} HTTP/1.0\r\nHost: ${host}\r\nX-Api-Key: ${token}\r\nConnection: close\r\n`
  if (range) head += `Range: ${range}\r\n`
  head += '\r\n'

  const writer = socket.writable.getWriter()
  await writer.write(textEncoder.encode(head))
  writer.releaseLock()

  const reader = socket.readable.getReader()
  let buf = new Uint8Array(0)
  let end = -1
  while (end < 0) {
    const { value, done } = await reader.read()
    if (done) break
    const merged = new Uint8Array(buf.length + value.length)
    merged.set(buf)
    merged.set(value, buf.length)
    buf = merged
    end = indexOfCrlfCrlf(buf)
    if (end < 0 && buf.length > 64 * 1024) {
      try { reader.releaseLock() } catch {}
      try { socket.close() } catch {}
      return { status: 502, text: '中继响应异常' }
    }
  }
  if (end < 0) {
    try { reader.releaseLock() } catch {}
    try { socket.close() } catch {}
    return { status: 502, text: '中继无响应' }
  }

  const lines = new TextDecoder().decode(buf.subarray(0, end)).split('\r\n')
  const status = Number((lines[0] || '').split(' ')[1] || 0)
  const headers = {}
  for (const line of lines.slice(1)) {
    const i = line.indexOf(':')
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim()
  }
  return {
    status,
    headers,
    reader,
    socket,
    first: buf.subarray(end + 4),
  }
}

/** 把 relayOpen 的结果包成流式响应 */
function relayRespond(relay, method, fileName) {
  const upstream = relay.headers['content-length']
  const out = new Headers()
  if (relay.headers['content-type']) out.set('Content-Type', relay.headers['content-type'])
  if (relay.headers['content-range']) out.set('Content-Range', relay.headers['content-range'])
  if (upstream) out.set('Content-Length', upstream)
  out.set('Accept-Ranges', 'bytes')
  out.set('Cache-Control', 'private, no-store')
  out.set('X-Content-Type-Options', 'nosniff')
  if (method !== 'HEAD' && fileName) {
    out.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`)
  }

  if (method === 'HEAD') {
    try { relay.reader.releaseLock() } catch {}
    try { relay.socket.close() } catch {}
    return new Response(null, { status: relay.status, headers: out })
  }

  const stream = new ReadableStream({
    start(controller) {
      if (relay.first && relay.first.length) controller.enqueue(relay.first)
    },
    async pull(controller) {
      try {
        const { value, done } = await relay.reader.read()
        if (done) {
          controller.close()
          try { relay.socket.close() } catch {}
          return
        }
        if (value && value.length) controller.enqueue(value)
      } catch (err) {
        controller.error(err)
        try { relay.socket.close() } catch {}
      }
    },
    cancel() {
      try { relay.reader.releaseLock() } catch {}
      try { relay.socket.close() } catch {}
    },
  })
  return new Response(stream, { status: relay.status, headers: out })
}

/**
 * 向中继要一份对象清单（`?list&prefix=`）。
 *
 * 这份数据是**以桶为准**的，不是本地的对象登记表 —— 登记表从上线那天才开始记，
 * 拿它去删历史对象会「静默什么都不删」，那是这类操作里最坏的一种失败
 * （操作者以为清干净了，其实一个都没删）。所以「按目录清」和「看桶里有什么」
 * 一律走这里，登记表只用来记「我们自己传过什么」和留墓碑。
 *
 * 返回 `[{ key, size, lastModified }]`；中继不可用 / 响应解不动返回 null，由调用方明确报错，不猜。
 * `lastModified` 是 OSS 记的**上传完成时刻**（ISO 串）—— 孤儿回收拿它当时间基准，
 * 而不是拿我们签发上传地址的时刻：大文件光上传就可能几十分钟。
 */
async function relayListDetailed(env, prefix) {
  const relay = await relayOpenPath(env, `/?list&prefix=${encodeURIComponent(prefix)}`, 'GET')
  if (!relay.reader) return null
  let text = new TextDecoder().decode(relay.first)
  while (true) {
    const { value, done } = await relay.reader.read()
    if (done) break
    if (value && value.length) text += new TextDecoder().decode(value)
  }
  try { relay.socket.close() } catch {}
  try {
    const data = JSON.parse(text)
    const objs = Array.isArray(data) ? data : data?.objects || []
    const objects = objs
      .map((o) =>
        typeof o === 'string'
          ? { key: o, size: 0, lastModified: '' }
          : {
              key: o?.key || o?.Key || '',
              size: Number(o?.size ?? o?.Size) || 0,
              // 中继原样透传 OSS 的 ISO 串（`2026-10-05T01:04:23.000Z`），交给 Date 解析
              lastModified: o?.lastModified || o?.LastModified || '',
            }
      )
      .filter((o) => typeof o.key === 'string' && o.key)
    // ⚠️ `isTruncated` 必须一起带出来：这份清单会被用来判断「某个键到底在不在桶里」，
    //    而 OSS 单次最多回 1000 条。拿一份被截断的清单去判「不存在」，就会把**真实存在**
    //    的对象误判成无主记录。调用方看到 truncated 就必须放弃这个判断。
    return { objects, truncated: data?.isTruncated === true || data?.truncated === true }
  } catch (err) {
    console.error('relay list parse error:', err && err.message)
    return null
  }
}

/** 只要对象列表（旧调用点用）；拿不到返回 null */
async function relayListObjects(env, prefix) {
  const out = await relayListDetailed(env, prefix)
  return out === null ? null : out.objects
}

/** 只要键（purge 用）。拿不到清单一律返回 null，由调用方明确报错，绝不猜。 */
async function relayList(env, prefix) {
  const objs = await relayListObjects(env, prefix)
  return objs === null ? null : objs.map((o) => o.key)
}

/**
 * 期望的取回通道：relay / direct；其余（含不设）一律按 auto 处理。
 *
 * 优先读 **DO 里的运行时配置**（`/api/dl-mode` 写的），只有从没写过才回落到 env.DL_MODE。
 * 这样「一键切链路」不必改 CF 绑定、不必重新部署 —— 这也是为什么它不直接读 env。
 */
async function dlModeWanted(env) {
  const out = await registryOp(env, { op: 'cfg-get' })
  const stored = out && out.cfg && out.cfg.mode
  const raw = String(stored || env.DL_MODE || DL_MODE_DEFAULT).trim().toLowerCase()
  return raw === 'relay' || raw === 'direct' ? raw : 'auto'
}

/** 「GB」写成字节；0 / 非法值 = 不限 */
function gbToBytes(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 1024 * 1024 * 1024) : 0
}

/** 签一条 OSS 直连地址；OSS 没配或签名失败都返回 null（调用方回落到中继） */
async function buildDirectUrl(env, key, fileName, ttl) {
  if (!env.OSS_BUCKET || !env.OSS_ACCESS_KEY_ID || !env.OSS_ACCESS_KEY_SECRET) return null
  try {
    return await ossPresignGet(env, key, ttl || DL_TICKET_TTL, fileName)
  } catch (err) {
    console.error('direct presign error:', err && err.message)
    return null
  }
}

/**
 * POST /api/dl-ticket → { key, fp, prefer? }
 * 领一张 15 分钟下载票据；同一指纹每天最多 DL_DAILY_LIMIT 张。
 *
 * 票据指向哪条通道由服务端决定：relay（经 ECS 中继）或 direct（OSS 短时直链）。
 * auto 模式下默认给 relay，并当场 HEAD 探一下中继是否活着；探不通或 relay 月度额度
 * 用满，就改成 direct。两条路都不通才真的没辙。
 * `prefer`（relay / direct）只作显式指定用 —— 对拍、应急，以及站长想临时把某条通道停掉。
 */
async function handleDlTicket(request, env, ctx) {
  let data
  try {
    data = await request.json()
  } catch {
    return json({ error: '请求格式错误' }, 400, request, env)
  }
  // 两条通道各自独立，只有都不可用才算「服务未配置」
  const relayReady = !!(env.RELAY_HOST && env.RELAY_TOKEN)
  const ossReady = !!(env.OSS_BUCKET && env.OSS_ACCESS_KEY_ID && env.OSS_ACCESS_KEY_SECRET)
  if (!relayReady && !ossReady) {
    return json({ error: '下载服务未配置' }, 503, request, env)
  }

  const key = String(data?.key || '').trim()
  if (!dlKeyOk(key)) return json({ error: '下载地址无效' }, 400, request, env)

  const fp = String(data?.fp || '').trim()
  if (fp.length < 8 || fp.length > 256) return json({ error: '设备标识无效' }, 400, request, env)

  // 输入都合法了，再问登记表（fail-open：DO 不在/出错时 registryOp 返回 null，当没问过）：
  //   · 墓碑（deleted）→ 已被清理的键不再发新票 —— 直链死了票据也不能换回来；
  //   · upload/ 下查无记录 → 不是我们签出去的键（upload/ 只可能来自 /api/oss-sign，
  //     签发即登记），一并拒掉。soft/ 与 releases/ 可能有登记表上线之前的历史对象，
  //     对它们只查墓碑、不做存在性要求。
  const reg = await registryOp(env, { op: 'file-get', key })
  if (reg && reg.ok) {
    if (reg.file && reg.file.deleted) return json({ error: '文件已被清理' }, 404, request, env)
    if (!reg.file && key.startsWith('upload/')) {
      return json({ error: '下载地址无效' }, 404, request, env)
    }
  }

  const fpHash = (await sha256Hex(fp)).slice(0, 16)

  if (env.DL_GATE) {
    try {
      const id = env.DL_GATE.idFromName(fpHash)
      const res = await env.DL_GATE.get(id).fetch('https://dl-gate/check', {
        method: 'POST',
        body: JSON.stringify({ limit: dlDailyLimit(env) }),
      })
      const gate = await res.json()
      if (!gate.allowed) {
        return json(
          {
            error: `今天的下载额度已用完（每台设备每天 ${gate.limit} 次），明天再来吧`,
            used: gate.used,
            limit: gate.limit,
            remaining: 0,
          },
          429,
          request,
          env
        )
      }
      var gateInfo = gate
    } catch (err) {
      console.error('dl gate error:', err && err.message)
    }
  }

  // ── 选通道 ──────────────────────────────────────────────────────
  // 登记表里查一下这件有多大：分流要用，也顺手回给前端。
  const rec = await registryGet(env, key)
  const size = rec && Number.isFinite(Number(rec.size)) ? Number(rec.size) : 0

  const want =
    String(data?.prefer || '').trim().toLowerCase() === 'relay' || String(data?.prefer || '').trim().toLowerCase() === 'direct'
      ? String(data.prefer).trim().toLowerCase()
      : await dlModeWanted(env)
  const stats = (await registryOp(env, { op: 'stats' })) || {}
  const relayUsed = Number(stats.relay) || 0
  const directUsed = Number(stats.direct) || 0
  const relayCap = gbToBytes(env.DL_RELAY_MONTHLY_GB)
  const directCap = gbToBytes(env.DL_DIRECT_MONTHLY_GB)
  const relayFull = relayCap > 0 && relayUsed >= relayCap
  const directFull = directCap > 0 && directUsed >= directCap

  const exp = Math.floor(Date.now() / 1000) + DL_TICKET_TTL
  const sig = await dlTicketSig(env, exp, fpHash, key)
  const origin = new URL(request.url).origin
  const relayPath = relayReady
    ? `${origin}/api/dl?k=${encodeURIComponent(key)}&e=${exp}&h=${fpHash}&s=${sig}` +
      `&f=${encodeURIComponent(fp)}`
    : null
  // 直链的有效期按体积分层（小文件 5 分钟，大文件最多 30 分钟），见 DIRECT_TTL_TIERS。
  // relay 那条不需要分层：票据只在**开始下载时**校验一次，之后是流式转发，传多久都不断。
  const directTtl = directTtlFor(size)
  const directPath = await buildDirectUrl(env, key, dlFileName(key), directTtl)

  // auto 的主通道：relay 见底而 direct 还有额度时才倒过来
  let mode = want === 'auto' ? (relayFull && !directFull ? 'direct' : 'relay') : want
  if (mode === 'relay' && !relayPath) mode = 'direct'
  if (mode === 'direct' && !directPath) mode = 'relay'
  if (!relayPath && !directPath) {
    return json({ error: '下载服务暂时不可用' }, 503, request, env)
  }

  // auto 下探活：中继是「裸 IP + 自建服务」，最容易先出问题（进程没了 / 端口被墙 / 令牌被换）。
  // 与其把一张注定 502 的票据交给用户，不如当场换成直连。HEAD 不传字节，代价很小。
  //
  // 判「活」的标准要分清楚：
  //   · 2xx/3xx（尤其 200）→ 活；
  //   · 404 → **也活** —— 对象不存在只说明这件东西没了，中继本身好着呢，
  //          这时候换直链没有任何意义，只会把用量记到错的通道上；
  //   · 401/403 → **不活** —— 令牌不对，链路等于断了，这时候直连才是能用的那条；
  //   · 5xx 或压根没响应 → 不活。
  if (want === 'auto' && mode === 'relay' && directPath) {
    let alive = false
    try {
      const probe = await relayOpen(env, key, 'HEAD')
      const status = probe.status || 0
      alive = !!(probe.reader && status < 500 && status !== 401 && status !== 403)
      if (probe.reader) {
        try { probe.reader.releaseLock() } catch {}
        try { probe.socket.close() } catch {}
      }
    } catch (err) {
      console.error('relay probe error:', err && err.message)
    }
    if (!alive) mode = 'direct'
  }

  const url = mode === 'direct' ? directPath : relayPath

  // 记一笔用量：按登记表给的体积估。分流用；删去 fallback 后用户只会走本通道，记账即准确。
  if (size > 0) {
    const meter = registryOp(env, { op: 'bytes-add', mode, bytes: size })
    if (ctx) ctx.waitUntil(meter)
    else await meter
  }

  return json(
    {
      success: true,
      mode,
      url,
      key,
      size: size || undefined,
      // 现在是**这条地址自己的**有效期：direct 按体积分层，relay 是票据本身的 15 分钟
      expiresIn: mode === 'direct' ? directTtl : DL_TICKET_TTL,
      dailyLimit: dlDailyLimit(env),
      remaining: gateInfo ? Math.max(0, gateInfo.limit - gateInfo.used) : undefined,
    },
    200,
    request,
    env
  )
}

/**
 * GET|HEAD /api/dl?k=&e=&h=&s=&f=  → 流式转发中继的内容
 * 逐项校验：签名、有效期、对象键前缀、设备指纹。
 */
async function handleDl(request, env) {
  const url = new URL(request.url)
  const key = url.searchParams.get('k') || ''
  const exp = Number(url.searchParams.get('e') || 0)
  const fpHash = url.searchParams.get('h') || ''
  const sig = url.searchParams.get('s') || ''
  const fp = url.searchParams.get('f') || ''

  if (!dlKeyOk(key)) return json({ error: '下载地址无效' }, 400, request, env)
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) {
    return json({ error: '下载链接已过期，请回站点重新点击下载' }, 410, request, env)
  }
  if (sig !== (await dlTicketSig(env, exp, fpHash, key))) {
    return json({ error: '下载地址无效' }, 403, request, env)
  }
  if (!fp || (await sha256Hex(fp)).slice(0, 16) !== fpHash) {
    return json({ error: '设备校验失败，请回站点重新点击下载' }, 403, request, env)
  }

  const method = request.method === 'HEAD' ? 'HEAD' : 'GET'
  let relay
  try {
    relay = await relayOpen(env, key, method, request.headers.get('Range'))
  } catch (err) {
    console.error('relay error:', err && err.message)
    return json({ error: '下载服务暂时不可用' }, 502, request, env)
  }
  if (!relay.reader) {
    return json({ error: relay.text || '下载失败' }, relay.status || 502, request, env)
  }
  return relayRespond(relay, method, dlFileName(key, url.searchParams.get('n')))
}

/** 管理接口的统一鉴权：请求头 X-Purge-Token 必须等于 CF secret（没配 secret 就等于全禁） */
function adminOk(request, env) {
  const expect = String(env.PURGE_TOKEN || '')
  return !!expect && request.headers.get('X-Purge-Token') === expect
}

/** 清理同时认软件包（upload//soft/）与图标（icon/）：三者都是我们自己的对象 */
function objectKeyOk(key) {
  return dlKeyOk(key) || iconKeyOk(key)
}

/** 删一个对象（走中继的 DELETE），删成功后把登记表也标掉 */
async function purgeOne(env, key, options) {
  // onlyRegistry：对象本来就不存在（比如「签了名但没真传」的失效登记记录），
  // 只需要把登记表那一笔销掉 —— 少一次注定失败的 DELETE 往返。
  if (options && options.onlyRegistry) {
    try {
      await registryOp(env, { op: 'file-del', key })
      return { key, ok: true, registryOnly: true }
    } catch (err) {
      return { key, ok: false, error: err && err.message }
    }
  }
  const relay = await relayOpen(env, key, 'DELETE')
  if (!relay.reader) {
    return { key, ok: false, status: relay.status || 0, error: relay.text || '' }
  }
  // DELETE 的响应体很小，读干净再关
  let text = new TextDecoder().decode(relay.first)
  while (true) {
    const { value, done } = await relay.reader.read()
    if (done) break
    text += new TextDecoder().decode(value)
  }
  try { relay.socket.close() } catch {}
  const ok = relay.status >= 200 && relay.status < 300
  if (ok) await registryOp(env, { op: 'file-del', key })
  return { key, ok, status: relay.status, body: text.slice(0, 120) }
}

/**
 * POST /api/purge → { key } | { keys: [...] } | { prefix }
 * 审核不通过时由 GitHub Actions 调用，删掉桶里的对象；也供站长手工清场。
 * 需要 X-Purge-Token（CF secret 与 GitHub secret 各存一份，两边都不进仓库）。
 *
 *   key    —— 删单个对象；
 *   keys   —— 一次删一批（投稿 JSON 里抠出来的那一串地址）；
 *   prefix —— 按「目录」整段清（比如一次误审通过后删掉整个 upload/2026/10/），
 *             只允许 upload/ soft/ icon/ releases/ 四个前缀之下，且**永远不许碰 gh-mirror/**。
 *   requireRegistry: true —— 只删登记表里有的键（审核「拒绝」路径必须带这个，
 *             否则投稿人可以在草稿里塞别人的对象键借刀删桶）。
 */
async function handlePurge(request, env) {
  if (!adminOk(request, env)) return json({ error: '未授权' }, 401, request, env)

  let data
  try {
    data = await request.json()
  } catch {
    return json({ error: '请求格式错误' }, 400, request, env)
  }

  const keys = []
  if (data?.key) keys.push(String(data.key).trim())
  if (Array.isArray(data?.keys)) for (const k of data.keys) keys.push(String(k || '').trim())

  const prefix = String(data?.prefix || '').trim()
  if (prefix) {
    if (prefix.length < 8 || !/^(?:upload|soft|icon|releases)\//.test(prefix) || prefix.includes('..')) {
      return json(
        { error: 'prefix 非法：只允许 upload/ soft/ icon/ releases/ 之下的路径' },
        400,
        request,
        env
      )
    }
    // 以**桶**为准列目录（登记表没有历史对象的记录，用它删会静默漏删）
    let listed = null
    try {
      listed = await relayList(env, prefix)
    } catch (err) {
      console.error('purge list error:', err && err.message)
    }
    if (listed === null) {
      return json({ error: '列目录失败（中继不可用或返回异常），未执行任何删除' }, 502, request, env)
    }
    // 中继返回的键也要复核：必须在本前缀之下、且通过键白名单
    const safe = listed.filter((k) => k.startsWith(prefix) && objectKeyOk(k))
    if (!safe.length) {
      return json(
        { success: true, count: 0, results: [], note: '桶里这个前缀下没有对象' },
        200,
        request,
        env
      )
    }
    if (safe.length > MAX_PURGE_BATCH) {
      return json(
        {
          error: `这个前缀下有 ${safe.length} 个对象，超过一次 ${MAX_PURGE_BATCH} 个的上限；请缩小 prefix 或分批传 keys`,
          count: safe.length,
          deleted: 0,
        },
        400,
        request,
        env
      )
    }
    for (const k of safe) keys.push(k)
  }

  const unique = [...new Set(keys.filter(Boolean))]
  if (!unique.length) return json({ error: '缺少 key / keys / prefix' }, 400, request, env)
  const invalid = unique.filter((k) => !objectKeyOk(k))
  if (invalid.length) {
    return json({ error: 'key 非法', invalid: invalid.slice(0, 5) }, 400, request, env)
  }

  // `requireRegistry: true`：只允许删「本站亲手签出去」的对象（登记表里有记录）。
  //
  // 审核「拒绝」时会带着草稿里的键来删桶 —— 而那些键是**投稿人自己填的**。攻击者可以把
  // `downloads[].url` 写成 `oss://soft/...`（一个合法但不属于这次投稿的历史对象），
  // 骗维护者一拒绝就把它删掉。键形状合法 ≠ 它属于这次投稿，所以审核链路必须打开这个开关：
  // 登记表里查不到的一律不删。登记表不可用（null = 不知道）时放行 —— 基础设施故障
  // 不该被算成调用方的错（与 submitGate / 附件探活同一套哲学）。
  if (data?.requireRegistry) {
    const foreign = []
    for (const k of unique) {
      if ((await registryHas(env, k)) === false) foreign.push(k)
    }
    if (foreign.length) {
      return json(
        { error: 'key 不在登记表里（不是本站签出的对象），已拒绝删除', invalid: foreign.slice(0, 5) },
        400,
        request,
        env
      )
    }
  }

  const results = []
  for (const key of unique) {
    try {
      results.push(await purgeOne(env, key))
    } catch (err) {
      results.push({ key, ok: false, error: err && err.message })
    }
  }
  return json(
    { success: results.every((r) => r.ok), count: results.length, results },
    200,
    request,
    env
  )
}

/**
 * GET /api/files?prefix=&limit=&all=1&source=  （需要 X-Purge-Token）
 *
 *   source=registry（默认）—— 列**登记表**：我们亲手签出去过的东西，各自多大、谁传的；
 *   source=bucket          —— 直接问**桶**：权威、含历史对象，但只有对象键。
 * 两个都留着：前者能看出「这是谁传的」，后者能看出「桶里到底有什么」。
 */
async function handleFiles(request, env) {
  if (!adminOk(request, env)) return json({ error: '未授权' }, 401, request, env)
  const url = new URL(request.url)
  const prefix = url.searchParams.get('prefix') || ''

  if (url.searchParams.get('source') === 'bucket') {
    let objs = null
    try {
      objs = await relayListObjects(env, prefix)
    } catch (err) {
      console.error('files bucket list error:', err && err.message)
    }
    if (objs === null) return json({ error: '列目录失败（中继不可用或返回异常）' }, 502, request, env)
    // keys 保留是为了兼容既有脚本；objects 带上体积与上传时间（对账/回收要用）
    return json(
      {
        ok: true,
        source: 'bucket',
        prefix,
        count: objs.length,
        keys: objs.map((o) => o.key),
        objects: objs,
      },
      200,
      request,
      env
    )
  }

  const out = await registryOp(env, {
    op: 'file-list',
    prefix,
    limit: Number(url.searchParams.get('limit')) || FILE_LIST_MAX,
    all: url.searchParams.get('all') === '1',
  })
  if (!out) return json({ error: '登记表不可用' }, 503, request, env)
  return json({ ...out, source: 'registry' }, 200, request, env)
}

/**
 * GET /api/dl-stats  （需要 X-Purge-Token）
 * 本月两条通道各走了多少、登记了多少对象、有多少还没被认领 —— 用来看额度够不够、
 * 以及是不是又攒了一堆「传了没提交」的孤儿。
 */
async function handleDlStats(request, env) {
  if (!adminOk(request, env)) return json({ error: '未授权' }, 401, request, env)
  const out = await registryOp(env, { op: 'stats' })
  if (!out) return json({ error: '统计不可用' }, 503, request, env)
  const cfg = await registryCfgGet(env)
  return json(
    {
      ...out,
      mode: await dlModeWanted(env),
      modeSource: cfg && cfg.mode ? 'runtime' : 'env',
      envMode: String(env.DL_MODE || DL_MODE_DEFAULT),
      orphanMinutes: await gcOrphanMinutes(env),
      staleRecordHours: await gcStaleRecordHours(env),
      relayMonthlyGB: Number(env.DL_RELAY_MONTHLY_GB) || 0,
      directMonthlyGB: Number(env.DL_DIRECT_MONTHLY_GB) || 0,
      // 最近一次定时回收的结果。定时任务不打任何外部接口、日志也留不长，
      // 这是从外部确认「cron 真的在跑」的唯一证据。
      lastGc: (cfg && cfg.lastGc) || null,
      submitGate: {
        requireSource: pickBool(cfg && cfg.requireSource, env.SUBMIT_REQUIRE_SOURCE, SUBMIT_REQUIRE_SOURCE),
        maxPending: pickNum(cfg && cfg.maxPending, env.SUBMIT_MAX_PENDING, SUBMIT_MAX_PENDING),
        maxPerDay: pickNum(cfg && cfg.maxPerDay, env.SUBMIT_MAX_PER_DAY, SUBMIT_MAX_PER_DAY),
      },
    },
    200,
    request,
    env
  )
}

/**
 * GET /api/oss-check （需要 X-Purge-Token）→ 桶还是**私有**的吗？
 *
 * 为什么值得单开一个接口：整套下载防盗刷（短时直链、票据闸门、每设备每天 80 次）
 * 全部建立在「桶是私有的、不签名拿不到对象」这一个前提上。哪天有人在控制台把 Bucket
 * ACL 改成公共读（或给对象设了 public-read），所有闸门会**静默失效** —— 界面一切正常，
 * 只有账单会涨。所以需要一个能随时按一下的自检。
 *
 * 判据：不带任何签名直接 GET 一个对象。403 / 401 / 404 都算「外人拿不到」；
 * 只要回了 200 / 206，就是公共可读，必须立刻改回来。
 */
async function handleOssCheck(request, env) {
  if (!adminOk(request, env)) return json({ error: '未授权' }, 401, request, env)
  const base = String(env.OSS_PUBLIC_BASE || '').replace(/\/+$/, '')
  if (!base) return json({ error: '未配置 OSS_PUBLIC_BASE，无法探测' }, 503, request, env)

  const url = new URL(request.url)
  let key = url.searchParams.get('k') || ''
  if (!key) {
    for (const prefix of ['icon/', 'upload/', 'releases/', '']) {
      const objs = await relayListObjects(env, prefix)
      if (objs && objs.length) {
        key = objs[0].key
        break
      }
    }
  }
  if (!key) return json({ ok: false, error: '桶里没有可用对象做探测' }, 409, request, env)

  const target = `${base}/${key.split('/').map(encodeURIComponent).join('/')}`
  let status = 0
  try {
    const res = await fetch(target, { method: 'GET', headers: { Range: 'bytes=0-0' } })
    status = res.status
  } catch (err) {
    return json({ ok: false, error: `探测请求失败：${(err && err.message) || err}` }, 502, request, env)
  }
  const isPrivate = status === 403 || status === 401 || status === 404
  return json(
    {
      ok: true,
      key,
      status,
      private: isPrivate,
      hint: isPrivate
        ? '桶是私有的，匿名直读被拒（预期）'
        : '⚠️ 桶当前可被匿名直读：请把 Bucket ACL 改回 private，并检查有没有给对象设 public-read',
    },
    200,
    request,
    env
  )
}

/**
 * GET /api/dl-mode → 当前取回通道；（需要 X-Purge-Token）
 * POST /api/dl-mode { "mode": "relay" | "direct" | "auto" } → 一键切换。
 *
 * 配置存在 DO 里，所以**不用改 CF 绑定、不用重新部署**，也不怕哪天忘了环境里设的是啥：
 * GET 会把「运行时值 / 环境值」都回给你。切错了再切回来就行。
 * 后续要接 Telegram / QQ bot，也只是调这个接口，不必再动 Worker。
 */
async function handleDlMode(request, env) {
  if (!adminOk(request, env)) return json({ error: '未授权' }, 401, request, env)

  if (request.method === 'GET') {
    const cfg = await registryCfgGet(env)
    return json(
      {
        success: true,
        mode: await dlModeWanted(env),
        modeSource: cfg && cfg.mode ? 'runtime' : 'env',
        envMode: String(env.DL_MODE || DL_MODE_DEFAULT),
        orphanMinutes: await gcOrphanMinutes(env),
        staleRecordHours: await gcStaleRecordHours(env),
        // 投稿准入的三个旋钮也一并回给运维：挡得太死就放宽，被灌了垃圾就收紧，
        // 全都当场生效、不用重新部署。
        requireSource: pickBool(cfg && cfg.requireSource, env.SUBMIT_REQUIRE_SOURCE, SUBMIT_REQUIRE_SOURCE),
        maxPending: pickNum(cfg && cfg.maxPending, env.SUBMIT_MAX_PENDING, SUBMIT_MAX_PENDING),
        maxPerDay: pickNum(cfg && cfg.maxPerDay, env.SUBMIT_MAX_PER_DAY, SUBMIT_MAX_PER_DAY),
        lastGc: (cfg && cfg.lastGc) || null,
        updatedAt: (cfg && cfg.updatedAt) || null,
        options: ['auto', 'relay', 'direct'],
      },
      200,
      request,
      env
    )
  }

  let data
  try {
    data = await request.json()
  } catch {
    return json({ error: '请求格式错误' }, 400, request, env)
  }

  // 这是**运行时配置总入口**（当初只为切链路而开，后来孤儿阈值与投稿准入也挂在这里）。
  // 一次请求可以只带其中几项，带了的才改，没带的一律不动。
  const patch = {}

  if (data && data.mode !== undefined) {
    const raw = String(data.mode || '').trim().toLowerCase()
    // 只认这三个字面量。想「恢复默认」就传 auto，而不是传 null 把配置删掉 ——
    // 留一条 updatedAt 比留一条空白更利于事后追查是谁什么时候切的。
    if (raw !== 'auto' && raw !== 'relay' && raw !== 'direct') {
      return json({ error: 'mode 只接受 auto / relay / direct' }, 400, request, env)
    }
    patch.mode = raw
  }

  if (data && data.orphanMinutes !== undefined) {
    const n = Number(data.orphanMinutes)
    if (!Number.isFinite(n) || n < 1 || n > 7 * 24 * 60) {
      return json({ error: 'orphanMinutes 必须是 1 ~ 10080 之间的分钟数' }, 400, request, env)
    }
    patch.orphanMinutes = Math.round(n)
  }

  if (data && data.staleRecordHours !== undefined) {
    const n = Number(data.staleRecordHours)
    if (!Number.isFinite(n) || n < 1 || n > 24 * 365) {
      return json({ error: 'staleRecordHours 必须是 1 ~ 8760 之间的小时数' }, 400, request, env)
    }
    patch.staleRecordHours = Math.round(n)
  }

  if (data && data.maxPending !== undefined) {
    const n = Number(data.maxPending)
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return json({ error: 'maxPending 必须是 0 ~ 100 之间的整数（0 = 关闭这道闸门）' }, 400, request, env)
    }
    patch.maxPending = Math.round(n)
  }

  if (data && data.maxPerDay !== undefined) {
    const n = Number(data.maxPerDay)
    if (!Number.isFinite(n) || n < 0 || n > 1000) {
      return json({ error: 'maxPerDay 必须是 0 ~ 1000 之间的整数（0 = 关闭这道闸门）' }, 400, request, env)
    }
    patch.maxPerDay = Math.round(n)
  }

  if (data && data.requireSource !== undefined) {
    patch.requireSource = pickBool(data.requireSource, undefined, SUBMIT_REQUIRE_SOURCE)
  }

  if (!Object.keys(patch).length) {
    return json(
      {
        error:
          '没有要改的项。可传 mode / orphanMinutes / staleRecordHours / maxPending / maxPerDay / requireSource',
      },
      400,
      request,
      env
    )
  }

  const saved = await registryCfgSet(env, patch)
  if (!saved) return json({ error: '配置保存失败（DO 不可用）' }, 503, request, env)
  return json(
    { success: true, changed: Object.keys(patch), ...patch, updatedAt: saved.updatedAt || null },
    200,
    request,
    env
  )
}

/**
 * POST /api/link → { key, ttl? }  （需要 X-Purge-Token）
 * 手工拼一条**带时效**的 OSS 直链：维护者临时要看某个包时不必走站点，审核 Issue 里也能贴。
 * 默认 15 分钟，最长 1 小时 —— 再长这个接口就等于「发永久公开直链」的开关了。
 */
async function handleLink(request, env) {
  if (!adminOk(request, env)) return json({ error: '未授权' }, 401, request, env)
  let data
  try {
    data = await request.json()
  } catch {
    return json({ error: '请求格式错误' }, 400, request, env)
  }
  const key = String(data?.key || '').trim()
  if (!objectKeyOk(key)) return json({ error: 'key 非法' }, 400, request, env)
  const ttl = Math.min(Math.max(Number(data?.ttl) || DL_TICKET_TTL, 60), 3600)
  const url = await buildDirectUrl(env, key, dlFileName(key), ttl)
  if (!url) return json({ error: 'OSS 未配置或签名失败' }, 503, request, env)
  return json({ success: true, mode: 'direct', url, key, expiresIn: ttl }, 200, request, env)
}

/**
 * 签一条**只用于服务端复制**的 PUT 地址：多订一个 `x-oss-copy-source`。
 *
 * 与 ossPresignPut 的差别只有两处：CanonicalHeaders 多一行 `x-oss-copy-source`，
 * 以及 Content-Type 固定成 octet-stream（服务端复制不传字节体，但要保证请求里带的
 * Content-Type 和签的那个值一致 —— 这条规则和前端直传是同一个坑）。
 *
 * ⚠️ `x-oss-copy-source` **不要**写进 `x-oss-additional-headers`：它是 `x-oss-*`，
 *    本就「存在即自动参与签名」，再列一次会让 Additional Headers 那一行多一个值而对不上
 *    （与 content-type 一模一样的失败模式，见 ossPresignPut 的注释）。
 */
async function ossPresignCopy(env, fromKey, toKey) {
  const bucket = String(env.OSS_BUCKET).trim()
  const region = String(env.OSS_REGION || 'cn-shanghai').trim()
  const endpoint = String(env.OSS_ENDPOINT || `oss-${region}.aliyuncs.com`).trim()
  const host = `${bucket}.${endpoint}`

  const now = new Date()
  const dateStr = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}`
  const amzDate = `${dateStr}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`
  const credentialScope = `${dateStr}/${region}/oss/aliyun_v4_request`

  // 源键要 URL 编码：中文文件名/空格在 x-oss-copy-source 里必须编过，
  // 而且**签名里的值和实际发的头必须逐字一致**，所以两边共用这一个变量。
  const encodeKey = (k) => k.split('/').map(uriEncode).join('/')
  const copySource = `/${bucket}/${encodeKey(fromKey)}`
  const contentType = 'application/octet-stream'

  const query = {
    'x-oss-additional-headers': 'host',
    'x-oss-credential': `${env.OSS_ACCESS_KEY_ID}/${credentialScope}`,
    'x-oss-date': amzDate,
    'x-oss-expires': String(OSS_SIGN_TTL),
    'x-oss-signature-version': OSS_ALGO,
  }
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join('&')

  const canonicalUri = `/${bucket}/${encodeKey(toKey)}`
  // 按 header 名小写字典序：content-type < host < x-oss-copy-source
  const canonicalHeaders =
    `content-type:${contentType}\nhost:${host}\nx-oss-copy-source:${copySource}\n`
  const canonicalRequest = [
    'PUT',
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = [OSS_ALGO, amzDate, credentialScope, await sha256Hex(canonicalRequest)].join('\n')
  const secretBytes = textEncoder.encode(`aliyun_v4${env.OSS_ACCESS_KEY_SECRET}`)
  const kDate = await hmacSha256(secretBytes, dateStr)
  const kRegion = await hmacSha256(kDate, region)
  const kService = await hmacSha256(kRegion, 'oss')
  const kSigning = await hmacSha256(kService, 'aliyun_v4_request')
  const signature = toHex(await hmacSha256(kSigning, stringToSign))

  return {
    url: `https://${host}/${encodeKey(toKey)}?${canonicalQuery}&x-oss-signature=${signature}`,
    headers: { 'content-type': contentType, 'x-oss-copy-source': copySource },
  }
}

/**
 * POST /api/promote { key, to? }  （需要 X-Purge-Token）
 *
 * 把 `upload/` 下的对象**服务端复制**成 `releases/` 下的正式副本，返回新键。
 * CopyObject 是 OSS 服务端内部操作，**不吃任何外网流量**（对比「下载再上传」）。
 *
 * ⚠️ 本接口**只复制、绝不删除源对象**，这是刻意的：
 *    审核流程的顺序必须是「复制 → 改写 apps/<id>.json 里的 oss:// 引用 → 推送」，
 *    推送**成功之后**才删源。源对象在改写期间必须还在 —— 万一推送失败，站点上那份
 *    旧数据仍然指着 upload/，这时候把源删了就是整站 403。
 *    删源由调用方在推送成功后用 /api/purge 收尾（失败也只是留个孤儿，由回收任务兜底）。
 */
async function handlePromote(request, env) {
  if (!adminOk(request, env)) return json({ error: '未授权' }, 401, request, env)
  if (!env.OSS_BUCKET || !env.OSS_ACCESS_KEY_ID || !env.OSS_ACCESS_KEY_SECRET) {
    return json({ error: 'OSS 未配置' }, 503, request, env)
  }
  let data
  try {
    data = await request.json()
  } catch {
    return json({ error: '请求格式错误' }, 400, request, env)
  }
  const fromKey = String(data?.key || '').trim()
  // 只允许从「待审核」的 upload/ 里往 releases/ 搬，别的来源（soft/ 历史对象、图标）一律不动
  if (!/^upload\//.test(fromKey) || !dlKeyOk(fromKey)) {
    return json({ error: 'key 非法：只能迁移 upload/ 之下的对象' }, 400, request, env)
  }

  // 目标键：保持原来那一段文件名（里面带时间与随机串，天然唯一，不必再造一个）
  const base = fromKey.split('/').pop() || 'file'
  const now = new Date()
  const yyyy = String(now.getUTCFullYear())
  const mm = pad2(now.getUTCMonth() + 1)
  const toKey = String(data?.to || '').trim() || `${RELEASE_PREFIX}/${yyyy}/${mm}/${base}`
  if (!dlKeyOk(toKey) || !toKey.startsWith(RELEASE_PREFIX + '/')) {
    return json({ error: 'to 非法：目标必须落在 releases/ 之下' }, 400, request, env)
  }
  if (toKey === fromKey) return json({ error: '源和目标相同' }, 400, request, env)

  try {
    const signed = await ossPresignCopy(env, fromKey, toKey)
    const res = await fetch(signed.url, { method: 'PUT', headers: signed.headers })
    const text = await res.text()
    if (!res.ok) {
      console.error('promote copy failed:', res.status, text.slice(0, 300))
      return json(
        { error: `OSS 复制失败（HTTP ${res.status}）`, detail: text.slice(0, 300) },
        502,
        request,
        env
      )
    }
    // 目标对象也登记一笔（标 promoted，不算「待提交的孤儿」，回收任务不会碰它）
    const rec = await registryGet(env, fromKey)
    await registryPut(env, {
      key: toKey,
      size: (rec && Number(rec.size)) || 0,
      name: (rec && rec.name) || base,
      ctype: (rec && rec.ctype) || 'application/octet-stream',
      origin: RELEASE_PREFIX,
      fph: (rec && rec.fph) || '',
      ts: Date.now(),
      promotedFrom: fromKey,
      claimed: Date.now(),
      synced: 1,
      deleted: 0,
    })
    return json({ success: true, from: fromKey, to: toKey }, 200, request, env)
  } catch (err) {
    console.error('promote error:', err && err.message)
    return json({ error: `OSS 复制异常：${err && err.message}` }, 502, request, env)
  }
}

/* ── 孤儿对象回收 ─────────────────────────────────────────────────── */

/**
 * 回收阈值（分钟）。优先级：DO 运行时配置 > env > 常量默认。
 * 做成可在线调的原因很实在：15 分钟意味着「传完文件之后必须 15 分钟内点提交」，
 * 而投稿页是「先传、再慢慢填表」—— 想放宽时不该逼着人重新部署一次 Worker。
 */
/**
 * 失效登记记录的容忍时长（小时）。优先级与 orphanMinutes 一致：
 * DO 运行时配置 > 环境变量 > 代码常量。做成可调是为了能线上验证它真的会动手，
 * 也方便哪天想收紧成 6 小时、或放宽成 3 天，不必重新部署。
 */
async function gcStaleRecordHours(env) {
  const cfg = await registryCfgGet(env)
  const fromCfg = Number(cfg && cfg.staleRecordHours)
  if (Number.isFinite(fromCfg) && fromCfg > 0) return fromCfg
  const fromEnv = Number(env && env.GC_STALE_RECORD_HOURS)
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv
  return GC_STALE_RECORD_HOURS
}

async function gcOrphanMinutes(env) {
  const cfg = await registryCfgGet(env)
  const fromCfg = Number(cfg && cfg.orphanMinutes)
  if (Number.isFinite(fromCfg) && fromCfg > 0) return fromCfg
  const n = Number(env.GC_ORPHAN_MINUTES)
  return Number.isFinite(n) && n > 0 ? n : GC_ORPHAN_MINUTES
}

/**
 * 扫一遍「传了但没提交」的孤儿对象。
 *
 * 只删同时满足三条的：**登记表里有** + **从没被认领过** + **桶里那份的上传完成时刻早于阈值**。
 * 任何一步拿不到权威数据（登记表不可用 / 列桶失败）就直接放弃整轮，**不做任何删除** ——
 * 这类操作里最坏的结果不是"没删掉"，而是"判据缺了一半还照样删"。
 *
 * 只扫 `upload/` 与 `icon/`：`soft/` 是历史直传对象（可能正被引用）、`releases/` 是正式副本，
 * 都不在回收范围内。
 */
async function runGc(env, options) {
  const opts = options || {}
  const dry = opts.dry !== false
  const minutes = Number(opts.minutes) > 0 ? Number(opts.minutes) : await gcOrphanMinutes(env)
  const cutoff = Date.now() - minutes * 60000

  const pool = await registryUnclaimed(env)
  if (pool === null) {
    return { ok: false, error: '登记表不可用，整轮跳过（未做任何删除）' }
  }
  const pending = new Map()
  for (const f of pool) if (f && f.key) pending.set(f.key, f)

  const report = {
    dry,
    minutes,
    scanned: 0,
    pending: pending.size,
    orphan: [],
    deleted: [],
    failed: [],
    skipped: false,
    // 登记了但桶里没有对象的记录（签了名没真传 / 对象被别的方式删掉）
    staleRecords: [],
    droppedRecords: [],
    listingComplete: true,
    staleRecordHours: null,
  }

  // 桶里真实存在的键。同时记下列表有没有被截断 —— 决定后面敢不敢判「这个键不存在」。
  const present = new Set()
  let listingComplete = true
  report.listingComplete = true
  for (const prefix of ['upload/', 'icon/']) {
    const page = await relayListDetailed(env, prefix)
    if (page === null) {
      return { ok: false, error: `列桶失败（${prefix}），整轮跳过（未做任何删除）` }
    }
    if (page.truncated) {
      listingComplete = false
      report.listingComplete = false
    }
    report.scanned += page.objects.length
    for (const o of page.objects) {
      present.add(o.key)
      if (!pending.has(o.key)) continue // 没登记 / 已认领 / 是补登的 → 一律不动
      const t = Date.parse(o.lastModified)
      if (!Number.isFinite(t)) continue // 时间解不出来就当他刚传完，下一次再说
      if (t > cutoff) continue
      report.orphan.push({
        key: o.key,
        size: o.size,
        lastModified: o.lastModified,
        ageMinutes: Math.floor((Date.now() - t) / 60000),
      })
    }
  }

  // ── 失效登记记录：登记了、但桶里压根没有这个对象 ──────────────────
  // 签发上传地址时会先记一笔；签完名却没真传（关页面 / PUT 前断网）的，这条记录会永远
  // 卡在「待认领」。孤儿回收只看桶里存在的对象，根本轮不到它 —— 于是 `pending` 只涨不落。
  // 这里把它们丢掉：对象不存在就没什么可删的，丢的只是记账。
  // ⚠️ 两个前提缺一不可：① 列表必须完整（否则「不存在」是假的）；② 记录必须够老
  //    （2.5 GB 在慢链路上传几小时是正常的，不能因为「现在还没看到」就判它没传）。
  // ⚠️ 同样只在真跑时动手；干跑只报告。
  const staleRecordHours = await gcStaleRecordHours(env)
  report.staleRecordHours = staleRecordHours
  const staleCutoff = Date.now() - staleRecordHours * 3600000
  if (listingComplete) {
    for (const f of pool) {
      if (!f || !f.key || present.has(f.key)) continue
      if (!Number.isFinite(f.ts) || f.ts > staleCutoff) continue
      report.staleRecords.push({
        key: f.key,
        size: f.size,
        signedAgoHours: Math.floor((Date.now() - f.ts) / 3600000),
      })
    }
    if (!dry) {
      for (const item of report.staleRecords) {
        const r = await purgeOne(env, item.key, { onlyRegistry: true })
        if (r.ok) report.droppedRecords.push(item.key)
        else report.failed.push({ key: item.key, error: r.error || `HTTP ${r.status}` })
      }
    }
  }

  // 候选突然变多，多半是判据或配置出了问题。宁可这一轮什么都不做，也不清场。
  if (report.orphan.length > GC_MAX_DELETE) {
    report.skipped = true
    report.error = `候选 ${report.orphan.length} 个，超过单轮上限 ${GC_MAX_DELETE}，本轮不执行删除`
    return { ok: true, ...report }
  }

  if (!dry) {
    for (const item of report.orphan) {
      const r = await purgeOne(env, item.key)
      if (r.ok) report.deleted.push(item.key)
      else report.failed.push({ key: item.key, error: r.error || `HTTP ${r.status}` })
    }
  }
  return { ok: true, ...report }
}

/**
 * POST /api/gc  （需要 X-Purge-Token）
 * 手动跑一轮回收。**默认是干跑（只报告不删）**，要真删必须显式传 `{"dry": false}`。
 * 定时回收在 Worker 的 scheduled 里，不需要这个接口。
 *
 * 带 `{"minutes": N, "persist": true}` 可以把阈值**存进 DO**，之后定时任务也按它跑 ——
 * 放宽「上传后多久没提交才清理」不必重新部署。
 */
async function handleGc(request, env) {
  if (!adminOk(request, env)) return json({ error: '未授权' }, 401, request, env)
  let data = {}
  try {
    data = (await request.json()) || {}
  } catch {
    data = {}
  }
  const minutes = Number(data?.minutes) || 0
  if (minutes > 0 && data?.persist === true) {
    const saved = await registryCfgSet(env, { orphanMinutes: minutes })
    if (!saved) return json({ error: '配置保存失败（DO 不可用）' }, 503, request, env)
  }
  const out = await runGc(env, {
    dry: data?.dry !== false,
    minutes,
  })
  return json({ ...out, persisted: minutes > 0 && data?.persist === true }, out.ok ? 200 : 503, request, env)
}

/**
 * POST /api/registry-sync  （需要 X-Purge-Token）
 *
 * 以**桶为准**校准登记表：桶里有、登记表里没有的对象补登一笔（标 `synced: 1`）。
 *
 * 为什么第 5 点要单独说「只能走 ECS 渠道」：列桶这件事只有中继能做（它就是 OSS 的
 * 路径 1:1 代理，我们的 AK/SK 只在 Worker 里，不直接对外发列目录请求）。
 * 所以中继不通时同步就跳过，重不重建以「桶」为唯一权威这点不受影响。
 *
 * ⚠️ 补登的记录**必须**标 `synced` —— 否则它们会立刻变成「登记过、没认领」，
 *    被回收任务在 15 分钟后删掉。而这些正是登记表上线之前的历史对象，很可能正被引用。
 */
async function handleRegistrySync(request, env) {
  if (!adminOk(request, env)) return json({ error: '未授权' }, 401, request, env)
  let data = {}
  try {
    data = (await request.json()) || {}
  } catch {
    data = {}
  }
  const dry = data?.dry !== false

  const known = await registryOp(env, { op: 'file-map' })
  if (!known || !Array.isArray(known.files)) {
    return json({ error: '登记表不可用' }, 503, request, env)
  }
  const have = new Set(known.files.filter((f) => f && !f.deleted).map((f) => f.key))

  const bucket = []
  for (const prefix of ['upload/', 'icon/', 'releases/', 'soft/']) {
    const objs = await relayListObjects(env, prefix)
    if (objs === null) {
      return json({ error: `列桶失败（${prefix}），本轮跳过` }, 502, request, env)
    }
    for (const o of objs) bucket.push(o)
  }

  const missing = bucket.filter((o) => !have.has(o.key))
  const ghost = known.files
    .filter((f) => f && !f.deleted && !have.has(f.key))
    .filter((f) => !bucket.some((o) => o.key === f.key))
    .map((f) => f.key)

  const added = []
  if (!dry) {
    for (const o of missing) {
      const origin = o.key.split('/')[0]
      await registryPut(env, {
        key: o.key,
        size: o.size,
        name: o.key.split('/').pop() || '',
        ctype: '',
        origin,
        fph: '',
        ts: Number.isFinite(Date.parse(o.lastModified)) ? Date.parse(o.lastModified) : Date.now(),
        synced: 1,
        deleted: 0,
      })
      added.push(o.key)
    }
  }

  return json(
    {
      ok: true,
      dry,
      bucket: bucket.length,
      registry: have.size,
      // 桶里有、登记表没有 → 历史对象（补登）
      missingCount: missing.length,
      missing: missing.slice(0, 50).map((o) => ({ key: o.key, size: o.size, lastModified: o.lastModified })),
      // 登记表有、桶里没有 → 被桶外删掉了（外部操作 / 人工删桶），登记表该清账
      ghostCount: ghost.length,
      ghost: ghost.slice(0, 50),
      added: added.length,
    },
    200,
    request,
    env
  )
}


/**
 * Durable Object（SQLite 后端）。
 *
 * 这一个类被当成两种用途，靠实例名区分：
 *   · 设备实例（idFromName(fpHash)）—— 每天按指纹计数，状态就是 { day, n }；
 *   · 全局实例（idFromName(REGISTRY_ID)）—— 对象登记表（f: 前缀）与月度用量（m: 前缀）。
 *
 * 之所以不另开一个类：Durable Object 的新类要再声明一次迁移，而 `new_sqlite_classes`
 * 重复声明会直接报 10074。同一个类换实例名，省掉这一整摊事。
 */
export class DownloadGate {
  constructor(state) {
    this.state = state
  }

  /** 按东八区切天 —— 和站长的直觉一致 */
  static day() {
    return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
  }

  /** 按东八区切月，用量计数用 */
  static month() {
    return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7)
  }

  async fetch(request) {
    let body = {}
    try {
      body = (await request.json()) || {}
    } catch {}
    const op = String(body.op || 'check')

    if (op === 'file-put') {
      const rec = body.record || {}
      const key = String(rec.key || '')
      if (!key) return Response.json({ ok: false, error: 'key 为空' }, { status: 400 })
      const storeKey = FILE_KEY_PREFIX + key
      const prev = await this.state.storage.get(storeKey)
      await this.state.storage.put(storeKey, { ...rec, key })
      // 计数单独维护，别让每次换票都去 list 一遍整张表
      if (!prev || prev.deleted) {
        const meta = (await this.state.storage.get('meta')) || { files: 0, icons: 0, pending: 0 }
        meta.files = (Number(meta.files) || 0) + 1
        if (String(rec.origin) === ICON_PREFIX) meta.icons = (Number(meta.icons) || 0) + 1
        // 「待认领」只在记录从无到有（或从墓碑复活）且还没有人认领时 +1
        if (!rec.claimed && !rec.synced) meta.pending = (Number(meta.pending) || 0) + 1
        meta.updated = Date.now()
        await this.state.storage.put('meta', meta)
      }
      return Response.json({ ok: true, key, existed: !!prev })
    }

    if (op === 'file-get') {
      const file = await this.state.storage.get(FILE_KEY_PREFIX + String(body.key || ''))
      return Response.json({ ok: true, file: file || null })
    }

    if (op === 'file-del') {
      const storeKey = FILE_KEY_PREFIX + String(body.key || '')
      const cur = await this.state.storage.get(storeKey)
      if (!cur) return Response.json({ ok: true, existed: false })
      if (!cur.deleted) {
        await this.state.storage.put(storeKey, { ...cur, deleted: 1, deletedAt: Date.now() })
        const meta = (await this.state.storage.get('meta')) || { files: 0, icons: 0, pending: 0 }
        meta.files = Math.max(0, (Number(meta.files) || 0) - 1)
        if (String(cur.origin) === ICON_PREFIX) {
          meta.icons = Math.max(0, (Number(meta.icons) || 0) - 1)
        }
        if (!cur.claimed && !cur.synced) {
          meta.pending = Math.max(0, (Number(meta.pending) || 0) - 1)
        }
        meta.updated = Date.now()
        await this.state.storage.put('meta', meta)
      }
      return Response.json({ ok: true, existed: true })
    }

    /* 认领：投稿提交成功时把引用的对象标掉。这是孤儿回收唯一的免死金牌。 */
    if (op === 'file-claim') {
      const keys = Array.isArray(body.keys) ? body.keys : []
      const claimed = []
      let meta = null
      for (const k of keys) {
        const storeKey = FILE_KEY_PREFIX + String(k || '')
        const cur = await this.state.storage.get(storeKey)
        if (!cur || cur.claimed) continue
        await this.state.storage.put(storeKey, { ...cur, claimed: Date.now() })
        claimed.push(cur.key)
        if (!cur.deleted && !cur.synced) {
          meta = meta || (await this.state.storage.get('meta')) || { files: 0, icons: 0, pending: 0 }
          meta.pending = Math.max(0, (Number(meta.pending) || 0) - 1)
        }
      }
      if (meta) {
        meta.updated = Date.now()
        await this.state.storage.put('meta', meta)
      }
      return Response.json({ ok: true, claimed })
    }

    /* 回收任务用：把所有「登记过、没删过、没认领过、不是补登的」条目捞出来 */
    if (op === 'unclaimed-list') {
      const map = await this.state.storage.list({ prefix: FILE_KEY_PREFIX })
      const files = []
      for (const v of map.values()) {
        if (!v || v.deleted || v.claimed || v.synced) continue
        files.push(v)
        if (files.length >= FILE_LIST_MAX) break
      }
      return Response.json({ ok: true, count: files.length, files })
    }

    /* 同步任务用：整张表（含墓碑）的完整视图，用来和桶对账 */
    if (op === 'file-map') {
      const map = await this.state.storage.list({ prefix: FILE_KEY_PREFIX })
      const files = []
      for (const v of map.values()) {
        if (v) files.push(v)
        if (files.length >= FILE_LIST_MAX) break
      }
      return Response.json({ ok: true, count: files.length, files })
    }

    if (op === 'file-list') {
      const limit = Math.min(Number(body.limit) || FILE_LIST_MAX, FILE_LIST_MAX)
      const map = await this.state.storage.list({
        prefix: FILE_KEY_PREFIX + String(body.prefix || ''),
        limit,
      })
      const files = []
      for (const v of map.values()) {
        if (!body.all && v.deleted) continue
        files.push(v)
      }
      files.sort((a, b) => (b.ts || 0) - (a.ts || 0))
      return Response.json({ ok: true, count: files.length, files })
    }

    /* 上传签发限流（/api/oss-sign）。一天一个键，键里存 { 总次数, 总申报体积, 各来源计数 }，
       所以存储不会随访问量无界增长；顺便清掉前天的存档。 */
    if (op === 'sign-check') {
      const day = DownloadGate.day()
      const storeKey = SIGN_DAY_KEY_PREFIX + day
      let rec = await this.state.storage.get(storeKey)
      if (!rec || rec.day !== day) rec = { day, n: 0, bytes: 0, ips: {} }
      const ips = rec.ips && typeof rec.ips === 'object' ? rec.ips : {}
      const src = String(body.ip || 'unknown').slice(0, 32)
      const perIp = Math.max(1, Number(body.perIp) || SIGN_PER_IP_PER_DAY)
      const perDay = Math.max(1, Number(body.perDay) || SIGN_GLOBAL_PER_DAY)
      const bytesCap = Number(body.bytesPerDay)
      const bytes = Math.max(0, Number(body.bytes) || 0)
      const ipN = Number(ips[src]) || 0
      const n = Number(rec.n) || 0
      const used = Number(rec.bytes) || 0

      if (n >= perDay) {
        return Response.json({ allowed: false, scope: 'global', limit: perDay, used: n, remaining: 0 })
      }
      if (Number.isFinite(bytesCap) && bytesCap > 0 && used + bytes > bytesCap) {
        return Response.json({ allowed: false, scope: 'global', limit: perDay, used: n, remaining: 0 })
      }
      if (ipN >= perIp) {
        return Response.json({ allowed: false, scope: 'ip', limit: perIp, used: ipN, remaining: 0 })
      }
      rec.n = n + 1
      rec.bytes = used + bytes
      ips[src] = ipN + 1
      rec.ips = ips
      await this.state.storage.put(storeKey, rec)
      if (Math.random() < 0.02) {
        try {
          const stale = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)
          await this.state.storage.delete(SIGN_DAY_KEY_PREFIX + stale)
        } catch {}
      }
      return Response.json({ allowed: true, used: rec.n, limit: perDay, remaining: Math.max(0, perDay - rec.n) })
    }

    if (op === 'bytes-add') {
      const mode = body.mode === 'direct' ? 'direct' : 'relay'
      const bytes = Math.max(0, Number(body.bytes) || 0)
      const month = DownloadGate.month()
      const storeKey = BYTES_KEY_PREFIX + month
      let rec = await this.state.storage.get(storeKey)
      if (!rec || rec.month !== month) rec = { month, relay: 0, direct: 0 }
      rec[mode] = (Number(rec[mode]) || 0) + bytes
      await this.state.storage.put(storeKey, rec)
      return Response.json({ ok: true, month, relay: rec.relay, direct: rec.direct })
    }

    if (op === 'stats') {
      const month = DownloadGate.month()
      const used = (await this.state.storage.get(BYTES_KEY_PREFIX + month)) || {}
      const meta = (await this.state.storage.get('meta')) || { files: 0, icons: 0, pending: 0 }
      return Response.json({
        ok: true,
        month,
        relay: Number(used.relay) || 0,
        direct: Number(used.direct) || 0,
        files: Number(meta.files) || 0,
        icons: Number(meta.icons) || 0,
        // 登记过但还没被任何一次提交认领的数量 —— 大于 0 就说明要么有投稿卡在表单里，
        // 要么回收任务在等 15 分钟窗口，要么中继挂了没跑成
        pending: Number(meta.pending) || 0,
      })
    }

    /* 运行时配置（目前只有取回通道 mode），切链路不必改 CF 绑定 */
    if (op === 'cfg-get') {
      const cfg = (await this.state.storage.get(CFG_KEY)) || null
      return Response.json({ ok: true, cfg })
    }

    if (op === 'cfg-set') {
      const cur = (await this.state.storage.get(CFG_KEY)) || {}
      const patch = body.cfg || {}
      const next = { ...cur }
      for (const k of Object.keys(patch)) {
        if (patch[k] === null || patch[k] === undefined) delete next[k]
        else next[k] = patch[k]
      }
      next.updatedAt = Date.now()
      await this.state.storage.put(CFG_KEY, next)
      return Response.json({ ok: true, cfg: next, updatedAt: next.updatedAt })
    }

    /* 投稿限流计数：按投稿人哈希记一串时间戳，滑动窗口。
       写入时顺手把窗口外的裁掉，于是这个键的大小天然有界，不需要定时清理。 */
    if (op === 'submit-tick') {
      const sid = String(body.sid || '').slice(0, 32)
      if (!sid) return Response.json({ ok: false, error: 'sid 为空' }, { status: 400 })
      const storeKey = SUBMIT_KEY_PREFIX + sid
      const now = Date.now()
      const prev = (await this.state.storage.get(storeKey)) || { ts: [] }
      const ts = (Array.isArray(prev.ts) ? prev.ts : []).filter(
        (t) => Number.isFinite(t) && now - t < SUBMIT_WINDOW_MS
      )
      ts.push(now)
      await this.state.storage.put(storeKey, { ts, updated: now })
      return Response.json({ ok: true, used: ts.length })
    }

    /* 清掉长期没动静的限流键（cron 每天顺带跑一次，避免 storage 里积垃圾） */
    if (op === 'submit-prune') {
      const days = Number(body.days) > 0 ? Number(body.days) : 30
      const cutoff = Date.now() - days * 86400000
      const list = await this.state.storage.list({ prefix: SUBMIT_KEY_PREFIX })
      const stale = []
      for (const [k, v] of list) {
        if (!v || !Number.isFinite(v.updated) || v.updated < cutoff) stale.push(k)
      }
      if (stale.length) await this.state.storage.delete(stale)
      return Response.json({ ok: true, removed: stale.length })
    }

    /* ── 教室喊话（ann: 前缀，固定跑在 __announce__ 实例上）───────────
       配对码固定且全教室机共用 → 一码多机广播语义，三个键：
         ann:r:<pairCode>  最近一次发送时刻（限流，窗口外放行，键保留无害）
         ann:d:<pairCode>  设备注册表 { deviceId: 最近轮询时刻 }，轮询续期、超期剪枝
         ann:m:<pairCode>  当前待播消息（targets 限定送达对象；consumed 逐机销账，
                           全员取走或 TTL 到期即删。targets 缺省 = 注册表全员广播） */

    /* 发送：限流 → 目标解析（指定 targets 或注册表全员）→ 写消息 */
    if (op === 'ann-send') {
      const pairCode = String(body.pairCode || '')
      const rateKey = ANN_RL_PREFIX + pairCode
      const prev = await this.state.storage.get(rateKey)
      if (prev && Number.isFinite(prev.t) && Date.now() - prev.t < ANN_RATE_MS) {
        return Response.json({ ok: false, error: 'rate_limited' }, { status: 429 })
      }
      const regKey = ANN_BIND_PREFIX + pairCode
      const reg = (await this.state.storage.get(regKey)) || {}
      // 剪枝：注册表里太长时间没轮询的设备视为离线
      // （值兼容两种形态：旧格式是纯数字时间戳，新格式是 { t, n }）
      const cutoff = Date.now() - ANN_BIND_TTL * 1000
      for (const dev of Object.keys(reg)) {
        const v = reg[dev]
        const t = v && typeof v === 'object' ? v.t : v
        if (!Number.isFinite(t) || t < cutoff) delete reg[dev]
      }
      await this.state.storage.put(regKey, reg)

      // 目标解析：带了 targets（桌面端绑定设备定向/批量）就**只**对名单内已注册的设备生效，
      // 名单里一台都不在线 → no_device（不会悄悄退化成广播）；不带 targets = 注册表全员广播。
      let targets
      if (Array.isArray(body.targets)) {
        targets = [...new Set(body.targets.map(String).filter((t) => reg[t]))]
        if (targets.length === 0) {
          return Response.json({ ok: false, error: 'no_device' }, { status: 403 })
        }
      } else {
        targets = Object.keys(reg)
        if (targets.length === 0) {
          return Response.json({ ok: false, error: 'no_device' }, { status: 403 })
        }
      }

      await this.state.storage.put(rateKey, { t: Date.now() })
      await this.state.storage.put(
        ANN_MSG_PREFIX + pairCode,
        {
          id: String(body.id || ''),
          text: String(body.text || ''),
          from: String(body.from || ''),
          duration: Number(body.duration) || ANN_DURATION_DEFAULT,
          ts: Date.now(),
          targets,
          consumed: {},
        },
        { expirationTtl: ANN_TTL }
      )
      return Response.json({ ok: true, devices: targets.length, skipped: body.targets ? body.targets.length - targets.length : 0 })
    }

    /* 轮询：注册/续期自己（带机器名，供发送端展示）→ 在 targets 名单内且未取过则返回并销账；
       全员取走即删 */
    if (op === 'ann-poll') {
      const pairCode = String(body.pairCode || '')
      const deviceId = String(body.deviceId || '')
      const name = String(body.name || '').slice(0, 32)
      const regKey = ANN_BIND_PREFIX + pairCode
      const reg = (await this.state.storage.get(regKey)) || {}
      reg[deviceId] = { t: Date.now(), n: name }
      await this.state.storage.put(regKey, reg, { expirationTtl: ANN_BIND_TTL })

      const msgKey = ANN_MSG_PREFIX + pairCode
      const msg = await this.state.storage.get(msgKey)
      if (!msg) return Response.json({ ok: true, msg: null })
      if (Array.isArray(msg.targets) && !msg.targets.includes(deviceId)) {
        return Response.json({ ok: true, msg: null })   // 定向消息，不发给这台
      }
      if (msg.consumed && msg.consumed[deviceId]) {
        return Response.json({ ok: true, msg: null })   // 这台已经取过这条了
      }
      if (!msg.consumed) msg.consumed = {}
      msg.consumed[deviceId] = true
      // targets 兜底：旧格式存量消息没有 targets 字段，按"取到即完"算，避免 length 读undefined
      const tgt = Array.isArray(msg.targets) && msg.targets.length ? msg.targets : [deviceId]
      if (Object.keys(msg.consumed).length >= tgt.length) {
        await this.state.storage.delete(msgKey)         // 名单内全取走了，提前清
      } else {
        await this.state.storage.put(msgKey, msg, { expirationTtl: ANN_TTL })
      }
      return Response.json({ ok: true, msg })
    }

    /* 设备列表：返回配对码下所有未过期设备（发送端"已配对设备"卡的数据源）。
       顺手剪枝，读一次等于做一次维护。 */
    if (op === 'ann-list') {
      const pairCode = String(body.pairCode || '')
      const regKey = ANN_BIND_PREFIX + pairCode
      const reg = (await this.state.storage.get(regKey)) || {}
      const cutoff = Date.now() - ANN_BIND_TTL * 1000
      const devices = []
      for (const [dev, v] of Object.entries(reg)) {
        const t = v && typeof v === 'object' ? v.t : v
        if (!Number.isFinite(t) || t < cutoff) {
          delete reg[dev]
          continue
        }
        devices.push({
          id: dev,
          name: v && typeof v === 'object' ? String(v.n || '') : '',
          ts: t,
        })
      }
      await this.state.storage.put(regKey, reg, { expirationTtl: ANN_BIND_TTL })
      devices.sort((a, b) => b.ts - a.ts)
      return Response.json({ ok: true, devices })
    }

    // 默认 = 设备每日额度检查
    let limit = DL_DAILY_LIMIT
    if (Number.isFinite(Number(body.limit))) limit = Number(body.limit)
    const day = DownloadGate.day()
    let rec = await this.state.storage.get('rec')
    if (!rec || rec.day !== day) rec = { day, n: 0 }

    if (rec.n >= limit) {
      return Response.json({ allowed: false, day, used: rec.n, limit })
    }
    rec.n += 1
    await this.state.storage.put('rec', rec)
    return Response.json({ allowed: true, day, used: rec.n, limit })
  }
}

/** 图标对象键校验：只放行 icon/ 前缀 */
function iconKeyOk(key) {
  if (typeof key !== 'string') return false
  if (key.length < 6 || key.length > 300) return false
  if (!key.startsWith(ICON_PREFIX + '/')) return false
  if (key.includes('..') || key.includes('//')) return false
  if (/[\u0000-\u001f\u007f\\]/.test(key)) return false
  return true
}

/**
 * GET /api/icon?k=icon/2026/10/xxx.png
 *
 * 图标是「小图 + 需要长期公开」：审核用的 Issue 里要能直接点开、维护者的
 * icon-sync 脚本要能拉。所以它**不进**下载闸门（没有票据、也没法在 <img> 里带票据），
 * 但严格限制在 icon/ 前缀内，并且超过 ICON_MAX_BYTES 直接拒掉。
 */
async function handleIcon(request, env, ctx) {
  const url = new URL(request.url)
  const key = url.searchParams.get('k') || ''
  if (!iconKeyOk(key)) return json({ error: '图标地址无效' }, 400, request, env)

  const method = request.method === 'HEAD' ? 'HEAD' : 'GET'

  // ── 边缘缓存 ──────────────────────────────────────────────────────
  // 没有这一层的话，每个访客的每次浏览都要走「Worker → ECS 中继 → OSS」把同一张图
  // 再取一遍。缓存 key 特意用一个固定的内部域名（而不是本次请求的 origin）：本 Worker
  // 同时挂在两个入口域上，共用一份缓存才不会重复回源。
  // 拿不到 Cache API 时退化成直连回源 —— 慢一点，但功能不受影响。
  const cache = globalThis.caches && globalThis.caches.default
  const cacheKey = new Request(`https://icon.cache.invalid/?k=${encodeURIComponent(key)}`)
  if (ctx && cache) {
    try {
      const hit = await cache.match(cacheKey)
      if (hit) {
        const headers = new Headers(hit.headers)
        headers.set('X-Icon-Cache', 'HIT')
        return new Response(method === 'HEAD' ? null : hit.body, { status: hit.status, headers })
      }
    } catch (err) {
      // 缓存本身出问题不该让图标挂掉，当 MISS 继续回源
      console.error('icon cache read error:', err && err.message)
    }
  }

  let relay
  try {
    relay = await relayOpen(env, key, method, request.headers.get('Range'))
  } catch (err) {
    console.error('icon relay error:', err && err.message)
    return json({ error: '图标服务暂时不可用' }, 502, request, env)
  }
  if (!relay.reader) return json({ error: relay.text || '图标不存在' }, relay.status || 502, request, env)

  const size = Number(relay.headers['content-length'] || 0)
  if (size > ICON_MAX_BYTES) {
    try { relay.reader.releaseLock() } catch {}
    try { relay.socket.close() } catch {}
    return json({ error: '图标文件过大' }, 413, request, env)
  }

  const res = relayRespond(relay, method, null)
  const headers = new Headers(res.headers)
  headers.set('Cache-Control', `public, max-age=${ICON_EDGE_TTL}, immutable`)
  headers.set('Access-Control-Allow-Origin', '*')
  // 图标是「用户上传的内容」里唯一会直接进 <img> 的东西，两个头必须锁死：
  //   nosniff —— 禁止浏览器无视 Content-Type 去猜类型；
  //   CSP     —— 万一这东西被别处当文档打开，也让它没有脚本能力、没有同源。
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox")
  // 元数据里的 Content-Type 一律不采用：GET 会在下面按字节嗅探后重设；
  // HEAD 没有 body，统一按二进制流声明（HEAD 本来也不下载内容）。
  headers.set('Content-Type', DEFAULT_CONTENT_TYPE)

  if (method === 'HEAD') {
    return new Response(null, { status: res.status, headers })
  }

  // 图标已经在上面的 ICON_MAX_BYTES 里封过顶（≤5 MB），整读进内存再写缓存最省事 ——
  // 改用流式 tee 反而要多留一份缓冲，而且 Cache API 只吃完整响应。
  const body = await res.arrayBuffer()

  // ── 内容嗅探：不信「存进去时是什么类型」，只信字节 ──────────────────
  // 上传路径虽然会把图标重编码成位图（见 src/gallery/iconResize.ts 的 canvas 重编码），
  // 但历史对象、手工塞进桶里的东西都不受那条约束。这里按魔数认格式，并且**只下发位图**：
  // 认不出来的一律 415，绝不回落成 application/octet-stream —— 那等于把
  // 「让浏览器猜类型」这个老洞重新打开。
  const sniffed = sniffImage(body)
  if (!sniffed) {
    return json({ error: '不是受支持的图片格式（只收 PNG / JPEG / GIF / WebP / BMP / ICO）' }, 415, request, env)
  }
  headers.set('Content-Type', sniffed)

  if (ctx && cache && res.status === 200) {
    const cacheHeaders = new Headers(headers)
    cacheHeaders.delete('X-Icon-Cache')
    ctx.waitUntil(
      cache.put(cacheKey, new Response(body, { status: 200, headers: cacheHeaders })).catch((err) => {
        console.error('icon cache write error:', err && err.message)
      })
    )
  }

  headers.set('X-Icon-Cache', 'MISS')
  return new Response(body, { status: res.status, headers })
}

/* ── 教室喊话：DO 调用封装（与 registryOp 同一套容错口径）────────── */
async function announceOp(env, payload) {
  if (!env.DL_GATE) return null
  try {
    const id = env.DL_GATE.idFromName(ANN_ID)
    const res = await env.DL_GATE.get(id).fetch('https://dl-gate/op', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return await res.json()
  } catch (err) {
    console.error('announce op error:', err && err.message)
    return null
  }
}

/**
 * POST /api/announce/send —— 发送喊话（网页端与桌面端同一接口）。
 * 入参 { pairCode, text, from?, duration? }；无在线设备 403、发太快 429。
 * 成功返回 { ok: true, id, devices }（devices = 将收到的教室机数）。
 */
async function handleAnnounceSend(request, env) {
  let data
  try {
    data = await request.json()
  } catch {
    return json({ error: 'bad_request' }, 400, request, env)
  }

  const pairCode = String(data?.pairCode || '').trim()
  const text = String(data?.text || '').trim()
  const from = String(data?.from || '').trim()
  let duration = Number(data?.duration) || ANN_DURATION_DEFAULT

  if (!/^\d{6}$/.test(pairCode)) return json({ error: 'bad_request' }, 400, request, env)
  if (!text || text.length > ANN_TEXT_MAX) {
    return json({ error: 'bad_request' }, 400, request, env)
  }
  if (from.length > ANN_FROM_MAX) return json({ error: 'bad_request' }, 400, request, env)
  if (!(duration >= ANN_DURATION_MIN && duration <= ANN_DURATION_MAX)) {
    duration = ANN_DURATION_DEFAULT
  }

  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  // targets（可选）：定向/批量发送的设备号名单。**带了这个字段就一定定向**（滤完整为空由 DO 侧回
  // no_device，不会退化成广播）；只留合法 hex 串。不带字段 = 注册表全员广播。
  const targets = Array.isArray(data?.targets)
    ? data.targets.map((t) => String(t).trim()).filter((t) => /^[0-9a-f]{16,64}$/i.test(t))
    : undefined
  const out = await announceOp(env, { op: 'ann-send', pairCode, text, from, duration, id, targets })
  if (!out) return json({ error: 'internal' }, 500, request, env)
  if (out.ok) return json({ ok: true, id, devices: out.devices || 0 }, 200, request, env)
  if (out.error === 'rate_limited') return json({ error: 'rate_limited' }, 429, request, env)
  if (out.error === 'no_device') return json({ error: 'no_device' }, 403, request, env)
  return json({ error: 'internal' }, 500, request, env)
}

/**
 * GET /api/announce/poll?deviceId=&pairCode=&name= —— 教室机轮询取件。
 * 固定配对码多机共用：轮询即注册/续期自己（name = 机器名，选填，供发送端列表展示），
 * 无新消息 204；有消息 200 { id, text, from, duration, ts }，每台设备对同一条消息只取一次。
 */
async function handleAnnouncePoll(request, env) {
  const url = new URL(request.url)
  const deviceId = (url.searchParams.get('deviceId') || '').trim()
  const pairCode = (url.searchParams.get('pairCode') || '').trim()
  const name = (url.searchParams.get('name') || '').trim().slice(0, 32)
  if (!/^[0-9a-f]{16,64}$/i.test(deviceId) || !/^\d{6}$/.test(pairCode)) {
    return json({ error: 'bad_request' }, 400, request, env)
  }

  const out = await announceOp(env, { op: 'ann-poll', deviceId, pairCode, name })
  if (!out) return json({ error: 'internal' }, 500, request, env)
  if (!out.ok) {
    return json({ error: out.error || 'unknown_pair' }, 403, request, env)
  }
  if (!out.msg) return new Response(null, { status: 204, headers: corsHeaders(request, env) })
  return json(
    {
      id: out.msg.id,
      text: out.msg.text,
      from: out.msg.from,
      duration: out.msg.duration,
      ts: out.msg.ts,
    },
    200,
    request,
    env
  )
}

/**
 * GET /api/announce/list?pairCode= —— 配对码下已登记设备列表（发送端"已配对设备"卡的数据源）。
 * 返回 { ok: true, devices: [{ id, name, ts }] }，ts = 最近轮询时刻（毫秒），按最近在线排序。
 */
async function handleAnnounceList(request, env) {
  const url = new URL(request.url)
  const pairCode = (url.searchParams.get('pairCode') || '').trim()
  if (!/^\d{6}$/.test(pairCode)) return json({ error: 'bad_request' }, 400, request, env)

  const out = await announceOp(env, { op: 'ann-list', pairCode })
  if (!out) return json({ error: 'internal' }, 500, request, env)
  return json({ ok: true, devices: out.devices || [] }, 200, request, env)
}

export default {
  async fetch(request, env, ctx) {
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
      return handleOssSign(request, env, ctx)
    }
    if (url.pathname === '/api/mirror-sign' && request.method === 'GET') {
      return handleMirrorSign(request, env)
    }
    if (url.pathname === '/api/icon' && (request.method === 'GET' || request.method === 'HEAD')) {
      return handleIcon(request, env, ctx)
    }
    if (url.pathname === '/api/dl-ticket' && request.method === 'POST') {
      return handleDlTicket(request, env, ctx)
    }
    if (url.pathname === '/api/dl' && (request.method === 'GET' || request.method === 'HEAD')) {
      return handleDl(request, env)
    }
    if (url.pathname === '/api/purge' && request.method === 'POST') {
      return handlePurge(request, env)
    }
    // ── 管理接口（都要 X-Purge-Token，只给站长与 CI 用）──────────────
    if (url.pathname === '/api/files' && request.method === 'GET') {
      return handleFiles(request, env)
    }
    if (url.pathname === '/api/dl-stats' && request.method === 'GET') {
      return handleDlStats(request, env)
    }
    if (url.pathname === '/api/link' && request.method === 'POST') {
      return handleLink(request, env)
    }
    if (url.pathname === '/api/promote' && request.method === 'POST') {
      return handlePromote(request, env)
    }
    if (url.pathname === '/api/gc' && request.method === 'POST') {
      return handleGc(request, env)
    }
    if (url.pathname === '/api/registry-sync' && request.method === 'POST') {
      return handleRegistrySync(request, env)
    }
    if (url.pathname === '/api/dl-mode' && (request.method === 'GET' || request.method === 'POST')) {
      return handleDlMode(request, env)
    }
    if (url.pathname === '/api/oss-check' && request.method === 'GET') {
      return handleOssCheck(request, env)
    }
    if (url.pathname === '/api/announce/send' && request.method === 'POST') {
      return handleAnnounceSend(request, env)
    }
    if (url.pathname === '/api/announce/poll' && request.method === 'GET') {
      return handleAnnouncePoll(request, env)
    }
    if (url.pathname === '/api/announce/list' && request.method === 'GET') {
      return handleAnnounceList(request, env)
    }

    return json({ error: 'Not Found' }, 404, request, env)
  },

  /**
   * 定时回收「传了但没提交」的孤儿对象。
   *
   * 放在 Worker 自己的 cron 里而不是 GitHub Actions：
   *   · 判据全在 Worker 手边（登记表 + 中继列桶），不需要把 token 交给外部任务；
   *   · Actions 的 schedule 最密也只有 5 分钟、实际延迟常常十几分钟到几小时（高负载时会被跳过），
   *     而这里要的是「15 分钟没提交就清掉」，靠 Actions 根本追不上。
   * 定时器本身在 CF 侧配置（cf-deploy-worker.py --cron），不是写在这里。
   */
  async scheduled(event, env, ctx) {
    const run = async () => {
      const summary = { at: Date.now(), ok: false, orphan: 0, deleted: 0, failed: 0, skipped: false, error: '' }
      try {
        const r = await runGc(env, { dry: false })
        summary.ok = !!r.ok
        summary.error = r.error || ''
        summary.minutes = r.minutes
        summary.scanned = r.scanned
        summary.pending = r.pending
        summary.orphan = (r.orphan || []).length
        summary.deleted = (r.deleted || []).length
        summary.failed = (r.failed || []).length
        summary.skipped = !!r.skipped
      } catch (err) {
        // 回收失败绝不能冒泡成一次「运行报错」，它只是个后台清理工
        summary.error = String((err && err.message) || err)
      }
      console.log('gc:', JSON.stringify(summary))
      // 心跳：把最近一次的结果落进 DO，/api/dl-stats 会读它。
      // 定时任务不打任何外部接口、Worker 日志也只留很短时间，没有这条心跳就
      // 根本无法从外部确认「cron 到底跑没跑」——只能靠等一个对象过期来猜。
      try {
        await registryCfgSet(env, { lastGc: summary })
      } catch (err) {
        console.error('gc heartbeat error:', err && err.message)
      }
      // 顺带清掉过期的投稿限流键，别让 DO storage 慢慢积垃圾
      try {
        await registryOp(env, { op: 'submit-prune', days: 30 })
      } catch (err) {
        console.error('submit-prune error:', err && err.message)
      }
    }
    if (ctx) ctx.waitUntil(run())
    else await run()
  },
}
