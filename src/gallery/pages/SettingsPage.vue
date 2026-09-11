<template>
  <WinGrid class="settings-page-root" RowDefinitions="Auto,*">
    <WinTextBlock
      class="settings-page-header"
      AutomationProperties.HeadingLevel="Level1"
      FontSize="28"
      FontWeight="600"
      LineHeight="36"
      Margin="36,24,36,30"
      TextWrapping="NoWrap"
      :Text="$t('text.settings')" />
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
            <!-- 节日皮肤（补丁模块，见 src/gallery/holidayTheme.ts；不要可整块删掉） -->
            <WinExpander
              :Header="$t('text.holiday-skin')"
              :Description="$t('text.holiday-skin-desc')">
              <WinToggleSwitch
                :IsOn="holidaySkinEnabled"
                :OnContent="$t('text.on')"
                :OffContent="$t('text.off')"
                @Toggled="onHolidaySkinToggled" />
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
                  :NavigateUri="t('about.echo-cave-url')"
                  TargetName="_blank"
                  HorizontalAlignment="Left"
                  :Content="t('about.echo-cave')" />
                <WinHyperlinkButton
                  :NavigateUri="t('welcome.article-url')"
                  TargetName="_blank"
                  HorizontalAlignment="Left"
                  :Content="t('welcome.article')" />
                <WinHyperlinkButton
                  :NavigateUri="t('about.reward-url')"
                  TargetName="_blank"
                  HorizontalAlignment="Left"
                  :Content="t('about.reward')" />
              </div>
            </WinExpander>

            <!-- 鸣谢卡片：文字在根目录「鸣谢文本.ts」，加贡献人员去那个文件改 -->
            <div class="credits-card">
              <div class="credits-card-title">{{ credits.title }}</div>
              <div class="credits-card-intro">{{ credits.intro }}</div>
              <ul v-if="credits.people.length > 0" class="credits-people">
                <li v-for="person in credits.people" :key="person.name" class="credits-person">
                  <span class="credits-person-name">{{ person.name }}</span>
                  <span v-if="person.note" class="credits-person-note">{{ person.note }}</span>
                </li>
              </ul>
              <div v-else class="credits-empty">{{ credits.empty }}</div>
            </div>
          </div>
        </div>
      </div>
    </WinScrollViewer>
  </WinGrid>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
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
import appManifest from '../../manifest.json';
import { useI18n } from '../../components/i18n/index';
import credits from '../../../鸣谢文本';

const { t } = useI18n();

// App.vue 始终 provide 以下设置项（ref），这里按约定直接注入
const themeSetting = inject('themeSetting') as Ref<string>;
const materialSetting = inject('materialSetting') as Ref<string>;
const isHostedInUwpWebView = inject('isHostedInUwpWebView') as Ref<boolean>;
// 节日皮肤开关（补丁模块，App.vue 提供）
const holidaySkinEnabled = inject('holidaySkinEnabled') as Ref<boolean>;
const onHolidaySkinToggled = ({ IsOn }: { IsOn: boolean }) => {
  holidaySkinEnabled.value = IsOn;
};

const themeOptions = ['system', 'light', 'dark'];
const materialOptions = ['mica', 'acrylic'];
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

.about-controls :deep(.win-expander-header-controls .win-btn) {
  white-space: nowrap;
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
</style>
