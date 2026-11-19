<template>
  <ToolShell
    :title="t('tool.pick-number.name')"
    :subtitle="t('tool.pick-number.subtitle')">
    <div class="tool-grid-2">
      <!-- ── 抽号 ───────────────────────────────────────────── -->
      <div class="tool-panel">
        <span class="tool-section-title">{{ t('pick.section') }}</span>
        <div class="pick-range">
          <WinNumberBox class="pick-numbox" :Minimum="0" :SmallChange="1" v-model:Value="from" />
          <span class="pick-tilde">~</span>
          <WinNumberBox class="pick-numbox" :Minimum="0" :SmallChange="1" v-model:Value="to" />
        </div>
        <div class="tool-row pick-opt">
          <WinNumberBox class="pick-count" :Header="t('pick.count')" :Minimum="1" :SmallChange="1" v-model:Value="count" />
          <WinCheckBox :Content="t('pick.no-repeat')" v-model:IsChecked="noRepeat" />
        </div>

        <div class="pick-start">
          <WinButton
            Style="AccentButtonStyle"
            Width="100%"
            :Content="rolling ? t('pick.rolling') : t('pick.start')"
            :IsEnabled="!rolling"
            @Click="start" />
        </div>

        <!-- 显示当前设置的摘要，便于发现范围填写错误 -->
        <div class="tool-hint pick-summary">
          {{ t('pick.summary', { lo, hi, count: pickCount }) }}<span v-if="noRepeat">{{ t('pick.summary-repeat') }}</span>
        </div>

        <!-- 不重复模式下显示剩余可抽号数，避免号码所剩无几时结果看似分布集中 -->
        <div v-if="noRepeat" class="tool-hint pick-remain">
          {{ t('pick.remain', { remain }) }}<template v-if="usedInRange">{{ t('pick.remain-used', { used: usedInRange }) }}</template>
          <template v-if="remain === 0">{{ t('pick.remain-empty') }}</template>
        </div>

        <div class="pick-result-box">
          <div v-if="result.length" class="pick-result" :class="{ rolling }">
            <span v-for="(n, i) in result" :key="i" class="pick-num">{{ n }}</span>
          </div>
          <div v-else class="tool-hint">{{ t('pick.result-empty') }}</div>
        </div>

        <div v-if="error" class="pick-error">{{ error }}</div>

        <div v-if="used.length" class="pick-used">
          <div class="pick-used-head">
            <span class="tool-hint">{{ t('pick.used', { count: used.length, list: used.join(listSep) }) }}</span>
            <WinButton :Content="t('pick.reset-used')" @Click="resetUsed" />
          </div>
        </div>

        <!-- 公平性自检：本机实抽两万次并统计分布，用于验证随机性是否均匀 -->
        <div class="pick-checkbar">
          <WinButton :Content="t('pick.fair-check')" @Click="runFairCheck" />
          <span class="tool-hint">{{ t('pick.fair-check-hint') }}</span>
        </div>
        <div v-if="fairCheck" class="pick-hist">
          <div class="pick-hist-chart">
            <div v-for="b in fairCheck.bars" :key="b.label" class="pick-hist-col" :title="t('pick.fair-title', { label: b.label, count: b.count })">
              <div class="pick-hist-bar" :style="{ height: b.pct + '%' }" />
              <span class="pick-hist-label">{{ b.label }}</span>
            </div>
          </div>
          <div class="tool-hint pick-hist-note">{{ fairCheck.note }}</div>
        </div>
      </div>

      <!-- ── 分组 ───────────────────────────────────────────── -->
      <div class="tool-panel">
        <span class="tool-section-title">{{ t('pick.group-section') }}</span>
        <div class="tool-row">
          <WinComboBox
            class="pick-gmode"
            Width="100%"
            :ItemsSource="GROUP_ITEMS"
            DisplayMemberPath="label"
            v-model:SelectedIndex="groupModeIndex" />
          <WinNumberBox class="pick-count" :Minimum="1" :SmallChange="1" v-model:Value="groupValue" />
        </div>
        <div class="tool-hint pick-ghint">{{ t('pick.group-hint', { from, to }) }}</div>
        <div class="pick-start">
          <WinButton Width="100%" :Content="t('pick.group-start')" @Click="doGroup" />
        </div>

        <div v-if="groups.length" class="pick-groups">
          <div v-for="(g, i) in groups" :key="i" class="pick-group">
            <span class="pick-group-title">{{ t('pick.group-title', { index: i + 1, count: g.length }) }}</span>
            <span class="pick-group-nums">
              <span v-for="n in g" :key="n" class="pick-chip">{{ n }}</span>
            </span>
          </div>
        </div>
        <div v-else class="tool-hint">{{ t('pick.group-empty') }}</div>
      </div>
    </div>

    <div v-if="toast" class="tool-toast" role="status">{{ toast }}</div>
  </ToolShell>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import ToolShell from './ToolShell.vue';
import { useCopy } from './useCopy';
import WinButton from '../../components/WinButton.vue';
import WinCheckBox from '../../components/WinCheckBox.vue';
import WinComboBox from '../../components/WinComboBox.vue';
import WinNumberBox from '../../components/WinNumberBox.vue';
import { useI18n } from '../../components/i18n/index';

const { t, locale } = useI18n();
const listSep = locale === 'en-US' ? ', ' : '、';
const { toast, flash } = useCopy();

const CFG_KEY = 'tool.pick.cfg';
const USED_KEY = 'tool.pick.used';

type Cfg = { from: number; to: number; count: number; noRepeat: boolean };

const loadCfg = (): Cfg => {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<Cfg>;
      return {
        from: Number(v.from) || 1,
        to: Number(v.to) || 50,
        count: Number(v.count) || 1,
        noRepeat: v.noRepeat !== false
      };
    }
  } catch {
    /* 忽略 */
  }
  return { from: 1, to: 50, count: 1, noRepeat: true };
};

const cfg = loadCfg();
const from = ref(cfg.from);
const to = ref(cfg.to);
const count = ref(cfg.count);
const noRepeat = ref(cfg.noRepeat);

const used = ref<number[]>([]);
try {
  const raw = localStorage.getItem(USED_KEY);
  if (raw) used.value = (JSON.parse(raw) as number[]).filter((n) => typeof n === 'number');
} catch {
  /* 忽略 */
}
watch(used, (v) => {
  try {
    localStorage.setItem(USED_KEY, JSON.stringify(v));
  } catch {
    /* 忽略 */
  }
}, { deep: true });

watch([from, to, count, noRepeat], () => {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify({ from: from.value, to: to.value, count: count.value, noRepeat: noRepeat.value }));
  } catch {
    /* 忽略 */
  }
});

const result = ref<number[]>([]);
const rolling = ref(false);
const error = ref('');
let timer: number | null = null;

const lo = computed(() => Math.min(Math.floor(from.value || 0), Math.floor(to.value || 0)));
const hi = computed(() => Math.max(Math.floor(from.value || 0), Math.floor(to.value || 0)));

/** 生成加密随机整数 [0, n)，使用 getRandomValues 保证分布均匀 */
const randInt = (n: number) => {
  if (!(n >= 1)) return 0;
  // n 超过 2^32 时 limit 为 0，while 循环条件恒成立会卡死页面，此时退化为 Math.random 兜底。
  if (n > 4294967295) return Math.floor(Math.random() * n);
  const limit = Math.floor(4294967295 / n) * n;
  const buf = new Uint32Array(1);
  let v = 0;
  do {
    crypto.getRandomValues(buf);
    v = buf[0];
  } while (v >= limit);
  return v % n;
};
const MAX_POOL = 100000;
const MAX_COUNT = 10000;
const poolTooBig = () => poolSize.value > MAX_POOL;

const poolSize = computed(() => hi.value - lo.value + 1);

const pickOnce = (k: number): number[] | null => {
  const size = poolSize.value;
  if (size <= 0) return null;
  if (k > size) return null;
  const available: number[] = [];
  if (noRepeat.value) {
    const usedSet = new Set(used.value);
    for (let n = lo.value; n <= hi.value; n++) if (!usedSet.has(n)) available.push(n);
    if (available.length < k) return null;
  } else {
    for (let n = lo.value; n <= hi.value; n++) available.push(n);
  }
  // Fisher–Yates（加密随机）
  for (let i = available.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    const t = available[i];
    available[i] = available[j];
    available[j] = t;
  }
  return available.slice(0, k);
};

const start = () => {
  error.value = '';
  const k = Math.min(MAX_COUNT, Math.max(1, Math.floor(count.value || 1)));
  const size = poolSize.value;
  if (size <= 1) {
    error.value = t('pick.error.range');
    return;
  }
  if (poolTooBig()) {
    error.value = t('pick.error.too-big', { max: MAX_POOL.toLocaleString(locale) });
    return;
  }
  if (k > size) {
    error.value = t('pick.error.count-over', { size });
    return;
  }
  if (noRepeat.value && used.value.filter((n) => n >= lo.value && n <= hi.value).length + k > size) {
    error.value = t('pick.error.not-enough');
    return;
  }

  const final = pickOnce(k);
  if (!final) {
    error.value = t('pick.error.failed');
    return;
  }

  rolling.value = true;
  let ticks = 0;
  if (timer) window.clearInterval(timer);
  timer = window.setInterval(() => {
    ticks += 1;
    result.value = Array.from({ length: k }, () => lo.value + randInt(size));
    if (ticks >= 16) {
      if (timer) window.clearInterval(timer);
      timer = null;
      result.value = final;
      rolling.value = false;
      if (noRepeat.value) used.value = [...used.value, ...final];
    }
  }, 65);
};

const resetUsed = () => {
  used.value = [];
  flash(t('pick.flash.reset'));
};

/** 本次抽取个数（与 start 中的逻辑保持一致，供界面显示） */
const pickCount = computed(() => Math.max(1, Math.floor(count.value || 1)));

/** 当前范围内已经抽过的个数 */
const usedInRange = computed(() => {
  const loV = lo.value;
  const hiV = hi.value;
  return new Set(used.value.filter((n) => n >= loV && n <= hiV)).size;
});

/** 不重复模式下剩余可抽取的号码数 */
const remain = computed(() => Math.max(0, poolSize.value - usedInRange.value));

/* ── 公平性自检：实抽两万次并统计分布 ────────────────────────── */
interface FairBar {
  label: string;
  count: number;
  /** 柱高百分比（以最高柱为基准） */
  pct: number;
}
const fairCheck = ref<{ bars: FairBar[]; note: string } | null>(null);

const runFairCheck = () => {
  const size = poolSize.value;
  if (size <= 1) {
    flash(t('pick.flash.range'), 2600);
    return;
  }
  if (poolTooBig()) {
    flash(t('pick.flash.too-big', { max: MAX_POOL.toLocaleString(locale) }), 2600);
    return;
  }
  const buckets = Math.min(10, size);
  const total = 20000;
  const counts = new Array<number>(buckets).fill(0);
  for (let i = 0; i < total; i++) {
    const v = lo.value + randInt(size);
    const bi = Math.min(buckets - 1, Math.floor(((v - lo.value) / size) * buckets));
    counts[bi]++;
  }
  const expect = total / buckets;
  let chi = 0;
  for (const c of counts) chi += ((c - expect) ** 2) / expect;
  const max = Math.max(...counts);
  const bars: FairBar[] = counts.map((c, i) => {
    const start = lo.value + Math.round((i * size) / buckets);
    const end = lo.value + Math.round(((i + 1) * size) / buckets) - 1;
    return { label: start === end ? String(start) : `${start}-${end}`, count: c, pct: Math.round((c / max) * 100) };
  });
  // 卡方值小于 27.9（自由度 9、p=0.001 的临界值）时视为分布均匀
  const normal = chi < 27.9;
  fairCheck.value = {
    bars,
    note: t('pick.fair.note', {
      total: total.toLocaleString(locale),
      buckets,
      expect: Math.round(expect),
      min: Math.min(...counts),
      max: Math.max(...counts),
      chi: chi.toFixed(1),
      verdict: normal ? t('pick.fair.normal') : t('pick.fair.off')
    })
  };
};

/* ── 分组 ─────────────────────────────────────────────────────── */
const groupMode = ref<'byGroups' | 'perGroup'>('byGroups');
const groupValue = ref(4);
const GROUP_ITEMS = computed<{ value: 'byGroups' | 'perGroup'; label: string }[]>(() => [
  { value: 'byGroups', label: t('pick.group-mode.byGroups') },
  { value: 'perGroup', label: t('pick.group-mode.perGroup') }
]);
const groupModeIndex = computed({
  get: () => Math.max(0, GROUP_ITEMS.value.findIndex((i) => i.value === groupMode.value)),
  set: (i: number) => {
    const o = GROUP_ITEMS.value[i];
    if (o) groupMode.value = o.value;
  }
});
const groups = ref<number[][]>([]);

const doGroup = () => {
  const size = poolSize.value;
  const v = Math.max(1, Math.floor(groupValue.value || 1));
  if (size <= 1) {
    flash(t('pick.flash.range'), 2600);
    return;
  }
  if (poolTooBig()) {
    flash(t('pick.flash.too-big', { max: MAX_POOL.toLocaleString(locale) }), 2600);
    return;
  }
  const nums: number[] = [];
  for (let n = lo.value; n <= hi.value; n++) nums.push(n);
  for (let i = nums.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    const t = nums[i];
    nums[i] = nums[j];
    nums[j] = t;
  }
  const gCount = groupMode.value === 'byGroups' ? Math.min(v, size) : Math.ceil(size / v);
  const out: number[][] = Array.from({ length: gCount }, () => []);
  nums.forEach((n, idx) => { out[idx % gCount].push(n); });
  out.forEach((g) => g.sort((a, b) => a - b));
  groups.value = out;
};

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
});
</script>

<style scoped>
.pick-range {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pick-numbox {
  flex: 1 1 0;
  min-width: 0;
}

.pick-tilde {
  color: var(--text-secondary);
}

.pick-opt {
  margin-top: 14px;
  align-items: flex-end;
}

.pick-field {
  flex: 0 0 96px;
}

.pick-count {
  width: 96px !important;
  flex: 0 0 96px;
}

.pick-check {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
}

.pick-start {
  margin-top: 16px;
  width: 100%;
}

.pick-result-box {
  margin-top: 14px;
  min-height: 104px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.04));
  padding: 14px;
}

.pick-result {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: 10px 20px;
}

.pick-num {
  font-size: 52px;
  font-weight: 600;
  line-height: 1.05;
  color: var(--accent-base, #0067C0);
  font-variant-numeric: tabular-nums;
}

.pick-result.rolling .pick-num {
  opacity: 0.72;
}

.pick-error {
  margin-top: 10px;
  font-size: 13px;
  color: var(--system-error, #c42b1c);
}

.pick-summary {
  margin-top: 10px;
}

.pick-remain {
  margin-top: 4px;
}

.pick-checkbar {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.pick-hist {
  margin-top: 10px;
}

.pick-hist-chart {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 96px;
  padding: 8px 10px 0;
  border-radius: 8px;
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.04));
}

.pick-hist-col {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  gap: 4px;
}

.pick-hist-bar {
  width: 100%;
  min-height: 2px;
  border-radius: 3px 3px 0 0;
  background: var(--accent-base, #0067c0);
  transition: height var(--faster-duration, 83ms) linear;
}

.pick-hist-label {
  flex: 0 0 auto;
  font-size: 10px;
  line-height: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.pick-hist-note {
  margin-top: 8px;
}

.pick-used {
  margin-top: 14px;
}

.pick-used-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pick-used-head .tool-hint {
  word-break: break-all;
}

.pick-gmode {
  flex: 1 1 180px;
}

.pick-ghint {
  margin-top: 10px;
}

.pick-groups {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pick-group {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.pick-group-title {
  flex: 0 0 auto;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  padding-top: 2px;
}

.pick-group-nums {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pick-chip {
  min-width: 28px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.06));
  font-size: 13px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
</style>
