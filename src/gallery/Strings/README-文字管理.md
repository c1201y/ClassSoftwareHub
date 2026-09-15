# 📝 全站文字管理

> ⭐ **中文站文字已经搬到项目根目录的 `文字设置.ts`**（打开就能改，顶部注释即说明书）。
> 本文件夹现在只放英文站文字：

| 文件 | 作用 |
|---|---|
| 根目录 `文字设置.ts` | **中文站文字**（日常主维护对象） |
| `en-US/Resources.ts` | 英文站文字（与中文一一对应；中文站改了，英文站记得同步） |
| 根目录 `鸣谢文本.ts` | 设置页「关于」下方"鸣谢"卡片的人员列表（独立于 文字设置.ts） |

**建议只改引号里的文字，不要动左边的 key**
（key 是页面对文字的"编号"，例如 `home.title`，改错了页面就找不到这段文字）。

## 文字 → 位置 速查表

| 想改哪句 | 找哪个 key（前缀） |
|---|---|
| 站名 / 副标题 / ⬇下载HTML按钮 | `app.title` `home.title` `home.subtitle` `home.download-html*` |
| 首页筛选条"全部" | `filter.all` |
| 左侧导航"首页 / 设置" | `nav.home` `text.settings` |
| 分类名（系统工具等） | ⚠️ 不在这里！在根目录 `软件数据/categories.json` |
| 详情页标题（应用介绍 / 详细信息 / 下载…） | `detail.*`（version/size/system/website/github/intro/info/download…） |
| 详情页"待补充"占位 | `detail.pending` |
| 设置页：主题 / 材质 / 导航位置 | `text.theme` `text.material` `text.navigation-pane-position` 等 `text.*` |
| 关于区：作者首页 / 回声洞 / 投喂作者 / QQ 群 | `about.author-home*` `about.echo-cave*` `about.reward*` `about.qq-group*` |
| 版权行 / 版本号 | `text.about-copyright` `app.author` `app.version` |
| 欢迎弹窗：标题 / 正文 / 按钮 / 相关文章 | `welcome.*`（`welcome.hello` 标题、`welcome.intro` 正文、`welcome.explore` 按钮、`welcome.article`+`welcome.article-url` 相关文章；仓库/作者/QQ 群/投喂链接复用 `about.*-url`） |
| 标题栏搜索框：占位提示 / 结果"来源"称呼 / 无结果提示 | `search.placeholder` `search.source-name`（应用名称）`search.source-intro`（相关简介）`search.no-results` |

## 软件名、软件简介、下载链接？

⚠️ 那是**数据**，不在这里 —— 去项目根目录的 `软件数据/` 文件夹：
`apps/` 一个软件一个文件（加软件=复制 `_模板.json`），分类在 `categories.json`，
操作前先看 `软件数据/README-维护手册.md`。

## 小知识

- 有些 key 是历史遗留（如 `text.page-transition`"页面过渡"相关、`text.qq-group` 等），
  页面已经不用了，**留着无害**，别删即可。
- 版权行由 `text.about-copyright`（模板）+ `app.author` + `text.all-rights-reserved` 拼成；
  中文版把"版权所有"留空 '' 是原版故意的（版权行只显示"© 2026 Tiny-Nick。"）。
- `about.*-url` 是链接地址，改链接改它们（作者首页/回声洞/投喂作者/代码仓库/QQ 群）。
- 搜索框会同时搜 软件名称 + 一句话简介 + 详细介绍（逻辑在 `src/gallery/searchIndex.ts`，
  日常不用碰）；结果写成「软件名（应用名称）」= 名字命中，「软件名（相关简介）」= 简介/介绍命中。
- 版本号 `app.version` 显示在关于区；原 HTML 里写的 `v2026831` 疑似手误
  （站名副标题写的是 v20260831），确认后改这里 + `en-US` 对应值即可。
