<template>
  <span class="visitor-counter" :class="{ 'vc-offline': visitorState.offline }" aria-label="网站访问量统计">
    <span class="vc-item">
      <span class="vc-label">总访问量</span>
      <span class="vc-value vc-number">{{ fmt(visitorState.pv) }}</span>
    </span>
    <span class="vc-item">
      <span class="vc-label">访客数</span>
      <span class="vc-value vc-number">{{ fmt(visitorState.uv) }}</span>
    </span>
  </span>
</template>

<script setup lang="ts">
// 纯展示组件：数字来自全站共享的 visitorState（由 App.vue 里的 trackVisit 上报并写入）。
// 计数动作在应用根组件完成，因此全站所有页面访问都会计入，而不是只在设置页计入。
import { visitorState } from './visitor';

function fmt(n: number | null): string {
  return n === null ? '—' : n.toLocaleString('en-US');
}
</script>

<style scoped>
.visitor-counter {
  display: inline-flex;
  align-items: center;
  gap: 18px;
  font-size: 13px;
  color: var(--text-primary, #1f1f1f);
  white-space: nowrap;
}
.vc-item {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}
.vc-label {
  opacity: 0.85;
}
.vc-value {
  display: inline;
}
.vc-number {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: var(--text-primary, #1f1f1f);
}
.vc-offline .vc-number {
  opacity: 0.5;
}
</style>
