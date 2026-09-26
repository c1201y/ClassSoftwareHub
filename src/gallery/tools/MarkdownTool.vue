<template>
  <ToolShell
    title="Markdown 预览"
    subtitle="左边写 Markdown，右边实时预览。写通知、说明文档、README 时很方便。">
    <div class="md-split">
      <div class="tool-panel md-pane">
        <div class="md-pane-head">
          <span class="tool-section-title">Markdown</span>
          <div class="tool-row">
            <WinButton FontSize="13" Padding="10,0,10,0" Content="示例" @Click="insertSample" />
            <WinButton FontSize="13" Padding="10,0,10,0" Content="复制源码" :IsEnabled="!!input" @Click="copy(input, 'Markdown')" />
            <WinButton FontSize="13" Padding="10,0,10,0" Content="复制 HTML" :IsEnabled="!!html" @Click="copy(html, 'HTML')" />
          </div>
        </div>
        <WinTextBox
          class="md-input"
          v-model:Text="input"
          :AcceptsReturn="true"
          TextWrapping="Wrap"
          :IsSpellCheckEnabled="false"
          PlaceholderText="# 标题&#10;&#10;正文…"
          FontFamily="Consolas, 'Courier New', monospace"
          :FontSize="13" />
      </div>

      <div class="tool-panel md-pane">
        <span class="tool-section-title">预览</span>
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

const { toast, copy } = useCopy();

const input = ref('# 你好，Markdown\n\n这是一个**实时预览**的编辑器。\n\n- 支持列表\n- 支持 `行内代码`\n\n> 引用也可以\n\n```js\nconsole.log("代码块");\n```');

/**
 * 渲染 + 消毒。
 *
 * ⚠️ `marked` **不做** HTML 消毒：它会把 Markdown 里原样的 HTML 直接放进输出，
 *    所以 `<img src=x onerror="alert(1)">` 会真的被执行。这里的输入目前只来自用户自己
 *    （属「自 XSS」，危害有限），但这个工具是公开的，一旦以后支持「从网址载入 md」
 *    「粘贴同学发来的文档」，就会变成可被利用的 XSS —— 所以渲染管线里就先把这扇门关上。
 *
 *    用 DOMPurify 而不是自己写白名单：手搓的标签/属性白名单是 XSS 的经典翻车点
 *    （`<svg>` 里的 `<script>`、`javascript:` 变形、属性里的换行……），
 *    这类过滤该交给专门维护的库。
 */
const html = computed(() => {
  try {
    const raw = marked.parse(input.value, { async: false }) as string;
    return DOMPurify.sanitize(raw, {
      // 只留「Markdown 会长出来」的标签，多一个都不给：没有 script / iframe / form / style
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'blockquote', 'pre', 'code',
        'ul', 'ol', 'li', 'strong', 'em', 'del', 's', 'a', 'img', 'table', 'thead', 'tbody',
        'tr', 'th', 'td', 'span', 'div', 'sup', 'sub', 'input'
      ],
      // `input` 是任务列表的复选框，只保留 type/checked/disabled，其余属性一律不留
      ALLOWED_ATTR: ['href', 'title', 'alt', 'src', 'class', 'type', 'checked', 'disabled', 'align'],
      ALLOW_DATA_ATTR: false,
    });
  } catch (err) {
    return `<p>渲染出错：${err instanceof Error ? err.message : String(err)}</p>`;
  }
});

const insertSample = () => {
  input.value = '# 标题\n\n正文段落，支持 **加粗**、*斜体*、`代码`。\n\n## 二级标题\n\n1. 第一项\n2. 第二项\n\n- [x] 已完成\n- [ ] 待办\n\n| 列 A | 列 B |\n| --- | --- |\n| 1 | 2 |\n\n[链接](https://example.com)\n';
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
