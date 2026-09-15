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

## 与原单文件版的对应关系

| 原 HTML 区域 | 现在的位置 |
| --- | --- |
| ① 文字设置区（window.DOWNLOAD_STATION_TEXT） | 根目录 `文字设置.ts`（zh，同款结构）＋ `src/gallery/Strings/en-US/Resources.ts`（en） |
| ② 软件数据区（window.DOWNLOAD_STATION_DATA） | 根目录 `软件数据/`（`apps/*.json` 每软件一文件 ＋ `categories.json` ＋ `README-维护手册.md`） |
| ③ 自检/补丁脚本（插“系统限制”行等） | 已删除 —— 详情页原生支持 `system` 字段，不再需要补丁 |
| ④ WinUIonWeb 编译内核 | `src/components`、`src/styles`、`src/utils`、`src/assets`（上游库源码） |
| ⑤ 页面骨架/样式 | `src/gallery/`（页面组件与样式）＋ `App.vue` |

## 备注

- 页面右上角“⬇ 下载HTML”按钮：在**单文件打包产物**上点击可把整站另存为一份离线 HTML；
  开发模式下请勿用它（存下来的是开发页），发布请走 `npm run build:single`。
- **版本号规则**（2026-09-15 起）：对外版本号用 `X.Y.Z` —— X 大版本（底层架构 / UI 大改动）、
  Y 功能更新、Z 小修小补；**代号后缀保留**（如 `- Autumn`）。同一版本另有内部版本号 `AAAABBCCPRDD`
  （AAAA 年 / BB 月 / CC 日期 / DD 文件版次），例 `20260915PR01`。
  对外版本号与内部版本号都写在 `文字设置.ts` 的 `app.version`（当前 `v2.3.0 - September 18 Incident (20260916PR03)`），
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
