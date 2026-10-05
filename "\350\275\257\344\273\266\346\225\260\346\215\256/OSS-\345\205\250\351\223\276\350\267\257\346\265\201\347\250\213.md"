# OSS 全链路流程（上传 · 取回 · 登记 · 清理）

> 面向维护者。所有接口都挂在同一个 Cloudflare Worker（脚本名 `classhub`）上。
> 入口域：`https://cshapi.132614.xyz`、`https://submit.132614.xyz`
> —— 前端按顺序试，并把上次成功的那个记进 `localStorage`，下次优先用它。
> 桶：`classsoftwarehub`（`cn-shanghai`），**私有**，任何裸直链打开都是 403。

---

## 0. 角色与凭据

| 角色 | 位置 | 干什么 | 持有凭据 |
| --- | --- | --- | --- |
| 静态站 | GitHub Pages / CF Pages | 只拿「预签名地址」和「短时票据」 | **无** |
| Worker `classhub` | Cloudflare | 签发预签名、发票据、转发内容、登记对象、清理 | Secrets：`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`、`RELAY_TOKEN`、`DL_SIGN_SECRET`、`PURGE_TOKEN`、`GITHUB_TOKEN` |
| ECS 中继 | `8.159.148.101:8091` | 用 OSS **内网**端点读写同一个桶 | 请求头 `X-Api-Key` |
| OSS 桶 | 阿里云 `classsoftwarehub` | 唯一存储 | 只有 Worker 有 AK/SK |
| Durable Object | `DownloadGate`（同一类两个实例名） | 登记表 + 设备计数 + 月度用量 | 无 |

**凭据一分别外流**：AK/SK 只在 Cloudflare Secret 里；前端拿到的永远是一条「只能写单个对象、一小时有效」的地址，或一条「15 分钟有效」的读取地址。

---

## 1. 上传链路（投稿改走浏览器直传）

```
访客选文件
   │  ① 图片先在本地压缩（createImageBitmap → canvas → WebP 128px）
   ▼
POST /api/oss-sign  { name, size, contentType, purpose, fp }
   │  ② Worker：
   │     · 体积闸门   file ≤ 4 GB   icon ≤ 1 MB
   │     · 生成对象键 upload/<年>/<月>/<36进制时间>-<6位随机>-<安全文件名>
   │     · ★签发即登记（丢 waitUntil，不拖慢签发）
   │     · 签一条只允许 PUT 这一个键的 V4 预签名地址（TTL 3600s）
   ▼
{ url, publicUrl, key, contentType, expiresIn, maxBytes }
   │  ③ 浏览器直接 PUT 到 OSS —— 进度条就是这一步
   │     ⚠️ Content-Type 必须原样照抄服务端回传的值，否则 403 SignatureDoesNotMatch
   ▼
④ 回填 **对象键**（不是直链；桶是私有的，直链谁打开都 403）到草稿
   ▼
POST /api/submit → 开 Issue（标题带 [待审核]）
   ▼
审核打标签
   ├─ approved  → review-submission.yml 合并成 软件数据/apps/<id>.json
   └─ rejected  → 同一工作流调 /api/purge（按草稿里的 OSS 键删）→ 关 Issue
```

**键的两种前缀，决定它后面怎么被读：**

| `purpose` | 前缀 | 读取路径 | 上限 |
| --- | --- | --- | --- |
| `file`（默认） | `upload/` | `/api/dl-ticket` → `/api/dl` 票据闸门 | 4 GB |
| `icon` | `icon/` | `/api/icon` 公开只读 | 签发 1 MB / 读取 5 MB |

> 为什么要有 `icon` 这条独立路径：审核 Issue 里要能直接点开图片看。图标走公开只读，代价是必须把体积卡死 —— 否则谁都能往这个前缀里灌大文件刷流量。

---

## 2. 取回链路（双通道）

桶是私有的，所以每一次下载都得「服务端点头」。服务端备了**两条互不相干**的路径，各自吃一份免费额度，谁先用满就自动换另一条。

| 通道 | 链路 | 流量记在谁头上 | 绑设备指纹 |
| --- | --- | --- | --- |
| `relay` | 浏览器 → Worker →（原生 TCP）ECS:8091 → OSS 内网端点 | ECS 公网带宽 | ✅ |
| `direct` | 浏览器 →（15 分钟预签名直链）OSS | OSS 出网流量 | ❌ |

### 2.1 领票 `POST /api/dl-ticket`

```
{ key, fp, prefer? }
   │
   ├─① 闸门：DO 设备实例（idFromName(fpHash)）按东八区切天计数
   │     每台设备每天 80 张，超了 429 + 剩余次数
   ├─② 查登记表拿 size（分流用，也顺手回给前端）
   ├─③ 读本月用量 relay / direct，与 DL_RELAY_MONTHLY_GB / DL_DIRECT_MONTHLY_GB 比
   ├─④ 定主通道：
   │     DL_MODE=auto（默认）→ 先 relay；仅当 relay 见底而 direct 还有额度时才倒过来
   │     DL_MODE=relay / direct → 强制走一条（应急、对拍、临时停某条通道）
   ├─⑤ auto 下当场 HEAD 探活中继
   │     2xx / 3xx  → 活
   │     404        → **也算活**（对象没了而已，中继好着呢；换直链只会把用量记到错的通道）
   │     401 / 403  → 不活（令牌不对，链路等于断了）
   │     5xx / 无响应 → 不活
   │     → 不活就切成 direct
   ▼
{ mode, url, fallback, key, size, expiresIn: 900, dailyLimit: 80, remaining }
   └─ 按 size 记一笔 bytes-add 到实际使用的通道
```

### 2.2 下载 `GET|HEAD /api/dl?k=&e=&h=&s=&f=`

逐项校验，任一不过就拒：

| 校验 | 不过时的响应 |
| --- | --- |
| 对象键前缀白名单（`upload/`、`soft/`） | 400 |
| 有效期 `e` 未过期（900s） | 410 |
| HMAC 签名 `s` 与 `DL_SIGN_SECRET` 一致 | 403 |
| 指纹 `f` 哈希后等于票据里的 `h` | 403 |

过了之后：原生 TCP 连 ECS（`cloudflare:sockets`，因为 Worker 的 `fetch()` 不允许裸 IP，会回 1003），带 `X-Api-Key` 取流，**流式**原样转发给浏览器，`Content-Disposition` 按原名生成；`Range` 请求回 206，支持断点续传。

### 2.3 `direct` 直链是什么

`ossPresignGet()` 签一条 V4 GET 地址，签名里带 `response-content-disposition`（浏览器点开直接下载而不是预览）。**它不绑指纹**：地址被转手，15 分钟内别人能用。想要更严就用 `relay`。

---

## 3. 图标链路 `GET|HEAD /api/icon?k=icon/…`

```
公开只读，不需要令牌
   ▼
① 查边缘缓存（Cache API，固定 key https://icon.cache.invalid/?k=<对象键>）
      命中 → 直接返回，头带 X-Icon-Cache: HIT
      ⚠️ 缓存 key 用固定内部域名，而不是本次请求的 origin —— 本 Worker 挂在两个入口域上，共用一份缓存才不会重复回源
   ▼ MISS
② 走中继回源 → 读取上限 5 MB（超了 413）
   ▼
③ 整读进内存 → Cache-Control: public, max-age=604800, immutable → 写回边缘缓存
      返回头带 X-Icon-Cache: MISS
```

**为什么必须自己做这层缓存**：Cloudflare **不会**自动缓存 Worker 直接返回的响应。没有它，每个访客的每次浏览都会打回 ECS 取同一张图 —— 纯粹白烧中转流量。图标键里带日期和随机串，内容写进去就不再变，所以可以放心按「不可变」长缓存。

---

## 4. 对象登记表（Durable Object）

挂在一个**已有**的 DO 类 `DownloadGate` 的固定实例上（`idFromName('__index__')`），用 DO 的 KV 接口。**不另开类**：DO 新增类要再声明一次迁移，而 `new_sqlite_classes` 重复声明会直接报 10074。

| 存储键 | 内容 |
| --- | --- |
| `f:<对象键>` | `{ key, size, name, ctype, origin, fph, ts, deleted, deletedAt }` |
| `m:YYYY-MM` | `{ month, relay, direct }` —— 本月两条通道各走了多少字节 |
| `meta` | `{ files, icons, updated }` —— 当前有效对象数（挂/删时增减，便于一眼看规模） |
| `rec`（设备实例） | `{ day, n }` —— 该指纹今天的领票数 |

- `origin`：`file` / `icon`；`fph`：**设备指纹的 SHA-256 前 16 位**（原始值不落库）。
- 登记是**尽力而为**：登记表挂了绝不能让上传/下载跟着挂，所以异常全吞、调用点一律不 await 它的失败。
- **不精确的地方要说清**：月度用量只在「换票」时按登记表里的 `size` 累加，用来分流够用，不追求账本级精确；登记表里没有的历史对象（`size = 0`）不会被计入。

### 为什么不是 KV

| | Durable Object（现在用的） | KV（Workers KV） |
| --- | --- | --- |
| 一致性 | 单实例串行，**强一致**（计数、墓碑不能丢） | 最终一致，多边缘副本不同步 |
| 配额 | DO 免费套餐自带 | 需要单独建命名空间 |
| 现状 | ✅ 已建好 `classhub_DownloadGate` | ❌ 没建，也不需要 |

登记表要的是「刚写进去马上读得到」，正是 KV 的弱项。所以**没有 KV 命名空间要配**，线上绑定里也确实只有 `DL_GATE` 一个 DO 绑定。

---

## 5. 清理与时效链接（管理接口）

全部要带请求头 `X-Purge-Token`（等于 CF Secret 里的值；**没配 Secret 就等于全禁**）。

```bash
# ⚠️ 用 Cloudflare 直连的入口域。cshapi 那条走 SpeedOnline CDN 回源，
#    2026-10-05 起持续 502（详见第 7 节的实测记录）。
B=https://submit.132614.xyz
T=<PURGE_TOKEN>

# 列对象。默认看登记表（带体积/名字/上传设备），all=1 连墓碑一起看；
# source=bucket 则直接问桶：权威、含历史对象，但只有键。
curl -H "X-Purge-Token: $T" "$B/api/files"
curl -H "X-Purge-Token: $T" "$B/api/files?source=bucket&prefix=upload/"

# 本月两条通道各走了多少、共登记了多少
curl -H "X-Purge-Token: $T" "$B/api/dl-stats"

# 临时拼一条带时效的直链（默认 900 秒，最长 3600 秒）
curl -X POST -H "X-Purge-Token: $T" -H 'Content-Type: application/json' \
  -d '{"key":"upload/2026/10/xxx.exe","ttl":600}' "$B/api/link"

# 删除：单条 / 一批 / 整个目录
curl -X POST -H "X-Purge-Token: $T" -H 'Content-Type: application/json' \
  -d '{"key":"upload/2026/10/xxx.exe"}' "$B/api/purge"
curl -X POST -H "X-Purge-Token: $T" -H 'Content-Type: application/json' \
  -d '{"prefix":"upload/2026/10/"}' "$B/api/purge"
```

`prefix` 形式的两条硬规则：

1. **只允许 `upload/`、`soft/`、`icon/` 之下，永远不许碰 `gh-mirror/`**（那是 8090 GitHub 加速服务的缓存）。
2. **先问桶要清单、再逐个删**（走中继 `?list&prefix=`），不是查登记表 —— 登记表从上线那天才开始记，拿它去删历史对象会「静默一个都没删」，是这类操作里最坏的一种失败。一次最多 200 个，超了会明确报错而不是删一半。

删掉的对象在登记表里留一条墓碑（`deleted: 1`），默认列表不再显示，`all=1` 可回溯。

---

## 6. 故障排查对照表

| 症状 | 大概率原因 | 处置 |
| --- | --- | --- |
| 上传 403 `SignatureDoesNotMatch` | 前端 PUT 时改了 Content-Type | 照抄 `/api/oss-sign` 回传的 `contentType` |
| 上传报「签名接口连不上」 | 两个入口域都不可达 | 换个网络试；查 Worker 是否在跑 |
| 领票 429 | 该指纹今天满 80 次 | 等次日（东八区切天），或调 `DL_DAILY_LIMIT` |
| 领票回来 `mode: direct` | 中继挂了 / 令牌被换 / relay 月度超额 | 看 `/?list` 能不能通；核对 `RELAY_TOKEN` |
| 下载 410 / 403 | 票据过期（15 分钟）或票据被转手 | 回站点重新点下载 |
| 图标一直 `X-Icon-Cache: MISS` | 没命中边缘缓存，或该边缘节点首次回源 | 正常；首次之后应该 HIT |
| 图标 401/403 | 中继令牌不对 | 核对 `RELAY_TOKEN` |
| `/api/files` 与 `source=bucket` 对不上 | 登记表只记「我们签出去的」 | 以 `source=bucket` 为准看桶，以登记表看「谁传的」 |
| purge 报「列目录失败」 | 中继不可用 | 先修中继；此时不执行任何删除（故意的） |

---

## 7. 线上状态核对（2026-10-05 复核）

| 项 | 实测值 |
| --- | --- |
| Worker 绑定 | `DL_GATE → DownloadGate`；**无 KV 命名空间绑定**（登记表挂在 DO 上） |
| DO 命名空间 | `classhub_DownloadGate`（脚本 `classhub`） |
| 定时器 | `*/5 * * * *`（`created_on: 2026-10-05T02:35:36Z`） |
| 取回模式 | `DL_MODE=auto`（运行时配置里也是 auto），`DL_RELAY_MONTHLY_GB=0`、`DL_DIRECT_MONTHLY_GB=0`（均不限） |
| 孤儿阈值 | `orphanMinutes=15`、`staleRecordHours=24` |
| 投稿准入 | `requireSource=true`、`maxPending=3`、`maxPerDay=6` |
| 桶私有性 | `GET /api/oss-check` → `private=true`（匿名直读 403）✅ |
| 桶内容 | 10 个对象 = 9 个 `gh-mirror/*` + 1 个遗留 `icon/2026/10/muujrjli-…jpg` |
| 登记表 | 存活 4 条 / 墓碑 7 条（含清理探针） |
| **入口域** | ⚠️ `cshapi.132614.xyz` **502**（SpeedOnline CDN 回源失败，2026-10-05 03:0x 起持续）；`submit.132614.xyz` **200**。运维入口与审核链路已全部改走后者 |

> `cshapi` 那条链路是 SpeedOnline CDN（`cname → *.world.speedonline.xyz`），502 出在 CDN 回源，
> 与 Worker 无关（`submit.132614.xyz` 同一 Worker 一切正常）。前端 `submitEndpoints.ts`
> 会先试 `cshapi`、失败后自动换 `submit`，所以访客侧只是慢一拍、不影响可用性。
> **但工作流与维护脚本必须写死可用入口** —— 它们没有 fallback，而清理/迁移是「只告警不阻断」的，
> 挂掉时不会报错，只会静默地什么也不做。

---

## 8. 安全闸门（防滥用 · 防注入 · 防篡改）

投稿接口是**完全匿名开放**的（没有登录、没有验证码），所以「挡垃圾」只能靠输入清洗 + 行为特征。
下面每一条都对应一个具体的攻击面：改代码时别只看功能，先回来看看有没有把这里弄坏。

### 8.1 输入清洗（`handleOssSign` / `handleSubmit`）

| 攻击面 | 措施 |
| --- | --- |
| 文件名路径穿越 | `ossSafeName()` 先取 basename（`../../etc/passwd` → `passwd`），再去控制字符 / 双向覆写 / 零宽字符、折叠连续点、去掉结尾点与空格，最后截到 100 字。对象键里还额外拼了 `<时间戳36>-<随机6>` 前缀，撞车也覆盖不到别人的对象 |
| 自由文本注入 | `cleanText()` 统一去控制字符 / 双向覆写 / 零宽字符，换行保留但连续空行压成一段；各字段另有长度上限（名称 120、简介 300、详细介绍 8000…） |
| 下载项数量爆炸 | 单个软件最多 **5** 个（前端按钮禁用 + 服务端 `MAX_DOWNLOADS_PER_APP` 双保险） |
| 超大文件耗尽存储 | 单文件上限 **2.5 GB**（前端 `UPLOAD_MAX_BYTES` 与服务端 `OSS_MAX_BYTES` 同口径；超限时界面引导改用官网 / GitHub Releases 直链） |
| 伪造 `oss://` 引用 | 提交时逐个查登记表，查不到的直接 400。登记表本身不可用（DO 故障）时**放行** —— 基础设施问题不该算用户的错 |
| `_联系方式` 被截断 | 它是 age 密文，单独给 4000 字上限（以前所有 `_` 键统一 300 字，等于把密文拦腰截断，管理员拿私钥也解不出来） |

### 8.2 投稿准入（三层闸门，`submitGate()`）

1. **来源门槛** —— 必须带本站上传的附件，或填了 GitHub 仓库。纯手填一条外链成本几乎为零，正是批量灌 Issue 最常见的形态。
2. **瞬时配额** —— 同一投稿人（设备指纹哈希）24 小时内最多 6 次，挡「一秒发 100 个」。
3. **待审上限** —— 同一投稿人在审核队列里最多同时挂 3 条，挡「一次开 1000 个 Issue」。

第 3 条靠反查实现：草稿里写 `_提交指纹`（设备指纹的 16 位哈希，原值不落库），
`create-review-issue.yml` 把它以 HTML 注释 `<!-- csh-submitter:xxx -->` 放进 Issue 正文，
Worker 再用 GitHub Search API 数这张 Issue 有多少还开着。
**查不到就放行**（返回 `-1`）—— GitHub 抽风不该让全体投稿一起挂。

拿不到设备指纹时只做第 1 层 —— 刻意如此：宁可漏挡，也不要把「指纹拿不到」变成一条谁也提交不了的路。

三个阈值都能在线调，不必重新部署：

```bash
curl -X POST -H "X-Purge-Token: $T" -H 'Content-Type: application/json' \
  -d '{"requireSource":true,"maxPending":5,"maxPerDay":10}' "$B/api/dl-mode"
```

### 8.3 审核 Issue 的 Markdown 注入

草稿里每个字符串都来自匿名接口，却要直接拼进 Issue 正文。GitHub 会过滤 HTML 标签，
但 Markdown 元字符照样生效：反引号能提前结束 `代码段`、三反引号能提前闭合 ```json 围栏
（把后面任何内容提升为正文）、`@名字` 会真的通知到人、`#123` 变交叉引用、`![]()` 变外部请求。

`create-review-issue.yml` 里有一组统一入口，**凡是用户给的字符串一律过一道**：

| 函数 | 用途 |
| --- | --- |
| `mdSafe(v, max)` | 去控制字符 / 双向覆写 / 零宽字符，压连续空行，截断 |
| `mdInline(v, max)` | 在它之上再压平换行，并把反引号与竖线换成单引号（不破代码段、不破表格） |
| `mdFence(v)` | 把内容里的 ``` 换成 `'''`（不破围栏）—— JSON 大块必须走这个 |
| `mdQuote(v)` | 逐行加 `> `，逐行打断围栏 |

### 8.4 图标格式欺骗

上传路径会先用 canvas 把图标**重编码成 WebP**（`iconResize.ts`），SVG / HTML 里的脚本在这一步就被
栅格化销毁了。但历史对象、以及有人手工塞进桶里的东西不受那条约束，所以 `/api/icon` 改成**按字节嗅探**：

- 只认位图魔数（PNG / JPEG / GIF / BMP / WebP / ICO），**SVG / HTML / XML 一律 415**；
- `Content-Type` 一律重设成嗅探结果，**绝不透传元数据**（否则一个 `image/svg+xml` 就能在别的上下文里跑脚本）；
- 固定下发 `X-Content-Type-Options: nosniff` 与 `Content-Security-Policy: default-src 'none'; sandbox`。

### 8.5 直链盗刷

| 措施 | 说明 |
| --- | --- |
| 桶保持私有 | 不签名拿不到对象。`GET /api/oss-check` 随时自检，`private=true` 才算正常 |
| 短时直链分层 TTL | `direct` 通道按体积给 5 / 15 / 20 / 30 分钟 |
| 每设备每天 80 次 | 领票闸门（`DL_DAILY_LIMIT`） |
| 上传回填的直链只读 | `SubmitPage.vue` 里 `oss://` 开头的输入框锁死，防手改成指向别的对象的键 |
| 上线前校验存活 | `review-submission.yml` 在写 `apps/*.json` 前对**外部**直链发 HEAD（被拒时回退 `GET` + `Range: bytes=0-0`），死链写进 Issue 评论（**不阻断**，大量正经站点会拒 HEAD） |
| 全量巡检 | `node scripts/verify-links.mjs` 扫全部 `apps/*.json` 的外链，`--soft` 时只报告不报错 |

### 8.6 凭据不入日志

- 中继令牌只走 **请求头**（`X-Api-Key`），绝不放查询串：URL 会原样落进中继的 access log，请求头不会。
- Worker 里那个含令牌的 `head` 变量**任何情况下都不许打印 / 进错误消息**；调试网络问题只打印 host 与 port。
- 工作流里对 `PURGE_TOKEN` 加 `::add-mask::`（bash 步骤）与 `core.setSecret()`（github-script 步骤），防将来有人加调试输出。
- `scripts/gen-age-key.mjs` 在 `CI` 环境下**直接拒绝运行** —— 它会打印 age 私钥，而私钥是唯一能解开投稿里加密联系方式的凭据。

### 8.7 三种「孤儿」各自归谁管

| 情形 | 归属 | 机制 |
| --- | --- | --- |
| 传完没提交（改主意 / 关页面） | Worker cron（每 5 分钟） | 超过 `orphanMinutes` 且从未被任何提交认领 → 删 |
| 提交了又被关掉，附件再无引用 | GitHub Actions 桶对账（每 6 小时） | **只报告不删**，由人拍板 |
| 签了名却没真传（PUT 前断网） | Worker cron | 超过 `staleRecordHours` 且桶里根本没有这个键 → 只销记账，不删对象 |

> 第三条是后来补的：这类记录永远卡在「待认领」，而孤儿回收只看**桶里存在的对象**，根本轮不到它 ——
> 于是 `pending` 只涨不落，慢慢变成纯噪声。清理有两个前提缺一不可：**列表完整**（`isTruncated` 为假）
> 且**记录够老**（2.5 GB 在慢链路上传几小时是正常的）。

### 8.8 「挂马 / 分发恶意软件」能挡到哪一步（说清楚边界）

必须承认：**没有任何自动手段能判断一个安装包是不是恶意软件**。所以这里的策略不是「自动拦下来」，
而是「把审核者需要的东西准备好 + 让流水账可追溯」：

- 站点层面只收「有本站附件」或「有 GitHub 仓库」的投稿（8.2 第 1 条），堵掉「随手丢个 exe 链接」这条最廉价的路；
- 服务端在签发时就把体积 / 对象键 / 上传设备哈希登记下来，审核 Issue 里有完整 JSON 可核；
- 真正的兜底是**人工审核**：这一条没有任何代码能替代。站点是「收录 + 跳转」，不承诺文件安全，
  出事时的边界写在下游的免责声明里；要更强的保障，得引入 VirusTotal 之类的第三方扫描后再上线（目前没做）。
