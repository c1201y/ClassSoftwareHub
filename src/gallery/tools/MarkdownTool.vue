<template>
  <ToolShell
    :title="t('tool.markdown.name')"
    :subtitle="t('tool.markdown.subtitle')">
    <div class="md-split">
      <div class="tool-panel md-pane">
        <div class="md-pane-head">
          <span class="tool-section-title">Markdown</span>
          <div class="tool-row">
            <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('markdown.sample')" @Click="insertSample" />
            <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('markdown.copy-source')" :IsEnabled="!!input" @Click="copy(input, 'Markdown')" />
            <WinButton FontSize="13" Padding="10,0,10,0" :Content="t('markdown.copy-html')" :IsEnabled="!!html" @Click="copy(html, 'HTML')" />
          </div>
        </div>
        <WinTextBox
          class="md-input"
          v-model:Text="input"
          :AcceptsReturn="true"
          TextWrapping="Wrap"
          :IsSpellCheckEnabled="false"
          :PlaceholderText="t('markdown.placeholder')"
          FontFamily="Consolas, 'Courier New', monospace"
          :FontSize="13" />
      </div>

      <div class="tool-panel md-pane">
        <span class="tool-section-title">{{ t('markdown.preview') }}</span>
        <div class="md-body" v-html="html"></div>
      </div>
    </div>

    <div v-if="toast" class="tool-toast" role="status">{{ toast }}</div>
  </ToolShell>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import ToolShell from './ToolShell.vue';
import { useCopy } from './useCopy';
import WinTextBox from '../../components/WinTextBox.vue';
import WinButton from '../../components/WinButton.vue';
import { useI18n } from '../../components/i18n/index';

const { t } = useI18n();
const { toast, copy } = useCopy();

const input = ref(t('markdown.default-content'));

/**
 * 渲染 + 消毒。
 *
 * marked 不做 HTML 消毒：Markdown 中原样的 HTML 会直接进入输出，
 * 例如 <img src=x onerror="alert(1)"> 会被真实执行。当前输入只来自用户本人
 * （属于自 XSS，危害有限），但本工具是公开的，一旦后续支持从网址载入 Markdown
 * 或粘贴他人文档，就会变成可被利用的 XSS，因此在渲染管线中先行拦截。
 *
 * 使用 DOMPurify 而非自行编写白名单：手写的标签/属性白名单是 XSS 的常见薄弱点
 * （<svg> 内嵌 <script>、javascript: 变形、属性中的换行等），
 * 此类过滤应交给持续维护的专门库处理。
 */
const html = computed(() => {
  try {
    const raw = marked.parse(input.value, { async: false }) as string;
    return DOMPurify.sanitize(raw, {
      // 仅保留 Markdown 可生成的标签，不含 script / iframe / form / style
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'blockquote', 'pre', 'code',
        'ul', 'ol', 'li', 'strong', 'em', 'del', 's', 'a', 'img', 'table', 'thead', 'tbody',
        'tr', 'th', 'td', 'span', 'div', 'sup', 'sub', 'input'
      ],
      // input 为任务列表复选框所用标签，其余属性一律不保留
      ALLOWED_ATTR: ['href', 'title', 'alt', 'src', 'class', 'type', 'checked', 'disabled', 'align'],
      ALLOW_DATA_ATTR: false,
    });
  } catch (err) {
    return `<p>${t('markdown.error', { message: err instanceof Error ? err.message : String(err) })}</p>`;
  }
});

const insertSample = () => {
  input.value = t('markdown.sample-content');
};
</script>

<style scoped>
.md-split {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 16px;
}

.md-pane {
  display: flex;
  flex-direction: column;
}

.md-pane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.md-pane-head .tool-section-title {
  margin: 0;
}

.md-input {
  flex: 1 1 auto;
  min-height: 420px;
}

.md-input :deep(.win-textbox-textarea) {
  min-height: 420px;
}

.md-body {
  flex: 1 1 auto;
  min-height: 420px;
  overflow: auto;
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
  word-wrap: break-word;
}

.md-body :deep(h1),
.md-body :deep(h2),
.md-body :deep(h3) {
  margin: 18px 0 10px;
  line-height: 1.3;
}

.md-body :deep(h1) { font-size: 26px; border-bottom: 1px solid var(--stroke-divider, rgba(0, 0, 0, 0.1)); padding-bottom: 6px; }
.md-body :deep(h2) { font-size: 21px; border-bottom: 1px solid var(--stroke-divider, rgba(0, 0, 0, 0.08)); padding-bottom: 4px; }
.md-body :deep(h3) { font-size: 17px; }

.md-body :deep(p) { margin: 8px 0; }

.md-body :deep(code) {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.06));
  font-family: Consolas, 'Courier New', monospace;
  font-size: 13px;
}

.md-body :deep(pre) {
  padding: 12px 14px;
  border-radius: 6px;
  overflow: auto;
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.06));
}

.md-body :deep(pre code) {
  padding: 0;
  background: transparent;
}

.md-body :deep(blockquote) {
  margin: 10px 0;
  padding: 4px 14px;
  border-left: 3px solid var(--accent-base, #0067C0);
  color: var(--text-secondary);
}

.md-body :deep(table) {
  border-collapse: collapse;
  margin: 10px 0;
}

.md-body :deep(th),
.md-body :deep(td) {
  border: 1px solid var(--card-stroke, rgba(0, 0, 0, 0.15));
  padding: 5px 10px;
}

.md-body :deep(img) { max-width: 100%; }

.md-body :deep(a) { color: var(--accent-base, #0067C0); }
</style>
