import type { Component } from 'vue';

// ════════════════════════════════════════════════════════════════════
// 内置工具注册表 —— 加新工具只改这一处！
//   1) 建一个工具页面（用 <ToolShell> 包起来）
//   2) 在下面 TOOLS 里加一条
// 导航卡片和路由会自动从这里生成。
// ════════════════════════════════════════════════════════════════════

export interface ToolDef {
  /** 路由段：/tools/<id> */
  id: string;
  /** 卡片标题 & 页面标题 */
  name: string;
  /** 卡片说明 */
  desc: string;
  /** 图标（SEGOEICONS 字符） */
  icon: string;
  /** 分组名（用于索引页分栏） */
  group: string;
  /** 懒加载的工具页面组件 */
  load: () => Promise<{ default: Component }>;
}

export const TOOLS: ToolDef[] = [
  {
    id: 'image-color',
    name: '图片取色',
    desc: '上传一张图片，在浏览器本地提取出一组柔和的配色方案（像 Win11 提取壁纸主题色那样），点击色块即可复制色值。',
    icon: '\uE790',
    group: '图片与颜色',
    load: () => import('./ImageColorTool.vue')
  },
  {
    id: 'color-convert',
    name: '颜色转换 / 配色',
    desc: 'HEX、RGB、HSL 三种格式互转，并基于当前颜色一键生成互补色、类似色、三色等和谐配色。',
    icon: '\uEC4A',
    group: '图片与颜色',
    load: () => import('./ColorConvertTool.vue')
  },
  {
    id: 'pick-number',
    name: '随机抽号',
    desc: '输入号码范围（比如学号 1~50）就能抽号，不用一个个敲名字。支持一次抽多个、抽过不重复，还能按号码随机分组。',
    icon: '\uE716',
    group: '课堂',
    load: () => import('./PickNumberTool.vue')
  },
  {
    id: 'timer',
    name: '课堂计时器',
    desc: '倒计时 / 秒表，大字号方便投影，到点响铃。纯本地运行。',
    icon: '\uE916',
    group: '课堂',
    load: () => import('./TimerTool.vue')
  },
  {
    id: 'clock',
    name: '全屏时钟',
    desc: '把屏幕变成一面大钟：网页全屏 / 屏幕全屏两种放大方式，可换背景图片并叠白色、黑色蒙版或亚克力、云母材质。',
    icon: '\uE740',
    group: '课堂',
    load: () => import('./ClockTool.vue')
  },
  {
    id: 'text',
    name: '文本处理',
    desc: '去重复行、去空行、大小写、中英标点互转、字数统计……写通知 / 名单 / 文案时常用。',
    icon: '\uE8A5',
    group: '文本与编码',
    load: () => import('./TextTool.vue')
  },
  {
    id: 'encoding',
    name: '编码 / 哈希工具',
    desc: 'Base64、URL 编解码，以及 MD5 / SHA-1 / SHA-256 / SHA-512 哈希，全部本地计算。',
    icon: '\uE943',
    group: '文本与编码',
    load: () => import('./EncodingTool.vue')
  },
  {
    id: 'markdown',
    name: 'Markdown 预览',
    desc: '左边写 Markdown，右边实时预览，可复制源码或 HTML。写说明文档 / README 很方便。',
    icon: '\uE70F',
    group: '文本与编码',
    load: () => import('./MarkdownTool.vue')
  },
  {
    id: 'qrcode',
    name: '二维码生成',
    desc: '把网址 / 文字生成二维码，可下载 PNG 或直接复制图片，全部本地生成。',
    icon: '\uE8B0',
    group: '实用工具',
    load: () => import('./QrCodeTool.vue')
  },
  {
    id: 'timestamp',
    name: '时间戳转换',
    desc: 'Unix 时间戳与日期时间互转，支持秒 / 毫秒自动识别，附带当前时间戳。',
    icon: '\uE823',
    group: '实用工具',
    load: () => import('./TimestampTool.vue')
  }
];

/** 按 group 归好类，保持 TOOLS 里的先后顺序 */
export function toolGroups() {
  const groups: { name: string; items: ToolDef[] }[] = [];
  for (const tool of TOOLS) {
    let group = groups.find((g) => g.name === tool.group);
    if (!group) {
      group = { name: tool.group, items: [] };
      groups.push(group);
    }
    group.items.push(tool);
  }
  return groups;
}
