
export interface MirrorSite {
  /** 显示名 */
  name: string;
  /** 英文显示名（省略时回退 name） */
  nameEn?: string;
  /** 一句话说明 */
  desc: string;
  /** 英文说明（省略时回退 desc） */
  descEn?: string;
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
  /** 英文标题（省略时回退 title） */
  titleEn?: string;
  /** 页面副标题 */
  subtitle: string;
  /** 英文副标题（省略时回退 subtitle） */
  subtitleEn?: string;
  /** 顶部免责声明（WinInfoBar 正文） */
  disclaimer: string;
  /** 英文免责声明（省略时回退 disclaimer） */
  disclaimerEn?: string;
  /** 底部小字 */
  note: string;
  /** 英文底部小字（省略时回退 note） */
  noteEn?: string;
  /** 跳转站点清单 */
  sites: MirrorSite[];
}

const 系统镜像网站: MirrorText = {
  title: '系统镜像下载',
  titleEn: 'System image downloads',
  subtitle: 'Windows 等系统镜像的官方 / 可信第三方下载入口，点一行就在新标签页打开。',
  subtitleEn: 'Official and trusted third-party download entries for Windows and other system images. Click a row to open it in a new tab.',
  disclaimer:
    '本站不存储、不中转任何镜像文件，也不代为下载 —— 这里只是第三方网站（微软官方 / 可信镜像站）的跳转入口，文件由对方提供，请以对方页面的说明和校验值为准。',
  disclaimerEn:
    'This site stores, relays, and hosts no image files and does not download on your behalf. These are only links to third-party sites (Microsoft official or trusted mirror sites). The files come from those sites; rely on their descriptions and checksums.',
  note: '镜像体积大、来源多，装之前记得核对官方公布的哈希值；排序不分先后，想补充站点跟维护的同学说一声。',
  noteEn: 'System images are large and come from many sources. Check the published hashes before installing. Order is arbitrary; if you want to add a site, tell the maintainer.',

  sites: [
    {
      name: 'Windows 11 官方下载',
      nameEn: 'Windows 11 official download',
      desc: '微软官方：下载 Win11 安装介质 / 制作启动 U 盘',
      descEn: 'Microsoft official: download Windows 11 installation media or create a bootable USB drive',
      url: 'https://www.microsoft.com/zh-cn/software-download/windows11',
      color: '#0078D4'
    },
    {
      name: 'Windows 10 官方下载',
      nameEn: 'Windows 10 official download',
      desc: '微软官方：下载 Win10 ISO / 媒体创建工具',
      descEn: 'Microsoft official: download the Windows 10 ISO or Media Creation Tool',
      url: 'https://www.microsoft.com/zh-cn/software-download/windows10',
      color: '#0078D4'
    },
    {
      name: 'MSDN, 我告诉你（NEXT）',
      nameEn: 'MSDN, I Tell You (NEXT)',
      desc: '原版系统镜像的下载信息 / 校验值查询站',
      descEn: 'Download information and checksums for original system images',
      url: 'https://next.itellyou.cn/',
      color: '#E8452C'
    },
    {
      name: 'Vizyn',
      nameEn: 'Vizyn',
      desc: '第三方系统镜像下载站',
      descEn: 'A third-party system image download site',
      url: 'https://vizyn.dpdns.org/',
      color: '#7C3AED'
    },
    {
      name: '站长收藏的系统镜像',
      nameEn: "Maintainer's system image collection",
      desc: '站长自己收藏的WinXP，Win7，Win8.1，Win10，Win11，Tiny11，WinPE系统镜像',
      descEn: "The maintainer's own collection of Windows XP, 7, 8.1, 10, 11, Tiny11 and WinPE images",
      url: 'https://pan.baidu.com/s/1sQU6leqf5M2dnS1Cu36e2w?pwd=1234'
    }
  ]
};

export default 系统镜像网站;
