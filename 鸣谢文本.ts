// ════════════════════════════════════════════════════════════════════
// ★★★★★ 鸣谢文本区（贡献人员）★★★★★
// 本文件放在项目根目录，打开就能改 —— 设置页「关于」卡片下方的
// “鸣谢”卡片内容就来自这里（和 文字设置.ts 分开，方便单独维护）。
//
// 【日常改法】只改下面引号里的文字 / 列表：
//   title   = 卡片标题（默认“鸣谢”）
//   intro   = 标题下的一句话说明
//   people  = 贡献人员列表，每行一个：
//             {
//               "name": "称呼/昵称",          // 必填，显示在最前面
//               "note": "贡献说明",           // 可留空字符串 ""，留空就不显示
//               "url":  "https://……"         // 可选：填了名字就变成可点击的链接，
//                                            // 新标签页打开；不想加链接就写 "" 或整行删掉
//             }
//   empty   = people 为空时显示的文字
// 加人 = 在 people 数组里照格式加一行；保存后 npm run dev 自动刷新，
// 发布前跑 npm run build 或 npm run build:single。
// ════════════════════════════════════════════════════════════════════

/** 单个贡献者的字段定义：url 选填，留空则名字不做成链接 */
interface CreditPerson {
  name: string;
  note?: string;
  url?: string;
}

const credits: {
  title: string;
  intro: string;
  people: CreditPerson[];
  empty: string;
} = {
  title: "鸣谢",
  intro: "感谢以下老师与同学对本站的贡献：",
  people: [
    { name: "Tiny-Nick", note: "前期网站制作", url: "https://space.bilibili.com/1274920807" },
    { name: "椰汁cyan", note: "提供网站搭建", url: "https://github.com/c1201y" },
  ],
  empty: "（待补充）",
};

export default credits;
