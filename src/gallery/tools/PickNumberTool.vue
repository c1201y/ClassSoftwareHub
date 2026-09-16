<template>
  <ToolShell
    title="随机抽号"
    subtitle="输入号码范围，一键抽号（比如学号 1~50）。号码用系统加密随机数抽取，绝对公平；也可用来随机分组。">
    <div class="tool-grid-2">
      <!-- ── 抽号 ───────────────────────────────────────────── -->
      <div class="tool-panel">
        <span class="tool-section-title">抽号设置</span>
        <div class="pick-range">
          <WinNumberBox class="pick-numbox" :Minimum="0" :SmallChange="1" v-model:Value="from" />
          <span class="pick-tilde">~</span>
          <WinNumberBox class="pick-numbox" :Minimum="0" :SmallChange="1" v-model:Value="to" />
        </div>
        <div class="tool-row pick-opt">
          <WinNumberBox class="pick-count" Header="抽几个" :Minimum="1" :SmallChange="1" v-model:Value="count" />
          <WinCheckBox Content="不重复（抽过的不再出现）" v-model:IsChecked="noRepeat" />
        </div>

        <div class="pick-start">
          <WinButton
            Style="AccentButtonStyle"
            Width="100%"
            :Content="rolling ? '抽号中…' : '开始抽号'"
            :IsEnabled="!rolling"
            @Click="start" />
        </div>

        <!-- 当前设置的白话总结：防止范围填错自己不知道 -->
        <div class="tool-hint pick-summary">
          本次设置：在 <b>{{ lo }}</b> ~ <b>{{ hi }}</b> 里抽 <b>{{ pickCount }}</b> 个号<span v-if="noRepeat">，抽过的不再出现</span>
        </div>

        <!-- 不重复模式：还剩多少号可抽（避免抽到快没号时结果看起来"很集中"） -->
        <div v-if="noRepeat" class="tool-hint pick-remain">
          范围内还剩 <b>{{ remain }}</b> 个号没抽过<template v-if="usedInRange">（已抽 {{ usedInRange }} 个）</template>
          <template v-if="remain === 0"> —— 想再来一轮请点下面的「重置记录」</template>
        </div>

        <div class="pick-result-box">
          <div v-if="result.length" class="pick-result" :class="{ rolling }">
            <span v-for="(n, i) in result" :key="i" class="pick-num">{{ n }}</span>
          </div>
          <div v-else class="tool-hint">结果会显示在这里</div>
        </div>

        <div v-if="error" class="pick-error">{{ error }}</div>

        <div v-if="used.length" class="pick-used">
          <div class="pick-used-head">
            <span class="tool-hint">已抽 {{ used.length }} 个：{{ used.join('、') }}</span>
            <WinButton Content="重置记录" @Click="resetUsed" />
          </div>
        </div>

        <!-- 公平性自检：当场抽 2 万次，看分布平不平（给"这抽号是不是有问题"一个答案） -->
        <div class="pick-checkbar">
          <WinButton Content="公平性自检" @Click="runFairCheck" />
          <span class="tool-hint">在本机实抽 2 万次，看分布平不平</span>
        </div>
        <div v-if="fairCheck" class="pick-hist">
          <div class="pick-hist-chart">
            <div v-for="b in fairCheck.bars" :key="b.label" class="pick-hist-col" :title="`${b.label}：${b.count} 次`">
              <div class="pick-hist-bar" :style="{ height: b.pct + '%' }" />
              <span class="pick-hist-label">{{ b.label }}</span>
            </div>
          </div>
          <div class="tool-hint pick-hist-note">{{ fairCheck.note }}</div>
        </div>
      </div>

      <!-- ── 分组 ───────────────────────────────────────────── -->
      <div class="tool-panel">
        <span class="tool-section-title">随机分组</span>
        <div class="tool-row">
          <WinComboBox
            class="pick-gmode"
            Width="100%"
            :ItemsSource="GROUP_ITEMS"
            DisplayMemberPath="label"
            v-model:SelectedIndex="groupModeIndex" />
          <WinNumberBox class="pick-count" :Minimum="1" :SmallChange="1" v-model:Value="groupValue" />
        </div>
        <div class="tool-hint pick-ghint">范围沿用上面的 {{ from }} ~ {{ to }}</div>
        <div class="pick-start">
          <WinButton Width="100%" Content="开始分组" @Click="doGroup" />
        </div>

        <div v-if="groups.length" class="pick-groups">
          <div v-for="(g, i) in groups" :key="i" class="pick-group">
            <span class="pick-group-title">第 {{ i + 1 }} 组 · {{ g.length }} 人</span>
            <span class="pick-group-nums">
              <span v-for="n in g" :key="n" class="pick-chip">{{ n }}</span>
            </span>
          </div>
        </div>
        <div v-else class="tool-hint">分组结果会显示在这里</div>
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

const { toast } = useCopy();

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

/** 加密随机整数 [0, n) —— 用 getRandomValues，比 Math.random 公平 */
const randInt = (n: number) => {
  if (n <= 1) return 0;
  const limit = Math.floor(4294967295 / n) * n;
  const buf = new Uint32Array(1);
  let v = 0;
  do {
    crypto.getRandomValues(buf);
    v = buf[0];
  } while (v >= limit);
  return v % n;
};

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
  const k = Math.max(1, Math.floor(count.value || 1));
  const size = poolSize.value;
  if (size <= 1) {
    error.value = '请填写有效的号码范围（如 1 ~ 50）';
    return;
  }
  if (k > size) {
    error.value = `一次最多抽 ${size} 个号`;
    return;
  }
  if (noRepeat.value && used.value.filter((n) => n >= lo.value && n <= hi.value).length + k > size) {
    error.value = '范围内号码不够了，点「重置记录」再来一轮';
    return;
  }

  const final = pickOnce(k);
  if (!final) {
    error.value = '抽号失败，请检查范围与数量';
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
  toast.value = '已重置抽号记录';
};

/** 本次会抽几个（界面上显示的，跟 start 里保持一致） */
const pickCount = computed(() => Math.max(1, Math.floor(count.value || 1)));

/** 当前范围内已经抽过的个数 */
const usedInRange = computed(() => {
  const loV = lo.value;
  const hiV = hi.value;
  return new Set(used.value.filter((n) => n >= loV && n <= hiV)).size;
});

/** 不重复模式下还剩几个号可抽 */
const remain = computed(() => Math.max(0, poolSize.value - usedInRange.value));

/* ── 公平性自检：实抽 2 万次，看分布平不平 ────────────────────── */
interface FairBar {
  label: string;
  count: number;
  /** 柱子高度百分比（相对最高的那根） */
  pct: number;
}
const fairCheck = ref<{ bars: FairBar[]; note: string } | null>(null);

const runFairCheck = () => {
  const size = poolSize.value;
  if (size <= 1) {
    toast.value = '请先填有效的号码范围';
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
  // 卡方 < 27.9 = 自由度 9、p=0.001 的临界值，低于它说明均匀得很正常
  const normal = chi < 27.9;
  fairCheck.value = {
    bars,
    note:
      `实抽 ${total.toLocaleString()} 次，分成 ${buckets} 格，每格理论约 ${Math.round(expect)} 次；` +
      `实际 ${Math.min(...counts)} ~ ${Math.max(...counts)} 次（卡方 ${chi.toFixed(1)}，${normal ? '分布正常' : '这次偏了一点，再点一次看看'}）`
  };
};

/* ── 分组 ─────────────────────────────────────────────────────── */
const groupMode = ref<'byGroups' | 'perGroup'>('byGroups');
const groupValue = ref(4);
const GROUP_ITEMS: { value: 'byGroups' | 'perGroup'; label: string }[] = [
  { value: 'byGroups', label: '按组数（分成 N 组）' },
  { value: 'perGroup', label: '按人数（每组 N 人）' }
];
const groupModeIndex = computed({
  get: () => Math.max(0, GROUP_ITEMS.findIndex((i) => i.value === groupMode.value)),
  set: (i: number) => {
    const o = GROUP_ITEMS[i];
    if (o) groupMode.value = o.value;
  }
});
const groups = ref<number[][]>([]);

const doGroup = () => {
  const size = poolSize.value;
  const v = Math.max(1, Math.floor(groupValue.value || 1));
  if (size <= 1) {
    toast.value = '请填写有效的号码范围';
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
