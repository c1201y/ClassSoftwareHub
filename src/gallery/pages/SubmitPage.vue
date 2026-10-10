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
              <div class="submit-icon-field">
                <WinTextBox
                  :Header="t('submit.icon')"
                  :PlaceholderText="t('submit.icon-placeholder')"
                  v-model:Text="form.icon" />
                <div class="submit-upload-row">
                  <WinButton
                    :Content="iconUploading ? uploadingText(iconUploadPct) : t('submit.icon-upload')"
                    :IsEnabled="ossReady && !iconUploading"
                    @Click="pickIcon" />
                  <span v-if="uploadError" class="submit-upload-error">{{ uploadError }}</span>
                  <span v-else-if="iconUploadWarn" class="submit-upload-warn">{{ iconUploadWarn }}</span>
                </div>
                <!-- 上传成功不等于提交成功：这个附件要等 /api/submit 才会被认领，超时会被回收 -->
                <div v-if="iconUploadTtl" class="submit-upload-hint">{{ iconUploadTtl }}</div>
                <WinTextBlock
                  class="submit-upload-note"
                  FontSize="12"
                  Foreground="var(--TextFillColorSecondaryBrush, var(--text-secondary))"
                  TextWrapping="Wrap"
                  :Text="t('submit.icon-upload-note')" />
              </div>
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
            <!-- 联系方式：本地加密成 age 密文后只进审核工单，不随软件数据发布（见 buildPayload 里的 _联系方式） -->
            <WinTextBox
              :Header="t('submit.contact')"
              :PlaceholderText="t('submit.contact-placeholder')"
              :Description="t('submit.contact-desc')"
              v-model:Text="form.contact">
              <template #header>{{ t('submit.contact') }}<span class="submit-required-star" :title="t('submit.required')" aria-hidden="true">*</span></template>
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
              v-model:Text="form.system">
              <template #header>{{ t('submit.system') }}<span class="submit-required-star" :title="t('submit.required')" aria-hidden="true">*</span></template>
            </WinTextBox>
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

          <input type="file" ref="iconInput" accept="image/*" @change="onIconPicked" style="display:none" />
          <input type="file" ref="dlFileInput" @change="onDownloadFilePicked" style="display:none" />

          <!-- ── 下载项 ──────────────────────────────────────────── -->
          <WinTextBlock
            class="submit-section-title"
            FontSize="20"
            FontWeight="600"
            Margin="0,32,0,0"
            :Text="t('submit.section-downloads')" />
          <div v-if="ossReady" class="submit-upload-hint">{{ t('submit.upload-limit-note', { limit: humanSize(UPLOAD_MAX_BYTES) }) }}</div>
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
                <!-- 本站上传回填的 `oss://` 键由服务端生成，界面锁定为只读：改动一个字符
                     即指向其他对象的直链，既会 404，也留下伪造引用的途径。 -->
                <WinTextBox
                  :Header="t('submit.download-url')"
                  :PlaceholderText="t('submit.download-url-placeholder')"
                  :IsReadOnly="isManagedUrl(dl.url)"
                  :Description="isManagedUrl(dl.url) ? t('submit.download-url-locked') : ''"
                  v-model:Text="dl.url">
                  <template #header>{{ t('submit.download-url') }}<span class="submit-required-star" :title="t('submit.required')" aria-hidden="true">*</span></template>
                </WinTextBox>
                <!-- 下载方式：决定详情页是「直接下载」还是「跳转网盘/商店」 -->
                <WinComboBox
                  :Header="t('submit.download-kind')"
                  :PlaceholderText="t('submit.download-kind-auto')"
                  :ItemsSource="downloadKindItems"
                  DisplayMemberPath="label"
                  v-model:SelectedIndex="dl.kindIndex" />
                <div class="submit-upload-row" v-if="ossReady">
                  <WinButton
                    :Content="dlUploading[i] ? uploadingText(dlUploadPct[i] ?? -1) : t('submit.download-upload')"
                    :IsEnabled="!dlUploading[i]"
                    @Click="pickDownloadFile(i)" />
                  <span v-if="dlUploadError[i]" class="submit-upload-error">{{ dlUploadError[i] }}</span>
                  <span v-else-if="dlUploadWarn[i]" class="submit-upload-warn">{{ dlUploadWarn[i] }}</span>
                </div>
                <div class="submit-upload-hint" v-else>{{ t('submit.upload-notconfigured') }}</div>
                <div v-if="dlUploadTtl[i]" class="submit-upload-hint">{{ dlUploadTtl[i] }}</div>
                <!-- 校验值（选填）：只收十六进制，页面按位数认算法，不写算法名 -->
                <WinTextBox
                  :Header="t('submit.download-hash')"
                  :PlaceholderText="t('submit.download-hash-placeholder')"
                  :Description="t('submit.download-hash-desc')"
                  v-model:Text="dl.hash" />
              </div>
            </div>
            <WinButton
              :Content="'+ ' + t('submit.download-add')"
              :IsEnabled="form.downloads.length < MAX_DOWNLOADS"
              @Click="addDownload" />
            <div v-if="form.downloads.length >= MAX_DOWNLOADS" class="submit-upload-hint">
              {{ t('submit.download-limit') }}
            </div>
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

          <WinInfoBar
            v-if="message"
            class="submit-result"
            :IsOpen="true"
            :IsClosable="false"
            :Severity="ok ? 'Success' : 'Error'"
            :Title="messageTitle"
            :Message="message" />

          <!-- 提交服务不可用时的兜底操作区：重试 / 下载提交文件 / 复制 JSON / 带去 GitHub -->
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
import { SUBMIT_TIMEOUT_MS, orderedEndpoints, rememberEndpoint } from '../submitEndpoints';
import {
  uploadToOss,
  hasOssUpload,
  UPLOAD_MAX_BYTES,
  UPLOAD_WARN_BYTES,
  OssUploadError
} from '../ossUpload';
import type { UploadProgress } from '../ossUpload';
import { shrinkIcon, ICON_INPUT_MAX_BYTES } from '../iconResize';
/**
 * 压缩后仍超过该体积时提醒。
 * 128 px 的图标通常只有几 KB，达到该阈值说明压缩未生效（如浏览器无法解码 HEIC），
 * 提示用户更换图片优于默认传一张大图。
 */
const ICON_WARN_BYTES = 256 * 1024;
/** 提交失败后本地留存的 key（存 localStorage，刷新或过一段时间重试都不丢填写内容） */
const DRAFT_KEY = 'csh-submit-draft';
/**
 * 兜底通道：提交服务连不上时（多见于对境外流量限制较严的地区），
 * 让用户把提交文件带到 GitHub 上自己提 PR。没有写权限时 GitHub 会引导 fork + PR，
 * 合并进 main 后同样会触发 .github/workflows/create-review-issue.yml 建审核 Issue。
 */
const REPO_NEW_FILE_URL = 'https://github.com/c1201y/ClassSoftwareHub/new/main/submissions';
/**
 * 联系方式的接收方公钥（age1...）：网页端与桌面端硬编码同一把。
 * 私钥仅开发者本地持有，绝不出现在任何客户端 / 网页 / 版本库代码里；
 * 这里只做公钥加密，不做任何解密。
 */
const RECIPIENT_PUBLIC_KEY = 'age1l9axcy0sxu6eeanapg0maughsv380fh8nhd4unf9p8d7x20rjqfsgz4dxa';

const { t } = useI18n();

/** 下载方式索引 → 写入数据的 kind 值；-1 自动 / 0 file / 1 netdisk / 2 store（对应 DOWNLOAD_KINDS） */
const DOWNLOAD_KINDS = ['', 'file', 'netdisk', 'store'] as const;

interface DownloadDraft {
  platform: string;
  note: string;
  size: string;
  url: string;
  /** 校验值：纯十六进制（算法按位数识别，见 HASH_LENGTHS），选填 */
  hash: string;
  /** 下载方式索引：-1 自动 / 0 file / 1 netdisk / 2 store（对应 DOWNLOAD_KINDS） */
  kindIndex: number;
}

const emptyDownload = (): DownloadDraft => ({ platform: '', note: '', size: '', url: '', hash: '', kindIndex: -1 });

const form = reactive({
  id: '',
  name: '',
  icon: '',
  category: '',
  tagline: '',
  description: '',
  /** 提交者联系方式：必填，本地加密后写进草稿 JSON（`_联系方式`）供审核时联系，不发布到站点 */
  contact: '',
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

// ════════════════════════════════════════════════════════════════════
// 上传文件到本站的阿里云 OSS（浏览器直传一条有时效的预签名地址，不经后端中转，前端也不需要任何密钥；详见 src/gallery/ossUpload.ts）
// ════════════════════════════════════════════════════════════════════
const ossReady = computed(() => hasOssUpload());

/** 下载方式下拉项（label 仅用于展示，索引对应 DOWNLOAD_KINDS） */
const downloadKindItems = [
  { label: t('submit.download-kind-auto') },
  { label: t('submit.download-kind-file') },
  { label: t('submit.download-kind-netdisk') },
  { label: t('submit.download-kind-store') }
];

const iconInput = ref<HTMLInputElement | null>(null);
const dlFileInput = ref<HTMLInputElement | null>(null);
const activeDlIndex = ref(-1);
const iconUploading = ref(false);
const dlUploading = ref<boolean[]>([]);
const uploadError = ref('');
const dlUploadError = ref<string[]>([]);
/** 大文件软提示（不阻止上传，只提醒会慢） */
const iconUploadWarn = ref('');
const dlUploadWarn = ref<string[]>([]);
/** 上传进度百分比（0-100；-1 = 尚未拿到进度，退回普通「上传中…」） */
const iconUploadPct = ref(-1);
const dlUploadPct = ref<number[]>([]);
/**
 * 「上传完了，但还没提交」的倒计时提示。
 * 阈值不是写死的：服务端在签发上传地址时会回传当前生效的 orphanMinutes，
 * 运维在线上把这个值调小，界面提示会跟着变，不会前后对不上。
 */
const iconUploadTtl = ref('');
const dlUploadTtl = ref<string[]>([]);

/** 上传进度 → 百分数（0-100）；总量未知时返回 -1，由文案层回退 */
function toPercent(p: UploadProgress): number {
  if (!p.total || p.total <= 0) return -1;
  return Math.min(100, Math.max(0, (p.loaded / p.total) * 100));
}

/** 上传中按钮文案：有进度就带百分数，没有就退回普通文案 */
function uploadingText(percent: number): string {
  return percent >= 0 ? t('submit.uploading-percent', { percent: Math.round(percent) }) : t('submit.uploading');
}

/** 字节数 → 人类可读（只用于文案，取整到 MB/KB 足够） */
function humanSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * 上传前的本地预检：超过硬上限时拒绝。
 * 当前链路为浏览器直连 OSS，无中转限制，上限仅代表本站可接收的最大体积：
 * 超过 2.5 GB 的一律引导改填官网 / GitHub Releases 直链（存储与下行成本均过高）。
 */
function sizeGuard(file: File): string {
  return file.size > UPLOAD_MAX_BYTES
    ? t('submit.upload-too-large', { size: humanSize(file.size), limit: humanSize(UPLOAD_MAX_BYTES) })
    : '';
}

/** 大文件软提示：不阻止，只提醒会比较慢 */
function sizeWarn(file: File): string {
  return file.size > UPLOAD_WARN_BYTES
    ? t('submit.upload-large-warn', { size: humanSize(file.size) })
    : '';
}

/** 单个软件最多几个下载项（与 Worker 的 MAX_DOWNLOADS_PER_APP 同口径） */
const MAX_DOWNLOADS = 5;

/**
 * 是不是「本站上传回填」的对象键。
 * 这类键由服务端生成、且与登记表一一对应，界面锁成只读 —— 手改一个字符就是另一条外部
 * 直链（轻则 404，重则把审核引到一个不受本站控制、也无法回收的对象上）。
 */
function isManagedUrl(url: string): boolean {
  return /^oss:\/\//i.test((url || '').trim());
}

/**
 * 「上传后 N 分钟内必须提交」提示。
 * 阈值由服务端在签发上传地址时下发（可在线调整），拿不到就不显示 —— 不写死一个数字，
 * 免得运维把阈值调小后界面还在说 15 分钟。
 */
function ttlText(minutes?: number): string {
  const n = Number(minutes);
  return Number.isFinite(n) && n > 0 ? t('submit.upload-ttl-warn', { minutes: n }) : '';
}

/** 上传失败 → 本地化文案；OSS 返回英文 / XML 原始报错，统一转换为可读文案后展示 */
function uploadErrorText(error: unknown): string {
  if (error instanceof OssUploadError) {
    if (error.code === 'too-large') {
      return t('submit.upload-server-limit', { limit: humanSize(UPLOAD_MAX_BYTES) });
    }
    if (error.code === 'sign-failed') {
      return t('submit.upload-sign-failed');
    }
    if (error.code === 'network' || error.code === 'aborted' || error.code === 'unreachable') {
      return t('submit.upload-network-error');
    }
    if (error.code === 'http') {
      return t('submit.upload-rejected', { detail: error.message });
    }
  }
  return t('submit.upload-failed', { message: error instanceof Error ? error.message : String(error) });
}

function pickIcon() {
  iconInput.value?.click();
}

function pickDownloadFile(index: number) {
  activeDlIndex.value = index;
  dlFileInput.value?.click();
}

async function onIconPicked(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const picked = input.files?.[0];
  input.value = '';
  if (!picked) return;
  uploadError.value = '';
  iconUploadWarn.value = '';
  // 图标体积不应达数十 MB：解码本身会阻塞页面，且该体量的图片在 44 px 磁贴中毫无意义
  if (picked.size > ICON_INPUT_MAX_BYTES) {
    uploadError.value = t('submit.icon-too-large', {
      size: humanSize(picked.size),
      limit: humanSize(ICON_INPUT_MAX_BYTES)
    });
    return;
  }
  iconUploading.value = true;
  iconUploadPct.value = -1;
  try {
    // 图标在站内仅以 44 / 72 px 显示，先在本地缩至 128 px 再上传：
    // 上传更快、存储更省、访客等待更短（详见 iconResize.ts）
    const file = await shrinkIcon(picked);
    if (file.size > ICON_WARN_BYTES) {
      iconUploadWarn.value = t('submit.upload-large-warn', { size: humanSize(file.size) });
    }
    // 图标使用 icon/ 前缀：小图，读取走公开的 /api/icon，不经过下载闸门
    const { url, orphanMinutes } = await uploadToOss(file, (p) => { iconUploadPct.value = toPercent(p); }, 'icon');
    form.icon = url;
    iconUploadTtl.value = ttlText(orphanMinutes);
  } catch (error) {
    uploadError.value = uploadErrorText(error);
    iconUploadWarn.value = '';
  } finally {
    iconUploading.value = false;
    iconUploadPct.value = -1;
  }
}

async function onDownloadFilePicked(ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  const index = activeDlIndex.value;
  if (!file || index < 0) return;
  dlUploadError.value[index] = '';
  dlUploadWarn.value[index] = '';
  const blocked = sizeGuard(file);
  if (blocked) {
    dlUploadError.value[index] = blocked;
    return;
  }
  dlUploadWarn.value[index] = sizeWarn(file);
  dlUploading.value[index] = true;
  dlUploadPct.value[index] = -1;
  try {
    // 软件包走 upload/ 前缀：私有对象，回填的是 `oss://对象键`，
    // 详情页点下载时由 ossDownload.ts 换一张 15 分钟票据再取流。
    const { url, orphanMinutes } = await uploadToOss(file, (p) => { dlUploadPct.value[index] = toPercent(p); }, 'file');
    form.downloads[index].url = url;
    form.downloads[index].kindIndex = 1; // 本站直链 → 显式按「文件」处理（点击后在当前页直接下载，不跳转）
    dlUploadWarn.value[index] = '';
    dlUploadTtl.value[index] = ttlText(orphanMinutes);
  } catch (error) {
    dlUploadError.value[index] = uploadErrorText(error);
    dlUploadWarn.value[index] = '';
  } finally {
    dlUploading.value[index] = false;
    dlUploadPct.value[index] = -1;
  }
}

const addDownload = () => {
  // 按钮 UI 已禁用超限操作，此处再次校验：上限属于数据约定，不应仅依赖 UI 拦截
  if (form.downloads.length >= MAX_DOWNLOADS) return;
  form.downloads.push(emptyDownload());
};

const removeDownload = (index: number) => {
  if (form.downloads.length <= 1) return;
  form.downloads.splice(index, 1);
  // 并行状态数组必须同步删除，否则后续各项的上传中/进度/错误状态会整体错位
  dlUploading.value.splice(index, 1);
  dlUploadPct.value.splice(index, 1);
  dlUploadError.value.splice(index, 1);
  dlUploadWarn.value.splice(index, 1);
  dlUploadTtl.value.splice(index, 1);
};

// ════════════════════════════════════════════════════════════════════
// 从 GitHub 一键读取
// 取数据的逻辑都在 ../githubImport.ts，这里只做两件事：
//   1. 把读到的内容填进表单（默认只填空字段，勾了「覆盖」才动已填内容）
//   2. 把「填了什么 / 跳过了什么 / 需注意的问题」列给用户看
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

/** 错误类型 → 文案 key（其余错误统一使用「网络错误」文案） */
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
   *   · 有内容，但内容是上一次「一键读取」填进去的（用户未改动）→ 也可以覆盖，
   *     否则更换仓库再次读取时不会更新任何字段，不符合直觉
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

  /** 上一次「一键读取」写进下载项的链接，用于判断当前下载项是否由用户手动填写 */
  const currentUrls = form.downloads.map((item) => item.url.trim()).filter(Boolean).join('\n');
  const downloadsEditedByUser = currentUrls !== '' && currentUrls !== lastDownloadUrls;

  // ── 软件 ID：由仓库名生成；与站内已有软件冲突时自动追加序号 ──────
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
  // 仓库主页为微软商店链接时，同时填写「商店下载」字段
  if (repo.homepage.includes('apps.microsoft.com')) {
    put(t('submit.store'), form.store, repo.homepage, (text) => { form.store = text; });
  }
  // 使用预发布版本时写入 notice，详情页会在下载区上方提示
  if (facts.usedPrerelease && release) {
    put(t('submit.notice'), form.notice, t('submit.import-notice-prerelease', { tag: release.tagName }), (text) => { form.notice = text; });
  }

  // ── 图标：GitHub 接口不提供软件图标，先以仓库所有者头像代替 ──
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
      // 重新「一键读取」时保留表单中已填的校验值：同一链接的校验值原样带入（手动填写的哈希通常仍然有效）
      const hashByUrl = new Map(
        form.downloads.filter((item) => item.hash.trim()).map((item) => [item.url.trim(), item.hash.trim()])
      );
      form.downloads = downloads.map((item) => ({ ...item, hash: hashByUrl.get(item.url.trim()) ?? '', kindIndex: -1 }));
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
        url,
        hash: '',
        kindIndex: -1
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

/**
 * 校验值输入的写法多样：可能带「MD5:」「sha256 =」前缀、0x 前缀、按字节以冒号或空格分隔。
 * 站点只接受纯十六进制（算法按位数识别），此处统一清洗。
 */
function normalizeHash(raw: string): string {
  return raw
    .trim()
    .replace(/^(md5|sha-?1|sha-?224|sha-?256|sha-?384|sha-?512)\s*[:=]?\s*/i, '')
    .replace(/^0x/i, '')
    .replace(/[\s:]/g, '');
}

/**
 * 合法校验值 = 纯十六进制，且位数能对上一种算法。
 * 位数表必须和详情页 DownloadDetailPage.vue 的 HASH_ALGORITHMS 一致，否则会把合法的
 * SHA-224 / SHA-384 当成非法值拦下来：32=MD5 / 40=SHA-1 / 56=SHA-224 / 64=SHA-256 / 96=SHA-384 / 128=SHA-512
 */
const HASH_LENGTHS = [32, 40, 56, 64, 96, 128];

function isHashLike(value: string): boolean {
  return /^[0-9a-f]+$/i.test(value) && HASH_LENGTHS.includes(value.length);
}

/**
 * 软件 ID 允许的字符集。
 * 必须与以下三处保持一致，修改时需同步：
 *   · scripts/update-ignore.mjs 的 id 校验
 *   · .github/workflows/review-submission.yml 里的 ID_RE（以 id 拼写入路径）
 *   · .github/workflows/update-ignore-command.yml 从 Issue 正文解析 id 的正则
 * 这不是格式美观问题：`data.id` 会被拼成 `软件数据/apps/<id>.json` 再写文件，
 * `../../package` 这类值可逃逸至仓库外（2026-09-25 审计发现的路径穿越）。
 */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * 从表单拼出要提交的 payload。
 * 必填项不全、或校验值填了但格式不对时，payload 为 null，error 里带上要显示的提示
 * （error 为空表示按通用的「请填写带 * 的必填项」提示）。
 */
/**
 * 联系方式：本地用 age 公钥加密，只提交 ASCII armor 密文。
 * 返回 null 表示「未填写」（走通用必填提示）；返回 '' 表示「已填写但加密失败」
 * —— 两者含义不同：前者未写，后者写了却无法提交，
 * 需给出专门文案，不能并入「请填写带 * 的必填项」的通用提示。
 * age-encryption 体积较大（含后量子曲线依赖），走动态 import，仅在真正提交时按需加载。
 */
async function encryptContact(): Promise<string | null> {
  const contact = form.contact.trim();
  if (!contact) return null;
  try {
    const age = await import('age-encryption');
    const encrypter = new age.Encrypter();
    encrypter.addRecipient(RECIPIENT_PUBLIC_KEY);
    const ciphertext = await encrypter.encrypt(contact);
    return age.armor.encode(ciphertext);
  } catch {
    return ''; // 加密失败：由 buildPayload 给出专门提示
  }
}

async function buildPayload(): Promise<{ payload: Record<string, unknown> | null; error: string }> {
  const contactField = await encryptContact();
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
      .map((item) => {
        const entry: Record<string, unknown> = {
          platform: item.platform.trim(),
          note: item.note.trim(),
          size: item.size.trim(),
          url: item.url.trim()
        };
        // 下载方式：用户显式选了（kindIndex >= 1，索引 0 是「自动」）才写 kind，
        // 否则交给详情页按链接自动推断
        const kind = DOWNLOAD_KINDS[item.kindIndex];
        if (kind) entry.kind = kind;
        // 校验值选填：归一化后为空则不写入该键，避免生成多余的 `"hash": ""`
        const hash = normalizeHash(item.hash);
        if (hash) entry.hash = hash;
        return entry;
      }),
    /**
     * 联系方式：下划线开头的字段是「审核用元数据」，不写进站点的软件数据 ——
     * review-submission.yml 合并时会把所有 `_` 开头的键剥掉，只在审核 Issue 里显示。
     * 值是本地加密后的 age 密文（ASCII armor），不再是明文；管理员用私钥才能解出联系方式。
     */
    _联系方式: contactField
  };

  // 必填校验不使用原生 required：提交按钮并非原生 submit 按钮，原生校验不会触发
  // 「系统限制」也计入必填：留空时详情页只会显示「待补充」；从 GitHub 一键读取时会自动归纳填上
  // contactField 为 ''（已填写但加密失败）时优先使用专门文案，不落入通用必填提示
  if (contactField === '') {
    return { payload: null, error: t('submit.error-encrypt') };
  }
  const missing =
    !payload.id || !payload.name || !payload.category ||
    !payload.tagline || !payload.description || !payload._联系方式 ||
    !payload.system ||
    (payload.downloads as unknown[]).length === 0;
  if (missing) return { payload: null, error: '' };

  // 软件 ID 字符集：说明文字（submit.id-desc）已声明规则，但该值会被 CI 拼成写入路径，
  // 必须在此处校验（理由见 ID_PATTERN 的注释）。
  if (!ID_PATTERN.test(String(payload.id))) {
    return { payload: null, error: t('submit.error-id') };
  }

  // 排序值：填写时必须为数字。
  // 不能只靠下方的 `=== undefined` 清理 —— Number('abc') 得到 NaN，NaN !== undefined，
  // 该键会被保留，JSON.stringify 随即写成 `"sort": null`，污染数据。
  if (payload.sort !== undefined && !Number.isFinite(payload.sort as number)) {
    return { payload: null, error: t('submit.error-sort') };
  }

  // 校验值格式检查：填了就必须是合法写法 —— 写错的哈希比不写更糟（用户会照着核对下载文件）
  const downloadItems = payload.downloads as { hash?: string }[];
  const badHashIndex = downloadItems.findIndex((item) => item.hash && !isHashLike(item.hash));
  if (badHashIndex >= 0) {
    return { payload: null, error: t('submit.error-hash', { index: badHashIndex + 1 }) };
  }

  if (payload.sort === undefined) delete payload.sort;
  return { payload, error: '' };
}

interface SubmissionReply {
  success?: boolean;
  message?: string;
  error?: string;
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
    // 提交接口成功时返回 success、校验失败时返回 error，两者均缺失表示响应并非来自提交接口
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
    // 清理失败可安全忽略：草稿残留不影响提交流程
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
  // 联系方式已加密提交，浏览器端无法解密回填；旧版明文草稿仍按原样恢复
  const contact = text('_联系方式');
  form.contact = contact.startsWith('-----BEGIN AGE') ? '' : contact;
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
        url: String(item.url ?? ''),
        hash: String(item.hash ?? ''),
        kindIndex: DOWNLOAD_KINDS.indexOf((String(item.kind ?? '')) as (typeof DOWNLOAD_KINDS)[number])
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

  const built = await buildPayload();
  if (!built.payload) {
    ok.value = false;
    messageTitle.value = t('submit.result-error-title');
    message.value = built.error || t('submit.error-required');
    return;
  }
  const payload = built.payload;

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
   否则各分区输入框连成一片，难以区分归属 */
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

/* ── 上传到本站 OSS（图标 / 下载文件）──────────────────────── */
.submit-icon-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.submit-upload-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 2px;
}

.submit-upload-error {
  font-size: 12px;
  color: var(--SystemFillColorCriticalBrush, #c42b1c);
  word-break: break-word;
}

.submit-upload-warn {
  font-size: 12px;
  color: var(--SystemFillColorCautionBrush, #9d5d00);
  word-break: break-word;
}

.submit-upload-note {
  margin-top: 2px;
}

.submit-upload-hint {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
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
