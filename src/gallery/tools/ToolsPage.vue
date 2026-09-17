<template>
  <!-- 内置工具索引页：卡片由 tools/index.ts 的注册表自动生成。 -->
  <WinGrid class="tools-page-root" RowDefinitions="Auto,*">
    <div class="tools-header">
      <WinTextBlock
        AutomationProperties.HeadingLevel="Level1"
        FontSize="28"
        FontWeight="600"
        LineHeight="36"
        TextWrapping="NoWrap"
        Text="内置工具" />
      <WinTextBlock
        class="tools-header-subtitle"
        FontSize="14"
        Foreground="var(--TextFillColorSecondaryBrush, var(--text-secondary))"
        TextWrapping="Wrap"
        Text="把这些小工具直接做进网站，打开就能用，不用下载、也不上传 —— 省得为一个小功能单独装个软件。" />
      <!-- 搜索：按「工具名 / 说明 / 分组」即时过滤下面的卡片，纯本地过滤、不联网 -->
      <div class="tools-search-row">
        <WinTextBox
          v-model:Text="keyword"
          class="tools-search-box"
          PlaceholderText="搜索工具：计时器、二维码、取色……"
          InputScope="Search"
          FontSize="14" />
        <span class="tools-search-count">
          {{ keyword.trim() ? `找到 ${matchedCount} 个工具` : `共 ${totalCount} 个工具` }}
        </span>
      </div>
    </div>
    <WinScrollViewer
      class="tools-page-scroll"
      VerticalScrollBarVisibility="Auto"
      VerticalScrollMode="Auto">
      <div class="gallery-item-page tools-page-body">
        <div class="gallery-page-content">
          <section v-for="group in visibleGroups" :key="group.name" class="tools-group">
            <span class="tools-group-title">{{ group.name }}</span>
            <div class="tools-grid">
              <button
                v-for="tool in group.items"
                :key="tool.id"
                type="button"
                class="tools-card"
                @click="openTool(tool)">
                <span class="tools-card-icon" aria-hidden="true">{{ tool.icon }}</span>
                <span class="tools-card-text">
                  <span class="tools-card-title">{{ tool.name }}</span>
                  <span class="tools-card-desc">{{ tool.desc }}</span>
                </span>
                <span class="tools-card-arrow" aria-hidden="true">&#xE76C;</span>
              </button>
            </div>
          </section>

          <!-- 搜不到时的空状态：给出路（换词 / 看全部 / 提建议） -->
          <div v-if="!visibleGroups.length" class="tools-empty">
            <span class="tools-empty-icon" aria-hidden="true">&#xE721;</span>
            <p class="tools-empty-title">没有找到这个工具</p>
            <p class="tools-empty-desc">
              换个关键词试试（比如「计时」「去重」「编码」）。想要的工具站里没有？
              可以到「提交软件」页说一声，或者进 QQ 群提。
            </p>
            <button type="button" class="tools-empty-reset" @click="keyword = ''">显示全部工具</button>
          </div>
        </div>
      </div>
    </WinScrollViewer>
  </WinGrid>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import WinGrid from '../../components/WinGrid.vue';
import WinScrollViewer from '../../components/WinScrollViewer.vue';
import WinTextBlock from '../../components/WinTextBlock.vue';
import WinTextBox from '../../components/WinTextBox.vue';
import { toolGroups, TOOLS, type ToolDef } from './index';

const router = useRouter();
const openTool = (tool: ToolDef) => {
  void router.push({ name: `tool-${tool.id}` });
};

const allGroups = toolGroups();
const totalCount = TOOLS.length;

/** 搜索关键词：留空（或只剩空格）就显示全部 */
const keyword = ref('');

/** 命中规则：工具名 / 说明 / 分组名，任一包含关键词即算命中；不区分大小写 */
const visibleGroups = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  if (!q) return allGroups;
  return allGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((tool) => `${tool.name} ${tool.desc} ${tool.group}`.toLowerCase().includes(q))
    }))
    .filter((group) => group.items.length > 0);
});

/** 当前命中的工具数（搜索框右边那行小字用） */
const matchedCount = computed(() => visibleGroups.value.reduce((sum, group) => sum + group.items.length, 0));
</script>

<style scoped>
.tools-page-root {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.tools-page-scroll {
  grid-row: 2;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.tools-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 24px 36px 0;
}

.tools-header-subtitle {
  max-width: 720px;
}

/* ── 搜索框 ────────────────────────────────────────────────── */
.tools-search-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.tools-search-box {
  flex: 0 1 380px;
  max-width: 380px;
}

.tools-search-count {
  flex: 0 0 auto;
  font-size: 12px;
  line-height: 16px;
  color: var(--text-tertiary, var(--text-secondary));
}

.tools-page-body {
  padding-top: 20px;
  max-width: 1064px;
}

.tools-group + .tools-group {
  margin-top: 26px;
}

.tools-group-title {
  display: block;
  margin-bottom: 12px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-secondary);
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}

/* ── 工具卡片 ─────────────────────────────────────────────── */
.tools-card {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 14px;
  width: 100%;
  padding: 14px 16px;
  text-align: left;
  border: 1px solid var(--card-stroke, var(--ctrl-border, rgba(0, 0, 0, 0.12)));
  border-radius: 8px;
  background: var(--card-bg, var(--ctrl-fill-default, rgba(255, 255, 255, 0.5)));
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
  transition: background var(--faster-duration, 83ms) linear,
    border-color var(--faster-duration, 83ms) linear;
}

.tools-card:hover:not(:active) {
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.04));
}

.tools-card:active {
  background: var(--ctrl-fill-tertiary, rgba(0, 0, 0, 0.06));
  color: var(--text-secondary);
}

.tools-card:focus-visible {
  outline: 2px solid var(--accent-base, #0067C0);
  outline-offset: 2px;
}

.tools-card-icon {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--accent-base, #0067C0) 25%, transparent);
  background: color-mix(in srgb, var(--accent-base, #0067C0) 12%, transparent);
  color: var(--accent-base, #0067C0);
  font-family: 'WinUIOnWebIcons';
  font-size: 22px;
  line-height: 1;
}

.tools-card-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.tools-card-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 21px;
}

.tools-card-desc {
  font-size: 13px;
  line-height: 19px;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tools-card-arrow {
  flex: 0 0 auto;
  font-family: 'WinUIOnWebIcons';
  font-size: 13px;
  color: var(--text-tertiary, var(--text-secondary));
}

/* ── 空状态 ───────────────────────────────────────────────── */
.tools-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 44px 16px 32px;
  text-align: center;
}

.tools-empty-icon {
  font-family: 'WinUIOnWebIcons';
  font-size: 30px;
  line-height: 1;
  color: var(--text-tertiary, var(--text-secondary));
}

.tools-empty-title {
  margin: 8px 0 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.tools-empty-desc {
  margin: 0;
  max-width: 440px;
  font-size: 13px;
  line-height: 20px;
  color: var(--text-secondary);
}

.tools-empty-reset {
  margin-top: 10px;
  padding: 6px 16px;
  font: inherit;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--ctrl-fill-default, rgba(255, 255, 255, 0.5));
  border: 1px solid var(--card-stroke, var(--ctrl-border, rgba(0, 0, 0, 0.12)));
  border-radius: 4px;
  cursor: pointer;
  transition: background var(--faster-duration, 83ms) linear;
}

.tools-empty-reset:hover {
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.04));
}

@media (max-width: 640px) {
  .tools-header {
    padding: 16px 16px 0;
  }

  .tools-search-row {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }

  .tools-search-box {
    flex: 1 1 auto;
    max-width: none;
  }

  .tools-page-body {
    padding-top: 16px;
  }

  .tools-grid {
    grid-template-columns: 1fr;
  }
}
</style>
