<template>
  <!-- 提交新软件页：版式与设置页保持一致（页头 WinTextBlock + 滚动区 + .gallery-item-page 容器），
       控件全部用 WinUIonWeb 组件，文案全部走 文字设置.ts 的 submit.* 键 -->
  <WinGrid class="submit-page-root" RowDefinitions="Auto,*">
    <WinTextBlock
      class="submit-page-header"
      AutomationProperties.HeadingLevel="Level1"
      FontSize="28"
      FontWeight="600"
      LineHeight="36"
      Margin="36,24,36,12"
      TextWrapping="NoWrap"
      :Text="t('nav.submit')" />
    <WinScrollViewer
      class="submit-page-scroll"
      VerticalScrollBarVisibility="Auto"
      VerticalScrollMode="Auto">
      <div class="gallery-item-page submit-page-body">
        <div class="gallery-page-content">
          <WinTextBlock
            class="submit-subtitle"
            FontSize="14"
            Foreground="var(--TextFillColorSecondaryBrush, var(--text-secondary))"
            TextWrapping="Wrap"
            :Text="t('submit.subtitle')" />

          <!-- ── 基本信息 ────────────────────────────────────────── -->
          <section class="submit-section">
            <WinTextBlock
              class="submit-section-title is-in-card"
              FontSize="20"
              FontWeight="600"
              Margin="0,0,0,18"
              :Text="t('submit.section-basic')" />
            <div class="submit-fields">
            <WinTextBox
              :Header="t('submit.id')"
              :PlaceholderText="t('submit.id-placeholder')"
              :Description="t('submit.id-desc')"
              v-model:Text="form.id">
              <template #header>{{ t('submit.id') }}<span class="submit-required-star" :title="t('submit.required')" aria-hidden="true">*</span></template>
            </WinTextBox>
            <WinTextBox
              :Header="t('submit.name')"
              :PlaceholderText="t('submit.name-placeholder')"
              v-model:Text="form.name">
              <template #header>{{ t('submit.name') }}<span class="submit-required-star" :title="t('submit.required')" aria-hidden="true">*</span></template>
            </WinTextBox>
            <div class="submit-field-row">
              <WinTextBox
                :Header="t('submit.icon')"
                :PlaceholderText="t('submit.icon-placeholder')"
                v-model:Text="form.icon" />
              <WinComboBox
                :Header="t('submit.category')"
                RequiredMark
                :PlaceholderText="t('submit.category-placeholder')"
                :ItemsSource="categories"
                DisplayMemberPath="name"
                v-model:SelectedIndex="categoryIndex" />
            </div>
            <WinTextBox
              :Header="t('submit.tagline')"
              :PlaceholderText="t('submit.tagline-placeholder')"
              v-model:Text="form.tagline">
              <template #header>{{ t('submit.tagline') }}<span class="submit-required-star" :title="t('submit.required')" aria-hidden="true">*</span></template>
            </WinTextBox>
            <WinTextBox
              :Header="t('submit.description')"
              :PlaceholderText="t('submit.description-placeholder')"
              AcceptsReturn
              MinHeight="120"
              v-model:Text="form.description">
              <template #header>{{ t('submit.description') }}<span class="submit-required-star" :title="t('submit.required')" aria-hidden="true">*</span></template>
            </WinTextBox>
            </div>
          </section>

          <!-- ── 补充信息 ────────────────────────────────────────── -->
          <section class="submit-section">
            <WinTextBlock
              class="submit-section-title is-in-card"
              FontSize="20"
              FontWeight="600"
              Margin="0,0,0,18"
              :Text="t('submit.section-extra')" />
            <div class="submit-fields">
            <div class="submit-field-row">
              <WinTextBox
                :Header="t('submit.version')"
                :PlaceholderText="t('submit.version-placeholder')"
                v-model:Text="form.version" />
              <WinTextBox
                :Header="t('submit.size')"
                :PlaceholderText="t('submit.size-placeholder')"
                v-model:Text="form.size" />
            </div>
            <WinTextBox
              :Header="t('submit.system')"
              :PlaceholderText="t('submit.system-placeholder')"
              v-model:Text="form.system" />
            <WinTextBox
              :Header="t('submit.website')"
              :PlaceholderText="t('submit.website-placeholder')"
              v-model:Text="form.website" />
            <WinTextBox
              :Header="t('submit.github')"
              :PlaceholderText="t('submit.github-placeholder')"
              v-model:Text="form.github" />
            <WinTextBox
              :Header="t('submit.notice')"
              :PlaceholderText="t('submit.notice-placeholder')"
              v-model:Text="form.notice" />
            <WinTextBox
              :Header="t('submit.store')"
              :PlaceholderText="t('submit.store-placeholder')"
              v-model:Text="form.store" />
            <WinTextBox
              :Header="t('submit.sort')"
              :PlaceholderText="t('submit.sort-placeholder')"
              InputScope="Number"
              v-model:Text="sortText" />
            </div>
          </section>

          <!-- ── 下载项 ──────────────────────────────────────────── -->
          <WinTextBlock
            class="submit-section-title"
            FontSize="20"
            FontWeight="600"
            Margin="0,32,0,0"
            :Text="t('submit.section-downloads')" />
          <div class="submit-download-list">
            <div v-for="(dl, i) in form.downloads" :key="i" class="submit-download-card">
              <div class="submit-download-head">
                <span class="submit-download-index">{{ t('submit.download-index', { index: i + 1 }) }}</span>
                <WinButton
                  Style="SubtleButtonStyle"
                  :Content="t('submit.download-remove')"
                  :IsEnabled="form.downloads.length > 1"
                  @Click="removeDownload(i)" />
              </div>
              <div class="submit-fields">
                <WinTextBox
                  :Header="t('submit.download-platform')"
                  :PlaceholderText="t('submit.download-platform-placeholder')"
                  v-model:Text="dl.platform" />
                <div class="submit-field-row">
                  <WinTextBox
                    :Header="t('submit.download-size')"
                    :PlaceholderText="t('submit.size-placeholder')"
                    v-model:Text="dl.size" />
                  <WinTextBox
                    :Header="t('submit.download-note')"
                    :PlaceholderText="t('submit.download-note-placeholder')"
                    v-model:Text="dl.note" />
                </div>
                <WinTextBox
                  :Header="t('submit.download-url')"
                  :PlaceholderText="t('submit.download-url-placeholder')"
                  v-model:Text="dl.url">
                  <template #header>{{ t('submit.download-url') }}<span class="submit-required-star" :title="t('submit.required')" aria-hidden="true">*</span></template>
                </WinTextBox>
              </div>
            </div>
            <WinButton
              :Content="'+ ' + t('submit.download-add')"
              @Click="addDownload" />
          </div>

          <!-- ── 提交 ────────────────────────────────────────────── -->
          <div class="submit-actions">
            <WinButton
              Style="AccentButtonStyle"
              :Content="loading ? t('submit.submitting') : t('submit.submit')"
              :IsEnabled="!loading"
              @Click="submit" />
          </div>

          <!-- 提交结果（成功 / 失败） -->
          <WinInfoBar
            v-if="message"
            class="submit-result"
            :IsOpen="true"
            :IsClosable="false"
            :Severity="ok ? 'Success' : 'Error'"
            :Title="ok ? t('submit.result-success-title') : t('submit.result-error-title')"
            :Message="message" />
        </div>
      </div>
    </WinScrollViewer>
  </WinGrid>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import WinGrid from '../../components/WinGrid.vue';
import WinScrollViewer from '../../components/WinScrollViewer.vue';
import WinTextBlock from '../../components/WinTextBlock.vue';
import WinTextBox from '../../components/WinTextBox.vue';
import WinComboBox from '../../components/WinComboBox.vue';
import WinButton from '../../components/WinButton.vue';
import WinInfoBar from '../../components/WinInfoBar.vue';
import { useI18n } from '../../components/i18n/index';
import { categories } from '../data';

/** 提交接口地址（Cloudflare Worker） */
const WORKER_URL = 'https://classhub.3763902702.workers.dev';

const { t } = useI18n();

interface DownloadDraft {
  platform: string;
  note: string;
  size: string;
  url: string;
}

const emptyDownload = (): DownloadDraft => ({ platform: '', note: '', size: '', url: '' });

const form = reactive({
  id: '',
  name: '',
  icon: '',
  category: '',
  tagline: '',
  description: '',
  version: '',
  size: '',
  system: '',
  website: '',
  github: '',
  notice: '',
  store: '',
  downloads: [emptyDownload()] as DownloadDraft[]
});

/** 排序值单独用字符串接（WinTextBox 只收字符串），提交时再转数字 */
const sortText = ref('');

const loading = ref(false);
const message = ref('');
const ok = ref(false);

/** 分类下拉：分类列表直接取自 软件数据/categories.json，加分类不用改这里 */
const categoryIndex = ref(-1);
watch(categoryIndex, (index) => {
  form.category = index >= 0 && index < categories.length ? categories[index].key : '';
});

const addDownload = () => {
  form.downloads.push(emptyDownload());
};

const removeDownload = (index: number) => {
  if (form.downloads.length <= 1) return;
  form.downloads.splice(index, 1);
};

async function submit() {
  if (loading.value) return;
  loading.value = true;
  message.value = '';

  const payload: Record<string, unknown> = {
    id: form.id.trim(),
    name: form.name.trim(),
    icon: form.icon.trim(),
    category: form.category,
    tagline: form.tagline.trim(),
    description: form.description.trim(),
    version: form.version.trim(),
    size: form.size.trim(),
    system: form.system.trim(),
    website: form.website.trim(),
    github: form.github.trim(),
    notice: form.notice.trim(),
    store: form.store.trim(),
    sort: sortText.value.trim() === '' ? undefined : Number(sortText.value),
    downloads: form.downloads
      .filter((item) => item.url.trim())
      .map((item) => ({
        platform: item.platform.trim(),
        note: item.note.trim(),
        size: item.size.trim(),
        url: item.url.trim()
      }))
  };

  // 必填校验（原来靠原生 required，但提交按钮不是原生 submit 按钮，校验根本不会触发）
  const missing =
    !payload.id || !payload.name || !payload.category ||
    !payload.tagline || !payload.description ||
    (payload.downloads as unknown[]).length === 0;
  if (missing) {
    ok.value = false;
    message.value = t('submit.error-required');
    loading.value = false;
    return;
  }

  try {
    if (payload.sort === undefined) delete payload.sort;
    const res = await fetch(`${WORKER_URL}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      ok.value = true;
      message.value = data.message || t('submit.result-success');
    } else {
      ok.value = false;
      message.value = data.error || t('submit.result-error');
    }
  } catch (error) {
    ok.value = false;
    message.value = t('submit.error-network', {
      message: error instanceof Error ? error.message : String(error)
    });
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.submit-page-root {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.submit-page-header {
  max-width: 1064px;
}

.submit-page-scroll {
  grid-row: 2;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.submit-page-body {
  padding-top: 0;
  max-width: 1064px;
}

.submit-subtitle {
  margin-bottom: 4px;
}

/* 分区标题（基本信息 / 补充信息 / 下载项）：字号、字重、间距一律走 WinTextBlock
   的 FontSize / FontWeight / Margin 参数——它的内联样式优先级高于外部 CSS，
   写在这里的 font-size / margin 都会被覆盖，所以这里只放不冲突的排版属性 */

/* 分区卡片：把「基本信息 / 补充信息」各自圈成一张卡（与下载项卡片同风格），
   否则一堆输入框连成一片，分不清哪几个属于哪个分区 */
.submit-section {
  margin-top: 24px;
  padding: 18px 20px 22px;
  border: 1px solid var(--card-stroke, var(--ctrl-border, rgba(0, 0, 0, 0.12)));
  border-radius: 8px;
  background: var(--card-bg, var(--ctrl-fill-default, rgba(255, 255, 255, 0.5)));
}

/* 卡片内的标题：与下方字段再拉开一点（间距靠 WinTextBlock 的 Margin 参数） */
.submit-section-title.is-in-card {
  display: block;
}

/* 字段标签后的必填星号：用 WinUI 的 Critical 色，深浅色下都清晰 */
.submit-required-star {
  margin-left: 4px;
  color: var(--SystemFillColorCriticalBrush, #c42b1c);
  font-weight: 600;
}

.submit-fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 6px;
}

.submit-fields :deep(.win-textbox),
.submit-fields :deep(.win-combo-box) {
  width: 100%;
}

.submit-field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.submit-download-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 6px;
}

.submit-download-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--card-stroke, var(--ctrl-border, rgba(0, 0, 0, 0.12)));
  border-radius: 8px;
  background: var(--card-bg, var(--ctrl-fill-default, rgba(255, 255, 255, 0.5)));
}

.submit-download-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 卡片标题“下载项 1”：与分区标题区分开，稍小但仍醒目 */
.submit-download-index {
  font-size: 16px;
  font-weight: 600;
  line-height: 22px;
  color: var(--text-primary);
}

.submit-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 24px;
}

.submit-result {
  margin-top: 16px;
}

@media (max-width: 640px) {
  .submit-field-row {
    grid-template-columns: 1fr;
  }
}
</style>
