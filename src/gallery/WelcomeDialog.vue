<!-- 欢迎弹窗：进入网站（初始落在首页）时弹出一次。
     文案在根目录 文字设置.ts 的 welcome.* 键（英文在 en-US/Resources.ts）；
     表情图 = src/assets/welcome-sticker.gif（同名覆盖即可换图）；
     五个外链：仓库地址 / 作者首页 = about.repository-url / about.author-home-url；
               相关文章 = welcome.article + welcome.article-url；
               QQ 群 = about.qq-group + about.qq-group-url；
               投喂作者 = about.reward + about.reward-url。 -->
<template>
  <WinContentDialog
    :IsOpen="open"
    :Title="t('welcome.hello')"
    TitleFontSize="40"
    :PrimaryButtonText="t('welcome.explore')"
    DefaultButton="Primary"
    @update:IsOpen="onOpenChange"
    @PrimaryButtonClick="onPrimaryClick">
    <div class="welcome-dialog-content">
      <WinImage class="welcome-dialog-sticker" :Source="sticker" Width="140" />
      <WinTextBlock class="welcome-dialog-intro" :Text="t('welcome.intro')" FontSize="15" />
      <div class="welcome-dialog-links">
        <WinHyperlinkButton
          :NavigateUri="t('about.repository-url')"
          TargetName="_blank"
          :Content="t('welcome.repository')"
          FontSize="14" />
        <span class="welcome-dialog-link-sep" aria-hidden="true">·</span>
        <WinHyperlinkButton
          :NavigateUri="t('about.author-home-url')"
          TargetName="_blank"
          :Content="t('about.author-home')"
          FontSize="14" />
        <span class="welcome-dialog-link-sep" aria-hidden="true">·</span>
        <WinHyperlinkButton
          :NavigateUri="t('welcome.article-url')"
          TargetName="_blank"
          :Content="t('welcome.article')"
          FontSize="14" />
        <span class="welcome-dialog-link-sep" aria-hidden="true">·</span>
        <WinHyperlinkButton
          :NavigateUri="t('about.qq-group-url')"
          TargetName="_blank"
          :Content="t('about.qq-group')"
          FontSize="14" />
        <span class="welcome-dialog-link-sep" aria-hidden="true">·</span>
        <WinHyperlinkButton
          :NavigateUri="t('about.reward-url')"
          TargetName="_blank"
          :Content="t('about.reward')"
          FontSize="14" />
      </div>
    </div>
  </WinContentDialog>
</template>

<script setup lang="ts">
import WinContentDialog from '../components/WinContentDialog.vue';
import WinTextBlock from '../components/WinTextBlock.vue';
import WinImage from '../components/WinImage.vue';
import WinHyperlinkButton from '../components/WinHyperlinkButton.vue';
import { useI18n } from '../components/i18n/index';
import sticker from '../assets/welcome-sticker.gif';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits(['update:open']);

const { t } = useI18n();

/** 弹窗被其它途径关闭（Esc/点遮罩等）→ 同步状态给父组件 */
const onOpenChange = (value: boolean) => {
  emit('update:open', value);
};

/** 点“开始探索下载~”：弹窗背后的首页已就绪，直接关闭即可 */
const onPrimaryClick = () => {
  emit('update:open', false);
};
</script>

<style scoped>
/* 弹窗内容整体居左（不居中） */
.welcome-dialog-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  padding-top: 4px;
}

.welcome-dialog-sticker {
  border-radius: 12px;
}

.welcome-dialog-intro {
  max-width: 460px;
  line-height: 24px;
}

.welcome-dialog-links {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 2px;
}

.welcome-dialog-link-sep {
  color: var(--TextFillColorSecondaryBrush, #8a8a8a);
}
</style>
