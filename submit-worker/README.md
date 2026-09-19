# 提交服务（Cloudflare Worker `classhub`）

`#/submit` 页面点「提交」时，前端 `POST /api/submit` 打到的就是这里。Worker 把校验过的
内容拼成一份草稿 JSON，用 GitHub API 写进本仓库的 `submissions/<id>-<时间戳>.json`，
随后 `.github/workflows/create-review-issue.yml` 生成审核 Issue，管理员打标签走
`review-submission.yml` 合并进 `软件数据/apps/`。

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
