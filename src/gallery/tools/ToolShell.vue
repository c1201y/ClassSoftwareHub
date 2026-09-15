<template>
  <!-- 所有内置工具的统一外壳：返回按钮 + 标题 + 说明 + 滚动区。
       每个工具页面只要 <ToolShell title="…" subtitle="…"> 自己的内容 </ToolShell> 即可。 -->
  <WinGrid class="tool-shell" RowDefinitions="Auto,*">
    <div class="tool-shell-header">
      <WinButton class="tool-shell-back" Style="SubtleButtonStyle" @Click="goBack">
        <span class="tool-shell-back-content">
          <span class="icon" aria-hidden="true">&#xE72B;</span>
          <span>内置工具</span>
        </span>
      </WinButton>
      <WinTextBlock
        AutomationProperties.HeadingLevel="Level1"
        FontSize="28"
        FontWeight="600"
        LineHeight="36"
        TextWrapping="NoWrap"
        :Text="title" />
      <WinTextBlock
        v-if="subtitle"
        class="tool-shell-subtitle"
        FontSize="14"
        Foreground="var(--TextFillColorSecondaryBrush, var(--text-secondary))"
        TextWrapping="Wrap"
        :Text="subtitle" />
    </div>
    <WinScrollViewer
      class="tool-shell-scroll"
      VerticalScrollBarVisibility="Auto"
      VerticalScrollMode="Auto">
      <div class="gallery-item-page tool-shell-body">
        <div class="gallery-page-content">
          <slot />
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
import WinButton from '../../components/WinButton.vue';
import './tool.css';

defineProps<{ title: string; subtitle?: string }>();

const router = useRouter();
const goBack = () => {
  void router.push({ name: 'tools' });
};
</script>

<style scoped>
.tool-shell {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.tool-shell-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 36px 0;
}

.tool-shell-back {
  align-self: flex-start;
  margin-left: -10px;
}

.tool-shell-back-content {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tool-shell-back-content .icon {
  font-size: 13px;
  line-height: 1;
}

.tool-shell-subtitle {
  max-width: 720px;
}

.tool-shell-scroll {
  grid-row: 2;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.tool-shell-body {
  padding-top: 20px;
  max-width: 1064px;
}

@media (max-width: 640px) {
  .tool-shell-header {
    padding: 12px 16px 0;
  }

  .tool-shell-body {
    padding-top: 16px;
  }
}
</style>
