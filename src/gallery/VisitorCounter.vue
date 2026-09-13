<template>
  <span class="visitor-counter" :class="{ 'vc-offline': offline }" aria-label="网站访问量统计">
    <span class="vc-item">
      <span class="vc-label">总访问量</span>
      <span id="busuanzi_container_site_pv" class="vc-value">
        <span id="busuanzi_value_site_pv" class="vc-number">—</span>
      </span>
    </span>
    <span class="vc-item">
      <span class="vc-label">访客数</span>
      <span id="busuanzi_container_site_uv" class="vc-value">
        <span id="busuanzi_value_site_uv" class="vc-number">—</span>
      </span>
    </span>
  </span>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';

// 不蒜子（busuanzi / 卜算子）：零后端、免费的第三方访问量统计。
// 站点 PV / UV 由 busuanzi 服务端按域名统计，这里只负责展示。
// 注意：busuanzi 对 localhost / 127.0.0.1 不统计（本地预览数字恒为 —），
//       部署到线上真实域名后会自动填充真实访问量。
const SCRIPT_SRC = 'https://busuanzi.ibruce.info/busuanzi/2.3/busuanzi.pure.mini.js';
const SCRIPT_ID = 'busuanzi-counter-script';

const offline = ref(false);
let injectedScript: HTMLScriptElement | null = null;

onMounted(() => {
  // 等 Vue 把计数占位 span 渲染进 DOM 后再注入脚本，避免 SPA 下脚本先跑找不到节点。
  // 同一次会话内若脚本已存在（例如从别的路由切回来）则不重复注入，避免 PV 重复计数。
  if (document.getElementById(SCRIPT_ID)) return;

  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.async = true;
  script.src = SCRIPT_SRC;
  script.onerror = () => {
    // 脚本加载失败（被墙 / 网络问题）时标记为离线，但不隐藏整块，
    // 保留「总访问量 / 访客数」文字与「—」占位，至少结构完整。
    offline.value = true;
  };
  document.head.appendChild(script);
  injectedScript = script;
});

onBeforeUnmount(() => {
  injectedScript?.remove();
  injectedScript = null;
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
/* 强制数字容器始终可见：busuanzi 默认会先隐藏容器、拿到数据再显示，
   在 localhost 下它不填充会一直隐藏，这里用 !important 顶掉它的隐藏，
   保证本地也能看到「—」占位，上线后 busuanzi 填进的数字同样正常显示。 */
.vc-value {
  display: inline !important;
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
