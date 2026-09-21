<div align="center">
<img src="public/favicon.ico" alt="ClassSoftwareHub Logo" width="180" height="180" />

# ClassSoftwareHub

**电教委员常用软件下载站（Vue 源码版）**

[![GitHub Stars](https://img.shields.io/github/stars/c1201y/ClassSoftwareHub?label=Stars)](https://github.com/c1201y/ClassSoftwareHub)
[![GitHub Release](https://img.shields.io/github/v/release/c1201y/ClassSoftwareHub?style=flat-square&color=%233fb950&label=Release)](https://github.com/c1201y/ClassSoftwareHub/releases)
[![Vue 3](https://img.shields.io/badge/Vue-3-42b883?style=flat-square&logo=vue.js)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=flat-square&logo=vite)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

ClassSoftwareHub 是一个面向电教委员的常用软件下载站，基于 **Vue 3 + Vite + TypeScript** 构建，采用 [WinUIonWeb](https://github.com/Furry-Xiyi/WinUIonWeb) 组件库，提供 WinUI 风格的界面。本站由单文件 `indexV20260831.html` 逆向重构而来，将原先压缩的页面内核拆分为可读、可维护的工程。

</div>

## 功能

- **软件下载**：按分类展示常用软件，支持查看详情、系统限制、版本号、体积、校验值，并提供文件直链下载。
- **全站搜索**：按 `Ctrl + K`（或 `Ctrl + F`）唤出搜索面板，一次搜索软件、内置工具、AI 导航站点和页面。
- **AI 导航**：内置常用 AI 网站导航，方便快速访问。
- **欢迎弹窗**：首次访问显示 WinUI 风格欢迎窗口，提供仓库地址、作者首页、相关文章、QQ 群、投喂作者等链接。
- **数据容错**：单个软件 JSON 格式错误不会影响全站，页面顶部会显示红色提示条，标明错误文件与原因。
- **桌面版**：提供 Electron 桌面程序（Windows exe / Linux deb），内容跟随网站自动更新，断网时自动切换到离线副本。
- **自动更新检查**：内置脚本定期核对软件版本、下载直链与体积，可自动写回或提交 Issue 由人工确认。


<!-- 可放置截图，例如：
![首页](docs/screenshots/home.png)
![搜索](docs/screenshots/search.png)
-->

## 开始使用

### 在线访问

本站已部署，可直接访问：

- [ClassSoftwareHub](classsoftwarehub.us.ci)

- [备用站点](classsoftwarehub.xfane.com)

- [备用站点](classsoftwarehub.132614.xyz)

### 本地运行

```bash
npm install          # 首次使用
npm run dev          # 开发预览 http://localhost:5173
npm run build        # 常规打包 → dist/
npm run build:single # 单文件打包 → dist/index.html（约 2MB，可离线双击打开）
npm run type-check   # TypeScript 类型检查
```

完整说明见维护手册

## 获取帮助 & 加入社区

· 维护手册：README-维护手册.md —— 软件数据维护、文字修改、自动更新、部署等。

· 问题反馈：GitHub Issues或QQ群

· 讨论：GitHub Discussions或QQ群

· QQ 群：[487903798](https://qun.qq.com/universal-share/share?ac=1&authKey=vefxPhZAIezynTibFDvI6%2Fk6IdFyykc%2BWJeWDWkhazM7y8LSXhKcbZwaVYM3anw2&busi_data=eyJncm91cENvZGUiOiI0ODc5MDM3OTgiLCJ0b2tlbiI6IlBkZ1FQaWtaQVAybEVEckl3QzBlay85ZzduU3VlblRwTWc5RlVKNWFCUFExSTdvMmJQQjB6V2VacFR1UEdvaHciLCJ1aW4iOiIzOTA0MjE1ODUzIn0%3D&data=pICf64tVKQTKypKZDhfKmNpcj4j6fS-LGeREZiBQnbWrokAMTdULxqLbm2JHCTIPqwgpG2pSPisQKg0QdbEIJvTU_e6wUDNbHUVTnTswsR8&svctype=5&tempid=h5_group_info)

## 开发

### 技术栈

· 框架：Vue 3 + Vite + TypeScript
· UI 组件库：WinUIonWeb（Furry-Xiyi 的开源 WinUI 风格 Vue 组件库）

### 目录结构

```
├── 文字设置.ts              # 站点文字配置（中文）
├── AI导航文本.ts            # AI 导航站点配置
├── 软件数据/                # 软件数据区
│   ├── apps/                # 每个软件一个 JSON 文件
│   ├── categories.json      # 分类配置
│   └── README-维护手册.md   # 软件数据维护手册
├── src/
│   ├── gallery/             # 页面组件与样式
│   │   ├── Strings/en-US/   # 英文站文字
│   │   ├── searchIndex.ts   # 搜索逻辑
│   │   └── GlobalSearch.vue # 搜索面板
│   ├── components/          # WinUIonWeb 组件
│   ├── styles/              # 样式
│   ├── utils/               # 工具
│   └── assets/              # 图标、表情图等
├── desktop/                 # Electron 桌面版
├── scripts/                 # 自动更新检查等脚本
└── ...
```

## 贡献

欢迎提交 Pull Request 或 Issue。在提交前，请阅读 README-维护手册.md 了解数据格式与维护流程。

## 致谢

· WinUIonWeb —— WinUI 风格 Vue 组件库
· 所有贡献者

## 许可证

许可证信息请参见仓库根目录的 LICENSE 文件。
<div align="center">

Copyright © 2026 Tiny-Nick . All rights reserved.

</div>
