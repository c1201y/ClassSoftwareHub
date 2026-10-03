<template>
  <!--
    回声洞（照桌面端 2026-10-03 定稿的形态，同 ClassIsland）：
    一个可以下拉的展开项 —— 收起时只有表头一行；展开后正文整块可点、点一下换一条，
    「投稿」按钮在右边，点了弹一个小面板（输入一句话 + 提交），不开新页面。
  -->
  <WinExpander
    class="echo-expander"
    :Header="t('echo-cave.title')"
    :Description="t('echo-cave.description')"
    HeaderIcon="&#xE8BD;">
    <div class="ec-body">
      <!-- 正文：整块可点（原生 button 去外观，只留悬停底色 + 手型光标，没有框）
           ⛔ 这一片**只许出现字条本身** —— 条数 / 取数状态 / 报错 / 投稿回执都不在这儿
           （2026-10-03 Nick：「这一片永远不要显示文字，要最纯粹的回声洞」）。回执在投稿面板里。 -->
      <button
        type="button"
        class="ec-stage"
        :aria-busy="typing"
        @click="next">
        <p class="ec-text" :class="{ 'is-empty': messages.length === 0 }">{{ displayText }}</p>
      </button>

      <!-- 投稿：右侧按钮 → 主题自带的 WinFlyout
           —— 它就是桌面端那个 <Flyout Placement="Bottom"> 的等价物：空间不够时自动翻到按钮上方、
           再按视口夹取，绝不会像原来那个 position:absolute 的面板一样被屏幕下沿切掉
           （2026-10-03 Nick：点了投稿，面板飞到屏幕下方被挡起来了）。
           ⛔ 别退回手写绝对定位面板，也别自己写点外关闭 / Esc —— 这些 WinFlyout 全带。 -->
      <div class="ec-side">
        <WinFlyout
          v-model:IsOpen="flyoutOpen"
          Placement="Bottom"
          @Closed="onFlyoutClosed">
          <template #trigger>
            <WinButton
              class="ec-submit"
              :Content="t('echo-cave.submit-short')"
              @Click="toggleFlyout" />
          </template>

          <div class="ec-flyout-body" role="dialog" :aria-label="t('echo-cave.submit-title')">
            <div class="ec-flyout-title">{{ t('echo-cave.submit-title') }}</div>
            <textarea
              v-model="draftText"
              class="ec-input"
              rows="3"
              maxlength="200"
              :placeholder="t('echo-cave.submit-placeholder')"
              @keydown.enter.exact.prevent="submit"></textarea>
            <p
              v-if="flyoutStatus"
              class="ec-flyout-status"
              :class="{ 'is-error': flyoutIsError }">{{ flyoutStatus }}</p>
            <div class="ec-flyout-actions">
              <!-- 投稿服务连不上时的兜底：GitHub 上新建字条文件 -->
              <WinHyperlinkButton
                v-if="showFallback"
                class="ec-fallback"
                :NavigateUri="submitUrl"
                TargetName="_blank"
                Padding="0"
                Margin="0"
                :Content="t('echo-cave.submit-fallback')" />
              <WinButton
                class="ec-send"
                Style="AccentButtonStyle"
                :Content="submitting ? t('echo-cave.submit-sending') : t('echo-cave.submit-send')"
                :IsEnabled="!submitting"
                @Click="submit" />
            </div>
          </div>
        </WinFlyout>
      </div>
    </div>
  </WinExpander>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import WinExpander from '../components/WinExpander.vue';
import WinButton from '../components/WinButton.vue';
import WinFlyout from '../components/WinFlyout.vue';
import WinHyperlinkButton from '../components/WinHyperlinkButton.vue';
import { useI18n } from '../components/i18n/index';

const { t } = useI18n();

// 一条一个文件：回声洞/messages/message1.json、message2.json……
// 用 glob 在构建期收整个目录，所以「加一条字条」= 加一个文件，不用改代码。
const files = import.meta.glob<{ default: { text?: string } }>('../../回声洞/messages/*.json', {
  eager: true,
});

/** message7.json → 7，按文件名里的编号排序 */
const numberOf = (filePath: string) => {
  const matched = /message(\d+)\.json$/i.exec(filePath);
  return matched ? Number(matched[1]) : Number.MAX_SAFE_INTEGER;
};

const messages = Object.keys(files)
  .sort((a, b) => numberOf(a) - numberOf(b))
  .map((path) => String(files[path]?.default?.text ?? '').trim())
  .filter((text) => text.length > 0);

// 打字节奏照 ClassIsland 的 TypingControl：清空 → 停 150ms → 每字 40ms；
// 光标 "_" 不是逐字闪，是每 10 个字翻一次。
const CLEAR_DELAY = 150;
const CHAR_DELAY = 40;
const BLINK_EVERY = 10;

const queue = ref<string[]>([]); // 本轮洗好的队列：抽一条少一条
const typing = ref(false);

// 展开时的默认文字（Nick 指定原文，别改）：第一次点击之前一直显示这句
const displayText = ref(t('echo-cave.placeholder'));

// 打字“代数”：每次开打 +1，上一遍发现代数变了就自己停
let generation = 0;

/** Fisher-Yates 洗牌 */
const shuffle = (list: string[]) => {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** 取下一条；这一轮抽完才重洗 —— 一轮之内不重复 */
const takeNext = (): string | null => {
  if (messages.length === 0) return null;
  if (queue.value.length === 0) queue.value = shuffle(messages);
  return queue.value.shift() ?? null;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 逐字打出来；被打断（离开页面）时不写最终文本 */
const typeOut = async (text: string) => {
  const my = ++generation;
  typing.value = true;
  try {
    displayText.value = '';
    await sleep(CLEAR_DELAY);
    if (my !== generation) return;

    for (let i = 0; i < text.length; i++) {
      displayText.value = text.slice(0, i) + (Math.floor(i / BLINK_EVERY) % 2 === 0 ? '_' : '');
      await sleep(CHAR_DELAY);
      if (my !== generation) return;
    }
    displayText.value = text; // 收尾补全，把可能留着的光标去掉
  } finally {
    if (my === generation) typing.value = false;
  }
};

const next = async () => {
  if (typing.value || messages.length === 0) return; // 打字期间再点无效（同 ClassIsland 的 IsBusy）
  const text = takeNext();
  if (!text) return;
  await typeOut(text);
};

// ══════════ 投稿 ══════════

// 提交入口与「提交软件」页同一套（SubmitPage.vue）：记忆入口也共用同一个 localStorage key
const SUBMIT_ENDPOINTS = ['https://cshapi.132614.xyz', 'https://submit.132614.xyz'];
const SUBMIT_TIMEOUT_MS = 10000;
const ENDPOINT_CACHE_KEY = 'csh-submit-endpoint';

// 兜底：GitHub 上字条目录的「新建文件」页
const submitUrl =
  'https://github.com/c1201y/ClassSoftwareHub/new/main/' + encodeURIComponent('回声洞/messages');

// 面板开关全权交给 WinFlyout（v-model:IsOpen）：置 true 打开、置 false 收起
const flyoutOpen = ref(false);
const draftText = ref('');
const flyoutStatus = ref('');
const flyoutIsError = ref(false);
const showFallback = ref(false);
const submitting = ref(false);

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
 * 向单个入口发一次回声洞投稿（带超时）。
 * 只认投稿接口的 JSON 应答；连不上 / 超时 / 拿到 HTML 错误页都算该入口不可用，换下一个。
 */
async function postEcho(base: string, text: string): Promise<{ message?: string }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/echocave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal
    });
    const data = (await res.json()) as { success?: boolean; message?: string; error?: string };
    if (data?.success === true) {
      rememberEndpoint(base);
      return data;
    }
    if (typeof data?.error === 'string' && data.error) {
      throw new DefinitiveError(data.error);
    }
    throw new Error('unexpected-reply');
  } finally {
    window.clearTimeout(timer);
  }
}

// 点面板外面收起（轻确认）与 Esc 关闭都由 WinFlyout 自己负责，这边只管开关与内容复位。

const closeFlyout = () => {
  flyoutOpen.value = false;
};

/** WinFlyout 每次收起都记一笔 —— 给下面那个「刚收起又被 click 弹开」的补丁用 */
let dismissedAt = 0;
const onFlyoutClosed = () => {
  dismissedAt = performance.now();
};

/**
 * 点「投稿」按钮。
 * ⚠️ 面板开着时，按下鼠标那一下是被 WinFlyout 的轻确认层接走的（它先把面板收起来），
 * 紧接着浏览器还会把这次 click 补发给按钮 —— 不挡一下就会「刚收起又弹开」，看着像关不掉。
 * 所以刚被收起的那一下点击直接忽略。
 */
const toggleFlyout = () => {
  if (flyoutOpen.value) {
    closeFlyout();
    return;
  }
  if (performance.now() - dismissedAt < 300) return;

  flyoutStatus.value = '';
  flyoutIsError.value = false;
  showFallback.value = false;
  flyoutOpen.value = true;
};

const submit = async () => {
  const text = draftText.value.trim();
  if (!text) {
    flyoutIsError.value = true;
    flyoutStatus.value = t('echo-cave.submit-empty');
    return;
  }
  if (submitting.value) return;

  submitting.value = true;
  flyoutStatus.value = '';
  flyoutIsError.value = false;
  try {
    let lastError: unknown = new Error('no-endpoint');
    for (const base of orderedEndpoints()) {
      try {
        const reply = await postEcho(base, text);
        // 成功：清空输入，回执**就地留在面板里**（卡面不写任何状态字），看一眼够了再自己收起
        draftText.value = '';
        flyoutStatus.value = reply.message?.trim() || t('echo-cave.submit-ok');
        flyoutIsError.value = false;
        showFallback.value = false;
        window.setTimeout(() => closeFlyout(), 1800);
        return;
      } catch (err) {
        lastError = err;
        if (err instanceof DefinitiveError) break; // 服务端明确拒绝，换入口也没用
      }
    }
    flyoutIsError.value = true;
    const detail = lastError instanceof DefinitiveError ? lastError.message : '';
    flyoutStatus.value = detail || t('echo-cave.submit-failed');
    showFallback.value = true;
  } finally {
    submitting.value = false;
  }
};

onBeforeUnmount(() => {
  generation++; // 让正在跑的那一遍打字作废
  typing.value = false;
  closeFlyout();
});
</script>

<style scoped>
/* ══════════ 展开区布局：正文占满，投稿按钮在右 ══════════ */
.ec-body {
  display: flex;
  align-items: stretch;
  gap: 12px;
}

/* 正文：整块可点（原生 button 去外观），hover 只给底色，不画框 */
.ec-stage {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  margin: 0;
  padding: 10px 12px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s ease;
}

.ec-stage:hover {
  background: var(--subtle-secondary, rgba(128, 128, 128, 0.08));
}

.ec-stage:active {
  background: var(--subtle-tertiary, rgba(128, 128, 128, 0.12));
}

.ec-stage:focus-visible {
  outline: 2px solid var(--accent, #0078d4);
  outline-offset: 1px;
}

.ec-text {
  margin: 0;
  min-height: 22px;
  font-size: 14px;
  line-height: 22px;
  color: var(--TextFillColorPrimaryBrush, var(--text-primary, #1f1f1f));
  white-space: pre-wrap;
  word-break: break-word;
}

/* 空洞时正文用次级色，别让人以为那是真发言 */
.ec-text.is-empty {
  color: var(--TextFillColorSecondaryBrush, var(--text-secondary, #5f5f5f));
}

/* ══════════ 投稿按钮 + 小面板 ══════════ */
.ec-side {
  display: flex;
  align-items: flex-start;
  flex-shrink: 0;
}

/* 面板内容：外壳（边框 / 圆角 / 阴影 / 定位 / 翻转换边 / 轻确认）全部归 WinFlyout。
   ⛔ 这里**再也不要**写 position / top / right / background / box-shadow ——
   原来的手写绝对定位面板就是栽在这上面：贴在按钮下沿往下弹，页面底部那一行直接被屏幕切掉。 */
.ec-flyout-body {
  width: 320px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ec-flyout-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: var(--TextFillColorPrimaryBrush, var(--text-primary, #1f1f1f));
}

.ec-input {
  box-sizing: border-box;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--ControlStrokeColorDefaultBrush, var(--card-stroke, rgba(128, 128, 128, 0.4)));
  border-bottom-color: var(--ControlStrokeColorSecondaryBrush, rgba(128, 128, 128, 0.6));
  border-radius: 4px;
  background: var(--ControlFillColorDefaultBrush, var(--card-bg, rgba(255, 255, 255, 0.04)));
  color: var(--TextFillColorPrimaryBrush, var(--text-primary, #1f1f1f));
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  resize: vertical;
  min-height: 64px;
}

.ec-input:focus {
  outline: none;
  border-bottom-width: 2px;
  border-bottom-color: var(--accent, #0078d4);
}

.ec-input::placeholder {
  color: var(--TextFillColorSecondaryBrush, var(--text-secondary, #5f5f5f));
}

.ec-flyout-status {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--TextFillColorSecondaryBrush, var(--text-secondary, #5f5f5f));
}

.ec-flyout-status.is-error {
  color: var(--SystemFillColorCriticalBrush, #c42b1c);
}

.ec-flyout-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.ec-flyout-actions :deep(.win-hyperlink-button) {
  font-size: 12px;
}

.ec-send {
  margin-left: auto;
}
</style>
