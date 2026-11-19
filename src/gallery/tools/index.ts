import type { Component } from 'vue';

export interface ToolDef {
  /** 路由段：/tools/<id> */
  id: string;
  /** 卡片标题 & 页面标题的文案 key（tool.<id>.name） */
  nameKey: string;
  /** 卡片说明的文案 key（tool.<id>.desc） */
  descKey: string;
  /** 图标（SEGOEICONS 字符） */
  icon: string;
  /** 分组名的文案 key（tool.group.*） */
  groupKey: string;
  /** 懒加载的工具页面组件 */
  load: () => Promise<{ default: Component }>;
}

export const TOOLS: ToolDef[] = [
  {
    id: 'announce',
    nameKey: 'tool.announce.name',
    descKey: 'tool.announce.desc',
    icon: '\uE720',
    groupKey: 'tool.group.classroom',
    load: () => import('../pages/AnnouncePage.vue')
  },
  {
    id: 'image-color',
    nameKey: 'tool.image-color.name',
    descKey: 'tool.image-color.desc',
    icon: '\uE790',
    groupKey: 'tool.group.image-color',
    load: () => import('./ImageColorTool.vue')
  },
  {
    id: 'color-convert',
    nameKey: 'tool.color-convert.name',
    descKey: 'tool.color-convert.desc',
    icon: '\uEC4A',
    groupKey: 'tool.group.image-color',
    load: () => import('./ColorConvertTool.vue')
  },
  {
    id: 'pick-number',
    nameKey: 'tool.pick-number.name',
    descKey: 'tool.pick-number.desc',
    icon: '\uE716',
    groupKey: 'tool.group.classroom',
    load: () => import('./PickNumberTool.vue')
  },
  {
    id: 'timer',
    nameKey: 'tool.timer.name',
    descKey: 'tool.timer.desc',
    icon: '\uE916',
    groupKey: 'tool.group.classroom',
    load: () => import('./TimerTool.vue')
  },
  {
    id: 'clock',
    nameKey: 'tool.clock.name',
    descKey: 'tool.clock.desc',
    icon: '\uE740',
    groupKey: 'tool.group.classroom',
    load: () => import('./ClockTool.vue')
  },
  {
    id: 'word-writing',
    nameKey: 'tool.word-writing.name',
    descKey: 'tool.word-writing.desc',
    icon: '\uE929',
    groupKey: 'tool.group.classroom',
    load: () => import('./WordWritingTool.vue')
  },
  {
    id: 'chemistry',
    nameKey: 'tool.chemistry.name',
    descKey: 'tool.chemistry.desc',
    icon: '\uE9D9',
    groupKey: 'tool.group.classroom',
    load: () => import('./ChemistryTool.vue')
  },
  {
    id: 'text',
    nameKey: 'tool.text.name',
    descKey: 'tool.text.desc',
    icon: '\uE8A5',
    groupKey: 'tool.group.text',
    load: () => import('./TextTool.vue')
  },
  {
    id: 'encoding',
    nameKey: 'tool.encoding.name',
    descKey: 'tool.encoding.desc',
    icon: '\uE943',
    groupKey: 'tool.group.text',
    load: () => import('./EncodingTool.vue')
  },
  {
    id: 'markdown',
    nameKey: 'tool.markdown.name',
    descKey: 'tool.markdown.desc',
    icon: '\uE70F',
    groupKey: 'tool.group.text',
    load: () => import('./MarkdownTool.vue')
  },
  {
    id: 'qrcode',
    nameKey: 'tool.qrcode.name',
    descKey: 'tool.qrcode.desc',
    icon: '\uE8B0',
    groupKey: 'tool.group.utility',
    load: () => import('./QrCodeTool.vue')
  },
  {
    id: 'timestamp',
    nameKey: 'tool.timestamp.name',
    descKey: 'tool.timestamp.desc',
    icon: '\uE823',
    groupKey: 'tool.group.utility',
    load: () => import('./TimestampTool.vue')
  },
  {
    id: 'mirror-download',
    nameKey: 'tool.mirror-download.name',
    descKey: 'tool.mirror-download.desc',
    icon: '\uE896',
    groupKey: 'tool.group.utility',
    load: () => import('./MirrorDownloadTool.vue')
  }
];

/** 按 groupKey 分组，保持 TOOLS 中的原有顺序 */
export function toolGroups() {
  const groups: { key: string; items: ToolDef[] }[] = [];
  for (const tool of TOOLS) {
    let group = groups.find((g) => g.key === tool.groupKey);
    if (!group) {
      group = { key: tool.groupKey, items: [] };
      groups.push(group);
    }
    group.items.push(tool);
  }
  return groups;
}
