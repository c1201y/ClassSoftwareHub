<template>
  <!-- 外壳 .page-view 是 overflow:hidden，页面必须自带 WinScrollViewer 才能滚动（同详情页） -->
  <WinScrollViewer
    class="gallery-page-scroll"
    VerticalScrollBarVisibility="Auto"
    VerticalScrollMode="Auto">
    <div class="gallery-page-content">
      <div class="legal-root">
        <header class="legal-header">
          <WinTextBlock class="legal-title" :Text="langDoc.title" />
          <WinTextBlock class="legal-subtitle" :Text="versionLine" />
        </header>

        <!-- 三份文档的切换标签（同首页筛选条的 WinSelectorBar） -->
        <WinSelectorBar
          class="legal-tabs"
          HorizontalAlignment="Left"
          :Items="tabItems"
          :SelectedItem="selectedTab"
          @SelectionChanged="onTabChanged" />

        <article class="legal-body">
          <p v-if="langDoc.intro" class="legal-intro">{{ langDoc.intro }}</p>

          <section
            v-for="section in langDoc.sections"
            :key="section.heading"
            class="legal-section">
            <h2 class="legal-heading">{{ section.heading }}</h2>
            <ul class="legal-items">
              <!-- 用户协议 2.2 的（1）（2）子项也是独立一行，统一按条款行渲染 -->
              <li v-for="(item, i) in section.items" :key="i" class="legal-item">
                {{ item }}
              </li>
            </ul>
          </section>
        </article>
      </div>
    </div>
  </WinScrollViewer>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import WinTextBlock from '../../components/WinTextBlock.vue';
import WinSelectorBar from '../../components/WinSelectorBar.vue';
import WinScrollViewer from '../../components/WinScrollViewer.vue';
import { useI18n } from '../../components/i18n/index';
// 三份法律文档的中英全文在根目录「法律文本.ts」，改内容去那里（同 鸣谢文本.ts 的做法）
import legalDocs from '../../../法律文本';

const route = useRoute();
const { locale } = useI18n();

// 默认展示《用户协议》（三份里的总纲）；支持 #/agreement?doc=privacy 直达某份
// （设置页「关于」区的三个链接就是这么跳过来的）
const docIndexByInitialKey = (() => {
  const wanted = String(route.query.doc ?? '');
  const idx = legalDocs.findIndex((doc) => doc.key === wanted);
  return idx >= 0 ? idx : 0;
})();
const selectedIndex = ref(docIndexByInitialKey);

const currentDoc = computed(() => legalDocs[selectedIndex.value]);
/** 当前语言下的文档内容（中文站显示中文、英文站显示英文） */
const langDoc = computed(() =>
  locale === 'zh-CN' ? currentDoc.value.zh : currentDoc.value.en
);

const versionLine = computed(() =>
  locale === 'zh-CN'
    ? `版本 ${currentDoc.value.version}　·　生效日期 ${currentDoc.value.effective}`
    : `Version ${currentDoc.value.version} · Effective ${currentDoc.value.effective}`
);

/** 标签条：文字随语言切换，Tag 用文档 key 稳定标识 */
const tabItems = computed(() =>
  legalDocs.map((doc) => ({
    Text: locale === 'zh-CN' ? doc.zh.title : doc.en.title,
    Tag: doc.key
  }))
);
const selectedTab = computed(() => tabItems.value[selectedIndex.value]);

/** WinSelectorBar 的 SelectionChanged：sender 带 Items / SelectedItem（同首页筛选条） */
const onTabChanged = (sender: { Items?: { Tag?: string }[]; SelectedItem?: { Tag?: string } } | null) => {
  const selected = sender?.SelectedItem;
  const idx = tabItems.value.findIndex((item) => item.Tag === selected?.Tag);
  selectedIndex.value = idx >= 0 ? idx : 0;
};
</script>

<style scoped>
/* 版式同回声洞页：内容列居中、跟随主题变量 */
.legal-root {
  max-width: 820px;
  margin: 0 auto;
  padding: 24px 24px 48px;
  box-sizing: border-box;
}

.legal-header {
  margin-bottom: 16px;
}

.legal-title {
  font-size: 28px;
  font-weight: 600;
  line-height: 36px;
  color: var(--text-primary, #1f1f1f);
}

.legal-subtitle {
  margin-top: 6px;
  font-size: 13px;
  line-height: 20px;
  color: var(--text-secondary, #5f5f5f);
}

.legal-tabs {
  margin-bottom: 8px;
}

.legal-body {
  border: 1px solid var(--card-stroke, rgba(128, 128, 128, 0.4));
  border-radius: 12px;
  background: var(--card-bg, rgba(255, 255, 255, 0.04));
  padding: 24px 28px 28px;
  box-sizing: border-box;
}

.legal-intro {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-secondary, #5f5f5f);
}

.legal-section {
  margin-top: 18px;
}

.legal-heading {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 600;
  line-height: 24px;
  color: var(--text-primary, #1f1f1f);
}

.legal-items {
  list-style: none;
  margin: 0;
  padding: 0;
}

.legal-item {
  margin: 6px 0;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-primary, #1f1f1f);
  /* 用户协议 2.2 的（1）（2）子项缩进一点，层级更清楚 */
  text-indent: 0;
}

.legal-item + .legal-item {
  margin-top: 4px;
}
</style>
