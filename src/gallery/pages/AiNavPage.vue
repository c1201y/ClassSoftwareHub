<template>
  <!-- AI 导航：一行一个网站，整行都是链接，点了在新标签页打开。
       文字和站点清单都在根目录「AI导航文本.ts」（方便以后自己加/改），这里只负责显示。
       注意：页面不放任何图片文件，站点图标是内联的 base64（aiSiteIcons.ts），不给服务器加流量。 -->
  <WinGrid
    class="ai-page-root"
    RowDefinitions="Auto,*">
    <div class="ai-header">
      <WinTextBlock
        AutomationProperties.HeadingLevel="Level1"
        FontSize="28"
        FontWeight="600"
        LineHeight="36"
        TextWrapping="NoWrap"
        :Text="aiNav.title" />
      <WinTextBlock
        class="ai-header-subtitle"
        FontSize="14"
        Foreground="var(--TextFillColorSecondaryBrush, var(--text-secondary))"
        TextWrapping="Wrap"
        :Text="aiNav.subtitle" />
    </div>

    <WinScrollViewer
      class="ai-page-scroll"
      VerticalScrollBarVisibility="Auto"
      VerticalScrollMode="Auto">
      <div class="gallery-item-page ai-page-body">
        <div class="gallery-page-content">
          <a
            v-for="site in aiNav.sites"
            :key="site.url"
            class="ai-row"
            :href="site.url"
            target="_blank"
            rel="noopener noreferrer"
            :style="rowStyle(site)">
            <!-- 站点图标：内联的 32x32 PNG（见 aiSiteIcons.ts）；没有图标时退回首字方块 -->
            <span class="ai-row-icon" aria-hidden="true">
              <img
                v-if="iconOf(site.url)"
                class="ai-row-icon-img"
                :src="iconOf(site.url)"
                alt="" />
              <span v-else class="ai-row-icon-fallback">{{ badgeOf(site.name) }}</span>
            </span>
            <span class="ai-row-text">
              <span class="ai-row-name">{{ site.name }}</span>
              <span class="ai-row-desc">{{ site.desc }}</span>
            </span>
            <span class="ai-row-host">{{ hostOf(site.url) }}</span>
            <span class="ai-row-arrow" aria-hidden="true">&#xE8A7;</span>
          </a>

          <p class="ai-page-note">{{ aiNav.note }}</p>
        </div>
      </div>
    </WinScrollViewer>
  </WinGrid>
</template>

<script setup lang="ts">
import WinGrid from '../../components/WinGrid.vue';
import WinScrollViewer from '../../components/WinScrollViewer.vue';
import WinTextBlock from '../../components/WinTextBlock.vue';
import { AI_SITE_ICONS } from '../aiSiteIcons';
// 站点清单 + 页面文字：根目录「AI导航文本.ts」（加/删站点改那个文件就行）
import aiNav from '../../../AI导航文本';
import type { AiNavSite } from '../../../AI导航文本';

/** 显示域名（去掉 https:// 和路径） */
const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

/** 站点图标（内联 base64，见 aiSiteIcons.ts）；没收录图标就返回空串，页面回退成首字方块 */
const iconOf = (url: string) => AI_SITE_ICONS[hostOf(url)] ?? '';

/** 没有图标时的兜底：取名字首字（中文取一个字，英文取首字母） */
const badgeOf = (name: string) => name.trim().slice(0, 1).toUpperCase();

/** 图标底的染色：站点没写 color 就不设这个变量，让 CSS 里的兜底颜色生效 */
const rowStyle = (site: AiNavSite) => (site.color ? { '--badge': site.color } : {});
</script>

<style scoped>
.ai-page-root {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.ai-page-scroll {
  grid-row: 2;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.ai-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 24px 36px 0;
}

.ai-header-subtitle {
  max-width: 720px;
}

.ai-page-body {
  padding-top: 20px;
  max-width: 1064px;
}

/* ── 一行一个网站：整行铺满宽度，点了直接跳 ───────────────────── */
.ai-row {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  column-gap: 14px;
  width: 100%;
  padding: 12px 16px;
  border: 1px solid var(--card-stroke, var(--ctrl-border, rgba(0, 0, 0, 0.12)));
  border-radius: 8px;
  background: var(--card-bg, var(--ctrl-fill-default, rgba(255, 255, 255, 0.5)));
  color: var(--text-primary);
  text-decoration: none;
  transition: background var(--faster-duration, 83ms) linear,
    border-color var(--faster-duration, 83ms) linear;
}

.ai-row + .ai-row {
  margin-top: 8px;
}

.ai-row:hover {
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.04));
  border-color: color-mix(in srgb, var(--badge, var(--accent-base, #0067c0)) 45%, transparent);
}

.ai-row:active {
  background: var(--ctrl-fill-tertiary, rgba(0, 0, 0, 0.06));
}

.ai-row:focus-visible {
  outline: 2px solid var(--accent-base, #0067c0);
  outline-offset: 2px;
}

/* 图标底：柔和的站点色方块，里面放 26px 的 logo */
.ai-row-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--badge, var(--accent-base, #0067c0)) 20%, transparent);
  background: color-mix(in srgb, var(--badge, var(--accent-base, #0067c0)) 8%, transparent);
}

.ai-row-icon-img {
  width: 26px;
  height: 26px;
  display: block;
  object-fit: contain;
  border-radius: 5px;
}

.ai-row-icon-fallback {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
}

.ai-row-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ai-row-name {
  font-size: 15px;
  font-weight: 600;
  line-height: 21px;
}

.ai-row-desc {
  font-size: 13px;
  line-height: 19px;
  color: var(--text-secondary);
}

.ai-row-host {
  font-size: 12px;
  line-height: 18px;
  color: var(--text-tertiary, var(--text-secondary));
  white-space: nowrap;
}

.ai-row-arrow {
  font-family: 'WinUIOnWebIcons';
  font-size: 13px;
  color: var(--text-tertiary, var(--text-secondary));
}

.ai-page-note {
  margin: 18px 0 0;
  font-size: 12.5px;
  line-height: 18px;
  color: var(--text-secondary);
}

@media (max-width: 640px) {
  .ai-header {
    padding: 16px 16px 0;
  }

  .ai-page-body {
    padding-top: 16px;
  }

  .ai-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
    column-gap: 12px;
    padding: 10px 12px;
  }

  .ai-row-host {
    display: none;
  }

  .ai-row-icon {
    width: 36px;
    height: 36px;
  }

  .ai-row-icon-img {
    width: 24px;
    height: 24px;
  }

  .ai-row-icon-fallback {
    font-size: 15px;
  }
}
</style>
