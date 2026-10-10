<!-- 反馈中心页（#/feedback）—— 仿微软「反馈中心」：先选择类型卡片，再填写表单。
     提交走站点自身的提交服务（Cloudflare Worker `classhub` 的 /api/feedback），
     与「提交软件」「回声洞」共用同一入口：POST 在仓库 submissions/ 落一份草稿，
     由 .github/workflows/create-review-issue.yml 开出一张带「用户反馈」等标签的 Issue。
     与前两者不同的是：反馈没有审核合并环节 —— Issue 本身即为其归宿。
     提交服务不可用时才退回「打开 GitHub 的预填新建 Issue 页」或「复制反馈内容」。
     逻辑（分类表 / 正文拼装 / 校验 / 草稿）全在 src/gallery/feedback.ts，
     文案全在根目录 文字设置.ts 的 feedback.* 与 nav.feedback 键。 -->
<template>
  <WinGrid class="feedback-page-root" RowDefinitions="Auto,*">
    <WinTextBlock
      class="feedback-page-header"
      AutomationProperties.HeadingLevel="Level1"
      FontSize="28"
      FontWeight="600"
      LineHeight="36"
      Margin="36,24,36,12"
      TextWrapping="NoWrap"
      :Text="t('nav.feedback')" />

    <WinScrollViewer
      class="feedback-page-scroll"
      VerticalScrollBarVisibility="Auto"
      VerticalScrollMode="Auto">
      <div class="gallery-item-page feedback-page-body">
        <div class="gallery-page-content">
          <!-- ══ 主视觉区（仅选择态）═══════════════════════════════
               仿微软反馈中心：先以横幅说明页面用途，其后才是类型卡片；
               进入表单后由具体类型标题取代，不再显示。
               不使用装饰插画：纯文字主视觉更克制，也避免与卡片图标冲突。 -->
          <section v-if="!activeKind" class="feedback-hero">
            <div class="feedback-hero-inner">
              <div class="feedback-hero-main">
                <WinTextBlock
                  class="feedback-hero-title"
                  AutomationProperties.HeadingLevel="Level2"
                  FontSize="40"
                  FontWeight="600"
                  LineHeight="48"
                  TextWrapping="Wrap"
                  :Text="t('feedback.title')" />
                <WinTextBlock
                  class="feedback-hero-desc"
                  FontSize="14"
                  LineHeight="22"
                  TextWrapping="Wrap"
                  :Text="t('feedback.subtitle')" />
              </div>
            </div>
          </section>

          <!-- ══ 选择态：两张卡片 ═══════════════════════════════════ -->
          <div v-if="!activeKind" class="feedback-kind-list">
            <button
              v-for="kind in FEEDBACK_KINDS"
              :key="kind.key"
              class="feedback-kind-card"
              type="button"
              @click="chooseKind(kind.key)">
              <span class="feedback-kind-icon-wrap" aria-hidden="true">
                <img class="feedback-kind-icon" :src="kindIcons[kind.key]" alt="" />
              </span>
              <span class="feedback-kind-text">
                <span class="feedback-kind-title">{{ t(kind.titleKey) }}</span>
                <span class="feedback-kind-desc">{{ t(kind.descKey) }}</span>
              </span>
              <span class="feedback-kind-chevron" aria-hidden="true">&#xE76C;</span>
            </button>
          </div>

          <!-- ══ 提交后流程（仅选择态）═════════════════════════════
               向用户说明提交后的三步去向，回应「提交后是否有人处理」的疑虑。
               编号由 CSS 计数器生成，不写死数字 —— 后续增删步骤无需修改文案。 -->
          <section v-if="!activeKind" class="feedback-flow">
            <WinTextBlock
              class="feedback-flow-title"
              AutomationProperties.HeadingLevel="Level2"
              FontSize="16"
              FontWeight="600"
              :Text="t('feedback.flow-title')" />
            <ol class="feedback-flow-list">
              <li v-for="step in FLOW_STEPS" :key="step.titleKey" class="feedback-flow-step">
                <span class="feedback-flow-index" aria-hidden="true" />
                <span class="feedback-flow-text">
                  <span class="feedback-flow-step-title">{{ t(step.titleKey) }}</span>
                  <span class="feedback-flow-step-desc">{{ t(step.descKey) }}</span>
                </span>
              </li>
            </ol>
          </section>

          <!-- ══ 已有反馈入口（仅选择态）═══════════════════════════
               议题列表公开可查，不提供入口会令用户在无法查重的情况下填写；
               做成低调的一行链接，避免抢占类型卡片的注意力。 -->
          <section v-if="!activeKind" class="feedback-existing">
            <span class="feedback-existing-text">
              <span class="feedback-existing-title">{{ t('feedback.existing-title') }}</span>
              <span class="feedback-existing-desc">{{ t('feedback.existing-desc') }}</span>
            </span>
            <WinButton
              class="feedback-existing-button"
              Style="SubtleButtonStyle"
              @Click="openIssueList">
              <span>{{ t('feedback.existing-open') }}</span>
              <span class="feedback-external-glyph" aria-hidden="true">&#xE8A7;</span>
            </WinButton>
          </section>

          <!-- ══ 表单态 ════════════════════════════════════════════ -->
          <template v-else>
            <!-- 表单态标题行：返回按钮在左（层级上先于标题），标题与图标居中 -->
            <div class="feedback-form-head">
              <WinButton
                class="feedback-form-back"
                Style="SubtleButtonStyle"
                @Click="backToKinds">
                <span class="feedback-back-glyph" aria-hidden="true">&#xE72B;</span>
                <span>{{ t('feedback.back') }}</span>
              </WinButton>
              <span class="feedback-form-kind-wrap">
                <img
                  v-if="activeKind"
                  class="feedback-form-kind-icon"
                  :src="kindIcons[activeKind]"
                  alt="" />
                <WinTextBlock
                  class="feedback-form-kind"
                  FontSize="20"
                  FontWeight="600"
                  :Text="t(currentKind!.titleKey)" />
              </span>
            </div>

            <!-- 隐私提醒置于表单最前，不以小字弱化 -->
            <WinInfoBar
              class="feedback-notice"
              :IsOpen="true"
              :IsClosable="false"
              Severity="Informational"
              :Title="t('feedback.privacy-title')"
              :Message="t('feedback.privacy-desc')" />

            <section class="feedback-section">
              <WinTextBlock
                class="feedback-section-title"
                FontSize="16"
                FontWeight="600"
                :Text="t('feedback.section-basic')" />

              <div class="feedback-fields">
                <!-- 子类型：只有「报告问题」才有（建议不分类） -->
                <WinComboBox
                  v-if="activeKind === 'report'"
                  :Header="t('feedback.sub-kind')"
                  RequiredMark
                  :PlaceholderText="t('feedback.sub-kind-placeholder')"
                  :ItemsSource="subKindItems"
                  DisplayMemberPath="name"
                  v-model:SelectedIndex="subKindIndex" />

                <WinComboBox
                  :Header="t('feedback.app')"
                  :PlaceholderText="t('feedback.app-placeholder')"
                  :ItemsSource="appItems"
                  DisplayMemberPath="name"
                  v-model:SelectedIndex="appIndex" />

                <WinTextBox
                  :Header="t('feedback.subject')"
                  :PlaceholderText="t('feedback.subject-placeholder')"
                  :MaxLength="TITLE_MAX"
                  v-model:Text="form.title">
                  <template #header>
                    {{ t('feedback.subject') }}<span class="feedback-required-star" aria-hidden="true">*</span>
                  </template>
                </WinTextBox>

                <WinTextBox
                  :Header="t('feedback.detail')"
                  :PlaceholderText="t('feedback.detail-placeholder')"
                  AcceptsReturn
                  MinHeight="160"
                  v-model:Text="form.detail">
                  <template #header>
                    {{ t('feedback.detail') }}<span class="feedback-required-star" aria-hidden="true">*</span>
                  </template>
                </WinTextBox>
              </div>

              <div class="feedback-section-divider" aria-hidden="true" />

              <WinTextBlock
                class="feedback-section-title"
                FontSize="16"
                FontWeight="600"
                :Text="t('feedback.section-contact')" />

              <div class="feedback-fields">
                <WinTextBox
                  :PlaceholderText="t('feedback.contact-placeholder')"
                  :Description="t('feedback.contact-desc')"
                  v-model:Text="form.contact" />
              </div>

              <!-- 提交成功（内容已进仓库，草稿与表单同时清掉） -->
              <WinInfoBar
                v-if="submitted"
                class="feedback-notice"
                :IsOpen="true"
                :IsClosable="false"
                Severity="Success"
                :Title="t('feedback.success-title')"
                :Message="successMessage" />

              <WinInfoBar
                v-if="errorText"
                class="feedback-notice"
                :IsOpen="true"
                :IsClosable="false"
                Severity="Error"
                :Title="t('feedback.error-title')"
                :Message="errorText" />

              <!-- 兜底路径才会出现：预填链接太长，正文被截断 -->
              <WinInfoBar
                v-if="truncated"
                class="feedback-notice"
                :IsOpen="true"
                :IsClosable="false"
                Severity="Warning"
                :Title="t('feedback.truncated-title')"
                :Message="t('feedback.truncated-desc')" />

              <!-- 新窗口被拦，已改成复制（仅兜底路径） -->
              <WinInfoBar
                v-if="popupBlocked"
                class="feedback-notice"
                :IsOpen="true"
                :IsClosable="false"
                Severity="Warning"
                :Title="t('feedback.popup-blocked-title')"
                :Message="t('feedback.popup-blocked-desc')" />

              <div class="feedback-actions">
                <WinButton
                  Style="AccentButtonStyle"
                  :Content="submitting ? t('feedback.submitting') : t('feedback.submit')"
                  :IsEnabled="!submitting"
                  @Click="submitFeedback" />
                <WinButton
                  v-if="fallback"
                  :Content="t('feedback.fallback-github')"
                  @Click="openGithub" />
                <WinButton
                  :Content="copied ? t('feedback.copied') : t('feedback.copy')"
                  @Click="copyReport" />
                <WinButton
                  v-if="hasDraft"
                  Style="SubtleButtonStyle"
                  :Content="t('feedback.restore')"
                  @Click="restoreDraft" />
              </div>

              <WinTextBlock
                class="feedback-hint"
                FontSize="12"
                Foreground="var(--TextFillColorSecondaryBrush, var(--text-secondary))"
                TextWrapping="Wrap"
                :Text="t('feedback.github-hint')" />
            </section>
          </template>
        </div>
      </div>
    </WinScrollViewer>
  </WinGrid>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import WinGrid from '../../components/WinGrid.vue';
import WinScrollViewer from '../../components/WinScrollViewer.vue';
import WinTextBlock from '../../components/WinTextBlock.vue';
import WinButton from '../../components/WinButton.vue';
import WinTextBox from '../../components/WinTextBox.vue';
import WinComboBox from '../../components/WinComboBox.vue';
import WinInfoBar from '../../components/WinInfoBar.vue';
import { useI18n } from '../../components/i18n/index';
import { apps } from '../data';
// 类型图标：3D 风格透明底 PNG。走 import 而不是放 public/ ——
// 这样会被内联进单文件版，离线双击打开也有图（见 AGENTS.md 的构建说明）
import reportIcon from '../../assets/feedback/report.png';
import suggestIcon from '../../assets/feedback/suggest.png';
import {
  FEEDBACK_KINDS,
  REPORT_SUBKINDS,
  REPO_URL,
  TITLE_MAX,
  buildIssueBody,
  buildIssueUrl,
  clearFeedbackDraft,
  copyText,
  emptyDraft,
  readFeedbackDraft,
  saveFeedbackDraft,
  validateFeedback
} from '../feedback';
import type { FeedbackDraft, FeedbackKind } from '../feedback';

const { t } = useI18n();
const route = useRoute();

/**
 * 联系方式的接收方公钥（age1...）：与「提交软件」页、桌面端硬编码同一把。
 * 私钥仅维护者本地持有，绝不出现在任何客户端 / 网页 / 版本库代码里；
 * 这里只做公钥加密，不做任何解密。
 */
const RECIPIENT_PUBLIC_KEY = 'age1l9axcy0sxu6eeanapg0maughsv380fh8nhd4unf9p8d7x20rjqfsgz4dxa';

/** 大类 -> 图标。键名与 FEEDBACK_KINDS 里各项的 icon 字段一致 */
const kindIcons: Record<FeedbackKind, string> = {
  report: reportIcon,
  suggestion: suggestIcon
};

/** 提交后流程三步（序号由 CSS 计数器画，这里只管文案 key） */
const FLOW_STEPS = [
  { titleKey: 'feedback.flow-step-1-title', descKey: 'feedback.flow-step-1-desc' },
  { titleKey: 'feedback.flow-step-2-title', descKey: 'feedback.flow-step-2-desc' },
  { titleKey: 'feedback.flow-step-3-title', descKey: 'feedback.flow-step-3-desc' }
] as const;

/** 议题列表直链。复用 feedback.ts 的 REPO_URL，避免仓库地址两处维护 */
const ISSUE_LIST_URL = `${REPO_URL}/issues`;

// 提交入口与「提交软件」（SubmitPage.vue）、「回声洞」（EchoCaveCard.vue）**同一套**：
// 同样的两个域名顺序、同样的超时、同样把上次成功的那个记在 localStorage（key 也共用）。
// 三处刻意保持一致 —— 任何一个入口出问题时，用户的体验应该完全一样。
const SUBMIT_ENDPOINTS = ['https://cshapi.132614.xyz', 'https://submit.132614.xyz'];
const SUBMIT_TIMEOUT_MS = 10000;
const ENDPOINT_CACHE_KEY = 'csh-submit-endpoint';

/** 打开公开议题列表（先查重，再决定要不要提交） */
const openIssueList = () => {
  window.open(ISSUE_LIST_URL, '_blank', 'noopener,noreferrer');
};

/** 空串 = 还在选类型；有值 = 展开表单 */
const activeKind = ref<FeedbackKind | ''>('');

const form = reactive<FeedbackDraft>(emptyDraft());

/** 下拉的选中项下标；-1 = 未选（软件那一项留空是允许的） */
const subKindIndex = ref(-1);
const appIndex = ref(-1);

const errorText = ref('');
const truncated = ref(false);
const popupBlocked = ref(false);
const copied = ref(false);
/** 正在向提交服务 POST（按钮同时当进度指示用） */
const submitting = ref(false);
/** 提交成功：显示绿色回执条 */
const submitted = ref(false);
const successMessage = ref('');
/** 提交服务连不上才置 true —— 此时才露出「改用 GitHub 提交」这个兜底入口 */
const fallback = ref(false);

/** 当前大类定义（表单态标题、子类型是否显示都看它） */
const currentKind = computed(() =>
  FEEDBACK_KINDS.find((k) => k.key === activeKind.value) ?? null
);

// 下拉的数据源要在 computed 里现取：t() 是运行时函数，写在 data 里会拿不到最新语言
const subKindItems = computed(() =>
  REPORT_SUBKINDS.map((s) => ({ key: s.key, name: t(s.labelKey) }))
);
const appItems = computed(() => apps.map((a) => ({ id: a.id, name: a.name })));

/** 选中的软件对象（拼正文时注入「涉及软件」和详情页直链） */
const selectedApp = computed(() => apps.find((a) => a.id === form.appId) ?? null);

const hasDraft = ref(false);

// 各控件的变化同步回 draft。
// `form.kind` 必须由 activeKind 的 watch 来写，不能只在 chooseKind 里写一次：
//    applyDraft（恢复草稿）也会改 activeKind，只写一处会漏掉那条路径。
watch(subKindIndex, (i) => {
  form.subKind = i >= 0 ? REPORT_SUBKINDS[i].key : '';
});
watch(appIndex, (i) => {
  form.appId = i >= 0 ? apps[i].id : '';
});
// activeKind 的三个来源：点卡片、返回、恢复草稿。
// 「清空子类型」只对**切到非 report** 有意义（否则会把草稿里那一条也抹掉，
// 而 applyDraft 是在同一个同步块里设下标的，watch 晚一拍跑，正好会误伤）。
// 所以这里只在 kind 不是 report 时才清 —— 从 report 切到 report 或恢复草稿都不会触发。
watch(activeKind, (kind) => {
  form.kind = kind;
  if (kind !== 'report') {
    form.subKind = '';
    subKindIndex.value = -1;
  }
  errorText.value = '';
  // 换类型 = 开始写新的一条：把上一条的回执和兜底按钮一起收起，
  // 免得「提交成功」的绿条挂在一条还没写完的反馈上面
  submitted.value = false;
  fallback.value = false;
});

const chooseKind = (kind: FeedbackKind) => {
  activeKind.value = kind;
};

const backToKinds = () => {
  activeKind.value = '';
};

/** 把草稿填回表单（含下拉选中项） */
const applyDraft = (draft: FeedbackDraft) => {
  Object.assign(form, draft);
  if (!draft.kind) return;
  // 顺序有讲究：先落 activeKind（那条 watch 对 report 不会清子类型），
  // 再把两个下标设好。下标本身也会各自触发 watch 写回 form。
  activeKind.value = draft.kind;
  subKindIndex.value = REPORT_SUBKINDS.findIndex((s) => s.key === draft.subKind);
  appIndex.value = apps.findIndex((a) => a.id === draft.appId);
};

const restoreDraft = () => {
  const draft = readFeedbackDraft();
  if (draft) applyDraft(draft);
  hasDraft.value = false;
};

/**
 * 联系方式：本地用 age 公钥加密成 ASCII armor 密文，只把密文发出去；未填写则无需加密。
 * age-encryption 体积较大（含后量子曲线依赖），走动态 import，仅在真正提交时按需加载。
 * 只加密、绝不解密；私钥不在本站。
 */
async function encryptContact(): Promise<{ cipher: string; failed: boolean }> {
  const contact = form.contact.trim();
  if (!contact) return { cipher: '', failed: false };
  try {
    const age = await import('age-encryption');
    const encrypter = new age.Encrypter();
    encrypter.addRecipient(RECIPIENT_PUBLIC_KEY);
    return { cipher: age.armor.encode(await encrypter.encrypt(contact)), failed: false };
  } catch {
    // 动态 chunk 加载失败等异常：宁可拦下来让用户重试，也绝不把明文发出去
    return { cipher: '', failed: true };
  }
}

/**
 * 校验并组装要发出去的内容；不通过时把错误填进 errorText 并返回 null。
 * 联系方式在这里用 age 公钥加密（在内存里完成，form 本身保留明文供本地草稿）——
 * 离开本机的那一份**永远是密文**：提交服务也拒收明文（见 worker 的 /api/feedback），
 * 因为它会被公开贴在 Issue 上。
 */
const prepareOutgoing = async () => {
  const key = validateFeedback(form);
  if (key) {
    errorText.value = key === 'feedback.error-title-too-long'
      ? t(key, { max: TITLE_MAX })
      : t(key);
    return null;
  }
  errorText.value = '';

  const { cipher, failed } = await encryptContact();
  if (failed) {
    errorText.value = t('feedback.error-encrypt');
    return null;
  }
  // 兜底路径（复制 / GitHub 预填）要的草稿形态：联系方式已换成密文
  const outgoing: FeedbackDraft = cipher ? { ...form, contact: cipher } : form;
  return {
    outgoing,
    payload: {
      kind: form.kind,
      subKind: form.subKind,
      appId: form.appId,
      title: form.title.trim(),
      detail: form.detail.trim(),
      contact: cipher
    }
  };
};

/**
 * 按顺序返回要试的入口，上次成功过的排最前。
 * 与「提交软件」「回声洞」共用同一个 localStorage key：用户在本站任意一处提交成功过，
 * 另外两处也就不必再先白等一次失败。
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

/** 服务端明确应答（拿到 JSON 且给了 error）就算定局，不再换入口重试 */
class DefinitiveError extends Error {}

/**
 * 向单个入口发一次反馈提交（带超时）。
 * 只认提交接口的 JSON 应答；连不上 / 超时 / 拿到 HTML 错误页都算该入口不可用，换下一个。
 */
async function postFeedback(
  base: string,
  payload: Record<string, unknown>
): Promise<{ message?: string }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const data = (await res.json()) as { success?: boolean; message?: string; error?: string };
    if (data?.success === true) return data;
    if (typeof data?.error === 'string' && data.error) {
      throw new DefinitiveError(data.error);
    }
    throw new Error('unexpected-reply');
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * 主操作：POST 到提交服务。
 * 拿到成功应答即代表内容已落进仓库的 `submissions/`，其后由工作流开出 Issue ——
 * 因此可直接清草稿、清表单。
 */
const submitFeedback = async () => {
  if (submitting.value) return;

  const built = await prepareOutgoing();
  if (!built) return;

  // 先存草稿：提交过程中断网 / 关掉页面，回来还能接着改
  saveFeedbackDraft(form);
  submitting.value = true;
  submitted.value = false;
  fallback.value = false;
  truncated.value = false;
  popupBlocked.value = false;
  errorText.value = '';

  let reply: { message?: string } | null = null;
  let failure = '';
  try {
    for (const base of orderedEndpoints()) {
      try {
        reply = await postFeedback(base, built.payload);
        rememberEndpoint(base);
        break;
      } catch (err) {
        failure = err instanceof DefinitiveError
          ? err.message
          : err instanceof Error && err.name === 'AbortError'
            ? t('feedback.error-timeout', { seconds: Math.round(SUBMIT_TIMEOUT_MS / 1000) })
            : t('feedback.error-network');
        if (err instanceof DefinitiveError) break; // 服务端明确拒绝，换入口也没用
      }
    }

    if (reply) {
      submitted.value = true;
      successMessage.value = reply.message?.trim() || t('feedback.success-desc');
      // 内容已经进仓库了：本地草稿与表单一起清掉 ——
      // 留着只会让下次进来又看到已提交过的旧内容
      clearFeedbackDraft();
      hasDraft.value = false;
      form.title = '';
      form.detail = '';
      form.contact = '';
      return;
    }

    errorText.value = failure || t('feedback.error-network');
    fallback.value = true;
  } finally {
    submitting.value = false;
  }
};

/**
 * 兜底：提交服务不可用时，退回「打开 GitHub 的预填新建 Issue 页」。
 * 该路径绕过 /api/feedback：标题 / 正文 / 标签均已填好，但用户需自行点击提交，
 * 且需要 GitHub 账号 —— 因此仅在主路径确实不可用时才露出按钮。
 */
const openGithub = async () => {
  const built = await prepareOutgoing();
  if (!built) return;
  const issue = buildIssueUrl(built.outgoing, selectedApp.value);
  truncated.value = issue.truncated;
  saveFeedbackDraft(form);
  popupBlocked.value = false;
  const win = window.open(issue.url, '_blank', 'noopener,noreferrer');
  if (!win) {
    // 新窗口被拦截：退回复制路径，避免内容丢失
    void copyText(issue.body).then((ok) => {
      copied.value = ok;
      popupBlocked.value = true;
    });
  }
};

/** 兜底操作：复制正文（Issue 形态的 Markdown），可粘贴至 QQ 群等渠道 */
const copyReport = async () => {
  const built = await prepareOutgoing();
  if (!built) return;
  saveFeedbackDraft(form);
  const ok = await copyText(buildIssueBody(built.outgoing, selectedApp.value));
  copied.value = ok;
  if (ok) {
    window.setTimeout(() => {
      copied.value = false;
    }, 2000);
  }
};

onMounted(() => {
  hasDraft.value = readFeedbackDraft() !== null;
  // 支持 ?app=<id> 预选软件：详情页当前未放置入口，参数先行预留，
  // 后续添加时只需在详情页放置 <router-link :to="{name:'feedback', query:{app: app.id}}">
  const preset = String(route.query.app ?? '');
  if (preset) {
    const i = apps.findIndex((a) => a.id === preset);
    if (i >= 0) appIndex.value = i;
  }
});
</script>

<style scoped>
.feedback-page-root {
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.feedback-page-header {
  max-width: 1064px;
}

.feedback-page-scroll {
  grid-row: 2;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.feedback-page-body {
  padding-top: 0;
  max-width: 1064px;
}

/* ── 主视觉区（横幅）────────────────────────────────────────────────
   仿微软反馈中心：一块有底色的大横幅承载主标题与说明。
   底色用主题变量而非常量深色，否则浅色主题下会突兀。 */
.feedback-hero {
  position: relative;
  overflow: hidden;
  margin-top: 4px;
  /* 左右内边距较常见的 36px 收窄：本横幅仅有文字一栏、无插画与右侧标签列，
     保留 36px 会使大标题较下方卡片明显右缩进，视觉上不对齐。
     收窄至 28px 后标题与卡片基本处于同一视觉起线。 */
  padding: 36px 28px 40px;
  border: 1px solid var(--card-stroke, var(--ctrl-border, rgba(0, 0, 0, 0.12)));
  border-radius: 8px;
  /* 横向渐变：左侧主题色逐渐淡出，比纯色块更有层次 */
  background:
    linear-gradient(
      100deg,
      var(--accent-fill-rest, rgba(0, 95, 184, 0.16)) 0%,
      var(--card-bg-secondary, var(--layer-default, rgba(0, 0, 0, 0.02))) 58%,
      var(--card-bg, var(--ctrl-fill-default, rgba(255, 255, 255, 0.5))) 100%
    );
}

/* 横幅内仅文字一栏，不再需要 grid 分栏 */
.feedback-hero-inner {
  position: relative;
  z-index: 1;
}

.feedback-hero-main {
  min-width: 0;
  /* 说明文字铺得太宽不好读，留上限；大标题（约 40px）需要更宽才不断行 */
  max-width: 680px;
}

.feedback-hero-title {
  display: block;
  margin-bottom: 14px;
  color: var(--text-primary);
}

.feedback-hero-desc {
  display: block;
  color: var(--text-secondary);
}

/* ── 选择态：两张并排卡片 ─────────────────────────────────────────── */
.feedback-kind-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  margin-top: 20px;
}

/* 卡片：横向「图标色块 + 文字 + 箭头」，比竖排堆叠更接近微软反馈中心的选项卡 */
.feedback-kind-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 24px 22px;
  border: 1px solid var(--card-stroke, var(--ctrl-border, rgba(0, 0, 0, 0.12)));
  border-radius: 8px;
  background: var(--card-bg, var(--ctrl-fill-default, rgba(255, 255, 255, 0.5)));
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease;
}

.feedback-kind-card:hover {
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.04));
  border-color: var(--ctrl-border-focus, var(--accent, rgba(0, 0, 0, 0.24)));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.feedback-kind-card:focus-visible {
  outline: 2px solid var(--SystemFillColorAttentionBrush, var(--accent, #005fb8));
  outline-offset: 2px;
}

/* 图标外框：3D 图标自带体积感与透明底，再叠加色块反而显得杂乱，此处仅作定位容器。
   尺寸取 64px —— 该图集为「文档 + 彩色圆标」的复合造型，缩至 48px 时
   圆标过小难以辨认，需保留足够高度。 */
.feedback-kind-icon-wrap {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
}

.feedback-kind-icon {
  width: 64px;
  height: 64px;
  object-fit: contain;
  /* 深色主题下图片易与背景融合，叠加浅投影以拉开层次 */
  filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.16));
  user-select: none;
}

.feedback-kind-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.feedback-kind-title {
  font-size: 17px;
  font-weight: 600;
  line-height: 24px;
}

.feedback-kind-desc {
  font-size: 13px;
  line-height: 19px;
  color: var(--TextFillColorSecondaryBrush, var(--text-secondary));
}

/* 右侧箭头：暗示「这一项可进入」，与 Fluent 列表项一致 */
.feedback-kind-chevron {
  font-family: 'WinUIOnWebIcons';
  font-size: 14px;
  line-height: 1;
  color: var(--TextFillColorSecondaryBrush, var(--text-secondary));
  opacity: 0.7;
}

/* ── 提交后流程（三步）────────────────────────────────────────────── */
.feedback-flow {
  margin-top: 28px;
}

.feedback-flow-title {
  display: block;
  margin-bottom: 14px;
}

.feedback-flow-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin: 0;
  padding: 0;
  list-style: none;
  /* 序号由这里数，模板里不写死数字 */
  counter-reset: feedback-step;
}

.feedback-flow-step {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 18px 20px;
  border: 1px solid var(--card-stroke, var(--ctrl-border, rgba(0, 0, 0, 0.1)));
  border-radius: 8px;
  background: var(--card-bg-secondary, var(--ctrl-fill-default, rgba(255, 255, 255, 0.4)));
}

/* 序号：圆底 + 计数内容，颜色取主题强调色 */
.feedback-flow-index {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--accent-fill-rest, rgba(0, 95, 184, 0.14));
  color: var(--accent-text, var(--accent, #005fb8));
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
}

.feedback-flow-index::before {
  counter-increment: feedback-step;
  content: counter(feedback-step);
}

.feedback-flow-text {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.feedback-flow-step-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.feedback-flow-step-desc {
  font-size: 13px;
  line-height: 19px;
  color: var(--TextFillColorSecondaryBrush, var(--text-secondary));
}

/* ── 已有反馈入口 ─────────────────────────────────────────────────── */
.feedback-existing {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 20px;
  padding: 16px 20px;
  border: 1px solid var(--card-stroke, var(--ctrl-border, rgba(0, 0, 0, 0.1)));
  border-radius: 8px;
  background: var(--subtle-secondary, rgba(0, 0, 0, 0.02));
}

.feedback-existing-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.feedback-existing-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.feedback-existing-desc {
  font-size: 13px;
  line-height: 19px;
  color: var(--TextFillColorSecondaryBrush, var(--text-secondary));
}

.feedback-existing-button {
  flex: 0 0 auto;
}

/* 外链字形：提示「会离开本站」，与站内跳转区分 */
.feedback-external-glyph {
  font-family: 'WinUIOnWebIcons';
  font-size: 12px;
  line-height: 1;
  margin-left: 8px;
}

/* ── 表单态 ─────────────────────────────────────────────────────── */
/* 返回在左、类型标题居中偏左：返回是导航动作，层级上先于当前步骤 */
.feedback-form-head {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 20px;
  padding-bottom: 4px;
}

.feedback-form-back {
  flex: 0 0 auto;
}

.feedback-back-glyph {
  font-family: 'WinUIOnWebIcons';
  font-size: 13px;
  line-height: 1;
  margin-right: 8px;
}

.feedback-form-kind-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.feedback-form-kind-icon {
  width: 28px;
  height: 28px;
  object-fit: contain;
  user-select: none;
}

.feedback-form-kind {
  display: block;
}

.feedback-notice {
  margin-top: 16px;
}

/* 分区卡片：与提交页 .submit-section 同风格 */
.feedback-section {
  margin-top: 24px;
  padding: 20px 22px 24px;
  border: 1px solid var(--card-stroke, var(--ctrl-border, rgba(0, 0, 0, 0.12)));
  border-radius: 8px;
  background: var(--card-bg, var(--ctrl-fill-default, rgba(255, 255, 255, 0.5)));
}

/* 分区小标题：表单字段多，需要中间层次把「基本信息」和「联系方式」分开 */
.feedback-section-title {
  display: block;
  margin-bottom: 16px;
}

/* 分区之间的分隔线：单独一个 div，不要挂在 WinTextBlock 上 ——
   组件的 scoped class 落到其根元素时，border 会被组件内部样式比下去而不渲染。 */
.feedback-section-divider {
  height: 1px;
  margin: 28px 0 24px;
  background: var(--stroke-divider, rgba(0, 0, 0, 0.08));
}

.feedback-fields {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* 字段标签与上方分区标题的间距：不拉开就会看起来像两行标题 */
.feedback-section-title + .feedback-fields {
  margin-top: 20px;
}

.feedback-fields :deep(.win-textbox),
.feedback-fields :deep(.win-combo-box) {
  width: 100%;
}

/* 必填星号：与提交页一致，用 WinUI 的 Critical 色 */
.feedback-required-star {
  margin-left: 4px;
  color: var(--SystemFillColorCriticalBrush, #c42b1c);
  font-weight: 600;
}

.feedback-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 22px;
}

.feedback-hint {
  display: block;
  margin-top: 14px;
  line-height: 18px;
}

/* 窄屏：三步流程与入口行改为竖向排列 */
@media (max-width: 820px) {
  .feedback-flow-list {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 640px) {
  .feedback-kind-list {
    grid-template-columns: minmax(0, 1fr);
  }

  .feedback-hero {
    padding: 28px 24px 30px;
  }

  .feedback-hero-title {
    /* 窄屏下 40px 过大，标题字号缩小一档 */
    font-size: 30px !important;
    line-height: 38px !important;
  }

  /* 步骤卡片窄屏是竖排，序号和文字之间不需要那么宽 */
  .feedback-flow-step {
    gap: 10px;
    padding: 16px 16px 18px;
  }

  .feedback-form-head {
    flex-wrap: wrap;
  }

  .feedback-existing {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
