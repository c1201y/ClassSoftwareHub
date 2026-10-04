# 提交服务（Cloudflare Worker `classhub`）

`#/submit` 页面点「提交」时，前端 `POST /api/submit` 打到的就是这里。Worker 把校验过的
内容拼成一份草稿 JSON，用 GitHub API 写进本仓库的 `submissions/<id>-<时间戳>.json`，
随后 `.github/workflows/create-review-issue.yml` 生成审核 Issue，管理员打标签走
`review-submission.yml` 合并进 `软件数据/apps/`。

设置页「回声洞」卡片的「投稿」走**同一个 Worker**、另一条路由：前端 `POST /api/echocave`
（`{ "text": "…" }`，≤ 200 字）→ Worker 把字条写成草稿
`submissions/echo-<时间戳>-<随机>.json` = `{ "_类型": "回声洞", "text": "…", "_提交时间": "…" }`，
同样进审核 Issue；打 `approved` 才由 `review-submission.yml` 收进
`回声洞/messages/message<N>.json`（N = 现有最大编号 + 1），`rejected` 直接删草稿。
**这个接口只落草稿、不直接上线**；目标路径全部由审核脚本写死，不受入参影响。

页面「反馈中心」（`#/feedback`）的「提交反馈」也是同一个 Worker：前端 `POST /api/feedback`
（`{ kind, subKind, appId, title, detail, contact }`）→ 草稿
`submissions/feedback-<时间戳>-<随机>.json` = `{ "_类型": "反馈", kind, subKind, appId, title,
detail, contact?, _提交时间 }`。反馈**没有审核合并这一步** —— `create-review-issue.yml` 把它
直接开成一张带 `用户反馈` / `报告问题` 等标签的 Issue，**并顺手把草稿删掉**（Issue 本身就是
终点产物，草稿没有留存价值）。这条路由以前不存在，页面只能打开 GitHub 的预填新建 Issue 页，
逼着每个反馈的人都有 GitHub 账号。

| 路由 | 方法 | 入参 | 落到 |
| --- | --- | --- | --- |
| `/api/submit` | POST | 提交页 `buildPayload()` 的软件对象 | `submissions/<id>-<时间戳>.json` → 审核 → `软件数据/apps/` |
| `/api/echocave` | POST | `{ "text": string }` | `submissions/echo-<时间戳>-<随机>.json` → 审核 → `回声洞/messages/messageN.json` |
| `/api/feedback` | POST | `{ kind, subKind, appId, title, detail, contact }` | `submissions/feedback-<时间戳>-<随机>.json` → 直接开 Issue → 草稿即删 |

三条路由的应答约定一致：成功 `{ success: true, message }`（200），被服务端明确拒绝
`{ error: string }`（4xx，前端据此判定「这条入口没戏、不必再换域名重试」），临时故障 `5xx`。

`/api/feedback` 的字段与校验（与 `src/gallery/feedback.ts` 的 `FeedbackDraft` 一一对应）：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `kind` | ✅ | `report`（报告问题）/ `suggestion`（提出建议） |
| `subKind` | report 必填 | `interaction` / `link` / `other`；`suggestion` 时服务端强制写成空串 |
| `appId` | 否 | 涉及的软件 id，只允许 `^[a-z0-9-]{1,60}$` |
| `title` | ✅ | ≤ 80 字；空白会被压平（它同时进 Issue 标题和正文） |
| `detail` | ✅ | ≤ 4000 字 |
| `contact` | 否 | **必须已是 age 密文** |

> ⛔ `contact` 明文会被**拒收**（400 `联系方式必须先在本地加密后再提交`）。这不是洁癖：
> 它会原文贴进**公开**的 Issue，泄漏了收不回来。服务端只检查年龄 armor 的开头
> （`-----BEGIN AGE ENCRYPTED FILE-----`），不做任何解密 —— 私钥不在服务端。


> ⚠️ **这份文件是备份，不是部署源。** Worker 实际运行在 Cloudflare 账号里的
> `classhub`（模块格式，入口 `worker.js`），域名走 `cshapi.132614.xyz`（国内加速入口）
> 与 `submit.132614.xyz`（CF 直连兜底）。改这里**不会**影响线上，必须重新上传到
> Cloudflare 才生效——见下面「怎么改」。

## 绑定（Bindings）

| 名字 | 类型 | 值 / 说明 |
| --- | --- | --- |
| `ALLOWED_ORIGIN` | 明文 | `*`（多域名用逗号分隔；`*` 表示放行全部） |
| `GITHUB_OWNER` | 明文 | `c1201y` |
| `GITHUB_REPO` | 明文 | `classsoftwarehub` |
| `GITHUB_BRANCH` | 明文 | `main` |
| `GITHUB_TOKEN` | **密钥** | 能写本仓库 contents 的 PAT，只在 Cloudflare 上配置，**绝不进仓库** |

上传新版本时必须把 `GITHUB_TOKEN` 用 `inherit` 方式继承（见下），否则密钥会被清空、
提交直接 500。

## 数据契约

入参 = 提交页 `SubmitPage.vue` → `buildPayload()` 的结果。写进草稿时**分两类**：

1. **业务字段**：按白名单逐个挑（`id` / `name` / `icon` / `category` / `tagline` /
   `description` / `version` / `size` / `system` / `website` / `github` / `downloads[]`
   / `sort`），下载项逐条挑 `platform` / `note` / `size` / `hash` / `url`；
2. **审核用元数据**：**凡是入参里 `_` 开头的键，原样带回草稿**（如提交页必填的
   `_联系方式`）。服务自己写的 `_提交时间` / `_原始ID冲突` 不允许被入参覆盖。

第 2 条是**按前缀放行**、不是逐个列举：以后再加审核字段不用回来改这个服务。
`review-submission.yml` 合并时会把所有 `_` 开头的键剥掉，所以这类字段永远不会
污染 `软件数据/apps/<id>.json`。

> 历史坑（2026-09-19 修）：原先只做第 1 条，入参里的 `_联系方式` 从没被读过，
> 导致提交者明明填了联系方式、审核 Issue 却显示「未填写」；同一处理解了
> `downloads[].hash`（校验值）也被丢掉的问题。

## 怎么改

Cloudflare 面板里粘贴只能手改，推荐走 Cloudflare API（只读拉取 → 本地改 → 上传）：

1. 拉线上源码 + 绑定清单（`GET /accounts/{account_id}/workers/scripts/classhub`
   返回 multipart，取其中的 `worker.js`）；
2. 改完本地跑一遍语法检查与桩 `fetch` 测试；
3. `PUT /accounts/{account_id}/workers/scripts/classhub?bindings_inherit=strict`，
   `multipart/form-data` 里放 `metadata`（含 `main_module: "worker.js"`、四个明文变量、
   以及 `{"type":"inherit","name":"GITHUB_TOKEN","old_name":"GITHUB_TOKEN"}`）和
   代码文件；用 `strict` 是为了「继承不到密钥就整个失败」，而不是静默把密钥丢了；
4. 上传后用 `POST /api/submit` 打一个**验证不通过**的请求（如空对象）确认新版本在跑——
   这种请求在 `validate()` 就被挡下，不会写草稿、不会开 Issue。
   同理可以 `POST /api/echocave` 打 `{ "text": "" }`：应返回 400 `{ "error": "先写一句话再投稿吧。" }`
   （旧版本这里是 404 `{"error":"Not Found"}`，一眼能看出有没有换成新版）。
   同法再打 `POST /api/feedback` 空对象 `{}`：应返回 400 `{ "error": "请选择反馈类型" }`。
   ⚠️ 探测时**不要**随手塞一个明文的 `contact`：带明文的请求会被 400 拒掉，那是有意为之的
   防线（见上面那张字段表），不是故障。
