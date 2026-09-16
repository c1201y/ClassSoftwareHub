# ClassSoftwareHub — 电教委员常用软件下载站（Vue 源码版）

由单文件 `indexV20260831.html` 逆向重构而来：把原本压缩成一坨的页面内核
拆成了可读、可维护的 Vue 3 + Vite + TypeScript 工程。
界面基于 **WinUIonWeb**（Furry-Xiyi 的开源 WinUI 风格 Vue 组件库），外观与原版一致。

## 常用命令

```bash
npm install          # 首次使用（已装过可跳过）
npm run dev          # 开发预览 http://localhost:5173（改代码自动刷新）
npm run build        # 常规打包 → dist/（多文件，适合挂服务器/GitHub Pages）
npm run build:single # 单文件打包 → dist/index.html（约 1.9MB，可离线双击打开）
npm run type-check   # TS 类型检查
```

## 日常维护：改哪里？（两个"傻瓜区"）

> 日常只碰下面两个地方，代码完全不用动。

| 想改什么 | 去哪改 |
| --- | --- |
| **文字**（站名/按钮/提示语/关于链接…） | 根目录 **`文字设置.ts`** —— 打开就改，只动引号里的字（顶部注释即说明书）。英文站对应 `src/gallery/Strings/en-US/Resources.ts` |
| **软件**（增删软件/改链接/版本/系统限制） | 根目录 **`软件数据/`** 文件夹 —— 里面 `apps/` 一个软件一个 JSON 文件，加软件=复制 `_模板.json` 改名改内容，删软件=删文件。先看 `README-维护手册.md` |
| 分类（名称/图标/顺序） | 根目录 `软件数据/categories.json`（一般不碰） |
| **AI 导航**（网址清单/文案） | 根目录 **`AI导航文本.ts`** —— 一个网站一段，改名称/简介/网址即可（图标内置，不用管） |

改完 → 跑 `npm run build`（或 `build:single`）→ 把产物给班级电脑。

## 软件信息自动更新（省事用）

站内软件的**版本号 / 下载直链 / 体积**会随上游更新而过期。仓库自带一个体检脚本，
去 GitHub 核对每个软件的最新版本，然后**分两路处理：能确定的自动改，不确定的丢进 Issue 让你拍板**。

```bash
node scripts/check-updates.mjs --report=报告.md --pending=待审.md        # 只体检，不改任何文件
node scripts/check-updates.mjs --apply --report=报告.md --pending=待审.md # 体检 + 写回能确定的
node scripts/update-ignore.mjs --list                                    # 看哪些软件被永久忽略了
```

- 想只查几个软件：`--only=7-zip,classisland`；嫌慢：`--no-link`（跳过直链存活检查）。
- 建议先设个 GitHub 令牌（不设也能跑，但匿名接口限流 60 次/小时）：
  `export GITHUB_TOKEN=xxx`（Windows CMD 用 `set GITHUB_TOKEN=xxx`）。

### 自动跑（默认就是全自动）

`.github/workflows/check-updates.yml` **每周五早上**自动体检一次：

1. **脚本能自己确定的更新** → 直接写回 JSON、提交、并触发一次部署，你不用管；
2. **它不敢确定的部分** → 汇总成一个「📦 软件信息体检 · 待人工确认」的 Issue（每次更新同一个，
   不刷屏）。全部处理完，这个 Issue 会**自动关闭**。

### 什么情况要你拍板

判定原则是**全有或全无**：一个软件的版本号与它的下载直链是一个整体，只要有一处搞不定，
就一个字都不改 —— 否则会出现「版本号已经是新的、直链还指着旧文件」这种自相矛盾的数据。
会进 Issue 的是这几种：

- **跨大版本**（1.7 → 2.0）：站内可能是有意留的旧版（比如给老系统用的 `classisland-17`），
  也可能要整体升级（简介 / 截图都得跟着改）；
- `note` 里写了 **SHA512/SHA256 校验值** 的 —— 换了文件校验值就失效，得你重新算；
- 上游**换了附件文件名**，脚本认不出新旧对应关系；
- `github` 字段指着查不到的仓库，或填的根本不是仓库地址；
- **不在 GitHub 上的直链还指着旧版本**（比如官网写的是 `7z2602-x64.exe`，而站内版本已经 26.03）——
  这些链接脚本不会替你改，得你到官网 / 镜像站找新地址；
- 下载直链已经打不开了（HTTP 404 等）。

### 在 Issue 里怎么处理

每条只有标题、一行「为什么没自动改」、**两个方框**、一个折叠的「要跟进的话，怎么改」。全程不用打字：

| 决定 | 怎么做 |
| --- | --- |
| **要跟进** | 点开该条的「要跟进的话，怎么改」，照步骤改 `软件数据/apps/<id>.json`（正文里直接给了「在网页上打开」的直达链接）→ **提交** → 回来点那条的「已改好 → 重新检测」，机器会立刻重跑一次体检确认 |
| **不跟进（永久忽略）** | 点一下该条下面的「不用跟进」方框 ☑ |
| **点错了 / 想恢复提醒** | 在文末「已忽略」区点一下那条的「恢复提醒」 |

> 改完**一定要先提交**再点「重新检测」，否则机器看到的还是旧数据。
> 两个方框都是**一次性开关、不是待办**：点完这条就从清单里消失，所以勾选状态不需要保留。

也支持命令行（等效，适合批量/写理由）：

```
/ignore 7-zip                      永久忽略这个软件的更新提醒
/ignore 7-zip all 上游没有仓库了     连直链失效也不提醒，并记下理由
/unignore 7-zip                    取消忽略
```

忽略记录写在 **`软件数据/update-ignore.json`**，也会进体检报告方便日后回顾。
默认范围 `updates` ＝不再提醒版本 / 仓库类问题（直链失效仍会提醒）；`all` ＝什么提醒都不要。

想立刻跑一次：Actions 页面 → Check App Updates → Run workflow（`apply` 默认已勾上）。

## 与原单文件版的对应关系

| 原 HTML 区域 | 现在的位置 |
| --- | --- |
| ① 文字设置区（window.DOWNLOAD_STATION_TEXT） | 根目录 `文字设置.ts`（zh，同款结构）＋ `src/gallery/Strings/en-US/Resources.ts`（en） |
| ② 软件数据区（window.DOWNLOAD_STATION_DATA） | 根目录 `软件数据/`（`apps/*.json` 每软件一文件 ＋ `categories.json` ＋ `README-维护手册.md`） |
| ③ 自检/补丁脚本（插“系统限制”行等） | 已删除 —— 详情页原生支持 `system` 字段，不再需要补丁 |
| ④ WinUIonWeb 编译内核 | `src/components`、`src/styles`、`src/utils`、`src/assets`（上游库源码） |
| ⑤ 页面骨架/样式 | `src/gallery/`（页面组件与样式）＋ `App.vue` |

## 备注

- **版本号规则**（2026-09-15 起）：对外版本号用 `X.Y.Z` —— X 大版本（底层架构 / UI 大改动）、
  Y 功能更新、Z 小修小补；**代号后缀保留**（如 `- Autumn`）。同一版本另有内部版本号 `AAAABBCCPRDD`
  （AAAA 年 / BB 月 / CC 日期 / DD 文件版次），例 `20260915PR01`。
  对外版本号与内部版本号都写在 `文字设置.ts` 的 `app.version`（当前 `v2.3.1 - September 18 Incident (20260916PR05)`），
  英文站同步改 `src/gallery/Strings/en-US/Resources.ts` 的 `app.version`（设置页「关于」展示的就是它）。
- 设置页“关于”里的“投喂作者/回声洞/作者首页/QQ 群”链接来自 `文字设置.ts` 的 `about.*-url` 键，改文字区即可换链接。
- 设置页已移除“页面过渡”选项，切换动画固定为默认效果（用户不可调）。
- **数据兜底**：某个软件 JSON 写坏不会影响全站 —— 坏文件被自动跳过，页面顶部出现红条
  提示「几个文件没读进来 + 文件名 + 大致行号 + 原因」，其余软件照常显示。
- 左侧导航软件小图标：数据里 `icon` 填图片链接即显示图片图标（组件已支持），分类图标仍是字形。
- 修复了原数据里 5 条畸形 id（7-Zip / Microsoft Store / Bing Wallpaper / 哔哩哔哩 / Dism 图形界面，
  原来 id 里混着网址参数，点进详情页会显示“未找到该软件”，已改为合法 id：
  `7-zip` / `9wzdncrfjbmp` / `xpfp7f8rl7mb1w` / `xpddvc6xtqqkmm` / `dism-gui`）。
  新加软件时 id 请用英文小写+短横线，别带 `? & =` 等符号。
- 组件库来自上游 WinUIonWeb，保持目录结构不变，方便以后对照上游升级。
  （注意：WinUIonWeb 的 `WinNavigationView` 相对上游补了“图片图标”支持；
  项目在 OneDrive 目录下，若出现文件莫名回退/丢失，可能是 OneDrive 同步冲突，对照上游重新补丁即可。）
- 页面样式是从原版 HTML 提取的**原样规则**（去掉了编译期 scoped 属性），改样式请优先在页面组件里加 scoped 规则。- 页面样式是从原版 HTML 提取的**原样规则**（去掉了编译期 scoped 属性），改样式请优先在页面组件里加 scoped 规则。
- **欢迎弹窗**：进入网站（打开后落在首页）会弹一个 WinUI 风格的欢迎窗（欢迎语/表情图/站点介绍/
  仓库地址 · 作者首页 · 相关文章 · 加入 QQ 群 · 投喂作者 五个外链），点“开始探索下载~”关闭继续使用；
  带 `#/download/xxx`、`#/settings` 等直达地址打开不弹。
  弹窗文字 = `文字设置.ts` 的 `welcome.*` 键（相关文章链接 = `welcome.article-url`，
  QQ 群 = `about.qq-group` + `about.qq-group-url`，投喂作者 = `about.reward` + `about.reward-url`）；
  表情图 = `src/assets/welcome-sticker.gif`
  （想换图就用同名文件覆盖后重新打包）。
- **标题栏搜索框**：和 WinUIonWeb 一样在窗口顶部（窗口太窄会自动收成 🔍 按钮，Ctrl+F 也能呼出）。
  搜索范围不止软件名，还包括**一句话简介**和**详细介绍**——不知道软件名、只记得“它是干嘛的”
  也能搜到。结果写成「软件名（来源）」：括号里是命中来源（`应用名称` 或 `相关简介`）。
  搜索逻辑在 `src/gallery/searchIndex.ts`，文案在 `文字设置.ts` 的 `search.*` 键，日常不用碰代码。
- **网站图标**：`src/assets/AppIcon.ico / AppIcon-180/192/512.png` 由
  `src/assets/AppIcon-source.png`（1890×1890 原图）缩放而来；想换图标就覆盖
  AppIcon-source.png 后重新生成四个文件（或用任意工具缩放成同名文件覆盖），再重新打包。
