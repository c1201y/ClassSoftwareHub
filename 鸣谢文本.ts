/** 分组：开发团队 / 赞助人员 */
type CreditGroup = "dev" | "sponsor";

/** 单个贡献者的字段定义：url 选填，留空则名字不做成链接 */
interface CreditPerson {
  group: CreditGroup;
  name: string;
  /** 英文界面下的称呼（留空沿用 name） */
  nameEn?: string;
  note?: string;
  /** 英文界面下的贡献说明（留空沿用 note） */
  noteEn?: string;
  url?: string;
}

const credits: {
  title: string;
  titleEn?: string;
  intro: string;
  introEn?: string;
  groupTitles: Record<CreditGroup, string>;
  groupTitlesEn?: Partial<Record<CreditGroup, string>>;
  groupOrder: CreditGroup[];
  people: CreditPerson[];
  empty: string;
  emptyEn?: string;
} = {
  title: "鸣谢",
  titleEn: "Credits",
  intro: "感谢以下老师与同学对本站的贡献：",
  introEn: "Thanks to the teachers and classmates who contribute to this site:",
  groupTitles: {
    dev: "开发团队",
    sponsor: "赞助人员",
  },
  groupTitlesEn: {
    dev: "Development team",
    sponsor: "Sponsors",
  },
  groupOrder: ["dev", "sponsor"],
  people: [
    // ── 开发团队 ──────────────────────────────────────────────
    { group: "dev", name: "Tiny-Nick", note: "前期网站制作，现在致力于Windows桌面端开发", noteEn: "Built the early website; now focused on the Windows desktop app", url: "https://space.bilibili.com/1274920807" },
    { group: "dev", name: "椰汁", nameEn: "cyan", note: "提供网站搭建和现网站维护更新，同时负责Win7桌面端、安卓端开发", noteEn: "Provide website construction and ongoing maintenance and updates, as well as development for Windows 7 desktop and Android platforms", url: "https://github.com/c1201y" },
    { group: "dev", name: "HelloCHLdev", note: "现致力于Linux（跨平台）平台桌面端应用的开发", noteEn: "Now focused on Linux (cross-platform) desktop development", url: "https://github.com/HelloCHLdev" },
    { group: "dev", name: "凭舟吟", nameEn: "Pingzhou Yin", note: "网页维护者，并提供GitHub下载与全站加速节点、OSS存储、服务器和cn域名等服务", noteEn: "Provides the GitHub acceleration node, OSS bucket, servers and the .cn domain", url: "https://github.com/pang-zhengyang" },
    { group: "dev", name: "假装", nameEn: "Jia Zhuang", note: "各版本安全测试与漏洞查找", noteEn: "Security testing and bug hunting for all versions" },
    { group: "dev", name: "离职荷包蛋", note: "辅助ClassSoftwareHub不同领域开发", noteEn: "Assists with development across different areas of ClassSoftwareHub" },
    
    // ── 赞助人员 ──────────────────────────────────────────────
    { group: "sponsor", name: "开心的阿罗娜（热心QQ群友）", nameEn: "Happy Arona (QQ group member)", note: "赞助桌面端开发及网站托管", noteEn: "Sponsors desktop development and site hosting", url: "https://ifdian.net/a/TinyNickCSHub?tab=home" },
    { group: "sponsor", name: "远方有猿", nameEn: "Wusi Yuan", note: "赞助桌面端开发及网站托管", noteEn: "Sponsors desktop development and site hosting", url: "https://ifdian.net/a/TinyNickCSHub?tab=home" },
    { group: "sponsor", name: "Xr080606", note: "赞助桌面端开发及网站托管", noteEn: "Sponsors desktop development and site hosting" },
  ],
  empty: "（待补充）",
  emptyEn: "(To be added)",
};

export default credits;
