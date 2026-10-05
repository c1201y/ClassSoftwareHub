# ClassSoftwareHub 维护手册

> 在向本项目提交 PR 之前，请仔细阅读此维护手册。
>
> 如需查找具体修改位置，请先查看目录；遇到问题请参阅第八节。

## 目录

1. [快速索引：需要修改什么，对应哪个文件](#一快速索引需要修改什么对应哪个文件)
2. [软件数据（增删改软件）](#二软件数据增删改软件)
3. [分类配置](#三分类配置)
4. [文字与界面](#四文字与界面)
5. [AI 导航](#五ai-导航)
6. [构建与部署](#六构建与部署)
7. [软件版本自动核对](#七软件版本自动核对)
8. [出问题了怎么办](#八出问题了怎么办)
9. [版本号与发布规则](#九版本号与发布规则)

---

## 一、快速索引：需要修改什么，对应哪个文件

| 需要修改的内容             | 对应文件                                                      | 参见章节               |
| ------------------- | --------------------------------------------------------- | ------------------ |
| 增删软件 / 修改链接、版本、系统限制 | `软件数据/apps/*.json`                                        | [第二节](#二软件数据增删改软件) |
| 分类名称 / 图标 / 顺序      | `软件数据/categories.json`                                    | [第三节](#三分类配置)      |
| 站名、按钮、提示语、关于链接等     | `文字设置.ts`（英文站另见 `src/gallery/Strings/en-US/Resources.ts`） | [第四节](#四文字与界面)     |
| AI 导航网址 / 文案        | `AI导航文本.ts`                                               | [第五节](#五ai-导航)     |
| 欢迎弹窗文字              | `文字设置.ts` 的 `welcome.*` 键                                 | [第四节](#四文字与界面)     |
| 搜索面板文案              | `文字设置.ts` 的 `search.*` 键                                  | [第四节](#四文字与界面)     |
| 网站图标                | `src/assets/AppIcon-source.png` 覆盖后重新生成                   | [第四节](#四文字与界面)     |
| 版本号                 | `文字设置.ts` 与英文站 `Resources.ts` 的 `app.version`             | [第九节](#九版本号与发布规则)  |

修改完成后执行：

```bash
npm run dev     # 本地预览（自动刷新）
npm run build   # 正式打包 → dist/
```

将 **`dist/` 整个目录**（`index.html` + `assets/`）复制到班级电脑即可。

推送到 `main` 分支后，GitHub Actions 会自动发布网页。

---

## 二、软件数据（增删改软件）

> 每个软件一个 JSON 文件，互不影响。文件夹：`软件数据/apps/`。

### 2.1 添加软件（四步）

1. 复制 `软件数据/apps/_模板.json`，重命名为 `软件英文id.json`

   （如「记事本」→ `notepad.json`；**仅限英文小写、数字与短横线**，不使用中文和符号）
2. 打开文件，按 [2.3 字段说明](#23-字段说明) 填写内容
3. **决定它以后怎么跟着上游更新** —— 见 [2.1.1](#211-新软件该登记到哪儿)。这步最容易漏；

   漏了它不会出错，但会落进体检报告的「只有网页入口」档，每周都要你人工看一眼
4. 保存 → `npm run dev` 预览 → 发布前执行一次 `npm run build`

> 新软件默认排在最后。如需插入中间位置，修改 `sort` 数值即可（数值越小越靠前，0 表示最前）。

#### 2.1.1 新软件该登记到哪儿

站点每周五自动核对每个软件的版本号与直链（[第七节](#七软件版本自动核对)），

但**前提是它知道去哪儿核对**。登记位置取决于这个软件有没有 GitHub 仓库、有没有稳定的官方直链：

| 这个软件…                                                                   | 你做什么                                                                                 | 谁来跟                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------- |
| **有 GitHub 仓库**                                                         | 在 JSON 里填 `github` 字段（**只填仓库地址**）                                                    | `scripts/check-updates.mjs`，每周读 Releases        |
| **没有仓库，官网有固定直链**<br />（路径里不带版本号，如 `e.seewo.com/download/file?code=xxx`） | 在 `scripts/resolve-direct-links.mjs` 的 `RESOLVERS` 加一条（`seewo` / `winget` / `probe`） | `scripts/resolve-direct-links.mjs`，每周刷新直链 + 版本号 |
| **没有仓库，直链带版本号或藏在页面里**                                                   | 同上，用 `probe`（跟重定向 / 读目录 / 抓页面）或 `rewrite`（按模板重建文件名）                                  | 同上                                              |
| **确实拿不到**<br />（SPA 页面、网盘、商店独占、上游已撤链）                                   | 在 `scripts/untracked-buckets.mjs` 的 `BUCKETS` 加一条并写明理由                               | 没人跟 —— 但报告会如实标注原因，不会误报成「待人工处理」                  |
| **什么都不做**                                                               | ——                                                                                   | 默认落进「只有网页入口」档，会出现在报告的「需要偶尔查看」里                  |

> ⚠️ **`github` 字段必须是真仓库地址。** 曾有一个软件把 B 站视频链接填了进去，导致体检一直被这条卡住。
>
> **不是 GitHub 分发的软件，直接不写这个字段。**

> 💡 **图标**：`icon` 填厂商官网的图片外链即可；但若图标挂在 **GitHub / jsDelivr** 这类国内不稳的域名上、
>
> 或体积偏大，跑一次 `python scripts/icon-sync.py --apply --only <软件id>`，
>
> 它会生成 `src/assets/icons/<id>.webp`（64×64、≤4 KB，会被 Vite 内联进产物）。详见 `AGENTS.md`。

### 2.2 修改 / 删除软件

- **修改**：直接编辑 `apps/<id>.json`，保存即生效。
- **删除**：删除对应 `.json` 文件即可。

### 2.3 字段说明

| 字段            | 含义         | 注意事项                                                                      |
| ------------- | ---------- | ------------------------------------------------------------------------- |
| `id`          | 唯一英文标识     | **不可重复**；网址为 `#/download/<id>`；仅允许英文小写、数字与短横线，**不得包含 `?` `&` `=`**        |
| `name`        | 软件名称       | 无限制                                                                       |
| `icon`        | 图标图片链接     | 建议使用正方形（256×256）；留空则显示空白占位                                                |
| `category`    | 所属分类       | 必须是 `categories.json` 中的 key：`system` / `schedule` / `teaching` / `other` |
| `tagline`     | 一句话简介      | 显示在首页卡片                                                                   |
| `description` | 详细介绍       | 显示在详情页                                                                    |
| `version`     | 版本号        |                                                                           |
| `size`        | 软件体积       |                                                                           |
| `system`      | 系统限制       | 如 `Windows 10/11（x86 / x64 / ARM64）、macOS、Linux`                          |
| `website`     | 官方网站       |                                                                           |
| `github`      | GitHub 仓库  |                                                                           |
| `notice`      | 更新提示（可选）   | 显示在详情页「下载」上方的蓝色提示条；如不需要，整行删除                                              |
| `store`       | 应用商店链接（可选） | 填写商店网页地址；详情页会多出「使用 Microsoft Store 下载」入口；如不需要，整行删除                        |
| `downloads`   | 下载项数组      | 参见 2.4                                                                    |
| `sort`        | 显示顺序       | 数值小的靠前                                                                    |
| `维护备注`        | 维护者备注      | 网页不显示，可自由填写                                                               |



> **必填项**（提交页 `#/submit` 会进行拦截）：`id`、`name`、`tagline`、`description`、`system`、`联系方式`、`downloads[].url`。

### 2.4 下载项格式

```json
{
  "platform": "Windows x64 安装版",
  "note": "官方安装包，GitHub 链接有时不稳定",
  "size": "373 KB",
  "kind": "file",
  "hash": "3F7A9C1D…（完整校验值，可整行删掉）",
  "url": "https://github.com/xxx/xxx/releases/download/xxx.exe"
}
```

- `url` 尽可能是**文件直链**（.exe / .zip / .msi 等），点击后立即开始下载 —— 不要填写官网下载页。

  若确实没有直链，可把官网下载页作为一项写入，`kind` 写 `page`（详情页按钮会显示「前往官网」）；

  网盘的分享页则写 `netdisk`（按钮显示「前往网盘」）。
- `kind` 是**落地方式**，决定详情页按钮的文案与行为：
  | 取值        | 含义    | 详情页表现                                     |
  | --------- | ----- | ----------------------------------------- |
  | `file`    | 文件直链  | 按钮写「下载」，点了**在本页直接开始下载**（不新开标签、不离开当前页）     |
  | `page`    | 官网下载页 | 按钮写「前往官网」，新标签页打开                          |
  | `netdisk` | 第三方网盘 | 按钮写「前往网盘」，新标签页打开                          |
  | `store`   | 应用商店  | 自动并进上方的商店卡片（apps.microsoft.com 的链接也会自动识别） |
  > **可以不写**：不写时按网址自动判断（看扩展名与域名）。只有「**没有扩展名但确实是文件**」的
  >
  > 链接必须手工写 `file`，否则会被当成网页、按钮错写成「前往官网」。已登记的这类例子：
  >
  > `download.geogebra.org/package/win-autoupdate`、`it.bandisoft.com/bandizip/dl.php?old`、
  >
  > `api.nrd.nie.163.com/api/v1/release/dl/1`、`care.seewo.com/pc/download`。
  >
  > 判断逻辑在 `src/gallery/downloadLink.ts`，**不要**在页面里另写一套。
- `hash` 是校验值（可选）：只填**十六进制那一串**，算法按长度自动识别

  （32=MD5、40=SHA-1、56=SHA-224、64=SHA-256、96=SHA-384、128=SHA-512）。

  页面显示首尾各几位，悬停可查看完整值，**点击一下即可复制**。
  > ⚠️ 不要将校验值整串写入 `note`：128 位没有可断行的地方，会导致文字溢出卡片。
  >
  > 提交页有专门的「校验值」输入框，带 `MD5:` 前缀或按字节分隔的写法均可直接粘贴。
- 多项之间使用英文逗号分隔，最后一项后不加逗号。
- 站内对象（用户投稿时直传我们的 OSS）写成 **`oss://对象键`**：桶是私有的，详情页点下载    
  会先向 `/api/dl-ticket` 换一张 15 分钟票据（每台设备每天 80 次额度），再经 `/api/dl`    
  流式取回，直链无法被转发生效。**不要手工填写**——它由提交页上传后自动回填，    
  审核不通过时机器人会自动把桶里那份一并删掉。相关代码：`src/gallery/ossDownload.ts`。

> **补充直链的原则**：「官方始终最新」的固定地址（路径里没有版本号）最理想，一次填好长期有效；
>
> 带版本号的直链每次发版都要改，尽量不要手工填 —— 那类交给 `.github/workflows/check-updates.yml`
>
> 的周更任务去解析。当前各软件的来源登记在 `scripts/untracked-buckets.mjs`。

### 2.5 `notice` 与 `store` 的选择

- **更新频繁的软件**（PowerToys、ToDesk、驱动总裁等）：固定直链很快会失效。两种处理方式：
  1. 只填写**官网「始终最新」的链接**（多数官网提供此类固定地址）；
  2. 填写 `notice`，提示用户前往官网或应用商店获取最新版。
- **应用商店提供官方版本的软件**（PowerToys、VLC、GeoGebra、UU远程、图吧工具箱等）：

  填写 `store` 后详情页会出现「使用 Microsoft Store 下载」按钮 —— 商店版本**自动更新**，

  可将版本维护交由商店完成。
  > 无需刻意填写 `store`：只要 `downloads` 中有一项 `url` 指向 `apps.microsoft.com` 商店页，
  >
  > 详情页会**自动识别**并渲染为同一张商店卡片。两种写法均可。
  >
  > 若本机没有「应用商店」（LTSC / 精简版 / 被卸载过），商店链接会变成死循环 ——
  >
  > 商店让你先去商店里装商店。详情页对「只有商店这一个入口」的软件（`downloads` 里没有
  >
  > 其他可用项）会自动补一行说明：按 `Win+R` 输入 `wsreset -i` 即可让 Windows 联网装回商店，
  >
  > 备用命令 `winget install 9WZDNCRFJBMP`。**这条由前端自动出现，维护者无需在 JSON 里做任何事**；
  >
  > 唯一需要手写的是 Microsoft Store 本体（`9wzdncrfjbmp`）那条 `notice`，因为点进那一页的人
  >
  > 多半正是「没有商店」的人。

### 2.6 处理他人提交的草稿

他人通过 `#/submit` 提交的工单标题带 `[待审核]`，在 Issue 上打标签即可：

| 标签         | 效果                                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| `approved` | 通过，合并成 `apps/<id>.json`。**若站内已有同 id 文件，会直接拒绝并说明**（防止误覆盖）                                                        |
| `覆盖已存在`    | 确实需要用这次提交**整份替换**站内那份时才使用。机器人会将「改前 → 改后」差异和**旧版完整内容**贴进 Issue；旧版可从提交历史中找回（`git show <父提交>:软件数据/apps/<id>.json`） |
| `rejected` | 不接受这份提交，删除草稿并关闭工单                                                                                               |

> ⚠️ 草稿信息比站内**少**时（常见：只剩一条「官方安装网站」链接、`icon` / `version` 为空），不建议使用 `覆盖已存在` —— 那样是倒退，直接选择 `rejected` 更为合适。

> ✅ **关于「联系方式」的问题（2026-09-19 已修复）**：它写作草稿中的 `_联系方式`，属于**审核用字段** ——
>
> 审核通过时 `review-submission.yml` 会剥掉所有 `_` 开头的键，因此它**不会被发布到网站上**。

### 2.7 站内对象怎么取回：两条通道

桶是私有的，任何对象都要「服务端点头」才拿得到。服务端备了两条互不相干的取回路径，  
各自吃一份免费额度，谁先用满就自动换另一条：

| 通道       | 链路                                      | 流量记在谁头上   |
| -------- | --------------------------------------- | --------- |
| `relay`  | 浏览器 → Worker →（原生 TCP）ECS 中继 → OSS 内网端点 | ECS 的公网带宽 |
| `direct` | 浏览器 →（15 分钟预签名直链）OSS                    | OSS 出网流量  |

分流规则由 Worker 变量 `DL_MODE` 决定：

- `auto`（默认）：先给 `relay`，并当场探一下中继是否活着；探不通、或 `relay` 本月用量    
  已超过 `DL_RELAY_MONTHLY_GB`，就改给 `direct`。反过来的 `DL_DIRECT_MONTHLY_GB` 同理。
- `relay` / `direct`：强制只走一条，用于应急或对拍。


两个额度都是「GB」，写 `0` = 不限。发票据时会一并返回另一条通道（`fallback`）。
`direct` 给的是 15 分钟有效的 OSS 直链，**不绑定设备指纹** —— 地址被转手，15 分钟内能用；
`relay` 的票据逐项校验签名与指纹，转发出去基本来不及用。

### 2.8 对象登记表（查、删、临时发链接）

`/api/oss-sign` 每签发一条上传地址，就把这条键登记进登记表（对象键、体积、原名、类型、
来源、上传设备的指纹哈希、时间）。下面几个接口都要带 `X-Purge-Token`：

```bash
# ⚠️ 用 Cloudflare 直连的入口域。cshapi 那条走 SpeedOnline CDN 回源，
#    2026-10-05 起持续 502（前端有 fallback，但脚本没有）。
B=https://submit.132614.xyz
T=<PURGE_TOKEN>          # 与 GitHub Actions secret 里那份相同
```

**这个令牌是什么、放哪、怎么换：**

- 它是一个**随机长字符串**（自己生成，比如 `openssl rand -hex 32`），没有算法、没有默认值；
- Worker 侧存在 **Cloudflare Workers 的 secret `PURGE_TOKEN`** 里（Dashboard → Workers →
  该 Worker → Settings → Variables → Secrets，或 `wrangler secret put PURGE_TOKEN`）。
  **没配这个 secret 时所有管理接口一律 401** —— 等于全禁，不会有「空令牌放行」；
- GitHub Actions 侧存在仓库 secret `PURGE_TOKEN` 里（工作流调 `/api/purge` 用），
  两边存**同一份值**；要轮换就两边各改一次，改完立刻生效，不用重新部署；
- 令牌只通过 `X-Purge-Token` 请求头传输，仓库文件、日志、前端代码里都不落明文。

```bash
# 列对象。默认看「登记表」：我们签出去过的，带体积 / 名字 / 上传设备；
# 加 all=1 连墓碑一起看。source=bucket 则直接问桶：权威、含历史对象，但只有键。
curl -H "X-Purge-Token: $T" "$B/api/files"
curl -H "X-Purge-Token: $T" "$B/api/files?prefix=icon/&all=1"
curl -H "X-Purge-Token: $T" "$B/api/files?source=bucket&prefix=upload/"

# 本月两条通道各走了多少、共登记了多少
curl -H "X-Purge-Token: $T" "$B/api/dl-stats"

# 临时拼一条带时效的直链（默认 900 秒，最长 3600 秒）
curl -X POST -H "X-Purge-Token: $T" -H 'Content-Type: application/json' \
  -d '{"key":"upload/2026/10/xxx.exe","ttl":600}' "$B/api/link"

# 删除：单条 / 一批 / 整个目录
curl -X POST -H "X-Purge-Token: $T" -H 'Content-Type: application/json' \
  -d '{"keys":["upload/2026/10/a.exe","icon/2026/10/b.png"]}' "$B/api/purge"
curl -X POST -H "X-Purge-Token: $T" -H 'Content-Type: application/json' \
  -d '{"prefix":"upload/2026/10/"}' "$B/api/purge"

# 桶还是私有的吗？（整套防盗刷都建立在这个前提上，随手按一下）
curl -H "X-Purge-Token: $T" "$B/api/oss-check"
#   → private: true（匿名直读 403）才算正常；返回 200 就是桶被设成公共读了，立刻改回去

# 跑一轮孤儿回收。默认**干跑**（只报告不删），要真删必须显式传 dry:false
curl -X POST -H "X-Purge-Token: $T" -H 'Content-Type: application/json' \
  -d '{"dry":true}' "$B/api/gc"

# 运维旋钮总入口：取回通道 / 孤儿阈值 / 失效记录阈值 / 投稿准入，改完当场生效
curl -H "X-Purge-Token: $T" "$B/api/dl-mode"
curl -X POST -H "X-Purge-Token: $T" -H 'Content-Type: application/json' \
  -d '{"mode":"relay"}' "$B/api/dl-mode"
curl -X POST -H "X-Purge-Token: $T" -H 'Content-Type: application/json' \
  -d '{"orphanMinutes":30,"requireSource":true,"maxPending":5,"maxPerDay":10}' "$B/api/dl-mode"
```

`prefix` 形式只允许 `upload/`、`soft/`、`icon/`、`releases/` 之下，**永远不许碰 `gh-mirror/`**。
它是**先问桶要清单、再逐个删**（不是查登记表），所以对「登记表上线之前」的老对象同样有效；
一次最多 200 个，超了会明确报错而不是删一半。删掉的对象会在登记表里留一条墓碑
（`deleted: 1`），默认列表不再显示，加 `all=1` 可回溯。

`dl-stats` 里还有几个值得天天瞄一眼的字段：`pending`（签了名还没被任何提交认领的数量，
只涨不落说明回收任务没跑成）、`lastGc`（最近一次定时回收的结果 —— 定时任务不打任何外部接口，
这是从外部确认「cron 真的在跑」的唯一证据）、`submitGate`（投稿准入的三个当前阈值）。

**`/api/dl-mode` 到底能调什么、怎么调**（一次请求只带要改的字段，没带的不动；改完当场生效）：

| 字段 | 取值 | 含义 |
| --- | --- | --- |
| `mode` | `auto` / `relay` / `direct` | 取回通道。`auto` = 中继活着且没超月度流量就走中继，否则直链 |
| `orphanMinutes` | 1 ~ 10080（分钟） | 传了没提交的文件，多久后允许回收（默认 15） |
| `staleRecordHours` | 1 ~ 8760（小时） | 「签了名一直没真传」的失效登记，多久后允许清理（默认 24） |
| `maxPending` | 0 ~ 100 | 同一设备同时在审的投稿上限（默认 3，0 = 关闸） |
| `maxPerDay` | 0 ~ 1000 | 同一设备 24h 内的投稿上限（默认 6，0 = 关闸） |
| `requireSource` | `true` / `false` | 投稿是否必须至少带一个站内下载项（默认 `true`） |

`GET /api/dl-mode` 会把当前值连同来源（`runtime` = DO 里改过的 / `env` = 环境变量）一起回显，
切错了照着再 POST 一次就是。**这些都存在 DO 里，改了不用重新部署。**

**当前整套限额（写死在 Worker 里的默认值，可用同名环境变量覆盖）：**

| 限制 | 默认值 | 覆盖用的环境变量 |
| --- | --- | --- |
| 签发限流 · 单来源 | 20 次/天 | `SIGN_PER_IP_PER_DAY` |
| 签发限流 · 全站次数 | 3000 次/天 | `SIGN_GLOBAL_PER_DAY` |
| 签发限流 · 全站申报体积 | 20 GB/天 | `SIGN_GLOBAL_BYTES_PER_DAY` |
| 单设备下载换票 | 25 次/天 | `DL_DAILY_LIMIT` |
| 单文件上传上限 | 2.5 GB | `OSS_MAX_BYTES`（代码常量，改它要发版） |

注意区分两层：**环境变量改了要重新部署 Worker**（Dashboard → Settings → Variables，
或 `wrangler.toml` 里加 `[vars]` 后发版）；上面的 `/api/dl-mode` 旋钮是运行时配置，
当场生效。急刹车用 dl-mode，调长期参数用环境变量。

### 2.9 上线前的直链巡检

`node scripts/verify-links.mjs` 会把 `软件数据/apps/*.json` 里所有**外部**直链（不含 `oss://` 与
`/api/icon`）逐个探一遍：先 HEAD，被拒（400/403/405/501）就回退 `GET` + `Range: bytes=0-0`。
结论只有三种，**超时 / DNS / TLS 一律算「无结论」而不是死链** —— 一次网络抖动判人死链比漏判更糟。

```bash
node scripts/verify-links.mjs                        # 扫全部，有死链退 1
node scripts/verify-links.mjs --soft                 # 只报告，永远退 0
node scripts/verify-links.mjs 软件数据/apps/7-zip.json
node scripts/verify-links.mjs --only github.com      # 只探某一类域名
```

审核工作流在每次**通过**之前也会对这份提交的外链探一遍，结论直接写进 Issue 评论（不阻断审核：
大量正经站点会拒 HEAD，硬拦会把好投稿挡在门外）。


---

> 安全相关的加固（输入清洗、投稿准入三层闸门、Markdown 注入防护、图标魔数校验、直链防盗刷、
> 凭据不入日志）统一记在 `软件数据/OSS-全链路流程.md` 的第 8 节 —— 动 Worker 或审核工作流之前先读那一节。

---

## 三、分类配置

`软件数据/categories.json` 包含 4 个分类（key / 名称 / 图标）：

| key        | 含义   |
| ---------- | ---- |
| `system`   | 系统工具 |
| `schedule` | 教学软件 |
| `teaching` | 教学辅助 |
| `other`    | 其他工具 |

- 修改名称：编辑 `name` 字段。
- 修改图标：`icon` 为字体符号代码（形如 `\uE90F` 的转义形式），需对照 Fluent 图标表，**不建议随意改动**。

---

## 四、文字与界面

### 4.1 文字设置

- 中文站：根目录 **`文字设置.ts`** —— 直接编辑引号内的值，文件顶部注释即字段说明。
- 英文站：`src/gallery/Strings/en-US/Resources.ts`。

### 4.2 欢迎弹窗

进入网站（停留在首页）会显示 WinUI 风格欢迎窗口（欢迎语 / 表情图 / 站点介绍 /  
仓库地址 · 作者首页 · 相关文章 · 加入 QQ 群 · 投喂作者 五个外链），点击「开始探索下载」后关闭。  
通过 `#/download/xxx`、`#/settings` 等直达地址打开时**不会弹出**。

- 文字：`文字设置.ts` 的 `welcome.*` 键
- 相关文章链接：`welcome.article-url`
- QQ 群：`about.qq-group` + `about.qq-group-url`
- 投喂作者：`about.reward` + `about.reward-url`
- 表情图：`src/assets/welcome-sticker.gif`（同名覆盖后重新打包）

### 4.3 全站搜索

按 `Ctrl + K`（`Ctrl + F` 同样可唤出）或点击标题栏搜索框，弹出搜索面板，  
一次可搜索四类内容 —— **软件 / 内置工具 / AI 导航站点 / 页面**，按类别分组显示。

- 软件除名称外还匹配**一句话简介**与**详细介绍**，仅记得用途也能搜到；    
  结果右侧标注命中来源（`应用名称` 或 `相关简介`）。
- `↑` `↓` 选择、`Enter` 打开、`Esc` 关闭；AI 导航站点在新标签页打开，其余站内跳转。
- 关键词留空时列出五个页面快捷入口。

搜索逻辑：`src/gallery/searchIndex.ts`；面板界面：`src/gallery/GlobalSearch.vue`；  
文案：`文字设置.ts` 的 `search.*` 键。日常维护无需修改代码。

### 4.4 网站图标

`src/assets/AppIcon.ico / AppIcon-180/192/512.png` 由 `src/assets/AppIcon-source.png`  
（1890×1890 原图）缩放生成。更换图标：覆盖 `AppIcon-source.png` 后重新生成四个文件  
（或使用任意工具缩放为同名文件覆盖），再重新打包。

### 4.5 设置页「关于」

- 「投喂作者 / 回声洞 / 作者首页 / QQ 群」链接来自 `文字设置.ts` 的 `about.*-url` 键。
- 页面过渡选项已移除，切换动画固定为默认效果（用户不可调整）。

---

## 五、AI 导航

根目录 **`AI导航文本.ts`** —— 每个网站一段配置，仅需修改名称 / 简介 / 网址（图标已内置）。

---

## 六、构建与部署

### 6.1 常用命令

```bash
npm install          # 首次使用（已安装过可跳过）
npm run dev          # 开发预览 http://localhost:5173（改代码自动刷新）
npm run build        # 常规打包 → dist/（多文件，线上部署使用此产物）
npm run build:single # 单文件打包 → dist/index.html（约 2MB，离线双击打开，非部署产物）
npm run type-check   # TypeScript 类型检查
```

### 6.2 部署方式

推送到 `main` 分支后，GitHub Actions 自动打包并发布网页。

- **线上部署**：使用 `npm run build` 生成的 `dist/` 整个目录。
- **单文件产物**：`npm run build:single` 仅用于「复制单个文件、离线双击打开」，**线上不使用**。

---

## 七、软件版本自动核对

网站仓库**每周五上午**自动核对每个软件的版本号、下载直链与体积，核对来源有 **两条**：

- **GitHub Releases** —— 依据 `github` 字段读取，本站收录的开源软件都走这条（`scripts/check-updates.mjs`）；
- **官方下载源** —— 没有 GitHub 仓库的软件（微信 / Chrome / VLC / 火绒 / 希沃系 / QQ / WPS …）    
  由 `scripts/resolve-direct-links.mjs` 去探厂商的固定入口或 winget 官方清单，直链与版本号同样每周刷新；
- **可确定的更新由脚本自动写入**（版本号、直链、体积），无需人工介入；
- **无法确定的条目**汇总到「软件信息体检」Issue，每条注明「需跟进」与「不跟进」两种处理方式。

### 7.1 命令行用法

```bash
node scripts/check-updates.mjs --report=报告.md --pending=待审.md        # 仅检查，不修改任何文件
node scripts/check-updates.mjs --apply --report=报告.md --pending=待审.md # 检查并写回可确定的信息
node scripts/update-ignore.mjs --list                                    # 查看已永久忽略的软件
```

- 仅检查指定软件：`--only=7-zip,classisland`；跳过直链存活检查（提速）：`--no-link`。
- 非 GitHub 应用的直链解析是**另一个脚本**，可以单独跑（见 §7.6）：    
  `node scripts/resolve-direct-links.mjs --report=解析报告.md`（只读，加 `--apply` 才写回）。
- 建议配置 GitHub 令牌（不配置也可运行，匿名接口限流 60 次/小时）：    
  `export GITHUB_TOKEN=xxx`（Windows CMD 使用 `set GITHUB_TOKEN=xxx`）。

### 7.2 自动执行流程

`.github/workflows/check-updates.yml` 每周五上午自动执行：

1. **脚本可自行确定的更新** → 直接写回 JSON、提交并触发一次部署，无需人工介入；
2. **脚本无法确定的部分** → 汇总为「软件信息体检 · 待人工确认」Issue     
   （每次更新复用同一个 Issue，不会重复创建）。全部处理完毕后，该 Issue 会**自动关闭**。

### 7.3 需人工确认的情况

判定原则为**全有或全无**：软件的版本号与下载直链是一个整体，只要有一处无法处理，  
则不做任何修改 —— 否则会出现「版本号已更新、直链仍指向旧文件」的自相矛盾数据。

进入 Issue 的情况：

- **跨大版本更新**（如 1.7 → 2.0）：站内可能有意保留旧版（例如供旧系统使用的 `classisland-17`），    
  也可能需整体升级（简介、截图同步修改）；
- 下载项带 **校验值**（`hash` 字段；早期写法写在 `note` 里）—— 文件更换后校验值即失效；
- 上游**更换了附件文件名**，脚本无法判断新旧对应关系；
- `github` 字段指向不存在的仓库，或填写的并非仓库地址；
- **非 GitHub 直链** —— 已由 `scripts/resolve-direct-links.mjs` 每周自动解析并写回（见 §7.6）；    
  只有厂商页面改成 SPA / 接口下发、或上游清单比站内还旧时，才会落进「跟不了」等人看；
- 下载直链已失效（HTTP 404 等）。


### 7.4 Issue 中的操作方式

每条记录包含标题、一行「未自动修改的原因」、**三个复选框**，以及折叠的「跟进修改步骤」。

| 处理意图 | 操作方式 |
|---|---|
| 已在其他地方修改完成，需重新检测 | 修改并**提交**后，勾选「**已改好 → 重新检测**」—— 系统立即重新检查，正确则该项消失 |
| 本次暂不处理（有变化再提醒） | 勾选「**本次跳过**」—— 仅压制当前这一版问题 |
| 该软件不再维护（今后不再提醒） | 勾选「**不用跟进**」（永久忽略） |
| 误操作 / 需恢复提醒 | 在 Issue 文末「已忽略 / 本次跳过」区域勾选对应那条的「恢复提醒」 |
| 需写明忽略理由（也支持批量处理） | 回复 `/ignore 软件id`、`/ignore 软件id all 理由`、`/unignore 软件id` |

> **必须先提交，再点击「重新检测」**，否则系统读取的仍是旧数据。
> 三个复选框均为**一次性操作，不是待办项**：勾选后该项即从清单中移除，无需保留勾选状态。
>
> **「本次跳过」与「不用跟进」的区别**：前者仅跳过**当前这一版问题**（上游发布新版、直链更换后
> 会自动恢复提醒），后者是永久静音。若不确定，建议选择「本次跳过」—— 它不会导致日后收不到真实问题的提醒。
>
> 跳过记录保存在 `软件数据/update-ignore.json` 的 `_skip_once` 字段；忽略记录也在同文件。
> `软件id` 即 `apps/` 中文件名去掉 `.json` 后的部分（如 `7-zip`、`classisland-17`）。

### 7.5 Issue 中的「跟不了」是什么

Issue 正文：顶部一行数字，下面**仅列出需要处理的条目** ——
已自动更新、跟不了、已忽略、本次跳过、账目都收在折叠区中。

| 归属 | 含义 |
|---|---|
| **需人工处理** | 产生了待审条目的软件。即使本次也自动修好了一部分，也只计一次 |
| **本次自动修好** | 脚本写回成功、且未留下待审条目的 |
| **跟踪中、无需处理** | 其余在自动跟踪的（已最新 / 比上游新 / 上游暂无发行版） |
| **本来就不跟踪** | 无 GitHub 仓库的 |

「跟不了」表格将**无法自动跟踪**的软件按原因分档列出，**它们不会成为待办条目**。
**已在自动跟踪的不列进来** —— 除了 GitHub Releases，还有一批「官方下载源」也在每周自动跟（见 §7.6）。

| 档位 | 含义 | 需人工处理吗 |
|---|---|---|
| **只有网页入口** | 官网是 JS 渲染的 SPA，页面中没有可解析的版本锚点 | **需要**，偶尔查看 |
| **微软商店分发** | 商店自身会推送更新，站内只做跳转 | 不需要 |
| **官方固定「最新版」直链** | URL 永不过期（如 `.../Version/Latest/`），安装后软件自身也会更新 | 不需要 |
| **有意归档 / 已停更** | 故意收录的旧版（id 中带版本号即为信号） | 只需关注「官方是否撤链」 |
| **第三方网盘** | 蓝奏云 / 百度网盘分发，链接无法自动验证 | 偶尔查看发布页 |

### 7.6 没有 GitHub 仓库的软件，怎么自动跟

`scripts/resolve-direct-links.mjs` 负责这批（微信、Chrome、VLC、火绒、希沃全家桶、QQ、WPS、
腾讯会议、360、DiskGenius…）的**直链与版本号**。它跑在 CI 上，同源策略管不到它，
**不需要任何自建后端**。登记表就是脚本里的 `RESOLVERS` —— 加一行就能让一个软件自动跟。


| 来源 | 做法 | 例子 |
|---|---|---|
| `seewo` | 厂商按产品码下发的固定接口，URL 里不带版本号 | 希沃白板 / 课堂助手 / 视频展台 / 班级优化大师 / 品课 |
| `winget` | 读 microsoft/winget-pkgs 官方清单，直链带版本号、**链接与版本一起刷新** | 微信、QQ、WPS、腾讯会议 |
| `winget` + `keepUrl` | 只借清单里的**版本号**，站内那条「始终最新」直链一个字不动 | Chrome、PotPlayer、RAMMap、Geek Uninstaller、UU 远程 |
| `probe` | 探一个不会变的入口，从**产物本身**读版本号：重定向的最终地址、目录清单、或页面里抠出的安装包名 | Firefox、火绒、GeoGebra、VLC、360 极速浏览器 / 急救箱、DiskGenius |
| `probe` + `rewrite` | 链接文件名里带版本号、发新版就 404 的那类，按模板重建每条下载项的地址 | VLC（`.../last/win64/vlc-<版本>-win64.exe`） |

两条硬规则：

1. **版本号只向前、不后退** —— 写回的版本必须来自我们**实际分发的那个产物**
   （重定向后的地址 / `Content-Disposition` 文件名 / 页面里抠出的安装包名 / winget 清单），
   且只在比站内更新时才覆盖。**上游比站内旧就整条跳过** —— winget 的钉钉清单停在 7.1.0、
   站内已是 8.5.0，宁可什么都不动，也不能把用户从新版拽回旧版。
2. **只处理没有 `github` 字段的软件** —— 有仓库的归 `check-updates.mjs`，两边都写会互相打架。

```bash
node scripts/resolve-direct-links.mjs --report=解析报告.md            # 只看，不改任何文件
node scripts/resolve-direct-links.mjs --apply --report=解析报告.md    # 写回
node scripts/resolve-direct-links.mjs --only=vlc,diskgenius           # 只处理指定软件
```

> **找安装包地址时别忘了「协议相对」写法**（`//dl.360safe.com/x.zip`）。只按 `https://` 搜
> 会以为人家「没有直链」—— 360 系统急救箱就这样被误判了很久。

**目前确实跟不了的**（`scripts/untracked-buckets.mjs` 里逐条写明理由）：
向日葵（页面是 Nuxt SSR，整页一个安装包地址都没有）、海康易教学助手（Vue SPA，地址由接口下发）、
360 安全卫士极速版（页面没有版本锚点，winget 也没收录 360）、驱动总裁（在线安装器 + JS 页面）、
钉钉 / ToDesk（上游清单比站内旧，被闸门拦下）、仅 Microsoft Store 分发的若干、以及网盘分发的 DirectX 修复工具。

---

## 八、出问题了怎么办

### 8.1 页面顶部出现红色提示条

**原因**：某个软件 JSON 格式错误。**影响**：仅跳过该文件，其余软件正常显示，不会导致整站无法打开。

**提示条内容**：「有 N 个数据文件未读取」+ 错误文件名 + 大致行号 + 原因
（鼠标悬停在条目上可查看浏览器原始报错）。

**处理**：修正对应文件的 JSON 语法，保存刷新，提示条自动消失。

### 8.2 JSON 语法要点

- 每行格式 `"字段名": 值` —— 冒号、引号、逗号**均使用英文符号**。
- 字符串（文字、网址）使用**英文双引号**包裹。
- 最后一行的值后面**不加**逗号。
- 若不确定，复制 `_模板.json` 后修改，不要从空白开始手写。

### 8.3 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| 详情页显示「未找到该软件」 | `id` 中混入了网址参数（`?` `&` `=`）。原数据中 5 条畸形 id 已修正为 `7-zip` / `9wzdncrfjbmp` / `xpfp7f8rl7mb1w` / `xpddvc6xtqqkmm` / `dism-gui` |
| 文字溢出卡片 | 校验值整串写入了 `note`。将哈希移至 `hash` 字段，`note` 只保留说明文字 |
| 图片图标无法显示 | 数据中 `icon` 留空会显示空白占位；分类图标仍使用字形 |
| 文件回退或丢失 | 项目位于 OneDrive 目录下，可能是同步冲突 —— 对照上游重新应用补丁 |
| 组件库升级后图片图标失效 | WinUIonWeb 的 `WinNavigationView` 相对上游补充了「图片图标」支持，升级后需重新应用该补丁 |

### 8.4 与原单文件版的对应关系

| 原 HTML 区域 | 现在的位置 |
| --- | --- |
| ① 文字设置区（window.DOWNLOAD_STATION_TEXT） | 根目录 `文字设置.ts`（zh）＋ `src/gallery/Strings/en-US/Resources.ts`（en） |
| ② 软件数据区（window.DOWNLOAD_STATION_DATA） | 根目录 `软件数据/`（`apps/*.json` ＋ `categories.json` ＋ 本手册） |
| ③ 自检 / 补丁脚本（插入「系统限制」行等） | 已删除 —— 详情页原生支持 `system` 字段，无需补丁 |
| ④ WinUIonWeb 编译内核 | `src/components`、`src/styles`、`src/utils`、`src/assets` |
| ⑤ 页面骨架 / 样式 | `src/gallery/`（页面组件与样式）＋ `App.vue` |

> 组件库来自上游 WinUIonWeb，保持目录结构不变，便于后续对照升级。

---

## 九、版本号与发布规则

**版本号规则**（2026-09-15 起）：

- 对外版本号采用 `X.Y.Z` —— X 为大版本（底层架构 / UI 大改动）、Y 为功能更新、Z 为小修小补；
  **代号后缀保留**（如 `- Autumn`）。
- 同一版本另有内部版本号 `AAAABBCCPRDD`（AAAA 年 / BB 月 / CC 日期 / DD 文件版次），
  例 `20260915PR01`。
- 对外与内部版本号均写入 `文字设置.ts` 的 `app.version`
  （当前 `v2.3.4 - Tangram (20260927PR01)`）。
- 英文站需同步修改 `src/gallery/Strings/en-US/Resources.ts` 的 `app.version`
  （设置页「关于」展示的即为此值）。

---

*其他文字在根目录 `文字设置.ts` 中修改。*
