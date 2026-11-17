<template>
  <WinGrid class="settings-page-root" RowDefinitions="Auto,*">
    <div class="settings-page-head">
      <WinTextBlock
        class="settings-page-header"
        AutomationProperties.HeadingLevel="Level1"
        FontSize="28"
        FontWeight="600"
        LineHeight="36"
        Margin="0"
        TextWrapping="NoWrap"
        :Text="$t('text.settings')" />
      <span class="settings-connection">
        <span class="settings-connection-label">{{ $t('text.connection') }}</span>
        <span class="settings-connection-value">{{ connectionText }}</span>
      </span>
    </div>
    <WinScrollViewer
      class="settings-page-scroll"
      VerticalScrollBarVisibility="Auto"
      VerticalScrollMode="Auto">
      <div class="gallery-item-page settings-page-body">
        <div class="gallery-page-content">
          <WinTextBlock class="settings-section-title" :Text="$t('text.appearance')" />
          <div class="settings-controls">
            <WinExpander
              Height="70"
              :Header="$t('text.theme')"
              :Description="$t('text.choose-your-app-color-mode')"
              HeaderIcon="">
              <WinRadioButtons :SelectedIndex="themeIndex" @SelectionChanged="onThemeSelectionChanged">
                <WinRadioButton :Content="$t('text.use-system-setting')" />
                <WinRadioButton :Content="$t('text.light')" />
                <WinRadioButton :Content="$t('text.dark')" />
              </WinRadioButtons>
            </WinExpander>
            <WinExpander
              v-if="isHostedInUwpWebView"
              Height="70"
              :Header="$t('text.material')"
              :Description="$t('text.choose-the-app-background-material')"
              HeaderIcon="&#xE2B1;">
              <WinRadioButtons :SelectedIndex="materialIndex" @SelectionChanged="onMaterialSelectionChanged">
                <WinRadioButton :Content="$t('text.mica')" />
                <WinRadioButton :Content="$t('text.acrylic')" />
              </WinRadioButtons>
            </WinExpander>
            <!-- 节日皮肤（补丁模块，见 src/gallery/holidayTheme.ts；不需要时可整块移除） -->
            <WinExpander
              :Header="$t('text.holiday-skin')"
              :Description="$t('text.holiday-skin-desc')"
              Height="70">
              <WinToggleSwitch
                :IsOn="holidaySkinEnabled"
                :OnContent="$t('text.on')"
                :OffContent="$t('text.off')"
                @Toggled="onHolidaySkinToggled" />
            </WinExpander>
            <!-- 版本与更新：参照 Windows 11「Windows 更新」页的写法——
                 一行状态（已是最新 / 有可用更新）+ 上次检查时间 + 操作按钮 -->
            <WinExpander
              :Header="$t('text.version-updates')"
              :Description="$t('text.version-updates-desc')"
              Height="70">
              <div class="version-update">
                <div class="version-update-row">
                  <span class="version-status" :class="`is-${updateState}`">
                    <span class="version-status-dot" aria-hidden="true"></span>
                    <span class="version-status-text">{{ updateStatusText }}</span>
                  </span>
                  <div class="cache-actions">
                    <WinButton
                      :IsEnabled="!checkingUpdate"
                      :Content="checkingUpdate ? $t('text.update-checking') : $t('text.update-check')"
                      @Click="refreshUpdate(true)" />
                    <WinButton
                      Style="AccentButtonStyle"
                      :IsEnabled="!updating"
                      :Content="updateState === 'stale' ? $t('text.update-now') : $t('text.force-update')"
                      @Click="runUpdate" />
                  </div>
                </div>
                <p class="version-update-meta">
                  {{ $t('text.update-last-check', { time: lastCheckText, build: runningBuild }) }}
                </p>
              </div>
            </WinExpander>
            <WinExpander
              v-if="installAvailable"
              :Header="$t('text.install-app')"
              :Description="$t('text.install-app-desc')"
              Height="70">
              <div class="cache-actions">
                <WinButton
                  :IsEnabled="installState !== 'accepted'"
                  :Content="installState === 'accepted' ? $t('text.install-done') : $t('text.install-now')"
                  @Click="installApp" />
              </div>
            </WinExpander>
          </div>

          <WinTextBlock class="about-section-title" :Text="$t('text.about')" />
          <div class="about-controls">
            <WinExpander
              :Header="appTitle"
              :Description="copyrightText"
              Height="70">
              <!-- @vue-expect-error 上游 WinExpander 未导出插槽类型，运行时正常 -->
              <template #HeaderControls>
                <WinButton
                  @Click="openRepository"
                  :Content="$t('text.open-code-repository')" />
                <WinTextBlock
                  :Text="versionText"
                  FontSize="14.4"
                  Foreground="var(--TextFillColorSecondaryBrush, var(--text-secondary))" />
              </template>
              <div class="about-content">
                <WinHyperlinkButton
                  :NavigateUri="t('about.author-home-url')"
                  TargetName="_blank"
                  HorizontalAlignment="Left"
                  :Content="t('about.author-home')" />
                <WinHyperlinkButton
                  :NavigateUri="t('welcome.article-url')"
                  TargetName="_blank"
                  HorizontalAlignment="Left"
                  :Content="t('welcome.article')" />
                <!-- QQ 群：群链接在根目录「文字设置.ts」的 about.qq-group-url -->
                <WinHyperlinkButton
                  :NavigateUri="t('about.qq-group-url')"
                  TargetName="_blank"
                  HorizontalAlignment="Left"
                  :Content="t('about.qq-group')" />
                <WinHyperlinkButton
                  :NavigateUri="t('about.reward-url')"
                  TargetName="_blank"
                  HorizontalAlignment="Left"
                  :Content="t('about.reward')" />
                <!-- UI 内核：本站界面用的上游组件库 —— 文字在根目录「文字设置.ts」 -->
                <WinHyperlinkButton
                  :NavigateUri="t('about.ui-kernel-url')"
                  TargetName="_blank"
                  HorizontalAlignment="Left"
                  :Content="t('about.ui-kernel')" />
                <!-- 法律三件套（#/agreement）：按钮文字与页面内容都来自根目录「法律文本.ts」。
                     站内跳转不用 WinHyperlinkButton —— 其 SAFE_URI_RE 白名单只认
                     http(s)/ms-windows-store:，hash 路由会被降级为无响应按钮 -->
                <div class="legal-links">
                  <WinButton
                    v-for="doc in legalDocLinks"
                    :key="doc.key"
                    HorizontalAlignment="Left"
                    :Content="doc.label"
                    @Click="openLegal(doc.key)" />
                </div>
              </div>
            </WinExpander>

            <!-- 鸣谢卡片：文字在根目录「鸣谢文本.ts」，贡献人员在该文件中维护（分开发团队 / 赞助人员两组） -->
            <div class="credits-card">
              <div class="credits-card-title">{{ credits.title }}</div>
              <div class="credits-card-intro">{{ credits.intro }}</div>
              <template v-if="credits.people.length > 0">
                <div v-for="group in creditGroups" :key="group.key" class="credits-group">
                  <div class="credits-group-title">{{ group.title }}</div>
                  <ul class="credits-people">
                    <li v-for="person in group.people" :key="person.name" class="credits-person">
                      <!-- 填写 url 时名字渲染为链接（新标签页打开），未填写则为普通文字；
                           链接地址在根目录「鸣谢文本.ts」中维护 -->
                      <WinHyperlinkButton
                        v-if="person.url"
                        class="credits-person-link"
                        :NavigateUri="person.url"
                        TargetName="_blank"
                        Padding="0"
                        Margin="0"
                        :Content="person.name" />
                      <span v-else class="credits-person-name">{{ person.name }}</span>
                      <span v-if="person.note" class="credits-person-note">{{ person.note }}</span>
                    </li>
                  </ul>
                </div>
              </template>
              <div v-else class="credits-empty">{{ credits.empty }}</div>
            </div>

            <!-- 访问量 + 稳定运行时长：独立板块，置于鸣谢下方；文字跟随主题 -->
            <div class="visitor-stat-card">
              <div class="visitor-stat-title">访问量</div>
              <VisitorCounter class="visitor-stat-counter" />
              <!-- 站点运行时长：起始日见下方 SITE_LAUNCH_DATE，调整日期仅需修改该处 -->
              <div class="visitor-stat-uptime">
                <span class="visitor-stat-uptime-label">网站已稳定运行</span>
                <span class="visitor-stat-uptime-value">{{ uptimeText }}</span>
              </div>
            </div>
          </div>

          <!-- 回声洞：独立分组（非「关于」区块内的一张卡）；可下拉展开项，正文整块可点换一条，投稿按钮在右侧弹出小面板 -->
          <WinTextBlock class="echo-section-title" :Text="$t('echo-cave.title')" />
          <div class="echo-controls">
            <EchoCaveCard />
          </div>
        </div>
      </div>
    </WinScrollViewer>
  </WinGrid>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Ref } from 'vue';
import WinExpander from '../../components/WinExpander.vue';
import WinRadioButton from '../../components/WinRadioButton.vue';
import WinRadioButtons from '../../components/WinRadioButtons.vue';
import WinToggleSwitch from '../../components/WinToggleSwitch.vue';
import WinTextBlock from '../../components/WinTextBlock.vue';
import WinButton from '../../components/WinButton.vue';
import WinHyperlinkButton from '../../components/WinHyperlinkButton.vue';
import WinGrid from '../../components/WinGrid.vue';
import WinScrollViewer from '../../components/WinScrollViewer.vue';
import VisitorCounter from '../VisitorCounter.vue';
import appManifest from '../../manifest.json';
import { useI18n } from '../../components/i18n/index';
import credits from '../../../鸣谢文本';
// 法律三件套：内容与标题均在根目录「法律文本.ts」中维护
import legalDocs from '../../../法律文本';
import { useRouter } from 'vue-router';
import EchoCaveCard from '../EchoCaveCard.vue';
import { applyUpdate, checkForUpdate, runningBuild } from '../appUpdate';
import type { UpdateCheck } from '../appUpdate';
import { onInstallAvailability, promptInstallPwa } from '../pwaInstall';

const { t, locale } = useI18n();

// 连接方式：由同源 /api/conn 按服务端看到的远端地址判定，只显示 IPv6/IPv4。
const connectionFamily = ref<'ipv6' | 'ipv4' | 'unknown'>('unknown');
const connectionText = computed(() => {
  if (connectionFamily.value === 'ipv6') return t('text.connection-ipv6');
  if (connectionFamily.value === 'ipv4') return t('text.connection-ipv4');
  return t('text.connection-unknown');
});

// 鸣谢分组：按「鸣谢文本.ts」的 groupOrder / groupTitles 渲染（开发团队 / 赞助人员）
const creditGroups = computed(() =>
  credits.groupOrder
    .map((key) => ({
      key,
      title: credits.groupTitles[key],
      people: credits.people.filter((person) => person.group === key),
    }))
    .filter((group) => group.people.length > 0),
);

// App.vue 始终 provide 以下设置项（ref），这里按约定直接注入
const themeSetting = inject('themeSetting') as Ref<string>;
const materialSetting = inject('materialSetting') as Ref<string>;
const isHostedInUwpWebView = inject('isHostedInUwpWebView') as Ref<boolean>;
// 节日皮肤开关（补丁模块，App.vue 提供）
const holidaySkinEnabled = inject('holidaySkinEnabled') as Ref<boolean>;
const onHolidaySkinToggled = ({ IsOn }: { IsOn: boolean }) => {
  holidaySkinEnabled.value = IsOn;
};

// ── 版本与更新 ─────────────────────────────────────────────────────
// 站点常驻 Service Worker，浏览器可能还在用旧 bundle。进入设置页自动比对
// /version.json（构建时生成）与当前 bundle 的提交号；三种结果都显式展示，
// 「已是最新」时不再沉默（参照 Windows 11 的「Windows 更新」页）。
const updateInfo = ref<UpdateCheck | null>(null);
const checkingUpdate = ref(false);
const updating = ref(false);
const lastCheckedAt = ref<Date | null>(null);

const refreshUpdate = async (force = false) => {
  if (checkingUpdate.value) return;
  checkingUpdate.value = true;
  try {
    updateInfo.value = await checkForUpdate(force);
    lastCheckedAt.value = new Date();
  } finally {
    checkingUpdate.value = false;
  }
};

const updateState = computed(() => {
  if (checkingUpdate.value) return 'checking';
  return updateInfo.value?.state ?? 'unknown';
});

const updateStatusText = computed(() => {
  if (checkingUpdate.value) return t('text.update-checking');
  const info = updateInfo.value;
  if (!info) return t('text.update-unknown');
  if (info.state === 'stale') {
    return t('text.update-available', { latest: info.latest, running: info.running });
  }
  return info.state === 'current' ? t('text.update-current') : t('text.update-unknown');
});

const lastCheckText = computed(() =>
  lastCheckedAt.value
    ? lastCheckedAt.value.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : '—'
);

const runUpdate = async () => {
  if (updating.value) return;
  updating.value = true;
  await applyUpdate();
};

const installAvailable = ref(false);
const installState = ref<'idle' | 'accepted' | 'dismissed' | 'unavailable'>('idle');
let stopInstallWatch: (() => void) | undefined;
const installApp = async () => {
  installState.value = await promptInstallPwa();
};

const themeOptions = ['system', 'light', 'dark'];const materialOptions = ['mica', 'acrylic'];
const themeIndex = computed(() => themeOptions.indexOf(themeSetting.value));
const materialIndex = computed(() => materialOptions.indexOf(materialSetting.value));
const onThemeSelectionChanged = ({ SelectedIndex }: { SelectedIndex: number }) => {
  themeSetting.value = themeOptions[SelectedIndex];
};
const onMaterialSelectionChanged = ({ SelectedIndex }: { SelectedIndex: number }) => {
  materialSetting.value = materialOptions[SelectedIndex];
};
const appTitle = t('app.title');
const currentYear = new Date().getFullYear();
const copyrightText = computed(() =>
  t('text.about-copyright', {
    year: currentYear,
    author: t(appManifest.author ?? 'app.author'),
    rights: t('text.all-rights-reserved')
  })
);
const versionText = t(appManifest.version ?? 'app.version');
const openRepository = () => {
  const url = t('about.repository-url');
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
};

// ── 法律三件套（#/agreement）：带 ?doc= 让条款页直接定位到对应文档 ──
const router = useRouter();
const legalDocLinks = computed(() =>
  legalDocs.map((doc) => ({
    key: doc.key,
    label: locale === 'zh-CN' ? doc.zh.title : doc.en.title
  }))
);
const openLegal = (key: string) => {
  router.push({ path: '/agreement', query: { doc: key } });
};

// ── 网站稳定运行时长 ────────────────────────────────────────────────
// 起始日：2026-08-29（仅需修改该处）。按本地时区零点起算，纯前端计算，
// 不依赖任何外部服务。
const SITE_LAUNCH_DATE = new Date(2026, 7, 29, 0, 0, 0); // 月份 0 起算，7 = 8 月
const nowTick = ref(Date.now());
let uptimeTimer: number | undefined;

const uptimeText = computed(() => {
  const diffMs = Math.max(0, nowTick.value - SITE_LAUNCH_DATE.getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days} 天 ${hours} 小时 ${minutes} 分 ${seconds} 秒`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分 ${seconds} 秒`;
  return `${minutes} 分 ${seconds} 秒`;
});

onMounted(() => {
  nowTick.value = Date.now();
  // 显示到「秒」，每秒刷新一次
  uptimeTimer = window.setInterval(() => {
    nowTick.value = Date.now();
  }, 1000);
  fetch('/api/conn', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const f = d && d.family;
      if (f === 'ipv6' || f === 'ipv4') connectionFamily.value = f;
    })
    .catch(() => {});
  // 进入设置页时比对一次版本（失败静默，不打扰用户）
  void refreshUpdate();
  stopInstallWatch = onInstallAvailability((available) => {
    installAvailable.value = available;
  });
});

onBeforeUnmount(() => {
  if (uptimeTimer !== undefined) window.clearInterval(uptimeTimer);
  stopInstallWatch?.();
});
</script>

<style scoped>
.settings-page-root {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.settings-page-header {
  max-width: 1064px;
  margin: 0;
}

.settings-page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 36px 30px;
}

.settings-connection {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
  color: var(--TextFillColorSecondaryBrush, var(--text-secondary));
  background: var(--ControlFillColorSecondaryBrush, rgba(128, 128, 128, 0.1));
}

.settings-connection-value {
  font-weight: 600;
  color: var(--TextFillColorPrimaryBrush, var(--text-primary));
}

@media (max-width: 640px) {
  .settings-page-head {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 20px 20px 24px;
  }
}

.settings-page-scroll {
  grid-row: 2;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.settings-page-body {
  padding-top: 0;
}

.settings-section-title {
  font-size: 14px;
  font-weight: 600;
}

.settings-controls {
  display: flex;
  flex-direction: column;
  margin-top: 6px;
  margin-bottom: 32px;
}

.settings-controls :deep(.win-expander),
.settings-controls :deep(.win-settings-card) {
  margin-bottom: 4px;
}

.cache-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.version-update {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.version-update-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.version-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
}
.version-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
  background: var(--text-secondary);
}
.version-status.is-current {
  color: #0f7b0f;
}
.version-status.is-current .version-status-dot {
  background: #0f7b0f;
}
.version-status.is-stale {
  color: var(--accent-base);
}
.version-status.is-stale .version-status-dot {
  background: var(--accent-base);
}
.version-status.is-checking .version-status-dot,
.version-status.is-unknown .version-status-dot {
  background: var(--text-secondary);
}
.version-update-meta {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}
:global(html.theme-dark) .version-status.is-current {
  color: #6ccb5f;
}
:global(html.theme-dark) .version-status.is-current .version-status-dot {
  background: #6ccb5f;
}

.cache-result-ok {
  color: #0f7b0f;
}

.cache-result-fail {
  color: #c42b1c;
}

:global(html.theme-dark) .cache-result-ok {
  color: #6ccb5f;
}

.about-section-title {
  font-size: 14px;
  font-weight: 600;
  margin-top: 32px;
}

.about-controls {
  display: flex;
  flex-direction: column;
  margin-top: 6px;
}

/* 回声洞：独立分组标题 + 展开项容器（与「关于」区的排法一致） */
.echo-section-title {
  font-size: 14px;
  font-weight: 600;
  margin-top: 32px;
}

.echo-controls {
  display: flex;
  flex-direction: column;
  margin-top: 6px;
}

.echo-controls :deep(.win-expander) {
  margin-bottom: 4px;
}

.about-controls :deep(.win-expander-header-controls .win-btn) {
  white-space: nowrap;
}

/* 法律三件套链接行：三个按钮横排，窄屏自动换行 */
.legal-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.about-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 鸣谢卡片（文字在根目录「鸣谢文本.ts」） */
.credits-card {
  box-sizing: border-box;
  border: 1px solid var(--CardStrokeColorDefaultBrush, var(--card-stroke, rgba(128, 128, 128, 0.4)));
  border-radius: 8px;
  background: var(--CardBackgroundFillColorDefaultBrush, var(--card-bg, transparent));
  margin-top: 4px;
  padding: 12px 16px 14px;
}

.credits-card-title {
  color: var(--TextFillColorPrimaryBrush, var(--text-primary));
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.credits-card-intro {
  color: var(--TextFillColorSecondaryBrush, var(--text-secondary));
  font-size: 12px;
  line-height: 18px;
  margin-top: 2px;
}

.credits-people {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.credits-person {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.credits-person-name {
  color: var(--TextFillColorPrimaryBrush, var(--text-primary));
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
  white-space: nowrap;
}

/* 可点击的贡献者名字：用两个类提高优先级，覆盖 WinHyperlinkButton 自带的
   内边距与字号，使其在列表中与普通名字样式一致，仅颜色为强调色 */
.credits-person .credits-person-link {
  padding: 0;
  min-height: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
  white-space: nowrap;
  justify-content: flex-start;
}

.credits-person-note {
  color: var(--TextFillColorSecondaryBrush, var(--text-secondary));
  font-size: 12px;
  line-height: 18px;
}

.credits-empty {
  color: var(--TextFillColorSecondaryBrush, var(--text-secondary));
  font-size: 12px;
  margin-top: 8px;
}

/* 鸣谢分组：组标题 + 细分割线，行距与颜色沿用原有变量，深浅色主题自适应 */
.credits-group {
  margin-top: 10px;
}

.credits-group + .credits-group {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--CardStrokeColorDefaultBrush, var(--card-stroke, rgba(128, 128, 128, 0.28)));
}

.credits-group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--TextFillColorPrimaryBrush, var(--text-primary));
  font-size: 12.5px;
  font-weight: 600;
  line-height: 18px;
}

.credits-group-title::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--CardStrokeColorDefaultBrush, var(--card-stroke, rgba(128, 128, 128, 0.28)));
  opacity: 0.6;
}

.credits-group .credits-people {
  margin-top: 8px;
}

/* 关于页·鸣谢下方的访问量与运行时长板块：独立卡片，文字颜色跟随主题 */
.visitor-stat-card {
  margin-top: 6px;
  padding: 12px 16px;
  border: 1px solid var(--CardStrokeColorDefaultBrush, var(--card-stroke, rgba(128, 128, 128, 0.4)));
  border-radius: 8px;
  background: var(--CardBackgroundFillColorDefaultBrush, var(--card-bg, rgba(255, 255, 255, 0.04)));
  color: var(--TextFillColorPrimaryBrush, var(--text-primary, #1f1f1f));
}
.visitor-stat-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--TextFillColorPrimaryBrush, var(--text-primary, #1f1f1f));
}

/* 运行时长：与上面访问量用一条细分隔线隔开，同卡片内 */
.visitor-stat-uptime {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--CardStrokeColorDefaultBrush, var(--card-stroke, rgba(128, 128, 128, 0.25)));
  font-size: 13px;
  color: var(--TextFillColorPrimaryBrush, var(--text-primary, #1f1f1f));
}
.visitor-stat-uptime-label {
  opacity: 0.85;
}
.visitor-stat-uptime-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
