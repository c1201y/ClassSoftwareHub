// ════════════════════════════════════════════════════════════════════
// ★★★★★ 全站文字设置区（中文）★★★★★
// 原版 HTML 里这块叫 window.DOWNLOAD_STATION_TEXT —— 全站文字就集中在
// 这一个地方。本文件放在项目根目录，打开就能改。
//
// 【日常改文字 = 只改这个文件】建议只改引号里的文字，不要动左边的 key
// （key 是页面找文字的“编号”，例如 home.title，改错就找不到文字了）。
// 改完保存：npm run dev 下浏览器自动刷新；发布前跑 npm run build
// 或 npm run build:single。
//
// 英文站文字在 src/gallery/Strings/en-US/Resources.ts（和这里一一对应，
// 中文站改了顺手同步英文站；只维护中文站可不管它）。
// 软件数据（软件名/简介/下载链接不在这里）→ 根目录「软件数据」文件夹。
//
// key 速查：app.*=站名/版权/版本号；home.*=首页标题区+下载HTML按钮；
// filter.*=筛选条；detail.*=详情页；text.*=通用按钮/设置页；
// about.*=设置页“关于”区（*-url 是链接地址）。
// welcome.*=欢迎弹窗（进入网站时弹出；仓库/作者链接复用 about.*-url 键；
//           相关文章=welcome.article(+url)，投喂作者=about.reward(+url)）。
// search.*=标题栏搜索框（placeholder、选项里“来源”的称呼、无结果提示）。
// ════════════════════════════════════════════════════════════════════
export default {
      "app.title": "电教委员常用软件下载站",
      "text.back": "返回",
      "text.copy": "复制",
      "text.more": "更多",
      "text.navigation-menu": "导航菜单",
      "text.search": "搜索",
      "text.select": "选择",
      "text.select-all": "全选",
      "text.default-navigation-transition-info": "默认 (DefaultNavigationTransitionInfo)",
      "text.entrance-navigation-transition-info": "进入 (EntranceNavigationTransitionInfo)",
      "text.drill-in-navigation-transition-info": "钻取 (DrillInNavigationTransitionInfo)",
      "text.suppress-navigation-transition-info": "无动画 (SuppressNavigationTransitionInfo)",
      "text.slide-navigation-transition-info-from-right": "滑动 (SlideNavigationTransitionInfo, Effect = FromRight)",
      "text.slide-navigation-transition-info-from-left": "滑动 (SlideNavigationTransitionInfo, Effect = FromLeft)",
      "text.common-navigation-transition-info": "通用 (CommonNavigationTransitionInfo)",
      "text.continuum-navigation-transition-info": "连续 (ContinuumNavigationTransitionInfo)",
      "text.about-copyright": "© {year} {author}。{rights}",
      "theme-toggle": "切换主题",
      "favorite-toggle": "收藏",
      "text.about": "关于",
      "text.acrylic": "Acrylic",
      "text.all-rights-reserved": "",
      "text.animation-style-when-switching-pages": "切换页面时的动画样式",
      "text.appearance": "外观",
      "text.choose-the-app-background-material": "选择应用背景材质",
      "text.choose-your-app-color-mode": "选择应用颜色模式",
      "text.holiday-skin": "节日皮肤",
      "text.holiday-skin-desc": "节日档期内自动换上应景横幅与主题色（中秋 / 国庆）；档期外也可以手动打开。",
      "text.on": "开启",
      "text.off": "关闭",
      "text.dark": "深色",
      "text.discord-group": "Discord 群组",
      "text.left": "左侧",
      "text.light": "浅色",
      "text.material": "材质",
      "text.mica": "Mica",
      "text.navigation-pane-position": "导航窗格位置",
      "text.open-code-repository": "打开代码仓库",
      "about.author-home": "作者首页",
      "about.author-home-url": "https://space.bilibili.com/1274920807",
      "about.echo-cave": "回声洞",
      "about.echo-cave-url": "https://www.bilibili.com/video/BV1GJ411x7h7/",
      "about.reward": "投喂作者",
      "about.reward-url": "https://ifdian.net/a/TinyNickCSHub",
      "about.repository-url": "https://github.com/c1201y/ClassSoftwareHub",
      "text.page-transition": "页面过渡",
      "text.qq-group": "QQ 群组",
      "text.select-the-navigation-bar-position": "选择导航栏位置",
      "text.settings": "设置",
      "text.theme": "主题",
      "text.top": "顶部",
      "text.use-system-setting": "使用系统设置",
      "nav.home": "首页",
      "home.title": "ClassSoftwareHub",
      "home.subtitle": "欢迎使用下载站【v2.0.0 - Autumn】，欢迎各位添砖加瓦，感谢 @Bilibili 椰汁cyan 提供网站的搭建！",
      "home.download-html": "使用 HTML【开发者】",
      "home.download-html-tip": "可以在网络通畅时下载本站，后离线也可访问！",
      "home.download-html-filename": "电教委员常用软件下载站.html",
      "home.download-template": "下载软件添加模板【开发者】",
      "home.download-template-tip": "共创！添加软件使用的模板",
      "home.download-template-filename": "模板.json",
      "home.download-html-only-single": "当前打开的页面不是离线单文件版（开发/预览模式下导出的文件会缺少脚本和样式，无法离线使用）。\n请先运行 npm run build:single 打包，再打开 dist 文件夹里生成的 HTML，使用此功能下载。",
      "welcome.hello": "欢迎！(*￣3￣)╭",
      "welcome.intro": "欢迎使用ClassSoftwareHub下载站【v2.0.0 - Autumn】，收纳多款电教委员常用软件，感谢使用本网站！如果你觉得好的话可以考虑投喂作者哦！",
      "welcome.repository": "仓库地址",
      "welcome.explore": "开始探索下载~",
      "welcome.article": "相关文章",
      "welcome.article-url": "https://github.com/c1201y/ClassSoftwareHub/releases",
      "search.placeholder": "搜索软件，不需要知道软件名！",
      "search.source-name": "应用名称",
      "search.source-intro": "相关简介",
      "search.no-results": "没有找到与“{query}”相关的软件",
      "filter.all": "全部",
      "detail.intro": "应用介绍",
      "detail.info": "详细信息",
      "detail.version": "软件版本",
      "detail.size": "软件体积",
      "detail.system": "系统限制",
      "detail.website": "官方网站",
      "detail.download": "下载",
      "detail.not-found": "未找到该软件。",
      "detail.downloads": "下载",
      "detail.pending": "待补充",
      "detail.github": "GitHub",
      "detail.notice-title": "小提示",
      "detail.store-title": "使用 Microsoft Store 下载",
      "detail.store-desc": "由应用商店托管，安装后自动更新，不用手动跟版本。",
      "detail.store-button": "下载",
      "detail.store-only": "该软件通过 Microsoft Store 分发，点上方按钮打开商店页面即可获取",
      "app.shortTitle": "电教委员常用软件下载站",
      "app.author": "Tiny-Nick",
      "app.version": "v2.0.0 - Autumn (20260911PR01)",
    };
