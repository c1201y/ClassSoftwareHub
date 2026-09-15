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

          <!-- ── 从 GitHub 一键读取（省去手抄安装包直链）────────────── -->
          <section class="submit-section submit-import">
            <WinTextBlock
              class="submit-section-title is-in-card"
              FontSize="20"
              FontWeight="600"
              Margin="0,0,0,10"
              :Text="t('submit.import-title')" />
            <WinTextBlock
              class="submit-import-desc"
              FontSize="14"
              Foreground="var(--TextFillColorSecondaryBrush, var(--text-secondary))"
              TextWrapping="Wrap"
              :Text="t('submit.import-desc')" />

            <div class="submit-import-row">
              <WinTextBox
                :PlaceholderText="t('submit.import-placeholder')"
                v-model:Text="repoInput" />
              <WinButton
                Style="AccentButtonStyle"
                :Content="reading ? t('submit.import-reading') : t('submit.import-button')"
                :IsEnabled="!reading"
                @Click="runImport" />
            </div>

            <WinCheckBox
              class="submit-import-check"
              :Content="t('submit.import-overwrite')"
              v-model:IsChecked="overwrite" />
            <WinTextBlock
              class="submit-import-check-desc"
              FontSize="12"
              Foreground="var(--TextFillColorSecondaryBrush, var(--text-secondary))"
              TextWrapping="Wrap"
              :Text="t('submit.import-overwrite-desc')" />
            <WinCheckBox
              class="submit-import-check"
              :Content="t('submit.import-prerelease')"
              v-model:IsChecked="includePrerelease" />

            <!-- 读取结果 -->
            <WinInfoBar
              v-if="importError"
              class="submit-import-result"
              :IsOpen="true"
              :IsClosable="false"
              Severity="Error"
              :Title="t('submit.import-error-title')"
              :Message="importError" />

            <template v-else-if="importSummary">
              <WinInfoBar
                class="submit-import-result"
                :IsOpen="true"
                :IsClosable="false"
                Severity="Success"
                :Title="t('submit.import-ok-title')"
                :Message="importSummary" />
              <div
                v-if="importFilled.length || importKept.length || importWarnings.length"
                class="submit-import-report">
                <div v-if="importFilled.length" class="submit-import-line">
                  <span class="submit-import-label">{{ t('submit.import-filled') }}</span>
                  <span class="submit-import-value">{{ importFilled.join('、') }}</span>
                </div>
                <div v-if="importKept.length" class="submit-import-line">
                  <span class="submit-import-label">{{ t('submit.import-kept') }}</span>
                  <span class="submit-import-value">{{ importKept.join('、') }}</span>
                </div>
                <div v-if="importWarnings.length" class="submit-import-line is-warn">
                  <span class="submit-import-label">{{ t('submit.import-warnings') }}</span>
                  <ul class="submit-import-notes">
                    <li v-for="(warning, i) in importWarnings" :key="i">{{ warning }}</li>
                  </ul>
                </div>
              </div>
            </template>
          </section>

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
            <WinButton
              v-if="hasDraft"
              Style="SubtleButtonStyle"
              :Content="t('submit.fallback-restore')"
              @Click="restoreDraft" />
          </div>

          <!-- 提交结果（成功 / 失败） -->
          <WinInfoBar
            v-if="message"
            class="submit-result"
            :IsOpen="true"
            :IsClosable="false"
            :Severity="ok ? 'Success' : 'Error'"
            :Title="messageTitle"
            :Message="message" />

          <!-- 连不上提交服务时的兜底：重试 / 下载提交文件 / 复制 JSON / 带去 GitHub -->
          <div v-if="fallback" class="submit-fallback">
            <WinInfoBar
              :IsOpen="true"
              :IsClosable="false"
              Severity="Warning"
              :Title="t('submit.fallback-title')"
              :Message="t('submit.fallback-desc')" />
            <div class="submit-fallback-actions">
              <WinButton
                Style="AccentButtonStyle"
                :Content="loading ? t('submit.submitting') : t('submit.fallback-retry')"
                :IsEnabled="!loading"
                @Click="submit" />
              <WinButton
                :Content="t('submit.fallback-download')"
                @Click="downloadSubmission" />
              <WinButton
                :Content="copied ? t('submit.fallback-copied') : t('submit.fallback-copy')"
                @Click="copySubmission" />
              <WinButton
                :Content="t('submit.fallback-github')"
                @Click="openGithubSubmit" />
            </div>
            <WinTextBlock
              class="submit-fallback-hint"
              :Text="t('submit.fallback-github-hint')"
              TextWrapping="WrapWholeWords" />
          </div>
        </div>
      </div>
    </WinScrollViewer>
  </WinGrid>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import WinGrid from '../../components/WinGrid.vue';
import WinScrollViewer from '../../components/WinScrollViewer.vue';
import WinTextBlock from '../../components/WinTextBlock.vue';
import WinTextBox from '../../components/WinTextBox.vue';
import WinComboBox from '../../components/WinComboBox.vue';
import WinButton from '../../components/WinButton.vue';
import WinInfoBar from '../../components/WinInfoBar.vue';
import WinCheckBox from '../../components/WinCheckBox.vue';
import { useI18n } from '../../components/i18n/index';
import { apps, categories } from '../data';
import { GithubImportError, importFromGithub, repoToId, toTagline } from '../githubImport';
import type { GithubImportResult } from '../githubImport';

/**
 * 提交接口入口，按顺序试，第一个拿到提交接口 JSON 响应的就停手。
 * ① CDN 新域：由香港节点回源到 Cloudflare —— 复用的是"能打开本站"那条已被验证可达的链路，
 *    对境外流量限制较严的地区也能提交；
 * ② CF 直连：老入口，留作兜底。
 * 两个都留着最稳：新域还没生效、或某条路临时抽风时，都能自动换下一条。
 */
const SUBMIT_ENDPOINTS = [
  'https://cshapi.132614.xyz',
  'https://submit.132614.xyz'
];
/** 单个入口的超时时间：连不上时尽快换下一个入口，不让用户干等（两个入口最坏 20 秒） */
const SUBMIT_TIMEOUT_MS = 10000;
/** 记住上次成功的入口，下次优先试它，省掉一次必然失败的等待 */
const ENDPOINT_CACHE_KEY = 'csh-submit-endpoint';
/** 提交失败后本地留存的 key（存 localStorage，刷新或过一段时间重试都不丢填写内容） */
const DRAFT_KEY = 'csh-submit-draft';
/**
 * 兜底通道：提交服务连不上时（多见于对境外流量限制较严的地区），
 * 让用户把提交文件带到 GitHub 上自己提 PR。没有写权限时 GitHub 会引导 fork + PR，
 * 合并进 main 后同样会触发 .github/workflows/create-review-issue.yml 建审核 Issue。
 */
const REPO_NEW_FILE_URL = 'https://github.com/c1201y/ClassSoftwareHub/new/main/submissions';

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
/** 结果提示条标题：成功 / 失败 / 已恢复，三种情况不一样，所以单独存 */
const messageTitle = ref('');
const ok = ref(false);

/** 提交服务连不上的兜底面板 */
const fallback = ref(false);
/** 兜底时留存的那份 payload */
const pending = ref<Record<string, unknown> | null>(null);
/** 本机是否还留着上次没提交成功的内容 */
const hasDraft = ref(false);
const copied = ref(false);

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

// ════════════════════════════════════════════════════════════════════
// 从 GitHub 一键读取
// 取数据的逻辑都在 ../githubImport.ts，这里只做两件事：
//   1. 把读到的内容填进表单（默认只填空字段，勾了「覆盖」才动已填内容）
//   2. 把「填了什么 / 跳过了什么 / 要留意的坑」列给用户看
// ════════════════════════════════════════════════════════════════════
const repoInput = ref('');
const reading = ref(false);
/** 默认只填空白字段；勾上后连已填内容一起覆盖 */
const overwrite = ref(false);
/** 默认取最新正式版；勾上后优先取最新的预发布版本（Beta / Alpha） */
const includePrerelease = ref(false);

const importError = ref('');
const importSummary = ref('');
const importFilled = ref<string[]>([]);
const importKept = ref<string[]>([]);
const importWarnings = ref<string[]>([]);

/** 上一次「一键读取」往各字段里写了什么：用来区分「用户手写的」和「上次自动填的」 */
let lastFilled: Record<string, string> = {};
/** 上一次「一键读取」填进去的下载链接（换行拼接） */
let lastDownloadUrls = '';

const resetImportReport = () => {
  importError.value = '';
  importSummary.value = '';
  importFilled.value = [];
  importKept.value = [];
  importWarnings.value = [];
};

/** 错误类型 → 文案 key（其余错误统一走「网络错误」那句） */
const IMPORT_ERROR_KEY: Record<string, string> = {
  invalid: 'submit.import-error-invalid',
  'not-found': 'submit.import-error-notfound',
  'rate-limit': 'submit.import-error-ratelimit'
};

async function runImport() {
  if (reading.value) return;
  resetImportReport();

  if (!repoInput.value.trim()) {
    importError.value = t('submit.import-error-empty');
    return;
  }

  reading.value = true;
  try {
    applyImport(
      await importFromGithub(repoInput.value, {
        includePrerelease: includePrerelease.value,
        maxDownloads: 12
      })
    );
  } catch (error) {
    if (error instanceof GithubImportError && IMPORT_ERROR_KEY[error.kind]) {
      importError.value = t(IMPORT_ERROR_KEY[error.kind]);
    } else {
      importError.value = t('submit.import-error-network', {
        message: error instanceof Error ? error.message : String(error)
      });
    }
  } finally {
    reading.value = false;
  }
}

/** 把读取结果填进表单，并整理出一份「已填 / 已保留 / 需注意」的报告 */
function applyImport(result: GithubImportResult) {
  const { repo, release, downloads, system, facts, via } = result;
  const filled: string[] = [];
  const kept: string[] = [];
  const warnings: string[] = [];

  /**
   * 统一填充规则：
   *   · 空字段 → 直接填
   *   · 有内容，但内容是上一次「一键读取」填进去的（用户没动过）→ 也可以覆盖，
   *     否则换个仓库再读一次会什么都不更新，很反直觉
   *   · 有内容，且是用户手写的 → 只有勾了「覆盖」才动
   */
  const put = (label: string, current: string, value: string, assign: (text: string) => void) => {
    const next = (value || '').trim();
    if (!next) return;
    const shown = current.trim();
    if (shown === next) {
      lastFilled[label] = next;
      kept.push(label);
      return;
    }
    const editedByUser = shown !== '' && shown !== lastFilled[label];
    if (editedByUser && !overwrite.value) {
      kept.push(label);
      return;
    }
    assign(next);
    lastFilled[label] = next;
    filled.push(label);
  };

  /** 上一次「一键读取」写进下载项的链接，用来判断现在的下载项是不是用户自己敲的 */
  const currentUrls = form.downloads.map((item) => item.url.trim()).filter(Boolean).join('\n');
  const downloadsEditedByUser = currentUrls !== '' && currentUrls !== lastDownloadUrls;

  // ── 软件 ID：由仓库名生成；和站内已有软件撞车就自动加序号 ──────
  const takenIds = new Set(apps.map((app) => app.id));
  let suggestedId = repoToId(repo.repo);
  if (suggestedId && takenIds.has(suggestedId)) {
    let suffix = 2;
    while (takenIds.has(`${suggestedId}-${suffix}`) && suffix < 100) suffix += 1;
    const corrected = `${suggestedId}-${suffix}`;
    warnings.push(t('submit.import-id-taken', { id: suggestedId, newId: corrected }));
    suggestedId = corrected;
  }
  put(t('submit.id'), form.id, suggestedId, (text) => { form.id = text; });
  if (form.id.trim() && takenIds.has(form.id.trim())) {
    warnings.push(t('submit.import-id-duplicate', { id: form.id.trim() }));
  }

  // ── 文本字段 ──────────────────────────────────────────────────
  put(t('submit.name'), form.name, repo.repo, (text) => { form.name = text; });
  put(t('submit.tagline'), form.tagline, toTagline(repo.description), (text) => { form.tagline = text; });
  put(t('submit.description'), form.description, repo.description, (text) => { form.description = text; });
  put(t('submit.version'), form.version, release ? release.tagName : '', (text) => { form.version = text; });
  put(t('submit.system'), form.system, system, (text) => { form.system = text; });
  put(t('submit.website'), form.website, repo.homepage, (text) => { form.website = text; });
  put(t('submit.github'), form.github, repo.htmlUrl, (text) => { form.github = text; });
  // 仓库主页正好是微软商店链接时，顺手把「商店下载」也填上
  if (repo.homepage.includes('apps.microsoft.com')) {
    put(t('submit.store'), form.store, repo.homepage, (text) => { form.store = text; });
  }
  // 用的是预发布版：写一条 notice，详情页会在下载区上方提示
  if (facts.usedPrerelease && release) {
    put(t('submit.notice'), form.notice, t('submit.import-notice-prerelease', { tag: release.tagName }), (text) => { form.notice = text; });
  }

  // ── 图标：GitHub 接口拿不到软件图标，先用仓库所有者的头像顶上 ──
  const iconLabel = t('submit.icon');
  if (repo.ownerAvatar && form.icon.trim() !== repo.ownerAvatar &&
      (!form.icon.trim() || lastFilled[iconLabel] === form.icon.trim() || overwrite.value)) {
    form.icon = repo.ownerAvatar;
    lastFilled[iconLabel] = repo.ownerAvatar;
    filled.push(iconLabel);
    warnings.push(t('submit.import-warn-icon', { owner: repo.owner }));
  } else if (form.icon.trim()) {
    kept.push(iconLabel);
  }

  // ── 下载项 ────────────────────────────────────────────────────
  if (downloads.length > 0) {
    if (downloadsEditedByUser && !overwrite.value) {
      kept.push(t('submit.section-downloads'));
      warnings.push(t('submit.import-warn-downloads-kept'));
    } else {
      form.downloads = downloads.map((item) => ({ ...item }));
      lastDownloadUrls = form.downloads.map((item) => item.url.trim()).join('\n');
      filled.push(`${t('submit.section-downloads')}（${downloads.length}）`);
    }
  } else if (!facts.releaseFailed) {
    // 没有附件（没发过 Release，或 Release 里只有源码）→ 填 Release 页面链接
    const url = release ? release.htmlUrl : `${repo.htmlUrl}/releases/latest`;
    if (downloadsEditedByUser && !overwrite.value) {
      kept.push(t('submit.section-downloads'));
    } else {
      form.downloads = [{
        platform: t('submit.import-latest-platform'),
        note: t('submit.import-latest-note'),
        size: t('submit.import-web'),
        url
      }];
      lastDownloadUrls = url;
      filled.push(t('submit.section-downloads'));
    }
  }

  // ── 需要留意的地方 ────────────────────────────────────────────
  if (facts.releaseFailed) warnings.push(t('submit.import-warn-release-failed'));
  if (facts.noRelease) warnings.push(t('submit.import-warn-no-release'));
  if (facts.noAsset) warnings.push(t('submit.import-warn-no-asset'));
  if (facts.assetSkipped > 0) warnings.push(t('submit.import-warn-skipped', { count: facts.assetSkipped }));
  if (facts.truncated) warnings.push(t('submit.import-warn-truncated', { count: downloads.length }));
  if (facts.usedPrerelease && release) warnings.push(t('submit.import-warn-prerelease', { tag: release.tagName }));
  if (facts.newerPrereleaseTag) warnings.push(t('submit.import-warn-newer-prerelease', { tag: facts.newerPrereleaseTag }));
  if (repo.archived) warnings.push(t('submit.import-warn-archived'));

  // 地址栏统一成规范写法，方便用户核对
  repoInput.value = repo.htmlUrl;

  let summary = t('submit.import-summary', {
    repo: repo.fullName,
    version: release ? release.tagName : '—',
    count: downloads.length,
    via
  });
  if (repo.license) summary += ` ${t('submit.import-info-license', { license: repo.license })}`;

  importSummary.value = summary;
  importFilled.value = filled;
  importKept.value = kept;
  importWarnings.value = warnings;
}

/** 从表单拼出要提交的 payload；必填项不全返回 null */
function buildPayload(): Record<string, unknown> | null {
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
  if (missing) return null;

  if (payload.sort === undefined) delete payload.sort;
  return payload;
}

interface SubmissionReply {
  success?: boolean;
  message?: string;
  error?: string;
}

/**
 * 按顺序返回要试的入口，上次成功过的排最前。
 * 记在 localStorage（和 githubImport.ts 的 csh-gh-api-base 同一套思路），
 * 这样能连通的用户不必每次都先白等一次失败。
 */
function orderedEndpoints(): string[] {
  let remembered = '';
  try {
    remembered = window.localStorage.getItem(ENDPOINT_CACHE_KEY) ?? '';
  } catch {
    remembered = '';
  }
  if (!remembered || !SUBMIT_ENDPOINTS.includes(remembered)) return SUBMIT_ENDPOINTS;
  return [remembered, ...SUBMIT_ENDPOINTS.filter((item) => item !== remembered)];
}

function rememberEndpoint(base: string) {
  try {
    window.localStorage.setItem(ENDPOINT_CACHE_KEY, base);
  } catch {
    // 隐私模式等场景写不进去，忽略
  }
}

/**
 * 向单个入口发一次提交请求（带超时，避免连不上时一直转圈）。
 * 只认提交接口的 JSON 响应：网络失败、超时、或拿到别的东西（比如回源还没生效时
 * 返回的 nginx HTML 错误页）都算这个入口不可用，交给上层换下一个入口。
 */
async function postSubmission(base: string, payload: Record<string, unknown>): Promise<SubmissionReply> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const data = (await res.json()) as SubmissionReply;
    // 提交接口成功时回 success、校验失败时回 error，两者都没有说明不是提交接口的响应
    if (data?.success !== true && typeof data?.error !== 'string') {
      throw new Error(t('submit.error-unexpected'));
    }
    return data;
  } finally {
    window.clearTimeout(timer);
  }
}

function saveDraft(payload: Record<string, unknown>) {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    hasDraft.value = true;
  } catch {
    // 隐私模式等场景写不进去，忽略
  }
}

function readDraft(): Record<string, unknown> | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // 忽略
  }
  hasDraft.value = false;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** 提交文件名：submissions/<id>-<本地时间戳>.json，和后台生成的草稿放在同一目录 */
function submissionFileName(id: string) {
  const now = new Date();
  return `${id}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
    + `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;
}

/**
 * 兜底用的提交文件内容。
 * 补上 _提交时间 / _原始ID冲突 两个下划线字段，是为了和提交接口写出的草稿长得一样，
 * 这样仓库的 create-review-issue.yml 建出来的审核 Issue 信息才完整。
 */
function buildSubmissionFile(): { name: string; text: string } | null {
  const data = pending.value ?? readDraft();
  if (!data) return null;
  const id = String(data.id ?? 'submission');
  const now = new Date();
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} `
    + `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const body = {
    ...data,
    _提交时间: stamp,
    _原始ID冲突: apps.some((item) => item.id === id) || undefined
  };
  return { name: submissionFileName(id), text: JSON.stringify(body, null, 2) };
}

function downloadSubmission() {
  const file = buildSubmissionFile();
  if (!file) return;
  const blob = new Blob([file.text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copySubmission() {
  const file = buildSubmissionFile();
  if (!file) return;
  try {
    await navigator.clipboard.writeText(file.text);
    copied.value = true;
    window.setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    copied.value = false;
  }
}

/** 打开 GitHub 新建文件页：没写权限时 GitHub 会引导 fork + 提 PR */
function openGithubSubmit() {
  const file = buildSubmissionFile();
  const url = file
    ? `${REPO_NEW_FILE_URL}?filename=${encodeURIComponent(file.name)}`
    : REPO_NEW_FILE_URL;
  window.open(url, '_blank', 'noopener');
}

/** 把一份 payload 填回表单（用于恢复上次没提交成功的内容） */
function applyPayload(data: Record<string, unknown>) {
  const text = (key: string) => String(data[key] ?? '');
  form.id = text('id');
  form.name = text('name');
  form.icon = text('icon');
  form.tagline = text('tagline');
  form.description = text('description');
  form.version = text('version');
  form.size = text('size');
  form.system = text('system');
  form.website = text('website');
  form.github = text('github');
  form.notice = text('notice');
  form.store = text('store');
  sortText.value = data.sort === undefined || data.sort === null ? '' : String(data.sort);

  const downloads = Array.isArray(data.downloads) ? (data.downloads as Record<string, unknown>[]) : [];
  form.downloads = downloads.length
    ? downloads.map((item) => ({
        platform: String(item.platform ?? ''),
        note: String(item.note ?? ''),
        size: String(item.size ?? ''),
        url: String(item.url ?? '')
      }))
    : [emptyDownload()];

  // 下拉的 watch 会按选中项覆写 form.category，所以分类要等它跑完再写一次
  const key = text('category');
  categoryIndex.value = categories.findIndex((item) => item.key === key);
  form.category = key;
  nextTick(() => { form.category = key; });
}

/** 恢复上次没提交成功的内容 */
function restoreDraft() {
  const data = readDraft();
  if (!data) return;
  applyPayload(data);
  fallback.value = false;
  pending.value = null;
  ok.value = true;
  messageTitle.value = t('submit.fallback-restore-title');
  message.value = t('submit.fallback-restored');
}

async function submit() {
  if (loading.value) return;

  const payload = buildPayload();
  if (!payload) {
    ok.value = false;
    messageTitle.value = t('submit.result-error-title');
    message.value = t('submit.error-required');
    return;
  }

  loading.value = true;
  message.value = '';
  messageTitle.value = '';
  fallback.value = false;

  let data: SubmissionReply | null = null;
  let failure = '';

  // 按顺序试每个入口：拿到提交接口的 JSON 就停手（成功或业务校验失败都算拿到了），
  // 只有这个入口不可用（连不上 / 超时 / 不是提交接口的响应）才换下一个。
  for (const base of orderedEndpoints()) {
    try {
      data = await postSubmission(base, payload);
      rememberEndpoint(base);
      break;
    } catch (error) {
      failure = error instanceof Error
        ? (error.name === 'AbortError'
            ? t('submit.error-timeout', { seconds: Math.round(SUBMIT_TIMEOUT_MS / 1000) })
            : error.message)
        : String(error);
    }
  }

  try {
    if (!data) throw new Error(failure || 'network');
    if (data.success) {
      ok.value = true;
      messageTitle.value = t('submit.result-success-title');
      message.value = data.message || t('submit.result-success');
      clearDraft();
      pending.value = null;
    } else {
      ok.value = false;
      messageTitle.value = t('submit.result-error-title');
      message.value = data.error || t('submit.result-error');
    }
  } catch (error) {
    // 连不上：提示 + 兜底（内容存本地，可重试，也可带去 GitHub 提交）
    ok.value = false;
    messageTitle.value = t('submit.result-error-title');
    message.value = t('submit.error-network', {
      message: error instanceof Error ? error.message : String(error)
    });
    fallback.value = true;
    pending.value = payload;
    saveDraft(payload);
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
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 24px;
}

.submit-result {
  margin-top: 16px;
}

/* ── 提交服务连不上时的兜底 ─────────────────────────────────────── */
.submit-fallback {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}

.submit-fallback-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.submit-fallback-hint {
  max-width: 760px;
  color: var(--text-secondary);
}

/* ── 从 GitHub 一键读取 ─────────────────────────────────────────── */
.submit-import {
  margin-top: 20px;
}

.submit-import-desc {
  max-width: 760px;
}

.submit-import-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  margin-top: 16px;
}

.submit-import-row :deep(.win-textbox) {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
}

.submit-import-check {
  margin-top: 12px;
}

/* 说明文字跟复选框的方框对齐（方框 20px + 间距 8px = 28px） */
.submit-import-check-desc {
  margin: 2px 0 0 28px;
}

.submit-import-result {
  margin-top: 14px;
}

.submit-import-report {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  padding: 12px 14px;
  border: 1px solid var(--card-stroke, var(--ctrl-border, rgba(0, 0, 0, 0.12)));
  border-radius: 8px;
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.02));
}

.submit-import-line {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 10px;
  font-size: 13px;
  line-height: 20px;
}

.submit-import-label {
  color: var(--text-secondary);
}

.submit-import-value {
  color: var(--text-primary);
  word-break: break-word;
}

.submit-import-notes {
  margin: 0;
  padding-left: 16px;
  color: var(--SystemFillColorCautionBrush, #9d5d00);
}

.submit-import-notes li {
  margin: 0 0 2px;
}

@media (max-width: 640px) {
  .submit-field-row {
    grid-template-columns: 1fr;
  }

  .submit-import-row {
    flex-direction: column;
    align-items: stretch;
  }

  .submit-import-line {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
</style>
