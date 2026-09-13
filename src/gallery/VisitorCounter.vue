<template>
  <span class="visitor-counter" :class="{ 'vc-offline': offline }" aria-label="网站访问量统计">
    <span class="vc-item">
      <span class="vc-label">总访问量</span>
      <span class="vc-value vc-number">{{ fmt(pv) }}</span>
    </span>
    <span class="vc-item">
      <span class="vc-label">访客数</span>
      <span class="vc-value vc-number">{{ fmt(uv) }}</span>
    </span>
  </span>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

// 自托管访问统计：Cloudflare Worker + KV（见 stats-worker/worker.js）。
// 三个域名共用同一 Worker 地址，后台 KV 自动把各域名的访问累加成一个总数，
// 解决不蒜子(busuanzi)按域名分别统计、各域名数字对不上的问题。
//
// ⚠️ 把下面的 API_BASE 改成你部署好的 Worker 地址
//    （部署后在 stats-worker 的 Dashboard 页底部也能看到该地址）。
const API_BASE = 'https://datastatistics.3763902702.workers.dev';

const pv = ref<number | null>(null);
const uv = ref<number | null>(null);
const offline = ref(false);

function fmt(n: number | null): string {
  return n === null ? '—' : n.toLocaleString('en-US');
}

onMounted(async () => {
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  // 本地预览走只读 /api/stats，避免把开发访问算进线上计数；线上走 /api/hit 正常 +1。
  // credentials: 'include' 用于携带 Worker 域下的去重 Cookie（跨域 UV 去重需要）。
  const path = isLocal ? '/api/stats' : '/api/hit';
  try {
    const res = await fetch(API_BASE + path, { credentials: 'include' });
    if (!res.ok) throw new Error('bad status ' + res.status);
    const data = await res.json();
    pv.value = typeof data.pv === 'number' ? data.pv : null;
    uv.value = typeof data.uv === 'number' ? data.uv : null;
  } catch {
    offline.value = true;
  }
});
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
