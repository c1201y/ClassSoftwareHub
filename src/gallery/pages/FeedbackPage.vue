<!-- 反馈中心页（#/feedback）—— 仿微软「反馈中心」：先选类型卡片，再填表。
     提交时不发任何网络请求：拼一个 GitHub Issue 预填链接打开（本站没有后端），
     没有 GitHub 账号的用户可以「复制反馈内容」拿去 QQ 群。
     逻辑（分类表 / 正文拼装 / URL 截断 / 校验 / 草稿）全在 src/gallery/feedback.ts，
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
               仿微软反馈中心：一块横幅把「这是什么、能做什么」先讲清楚，
               再往下才是类型卡片。进了表单后让位给具体类型标题，不再显示。
               刻意不放装饰插画：纯文字的主视觉更克制，也避免和卡片图标打架。
               右侧那排标签用来填掉大标题留出的空白，同时把「公开」「免登录」
               这两个最影响用户是否肯填的前提提前说掉。 -->
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
              <ul class="feedback-hero-tags">
                <li v-for="tagKey in HERO_TAGS" :key="tagKey" class="feedback-hero-tag">
                  <span class="feedback-hero-tag-glyph" aria-hidden="true">&#xE73E;</span>
                  <span>{{ t(tagKey) }}</span>
                </li>
              </ul>
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
               点开链接就跳走了，用户全程在「付出」，从没见过「回报」。
               这里把三步讲清楚，解决「我提了有人看吗」的犹豫。
               编号用 CSS 计数器画，不写死数字 —— 将来加删步骤不用改文案。 -->
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
               议题列表本来就是公开的，不给入口等于让用户盲填。
               做成一行低调的链接，不抢类型卡片的注意力。 -->
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

            <!-- 隐私提醒放在最前面，不能只写小字 -->
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

              <!-- 校验失败 -->
              <WinInfoBar
                v-if="errorText"
                class="feedback-notice"
                :IsOpen="true"
                :IsClosable="false"
                Severity="Error"
                :Title="t('feedback.error-title')"
                :Message="errorText" />

              <!-- 内容被截断 -->
              <WinInfoBar
                v-if="truncated"
                class="feedback-notice"
                :IsOpen="true"
                :IsClosable="false"
                Severity="Warning"
                :Title="t('feedback.truncated-title')"
                :Message="t('feedback.truncated-desc')" />

              <!-- 新窗口被拦，已改成复制 -->
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
                  :Content="t('feedback.open-github')"
                  :IsEnabled="!justOpened"
                  @Click="openIssue" />
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
  buildIssueUrl,
  copyText,
  emptyDraft,
  readFeedbackDraft,
  saveFeedbackDraft,
  validateFeedback
} from '../feedback';
import type { FeedbackDraft, FeedbackKind } from '../feedback';

const { t } = useI18n();
const route = useRoute();

/** 大类 -> 图标。键名与 FEEDBACK_KINDS 里各项的 icon 字段一致 */
const kindIcons: Record<FeedbackKind, string> = {
  report: reportIcon,
  suggestion: suggestIcon
};

/** 主视觉右侧的文字标签（提前讲清「公开」「免登录」两个前提） */
const HERO_TAGS = [
  'feedback.hero-tag-public',
  'feedback.hero-tag-no-account',
  'feedback.hero-tag-tracked'
] as const;

/** 提交后流程三步（序号由 CSS 计数器画，这里只管文案 key） */
const FLOW_STEPS = [
  { titleKey: 'feedback.flow-step-1-title', descKey: 'feedback.flow-step-1-desc' },
  { titleKey: 'feedback.flow-step-2-title', descKey: 'feedback.flow-step-2-desc' },
  { titleKey: 'feedback.flow-step-3-title', descKey: 'feedback.flow-step-3-desc' }
] as const;

/** 议题列表直链。复用 feedback.ts 的 REPO_URL，避免仓库地址两处维护 */
const ISSUE_LIST_URL = `${REPO_URL}/issues`;

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
const justOpened = ref(false);

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
// ⚠️ `form.kind` 必须由 activeKind 的 watch 来写，不能只在 chooseKind 里写一次：
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

/** 校验并返回正文；不通过时把错误填进 errorText 并返回 null */
const prepare = () => {
  const key = validateFeedback(form);
  if (key) {
    errorText.value = key === 'feedback.error-title-too-long'
      ? t(key, { max: TITLE_MAX })
      : t(key);
    return null;
  }
  errorText.value = '';
  const built = buildIssueUrl(form, selectedApp.value);
  truncated.value = built.truncated;
  return built;
};

/**
 * 主操作：拼好链接直接开新标签页。
 * 打开前先存草稿 —— 用户到了 GitHub 那边可能才发现要登录，
 * 回头再来时内容还在。
 */
const openIssue = () => {
  const built = prepare();
  if (!built) return;
  saveFeedbackDraft(form);
  popupBlocked.value = false;
  const win = window.open(built.url, '_blank', 'noopener,noreferrer');
  if (!win) {
    // 被拦截：退回复制，别让内容白白丢掉
    void copyText(built.body).then((ok) => {
      copied.value = ok;
      popupBlocked.value = true;
    });
    return;
  }
  // 防止连点开一堆标签页
  justOpened.value = true;
  window.setTimeout(() => {
    justOpened.value = false;
  }, 3000);
};

/** 兜底操作：把正文复制走（没有 GitHub 账号时用） */
const copyReport = async () => {
  const built = prepare();
  if (!built) return;
  const ok = await copyText(built.body);
  copied.value = ok;
  if (ok) {
    window.setTimeout(() => {
      copied.value = false;
    }, 2000);
  }
};

onMounted(() => {
  hasDraft.value = readFeedbackDraft() !== null;
  // ?app=<id> 预选软件：本次没在详情页放入口，但口子留着，
  // 将来要加只需在详情页放个 <router-link :to="{name:'feedback', query:{app: app.id}}">
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
  /* 左右内边距比常见的 36px 收小：本条横幅只有文字与标签、没有插画，
     再留 36px 会让大标题明显比下方卡片右缩进，看着「没对齐」。
     收窄到 28px 后标题与卡片基本在同一条视觉起线上。 */
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

/* 横幅内两栏：文字在左，前提标签在右。
   窄屏会折叠成一栏（见文件末尾媒体查询），所以布局用 grid 而非绝对定位。 */
.feedback-hero-inner {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 32px;
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

/* ── 主视觉右侧的前提标签 ─────────────────────────────────────────── */
.feedback-hero-tags {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.feedback-hero-tag {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px 7px 10px;
  border: 1px solid var(--card-stroke, var(--ctrl-border, rgba(0, 0, 0, 0.1)));
  border-radius: 999px;
  background: var(--card-bg, rgba(255, 255, 255, 0.55));
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 18px;
  white-space: nowrap;
}

.feedback-hero-tag-glyph {
  font-family: 'WinUIOnWebIcons';
  font-size: 12px;
  line-height: 1;
  color: var(--SystemFillColorSuccessBrush, var(--accent, #0f7b0f));
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

/* 图标外框：3D 图标自带体积感和透明底，再套一层色块会显脏，这里只做定位容器。
   尺寸给到 64px —— 这套图是「文档 + 彩色圆标」的复合造型，缩到 48px 时
   圆标只剩十几像素糊成一点，必须留够高度才看得出是什么。 */
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
  /* 图片在深色主题下会和背景糊在一起，垫一层浅投影拉开 */
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

/* 窄屏：卡片改成上下堆叠；横幅收窄内边距，右侧标签折到标题下面；
   三步流程与入口行同样改成竖向排列 */
@media (max-width: 820px) {
  .feedback-hero-inner {
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: 22px;
  }

  .feedback-hero-tags {
    flex-direction: row;
    flex-wrap: wrap;
  }

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
    /* 窄屏 40px 会撑爆标题，收一档 */
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
