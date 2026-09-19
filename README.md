# ClassSoftwareHub — 电教委员常用软件下载站（Vue 源码版）

本站由单文件 `indexV20260831.html` 逆向重构而来，将原先压缩的页面内核拆分为可读、可维护的
Vue 3 + Vite + TypeScript 工程。界面基于 **WinUIonWeb**（Furry-Xiyi 的开源 WinUI 风格 Vue 组件库），
外观与原版保持一致。

## 常用命令

```bash
npm install          # 首次使用（已安装过可跳过）
npm run dev          # 开发预览 http://localhost:5173（修改代码后自动刷新）
npm run build        # 常规打包 → dist/（多文件：index.html + assets/，线上部署使用此产物）
npm run build:single # 单文件打包 → dist/index.html（约 2MB，可离线双击打开，不属于部署产物）
npm run type-check   # TypeScript 类型检查
```

## 日常维护：需要修改哪些文件

> 日常维护只需改动以下两个内容区，无需修改代码。

| 修改内容 | 对应文件 |
| --- | --- |
| **文字**（站名 / 按钮 / 提示语 / 关于链接等） | 根目录 **`文字设置.ts`** —— 直接编辑引号内的值，文件顶部注释即字段说明。英文站对应 `src/gallery/Strings/en-US/Resources.ts` |
| **软件**（增删软件 / 修改链接、版本、系统限制） | 根目录 **`软件数据/`** 文件夹 —— `apps/` 下每个软件一个 JSON 文件。新增软件即复制 `_模板.json` 后改名并填写内容，删除软件即删除对应文件。操作前请先阅读 `README-维护手册.md` |
| 分类（名称 / 图标 / 顺序） | 根目录 `软件数据/categories.json`（一般无需改动） |
| **AI 导航**（网址清单 / 文案） | 根目录 **`AI导航文本.ts`** —— 每个网站一段配置，仅需修改名称 / 简介 / 网址（图标已内置） |

修改完成后执行 `npm run build`，将 **`dist/` 整个目录**（`index.html` 与 `assets/` 文件夹）复制到班级电脑。
推送到 `main` 分支后，GitHub Actions 会自动打包并发布至 **GitHub Pages + FTP + OpenList 网盘**三处。
`npm run build:single` 生成的单文件 HTML 仅用于「复制单个文件、离线双击打开」的场景，**线上部署不使用该产物**。

## 软件信息自动更新

站内软件的**版本号 / 下载直链 / 体积**会随上游更新而过期。仓库内置检查脚本，会向 GitHub
核对每个软件的最新版本，并按两类分别处理：**可确定的信息自动写入，无法确定的提交到 Issue 由人工确认**。

```bash
node scripts/check-updates.mjs --report=报告.md --pending=待审.md        # 仅检查，不修改任何文件
node scripts/check-updates.mjs --apply --report=报告.md --pending=待审.md # 检查并写回可确定的信息
node scripts/update-ignore.mjs --list                                    # 查看已永久忽略的软件
```

- 仅检查指定软件：`--only=7-zip,classisland`；跳过直链存活检查（可提速）：`--no-link`。
- 建议配置 GitHub 令牌（不配置也可运行，但匿名接口限流为 60 次/小时）：
  `export GITHUB_TOKEN=xxx`（Windows CMD 使用 `set GITHUB_TOKEN=xxx`）。

### 自动执行（默认即为全自动）

`.github/workflows/check-updates.yml` **每周五上午**自动执行一次检查：

1. **脚本可自行确定的更新** → 直接写回 JSON、提交并触发一次部署，无需人工介入；
2. **脚本无法确定的部分** → 汇总为「📦 软件信息体检 · 待人工确认」Issue
   （每次更新复用同一个 Issue，不会重复创建）。全部处理完毕后，该 Issue 会**自动关闭**。

### 需人工确认的情况

判定原则为**全有或全无**：软件的版本号与下载直链是一个整体，只要有一处无法处理，
则不做任何修改 —— 否则会出现「版本号已更新、直链仍指向旧文件」的自相矛盾数据。
进入 Issue 的情况包括：

- **跨大版本更新**（1.7 → 2.0）：站内可能有意保留旧版（例如供旧系统使用的 `classisland-17`），
  也可能需要整体升级（简介、截图需同步修改）；
- `note` 中包含 **SHA512 / SHA256 校验值** —— 文件更换后校验值即失效，需重新计算；
- 上游**更换了附件文件名**，脚本无法判断新旧对应关系；
- `github` 字段指向不存在的仓库，或填写的并非仓库地址；
- **非 GitHub 直链仍指向旧版本**（例如官网提供 `7z2602-x64.exe`，而站内版本已是 26.03）——
  此类链接脚本不会代为修改，需人工到官网或镜像站查找新地址；
- 下载直链已失效（HTTP 404 等）。

### Issue 中的操作方式

每条记录包含标题、一行「未自动修改的原因」、**两个复选框**，以及折叠的「跟进修改步骤」。无需输入文本：

| 处理方式 | 操作步骤 |
| --- | --- |
| **需要跟进** | 展开该条的「跟进修改步骤」，按步骤修改 `软件数据/apps/<id>.json`（正文中提供「在网页上打开」直达链接）→ **提交** → 返回勾选该条的「已改好 → 重新检测」，系统会立即重新执行检查以确认 |
| **不跟进（永久忽略）** | 勾选该条下方的「不用跟进」复选框 |
| **误操作 / 需恢复提醒** | 在 Issue 文末「已忽略」区域勾选该条的「恢复提醒」 |

> 修改后**必须先提交**再点击「重新检测」，否则系统读取的仍是旧数据。
> 两个复选框均为**一次性操作，不是待办项**：勾选后该条即从清单中移除，因此无需保留勾选状态。

也支持命令行方式（效果相同，适合批量处理或需要填写理由的场景）：

```
/ignore 7-zip                      永久忽略该软件的更新提醒
/ignore 7-zip all 上游没有仓库了     同时忽略直链失效提醒，并记录理由
/unignore 7-zip                    取消忽略
```

忽略记录保存在 **`软件数据/update-ignore.json`**，同时会写入检查报告以便日后查阅。
默认范围 `updates` 表示不再提醒版本与仓库类问题（直链失效仍会提醒）；`all` 表示不再提醒任何问题。

如需立即执行一次：Actions 页面 → Check App Updates → Run workflow（`apply` 默认已勾选）。

## 与原单文件版的对应关系

| 原 HTML 区域 | 现在的位置 |
| --- | --- |
| ① 文字设置区（window.DOWNLOAD_STATION_TEXT） | 根目录 `文字设置.ts`（zh，结构一致）＋ `src/gallery/Strings/en-US/Resources.ts`（en） |
| ② 软件数据区（window.DOWNLOAD_STATION_DATA） | 根目录 `软件数据/`（`apps/*.json` 每个软件一个文件 ＋ `categories.json` ＋ `README-维护手册.md`） |
| ③ 自检 / 补丁脚本（插入「系统限制」行等） | 已删除 —— 详情页原生支持 `system` 字段，无需补丁 |
| ④ WinUIonWeb 编译内核 | `src/components`、`src/styles`、`src/utils`、`src/assets`（上游库源码） |
| ⑤ 页面骨架 / 样式 | `src/gallery/`（页面组件与样式）＋ `App.vue` |

## 备注

- **版本号规则**（2026-09-15 起）：对外版本号采用 `X.Y.Z` —— X 为大版本（底层架构 / UI 大改动）、
  Y 为功能更新、Z 为小修小补；**代号后缀保留**（如 `- Autumn`）。同一版本另有内部版本号 `AAAABBCCPRDD`
  （AAAA 年 / BB 月 / CC 日期 / DD 文件版次），例 `20260915PR01`。
  对外版本号与内部版本号均写入 `文字设置.ts` 的 `app.version`
  （当前 `v2.3.2 - September 18 Incident (20260919PR02)`），英文站需同步修改
  `src/gallery/Strings/en-US/Resources.ts` 的 `app.version`（设置页「关于」展示的即为此值）。
- 设置页「关于」中的「投喂作者 / 回声洞 / 作者首页 / QQ 群」链接来自 `文字设置.ts` 的 `about.*-url` 键，
  修改文字区即可更换链接。
- 设置页已移除「页面过渡」选项，切换动画固定为默认效果（用户不可调整）。
- **数据容错**：单个软件 JSON 格式错误不会影响全站 —— 错误文件会被自动跳过，页面顶部出现红色提示条，
  显示「未读取文件数量 + 文件名 + 大致行号 + 原因」，其余软件正常显示。
- 左侧导航软件小图标：数据中 `icon` 填入图片链接即显示图片图标（组件已支持），分类图标仍使用字形。
- 已修正原数据中的 5 条畸形 id（7-Zip / Microsoft Store / Bing Wallpaper / 哔哩哔哩 / Dism 图形界面，
  原 id 中混有网址参数，导致详情页显示「未找到该软件」，现已改为合法 id：
  `7-zip` / `9wzdncrfjbmp` / `xpfp7f8rl7mb1w` / `xpddvc6xtqqkmm` / `dism-gui`）。
  新增软件时 id 请使用英文小写加短横线，不要包含 `?` `&` `=` 等符号。
- 组件库来自上游 WinUIonWeb，保持目录结构不变，便于后续对照上游升级。
  （注意：WinUIonWeb 的 `WinNavigationView` 相对上游补充了「图片图标」支持；
  项目位于 OneDrive 目录下，若出现文件回退或丢失，可能是 OneDrive 同步冲突，对照上游重新应用补丁即可。）
- 页面样式提取自原版 HTML 的**原始规则**（已移除编译期 scoped 属性），修改样式请优先在页面组件内添加 scoped 规则。
- **欢迎弹窗**：进入网站（打开后停留在首页）会显示一个 WinUI 风格的欢迎窗口（欢迎语 / 表情图 / 站点介绍 /
  仓库地址 · 作者首页 · 相关文章 · 加入 QQ 群 · 投喂作者 五个外链），点击「开始探索下载」后关闭并继续使用；
  通过 `#/download/xxx`、`#/settings` 等直达地址打开时不会弹出。
  弹窗文字位于 `文字设置.ts` 的 `welcome.*` 键（相关文章链接 = `welcome.article-url`，
  QQ 群 = `about.qq-group` + `about.qq-group-url`，投喂作者 = `about.reward` + `about.reward-url`）；
  表情图 = `src/assets/welcome-sticker.gif`（更换时以同名文件覆盖后重新打包）。
- **全站搜索**：按 `Ctrl + K`（`Ctrl + F` 同样可唤出）或点击标题栏的搜索框，会弹出搜索面板，
  一次即可搜到四类内容 —— **软件 / 内置工具 / AI 导航站点 / 页面**，结果按类别分组显示。
  软件除名称外还匹配**一句话简介**与**详细介绍**，因此只记得用途、不记得名称时同样可以搜到；
  软件结果右侧标注命中来源（`应用名称` 或 `相关简介`）。`↑` `↓` 选择、`Enter` 打开、`Esc` 关闭；
  AI 导航的站点在新标签页打开，其余结果在站内跳转。关键词留空时列出五个页面快捷入口。
  搜索逻辑位于 `src/gallery/searchIndex.ts`，面板界面位于 `src/gallery/GlobalSearch.vue`，
  文案位于 `文字设置.ts` 的 `search.*` 键，日常维护无需修改代码。
- **网站图标**：`src/assets/AppIcon.ico / AppIcon-180/192/512.png` 由
  `src/assets/AppIcon-source.png`（1890×1890 原图）缩放生成；更换图标时覆盖
  AppIcon-source.png 后重新生成四个文件（或使用任意工具缩放为同名文件覆盖），再重新打包。
