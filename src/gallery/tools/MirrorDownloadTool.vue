<template>
  <ToolShell :title="mirror.title" :subtitle="mirror.subtitle">
    <!-- 免责声明：本站只做跳转，不存镜像、不代下 -->
    <WinInfoBar
      class="mirror-disclaimer"
      :IsOpen="true"
      :IsClosable="false"
      Severity="Warning"
      :Message="mirror.disclaimer" />

    <!-- 一行一个网站：整行铺满宽度，点了在新标签页打开（和「AI 导航」同款样子） -->
    <a
      v-for="site in mirror.sites"
      :key="site.url"
      class="mirror-row"
      :href="site.url"
      target="_blank"
      rel="noopener noreferrer"
      :style="rowStyle(site)">
      <span class="mirror-row-icon" aria-hidden="true">
        <img
          v-if="site.icon"
          class="mirror-row-icon-img"
          :src="site.icon"
          alt="" />
        <span v-else class="mirror-row-icon-fallback">{{ badgeOf(site.name) }}</span>
      </span>
      <span class="mirror-row-text">
        <span class="mirror-row-name">{{ site.name }}</span>
        <span class="mirror-row-desc">{{ site.desc }}</span>
      </span>
      <span class="mirror-row-host">{{ hostOf(site.url) }}</span>
      <span class="mirror-row-arrow" aria-hidden="true">&#xE8A7;</span>
    </a>

    <p class="mirror-note">{{ mirror.note }}</p>
  </ToolShell>
</template>

<script setup lang="ts">
import ToolShell from './ToolShell.vue';
import WinInfoBar from '../../components/WinInfoBar.vue';
// 站点清单 + 页面文字：同目录「系统镜像网站.ts」（加 / 删站点改那个文件就行）
import mirror from './系统镜像网站';
import type { MirrorSite } from './系统镜像网站';

/** 显示域名（去掉 https:// 和路径） */
const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

/** 没有图标时的兜底：取名字首字 */
const badgeOf = (name: string) => name.trim().slice(0, 1).toUpperCase();

/** 首字方块的染色：站点没写 color 就不设这个变量，让 CSS 里的兜底颜色生效 */
const rowStyle = (site: MirrorSite) => (site.color ? { '--badge': site.color } : {});
</script>

<style scoped>
.mirror-disclaimer {
  display: block;
  margin-bottom: 14px;
}

/* ── 一行一个网站 ─────────────────────────────────────────── */
.mirror-row {
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

.mirror-row + .mirror-row {
  margin-top: 8px;
}

.mirror-row:hover {
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.04));
  border-color: color-mix(in srgb, var(--badge, var(--accent-base, #0067c0)) 45%, transparent);
}

.mirror-row:active {
  background: var(--ctrl-fill-tertiary, rgba(0, 0, 0, 0.06));
}

.mirror-row:focus-visible {
  outline: 2px solid var(--accent-base, #0067c0);
  outline-offset: 2px;
}

.mirror-row-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--badge, var(--accent-base, #0067c0)) 20%, transparent);
  background: color-mix(in srgb, var(--badge, var(--accent-base, #0067c0)) 8%, transparent);
}

.mirror-row-icon-img {
  width: 26px;
  height: 26px;
  display: block;
  object-fit: contain;
  border-radius: 5px;
}

.mirror-row-icon-fallback {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
  line-height: 1;
}

.mirror-row-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mirror-row-name {
  font-size: 15px;
  font-weight: 600;
  line-height: 21px;
}

.mirror-row-desc {
  font-size: 13px;
  line-height: 19px;
  color: var(--text-secondary);
}

.mirror-row-host {
  font-size: 12px;
  line-height: 18px;
  color: var(--text-tertiary, var(--text-secondary));
  white-space: nowrap;
}

.mirror-row-arrow {
  font-family: 'WinUIOnWebIcons';
  font-size: 13px;
  color: var(--text-tertiary, var(--text-secondary));
}

.mirror-note {
  margin: 18px 0 0;
  font-size: 12.5px;
  line-height: 18px;
  color: var(--text-secondary);
}

@media (max-width: 640px) {
  .mirror-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
    column-gap: 12px;
    padding: 10px 12px;
  }

  .mirror-row-host {
    display: none;
  }

  .mirror-row-icon {
    width: 36px;
    height: 36px;
  }

  .mirror-row-icon-img {
    width: 24px;
    height: 24px;
  }

  .mirror-row-icon-fallback {
    font-size: 15px;
  }
}
</style>
