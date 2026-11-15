/**
 * AI导航文本.ts —— 「AI 导航」页的文字 + 站点清单（说明书在下面，改这里就够）
 *
 * ┌─ 怎么加一个站点 ─────────────────────────────────────────────┐
 * │ 在 sites: [ ... ] 里照抄一条，四行一个花括号，注意：            │
 * │   name  —— 显示名（中文、英文都行）                            │
 * │   desc  —— 一句话说明（"它是谁 + 什么时候用"）                  │
 * │   url   —— 官方地址，必须带 https://                           │
 * │   color —— 图标底的染色（可省略；省了用主题蓝）                  │
 * │ 删站点就整条删掉；**最后一条末尾不要有逗号**，别的都要有，       │
 * │ 少一个逗号或多一个逗号，网站会直接构建失败（写坏前先备份！）。    │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 图标：内联在 src/gallery/aiSiteIcons.ts，按「域名」对应。
 *       新加的站点如果没配图标，页面会自动显示「首字方块」，不会开天窗。
 *       想给它配图标：把 32x32 的 png 放进 workspace 的 _csh_new/icons32/ 再跑 gen-ai-icons.mjs。
 *
 * 备注：这个文件会被一起打包进网页（是真 TS 模块，构建时会编译），
 *       所以只写数据和文字，别在这里写别的逻辑。
 */

export interface AiNavSite {
  /** 显示名 */
  name: string;
  /** 英文显示名（英文界面用；省略时回退 name） */
  nameEn?: string;
  /** 一句话说明 */
  desc: string;
  /** 英文说明（省略时回退 desc） */
  descEn?: string;
  /** 官方地址（整行点下去就是跳这里） */
  url: string;
  /** 图标底的染色，可省略 */
  color?: string;
}

export interface AiNavText {
  /** AI 导航页标题 */
  title: string;
  /** 英文标题（省略时回退 title） */
  titleEn?: string;
  /** AI 导航页副标题 */
  subtitle: string;
  /** 英文副标题（省略时回退 subtitle） */
  subtitleEn?: string;
  /** AI 导航页底部小字 */
  note: string;
  /** 英文底部小字（省略时回退 note） */
  noteEn?: string;
  /** 首页那张入口卡片上的标题 */
  homeTitle: string;
  /** 英文首页标题（省略时回退 homeTitle） */
  homeTitleEn?: string;
  /** 首页那张入口卡片上的说明 */
  homeDesc: string;
  /** 英文首页说明（省略时回退 homeDesc） */
  homeDescEn?: string;
  /** 收录的站点 */
  sites: AiNavSite[];
}

const AI导航文本: AiNavText = {
  title: 'AI 导航',
  titleEn: 'AI directory',
  subtitle:
    '收录常用的国产 AI 网站，点一行就在新标签页打开 —— 不用背网址，也不用翻收藏夹。都是官方地址，直接连、不中转。',
  subtitleEn:
    'A list of popular Chinese AI sites. Click a row to open it in a new tab — no need to memorize URLs or dig through bookmarks. All are official addresses, connected directly.',
  note: '排序不分先后，打不开 / 想补充的站点，跟维护的同学说一声就行。',
  noteEn: 'Order is arbitrary. If a site will not open, or you want to add one, let the maintainer know.',

  homeTitle: 'AI 导航',
  homeTitleEn: 'AI directory',
  homeDesc: '收录常用国产 AI 站，点一下直接跳',
  homeDescEn: 'Popular Chinese AI sites, one click away',

  sites: [
    // ── 通用对话 ──────────────────────────────────────────────
    {
      name: 'DeepSeek',
      nameEn: 'DeepSeek',
      desc: '推理和写代码很强，免费直接用',
      descEn: 'Strong reasoning and coding, free to use',
      url: 'https://chat.deepseek.com/',
      color: '#4D6BFE'
    },
    {
      name: '豆包',
      nameEn: 'Doubao',
      desc: '字节跳动，全能助手，语音对话很顺',
      descEn: 'ByteDance\'s all-round assistant with smooth voice chat',
      url: 'https://www.doubao.com/',
      color: '#1667FF'
    },
    {
      name: '通义千问',
      nameEn: 'Tongyi Qianwen',
      desc: '阿里出品，长文档和办公处理强',
      descEn: 'Alibaba\'s model, strong on long documents and office work',
      url: 'https://www.tongyi.com/',
      color: '#615CED'
    },
    {
      name: '文心一言',
      nameEn: 'ERNIE Bot',
      desc: '百度出品，中文理解和写作',
      descEn: 'Baidu\'s model for Chinese comprehension and writing',
      url: 'https://yiyan.baidu.com/',
      color: '#2932E1'
    },
    {
      name: 'Kimi',
      nameEn: 'Kimi',
      desc: '月之暗面，长文本、网页总结特别好用',
      descEn: 'Moonshot AI; excellent at long text and web page summaries',
      url: 'https://www.kimi.com/',
      color: '#1F1F1F'
    },
    {
      name: '智谱清言',
      nameEn: 'Zhipu ChatGLM',
      desc: '智谱 AI，能联网、能读文档',
      descEn: 'Zhipu AI, with web access and document reading',
      url: 'https://chatglm.cn/',
      color: '#0A7E8C'
    },
    {
      name: '腾讯元宝',
      nameEn: 'Tencent Yuanbao',
      desc: '腾讯混元，能查公众号文章',
      descEn: 'Tencent Hunyuan; can search WeChat official account articles',
      url: 'https://yuanbao.tencent.com/',
      color: '#4F46E5'
    },
    {
      name: '讯飞星火',
      nameEn: 'iFlytek Spark',
      desc: '科大讯飞，语音交互见长',
      descEn: 'iFlytek; strong at voice interaction',
      url: 'https://xinghuo.xfyun.cn/',
      color: '#E8452C'
    },
    {
      name: '天工 AI',
      nameEn: 'Tiangong AI',
      desc: '昆仑万维，搜索 + 对话',
      descEn: 'Kunlun Wanwei; search plus chat',
      url: 'https://www.tiangong.cn/',
      color: '#2BAEEF'
    },
    {
      name: '海螺 AI',
      nameEn: 'Hailuo AI',
      desc: 'MiniMax，语音、视频生成',
      descEn: 'MiniMax; voice and video generation',
      url: 'https://hailuoai.com/',
      color: '#F2503C'
    },
    {
      name: '商量 SenseChat',
      nameEn: 'SenseChat',
      desc: '商汤大模型，支持联网与文档',
      descEn: 'SenseTime LLM; supports web access and documents',
      url: 'https://chat.sensetime.com/',
      color: '#C8102E'
    },
    {
      name: '书生·浦语',
      nameEn: 'InternLM',
      desc: '上海人工智能实验室，学术味重',
      descEn: 'Shanghai AI Lab; research-oriented',
      url: 'https://chat.intern-ai.org.cn/',
      color: '#2E7D6F'
    },

    // ── AI 搜索 / 学习 ────────────────────────────────────────
    {
      name: '知乎直答',
      nameEn: 'Zhihu Direct Answer',
      desc: '知乎出品，答案带真实来源',
      descEn: 'From Zhihu; answers come with real sources',
      url: 'https://zhida.zhihu.com/',
      color: '#0084FF'
    },
    {
      name: '秘塔 AI 搜索',
      nameEn: 'Metaso AI Search',
      desc: '无广告学术搜索，直接给参考文献',
      descEn: 'Ad-free academic search that returns references',
      url: 'https://metaso.cn/',
      color: '#8B5CF6'
    },
    {
      name: '纳米 AI 搜索',
      nameEn: 'Nano AI Search',
      desc: '360 出品，一次聚合多种大模型',
      descEn: 'From 360; queries several large models at once',
      url: 'https://www.n.cn/',
      color: '#00B85C'
    },
    {
      name: '夸克',
      nameEn: 'Quark',
      desc: '阿里夸克，搜索 + AI 助手',
      descEn: 'Alibaba Quark; search plus AI assistant',
      url: 'https://www.quark.cn/',
      color: '#3B5BF0'
    },
    {
      name: '有道小 P',
      nameEn: 'Youdao Xiaop',
      desc: '网易有道，学习答疑（适合学生）',
      descEn: 'NetEase Youdao; study Q&A for students',
      url: 'https://xiaop.youdao.com/',
      color: '#E6322F'
    },

    // ── 图片 / 视频 / 演示 ────────────────────────────────────
    {
      name: '即梦 AI',
      nameEn: 'Jimeng AI',
      desc: '字节，AI 画图、生视频',
      descEn: 'ByteDance; AI images and video',
      url: 'https://jimeng.jianying.com/',
      color: '#A855F7'
    },
    {
      name: '通义万相',
      nameEn: 'Tongyi Wanxiang',
      desc: '阿里，AI 图片 / 视频生成',
      descEn: 'Alibaba; AI image and video generation',
      url: 'https://tongyi.aliyun.com/wan/',
      color: '#F5A524'
    },
    {
      name: '可灵 AI',
      nameEn: 'Kling AI',
      desc: '快手，视频生成（需要登录）',
      descEn: 'Kuaishou video generation (sign-in required)',
      url: 'https://klingai.com/',
      color: '#14B87A'
    },
    {
      name: '讯飞智文',
      nameEn: 'iFlytek Zhiwen',
      desc: '讯飞，一键生成 PPT / 文档',
      descEn: 'iFlytek; one-click PPT and document generation',
      url: 'https://zhiwen.xfyun.cn/',
      color: '#0FA3B1'
    }
  ]
};

export default AI导航文本;
