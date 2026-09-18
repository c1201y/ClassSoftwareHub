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
      <!-- 页内搜索已并入全站搜索（Ctrl + K）：这里只提示入口 + 显示工具总数 -->
      <div class="tools-meta-row">
        <span class="tools-meta-hint">{{ t('search.tools-hint') }}</span>
        <span class="tools-meta-count">{{ t('search.tools-count', { count: totalCount }) }}</span>
      </div>
    </div>
    <WinScrollViewer
      class="tools-page-scroll"
      VerticalScrollBarVisibility="Auto"
      VerticalScrollMode="Auto">
      <div class="gallery-item-page tools-page-body">
        <div class="gallery-page-content">
          <section v-for="group in allGroups" :key="group.name" class="tools-group">
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
        </div>
      </div>
    </WinScrollViewer>
  </WinGrid>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import WinGrid from '../../components/WinGrid.vue';
import WinScrollViewer from '../../components/WinScrollViewer.vue';
import WinTextBlock from '../../components/WinTextBlock.vue';
import { useI18n } from '../../components/i18n/index';
import { toolGroups, TOOLS, type ToolDef } from './index';

const { t } = useI18n();
const router = useRouter();
const openTool = (tool: ToolDef) => {
  void router.push({ name: `tool-${tool.id}` });
};

// 工具卡片按分组显示（搜索统一走全站搜索面板，见 GlobalSearch.vue）
const allGroups = toolGroups();
const totalCount = TOOLS.length;
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

/* ── 搜索提示 + 工具总数 ──────────────────────────────────── */
.tools-meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
}

.tools-meta-hint {
  min-width: 0;
  font-size: 13px;
  line-height: 18px;
  color: var(--text-secondary);
}

.tools-meta-count {
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

@media (max-width: 640px) {
  .tools-header {
    padding: 16px 16px 0;
  }

  .tools-meta-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .tools-page-body {
    padding-top: 16px;
  }

  .tools-grid {
    grid-template-columns: 1fr;
  }
}
</style>
