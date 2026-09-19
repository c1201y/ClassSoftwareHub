# ClassSoftwareHub 桌面版

把「电教委员常用软件下载站」装进一个独立窗口的桌面程序：**内容跟着网站走，断网有副本兜底**。

- Windows：`.exe`（安装版 / 免安装版）
- Linux：`.deb`

设计上最要紧的两条：

1. **客户端自己不需要更新** —— 网页一更新，桌面版打开的就是最新内容（它是直接加载网站，不是把网页打包死在程序里）。
   唯一会过期的东西是随包附带的「离线副本」，而且它只在断网时才会用到。
2. **界面里没有一条自绘的提示横幅** —— 窗口内容区 100% 是网站本身。
   所有状态都交给系统去画（窗口按钮、任务栏角标、系统对话框），所以看起来就是一个 Windows 程序，
   而不是「网页上面盖了根条」。
3. **没有系统标题栏** —— 窗口用的是「去掉标题栏 + 系统窗口控制按钮覆盖层」：
   最小化/最大化/关闭三个按钮仍由 Windows 自己绘制，浮在网页标题栏的右端。
   网页标题栏读 `env(titlebar-area-*)` 自动让位，所以标题栏里的搜索框正好落在按钮左边，
   站点一个字节都不用改。

## 打开顺序（三级降级）

| 级别 | 情况 | 界面表现 |
| --- | --- | --- |
| ① 网站 | 能连上 `classsoftwarehub.us.ci` | 就是网站最新内容 |
| ② 磁盘缓存 | 第一次失败 → 再试一次，这一跳通常吃到 Chromium 的磁盘缓存 | 同①（对用户无感） |
| ③ 内置离线副本 | 还是失败 → 加载随包附带的单文件快照 | 弹一次系统对话框说明「现在看的是离线副本（打包日期）」，同时标题栏与任务栏角标标记出来 |

## 窗口与标题栏

| 项目 | 做法 |
| --- | --- |
| 系统标题栏 | **去掉**（`titleBarStyle: 'hidden'`）—— 窗口顶部只剩网页自己的标题栏 |
| 最小化 / 最大化 / 关闭 | **系统绘制**（`titleBarOverlay`），浮在网页标题栏右端，不是自绘按钮 |
| 覆盖层高度 | 固定 48，与站点标题栏一致（站点是 `max(env(titlebar-area-height,0px), 48px)`） |
| 拖动窗口 | 站点标题栏自带 `-webkit-app-region: drag`；兜底页 `no-copy.html` 自己补了一条 |
| 按钮区底色 | 从网页读 `--app-bg`，随「浅色 / 深色 / 跟随系统」和节日皮肤实时同步 |
| 窗口标题 | 仍由主进程 `setTitle()` 设置 —— 没标题栏了，但任务栏悬浮提示和 Alt+Tab 还看得到 |

按钮区取色靠注入站点的一小段**无界面探针**（`main.js` 的 `OVERLAY_PROBE`）：
每 500ms 读一次页面自己的 CSS 变量，值变了就用 `console` 报给主进程，主进程再调
`win.setTitleBarOverlay()`。**不插 DOM、不改样式**，站点照旧。

站点那边不需要改任何东西：标题栏的 `left / top / width / height` 全部写成
`env(titlebar-area-*, 兜底值)`，覆盖层一启用，宽度自动收缩成「窗口宽 − 138」，
搜索框就正好落在三个按钮左边。

## 状态怎么报（全部由系统画）

| 情况 | 窗口标题（任务栏悬浮提示里看得到） | 任务栏图标角标 |
| --- | --- | --- |
| 正常 | `ClassSoftwareHub` | 无 |
| 内置副本落后于网站 | `ClassSoftwareHub - 网站有更新` | 蓝色小圆点 |
| 正在看离线副本 | `ClassSoftwareHub - 离线副本 v2.3.2（2026-09-19）` | 黄色小圆点 |
| 既连不上、也没有副本 | `ClassSoftwareHub - 无法访问网站` | 红色小圆点 |

- 版本明细（桌面版版本 / 内置副本 / 网站当前版本 / 上次检查时间 / 失败原因）在
  菜单 **「帮助 → 版本信息…」**，用系统对话框显示。
- **「帮助 → 诊断信息…」** 会显示渲染实情：硬件加速是否启用、GPU 各功能的状态、**实测帧率**。
  觉得界面发黏时先点它，见下面「卡顿怎么办」。
- 断网时也是**系统对话框**（「重试 / 继续浏览」），每次启动最多弹一次 —— 用户点了「继续浏览」就不再打扰。
- 实现上对应 `main.js` 里的 `applyWindowChrome()`（标题 + 角标）、`notifyOfflineOnce()`、
  `showVersionInfo()`、`showDiagnostics()`，都只用 Electron 的原生能力。

## 目录

```
desktop/
  main.js                              主进程：窗口（无边框 + 系统窗口按钮覆盖层）、三级降级、
                                       标题/角标、原生对话框（版本信息 / 诊断信息 / 断网提示）、
                                       外链交给系统浏览器
  shell/
    index.html                         空白承载页 —— 界面里没有自绘 UI，它只提供跟随系统主题的底色
    no-copy.html                       既连不上网站、又没有副本时的兜底页（自带一条拖动区）
  scripts/make-snapshot.mjs            把站点产物做成内置离线副本
  start.cmd                             Windows：双击即可从源码启动（免敲命令）
  assets/icon.png|ico                  应用图标（取自网页图标，非另行设计）
  assets/badge-info|warn|error.png     任务栏角标（16×16，系统画在图标右下角）
  electron-builder.yml                 打包配置（Windows nsis+portable / Linux deb）
  snapshot/                            内置离线副本（构建时生成，不入库）
```

## 本地跑起来

```bash
# 1) 先在**站点根目录**做一份单文件产物（离线副本的来源）
npm run build:single

# 2) 生成内置离线副本
cd desktop
node scripts/make-snapshot.mjs

# 3) 装依赖并启动
npm install
npm start
```

Windows 上第 3 步可以省掉命令行：依赖装好后**双击 `desktop/start.cmd`** 即可。
（`start.cmd` 会先清掉 `ELECTRON_RUN_AS_NODE` —— 某些被托管的终端预设了这个变量，
不清的话 Electron 会当成普通 Node 启动、窗口一闪都不闪。）

只想试在线部分、不想生成副本也行：跳过 1、2 步，此时断网会显示「也没有离线副本」的兜底页。

## 图标

应用图标不是另外设计的，**用的就是网页那个图标**：

- 源图 = 站点图标母版 `src/assets/AppIcon-source.png`（`public/favicon.ico` 就是从它生成的）。
- 母版图形是横向卡片，正方形画布上下留白很大，直接照搬在任务栏里会显得又小又扁；
  所以生成时把图形内容裁出来、按长边缩到画布的 94% 再居中 —— 形象与网页一致，只是收掉了留白。
- 产出 `assets/icon.png`（512×512，Linux 用）和 `assets/icon.ico`（16/24/32/48/64/128/256 七档，Windows 用）。
- 任务栏角标 `assets/badge-*.png` 同样是脚本生成的 16×16 小圆点，颜色对应上表三种状态。

图标换了，重新跑一次生成脚本即可（生成脚本放在本机工具目录，不入库）。

## 出安装包

```bash
cd desktop
npm run pack:win     # Windows：release/ 下出 Setup.exe 与 Portable.exe
npm run pack:linux   # Linux：release/ 下出 .deb
npm run pack:dir     # 只解开目录，不打包（排查用）
```

正常不用手工出包 —— 到 GitHub Actions 里手动跑 **Build Desktop App**（Actions → 左侧选它 →
**Run workflow** → 填要发的 tag 号，如 `desktop-v1.0.1`）：它会自动建 tag、打包、发 Release。
**只有这一种触发方式** —— 推 tag 不再触发构建（见下节）。

实测记录（2026-09-19，Windows）：

- `npm run pack:win` **本机就能出包**，`release/` 下得到 `Setup.exe` 与 `Portable.exe`，各约 107 MB，双击可运行。
- **`.deb` 别在 Windows 上构建**：会卡在解压 Electron 的 Linux 运行时（十几分钟没动静），交给 CI 的 ubuntu 任务。
- deb 目标需要 `package.json` 里的 `homepage`（已配）—— 少了它 deb 会直接报 `Please specify project homepage`。
- 环境变量若预设了 `ELECTRON_RUN_AS_NODE`，构建前要清掉，否则 electron 会被当成普通 Node 启动。
- `release/` 万一被文件锁占住（上次跑的程序没退干净），会报 `EBUSY: resource busy or locked, unlink ...\app.asar`。
  先确认进程退干净；仍不行就换个输出目录：`npm run pack:win -- --config.directories.output=release-out`。
- 打包前务必确认 `assets/**/*` 在 `electron-builder.yml` 的 `files` 白名单里 —— 漏了不会报错，
  只是窗口图标和**任务栏角标**静默消失（`main.js` 运行时按 `__dirname` 读它们）。

> 出包机器上**必须**先有 `snapshot/`：`make-snapshot.mjs` 找不到单文件产物会直接报错退出，
> 免得打出一个「断网就没内容」的包。

## 发版与版本号

- 桌面版版本号在 `desktop/package.json` 的 `version`，和站点版本（`文字设置.ts` 的 `app.version`）**互不相干**。
- **发版只有一个入口**：Actions → **Build Desktop App** → **Run workflow** → 填 tag
  （`1.0.1` / `v1.0.1` / `desktop-v1.0.1` 都接受，一律归一成 `desktop-v1.0.1`）。
  这一次运行会依次做完四件事：

  | 步骤 | 做什么 |
  | --- | --- |
  | ① | 校验 tag 格式；**已存在就直接失败**（要重发先删 Release 再删该 tag） |
  | ② | **自动创建并推送 tag**，指向触发时的 `main` |
  | ③ | 打包 Windows（`Setup` / `Portable`）+ Linux（`.deb`），版本号取 tag 里的 `1.0.1` |
  | ④ | **建 Release**，附上安装包，发布说明取 `CHANGELOG.md` **最新一节** |

- **产物版本号跟随 tag**：打包前把 `desktop/package.json` 的 `version` 改成 tag 里的版本
  （只改 CI 工作区、不提交），所以 tag 与 `ClassSoftwareHub-Desktop-1.0.1-Setup.exe` 永远对得上。
- **发布说明 = `CHANGELOG.md` 最上面那一节**（`## …` 到下一个 `## …` 之间），开头另加一行
  「随包附带的离线副本对应网站版本」。想改说明，就先改 `CHANGELOG.md` 再跑工作流。
- 勾 `prerelease` = 预发布；不勾 = 正式版。
- 想只更新「内置离线副本」（网站改版后希望断网也有新内容）→ 同样跑一次，换个新 tag 即可。

## 卡顿怎么办

界面「发黏」几乎只有一个原因：**这台机器上跑的 Chromium 没拿到显卡**，退化成了软件渲染。
（实测参考：软件渲染下，一个只有一行标题的空白页也只能跑到 37 fps。）

先点菜单 **「帮助 → 诊断信息…」**，重点看两行：**硬件加速** 和 **实测帧率**。

| 看到什么 | 说明 | 怎么办 |
| --- | --- | --- |
| 硬件加速 = 已启用、GPU 光栅化 = 启用、帧率 55~60 | 渲染没问题 | 卡的观感多半来自首屏加载（站点首包较大）或网络，稍等或换个网络再对比 |
| 硬件加速 = 已关闭，或某几项写着「软件模拟」，帧率明显偏低 | 显卡没被采用 | 见下面三条 |

显卡没被采用时，按顺序排查：

1. **更新显卡驱动** —— 最常见的原因。
2. **是不是在远程桌面 / 虚拟机里跑** —— 这类环境通常不提供 GPU，界面必然发黏。
3. **远程控制软件（向日葵、ToDesk 等）或部分安全软件**会干扰 Chromium 的 GPU 初始化；退出后重启程序再对比一次。

> 软件渲染下浏览器也一样吃力：同一个网站在浏览器里若同样发黏，那就不是桌面版的问题，
> 把诊断信息里那几行发出来即可判断。

## 已知取舍

- **安装包体积约 100 MB**：用的 Electron（自带浏览器内核）。好处是行为可预期、Windows/Linux 一套代码；
  代价就是大。若以后想压到 10 MB 以内，需要换 Tauri 之类的方案，但那样 Linux 端要依赖系统 WebKitGTK。
- **状态提示走系统原生**：好处是观感就是 Windows 程序、不干扰网站布局；代价是不像横幅那么显眼。
  因此断网时会额外弹一次系统对话框，保证用户一定知道「现在看的不是实时内容」。
- **去掉系统标题栏的代价**：窗口标题平时看不见了（只剩任务栏悬浮提示和 Alt+Tab），
  所以「副本过期了」这件事主要靠**任务栏角标**和**断网时的系统对话框**传达；
  而窗口按钮那块底色是从网页读出来的，站点主题/节日皮肤一变就要跟着刷新（靠 `OVERLAY_PROBE` 探针，已做）。
  另外覆盖层高度必须和站点标题栏保持一致（都是 48），改高度前先看 `WinTitleBar.vue`。
- **没有代码签名**：Windows 首次运行会有「未知发布者」提示，属预期内；要消除得买代码签名证书。
- **系统要求**：Windows 10 及以上、主流 64 位 Linux 发行版。
- 站点里的外链（GitHub、官网、网盘）一律**交给系统默认浏览器**打开，下载包也走浏览器 —— 这样下载进度、
  断点续传、杀毒软件提示都跟平时一致；只有本站自己托管的文件才在程序内下载。
