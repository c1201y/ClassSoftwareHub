// ════════════════════════════════════════════════════════════════════
// ★★★★★ 鸣谢文本区（贡献人员）★★★★★
// 本文件放在项目根目录，打开就能改 —— 设置页「关于」卡片下方的
// “鸣谢”卡片内容就来自这里（和 文字设置.ts 分开，方便单独维护）。
//
// 【日常改法】只改下面引号里的文字 / 列表：
//   title       = 卡片标题（默认“鸣谢”）
//   intro       = 标题下的一句话说明
//   groupTitles = 两个分组的标题（默认“开发团队”/“赞助人员”）
//   groupOrder  = 分组显示顺序
//   people      = 贡献人员列表，每行一个：
//                 {
//                   "group": "dev" | "sponsor",   // 必填：dev=开发团队，sponsor=赞助人员
//                   "name": "称呼/昵称",           // 必填，显示在最前面
//                   "note": "贡献说明",            // 可留空字符串 ""，留空就不显示
//                   "url":  "https://……"          // 可选：填了名字就变成可点击的链接
//                 }
//   empty       = people 为空时显示的文字
// 加人 = 在 people 数组里照格式加一行；保存后 npm run dev 自动刷新，
// 发布前跑 npm run build 或 npm run build:single。
// ════════════════════════════════════════════════════════════════════

/** 分组：开发团队 / 赞助人员 */
type CreditGroup = "dev" | "sponsor";

/** 单个贡献者的字段定义：url 选填，留空则名字不做成链接 */
interface CreditPerson {
  group: CreditGroup;
  name: string;
  note?: string;
  url?: string;
}

const credits: {
  title: string;
  intro: string;
  groupTitles: Record<CreditGroup, string>;
  groupOrder: CreditGroup[];
  people: CreditPerson[];
  empty: string;
} = {
  title: "鸣谢",
  intro: "感谢以下老师与同学对本站的贡献：",
  groupTitles: {
    dev: "开发团队",
    sponsor: "赞助人员",
  },
  groupOrder: ["dev", "sponsor"],
  people: [
    // ── 开发团队 ──────────────────────────────────────────────
    { group: "dev", name: "Tiny-Nick", note: "前期网站制作，现在致力于Windows桌面端开发", url: "https://space.bilibili.com/1274920807" },
    { group: "dev", name: "椰汁cyan", note: "提供网站搭建和现网站维护更新，同时负责Win7桌面端开发", url: "https://github.com/c1201y" },
    { group: "dev", name: "HelloCHLdev", note: "现致力于Linux（跨平台）平台桌面端应用的开发", url: "https://github.com/HelloCHLdev" },
    { group: "dev", name: "凭舟吟", note: "提供GitHub加速节点，OSS 存储桶，服务器和 cn 域名等服务" },
    // ── 赞助人员 ──────────────────────────────────────────────
    { group: "sponsor", name: "开心的阿罗娜（热心QQ群友）", note: "赞助桌面端开发与网站服务器搭建", url: "https://ifdian.net/a/TinyNickCSHub?tab=home" },
    { group: "sponsor", name: "Xr080606", note: "赞助桌面端开发与网站服务器搭建" },
  ],
  empty: "（待补充）",
};

export default credits;
