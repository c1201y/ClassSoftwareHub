/**
 * 系统镜像网站.ts —— 「系统镜像下载」工具的文字 + 站点清单
 *
 * ⚠️ 本站不存储、不中转任何镜像文件：这里只是官方 / 可信第三方镜像站的
 *    **快捷跳转入口**，文件由对方网站提供。所以这里只填「网站地址」，
 *    不要填直链，也不要在这里放镜像文件。
 *
 * ┌─ 怎么加 / 删一个站点 ────────────────────────────────────────┐
 * │ 在 sites: [ ... ] 里照抄一条，注意：                           │
 * │   name  —— 显示名（中文、英文都行）                            │
 * │   desc  —— 一句话说明（它是谁 + 下什么）                        │
 * │   url   —— 必须带 https://，整行点下去就跳这里                  │
 * │   color —— 首字方块的染色，可省略（省了用主题蓝）               │
 * │   icon  —— 图标图片地址，可省略（省了自动显示「首字方块」）      │
 * │ 删站点就整条删掉；**最后一条末尾不要有逗号**，别的都要有，       │
 * │ 少一个逗号或多一个逗号，网站会直接构建失败（写坏前先备份！）。    │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 备注：这是真 TS 模块，会被一起打包进网页（构建时会编译），
 *       所以只写数据和文字，别在这里写别的逻辑。
 */

export interface MirrorSite {
  /** 显示名 */
  name: string;
  /** 一句话说明 */
  desc: string;
  /** 跳转地址（必须带 https://） */
  url: string;
  /** 首字方块的染色，可省略 */
  color?: string;
  /** 图标图片地址，可省略 */
  icon?: string;
}

export interface MirrorText {
  /** 页面标题（同时是工具卡片标题） */
  title: string;
  /** 页面副标题 */
  subtitle: string;
  /** 顶部免责声明（WinInfoBar 正文） */
  disclaimer: string;
  /** 底部小字 */
  note: string;
  /** 跳转站点清单 */
  sites: MirrorSite[];
}

const 系统镜像网站: MirrorText = {
  title: '系统镜像下载',
  subtitle: 'Windows 等系统镜像的官方 / 可信第三方下载入口，点一行就在新标签页打开。',
  disclaimer:
    '本站不存储、不中转任何镜像文件，也不代为下载 —— 这里只是第三方网站（微软官方 / 可信镜像站）的跳转入口，文件由对方提供，请以对方页面的说明和校验值为准。',
  note: '镜像体积大、来源多，装之前记得核对官方公布的哈希值；排序不分先后，想补充站点跟维护的同学说一声。',

  sites: [
    {
      name: 'Windows 11 官方下载',
      desc: '微软官方：下载 Win11 安装介质 / 制作启动 U 盘',
      url: 'https://www.microsoft.com/zh-cn/software-download/windows11',
      color: '#0078D4'
    },
    {
      name: 'Windows 10 官方下载',
      desc: '微软官方：下载 Win10 ISO / 媒体创建工具',
      url: 'https://www.microsoft.com/zh-cn/software-download/windows10',
      color: '#0078D4'
    },
    {
      name: 'MSDN, 我告诉你（NEXT）',
      desc: '原版系统镜像的下载信息 / 校验值查询站',
      url: 'https://next.itellyou.cn/',
      color: '#E8452C'
    },
    {
      name: 'Vizyn',
      desc: '第三方系统镜像下载站',
      url: 'https://vizyn.dpdns.org/',
      color: '#7C3AED'
    }
  ]
};

export default 系统镜像网站;
