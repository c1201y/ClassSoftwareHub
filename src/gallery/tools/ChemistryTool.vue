<template>
  <ToolShell
    title="化学式配平"
    subtitle="输入未配平的化学方程式，自动算出各物质前的系数。支持常见元素与原子团，全部本地计算、不上传数据。">
    <div class="chem-input-row tool-row">
      <WinTextBox
        class="chem-input"
        :Text="equation"
        PlaceholderText="例如：H2 + O2 = H2O"
        @Update:Text="onInput" />
      <WinButton Content="配平" Style="AccentButtonStyle" @Click="balance" />
      <WinButton Content="清空" @Click="clear" />
    </div>

    <div class="chem-samples tool-row">
      <span class="tool-hint">试试：</span>
      <button
        v-for="s in SAMPLES"
        :key="s.eq"
        type="button"
        class="chem-sample"
        @click="loadSample(s.eq)">
        {{ s.label }}
      </button>
    </div>

    <!-- 结果 -->
    <div v-if="error" class="chem-error tool-panel">
      <span class="chem-error-icon" aria-hidden="true">&#xE7BA;</span>
      <span>{{ error }}</span>
    </div>

    <template v-else-if="result">
      <div class="chem-result tool-panel">
        <div class="chem-result-eq">
          <template v-for="(term, i) in result.terms" :key="i">
            <span v-if="i > 0" class="chem-op">{{ term.op === '=' ? ' → ' : ` + ` }}</span>
            <span class="chem-term">
              <span v-if="term.coef > 1" class="chem-coef">{{ term.coef }}</span>
              <span class="chem-formula">{{ term.label }}</span>
            </span>
          </template>
        </div>
        <div class="chem-result-meta">
          <span>{{ t('chem.balanced') }}</span>
          <button type="button" class="chem-copy" @click="copyResult">
            {{ copied ? t('chem.copied') : t('chem.copy') }}
          </button>
        </div>
      </div>

      <!-- 元素守恒表：让人能核对，而不是只信一个答案 -->
      <div class="chem-table-wrap tool-panel">
        <table class="chem-table">
          <thead>
            <tr>
              <th>{{ t('chem.element') }}</th>
              <th>{{ t('chem.left') }}</th>
              <th>{{ t('chem.right') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in result.elements" :key="row.symbol">
              <td class="chem-el">{{ row.symbol }}</td>
              <td>{{ row.left }}</td>
              <td>{{ row.right }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <p class="tool-hint chem-tip">{{ t('chem.tip') }}</p>
  </ToolShell>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ToolShell from './ToolShell.vue';
import WinButton from '../../components/WinButton.vue';
import WinTextBox from '../../components/WinTextBox.vue';
import { useI18n } from '../../components/i18n/index';

const { t } = useI18n();

const equation = ref('H2 + O2 = H2O');
const error = ref('');
const result = ref<BalanceResult | null>(null);
const copied = ref(false);

interface Term {
  /** 物质原始写法（含括号与下标数字原样） */
  formula: string;
  /** 显示用（下标还原为普通数字，界面用 <sub> 不现实，就直接写 H2O） */
  label: string;
  /** 元素 → 原子个数 */
  atoms: Record<string, number>;
  /** 位于等号哪一侧 */
  side: 'left' | 'right';
  /** 在显示序列中的分隔符 */
  op: '+' | '=';
}

interface BalanceResult {
  terms: { label: string; coef: number; op: '+' | '=' }[];
  elements: { symbol: string; left: number; right: number }[];
}

const SAMPLES = [
  { label: '氢气燃烧', eq: 'H2 + O2 = H2O' },
  { label: '铁生锈', eq: 'Fe + O2 = Fe2O3' },
  { label: '甲烷燃烧', eq: 'CH4 + O2 = CO2 + H2O' },
  { label: '高锰酸钾分解', eq: 'KMnO4 = K2MnO4 + MnO2 + O2' },
  { label: '盐酸中和', eq: 'HCl + NaOH = NaCl + H2O' },
  { label: '光合作用', eq: 'CO2 + H2O = C6H12O6 + O2' }
];

const onInput = (value: string) => {
  equation.value = value;
  error.value = '';
  result.value = null;
};

const loadSample = (eq: string) => {
  equation.value = eq;
  error.value = '';
  balance();
};

const clear = () => {
  equation.value = '';
  error.value = '';
  result.value = null;
};

/**
 * 解析一个化学式，返回元素 → 原子数。
 *
 * 支持：
 *   · 元素符号 H / Na / Cl（首字母大写，可跟一个小写）
 *   · 下标 H2 / C6H12O6
 *   · 括号 Ca(OH)2 / (NH4)2SO4
 *   · 前后带系数 2H2O（系数在这一步先剥掉，由配平求解）
 */
function parseFormula(raw: string): Record<string, number> | null {
  const s = raw.trim();
  if (!s) return null;

  let i = 0;
  const total: Record<string, number> = {};

  // 解析一段（可递归处理括号），返回该段的元素计数
  const parseGroup = (): Record<string, number> | null => {
    const out: Record<string, number> = {};
    while (i < s.length) {
      const ch = s[i];
      if (ch === '(') {
        i++;
        const inner = parseGroup();
        if (!inner) return null;
        if (s[i] !== ')') return null;
        i++;
        // 括号后的下标
        let num = '';
        while (i < s.length && /\d/.test(s[i])) num += s[i++];
        const mult = num ? Number(num) : 1;
        for (const [el, n] of Object.entries(inner)) out[el] = (out[el] ?? 0) + n * mult;
        continue;
      }
      if (ch === ')') return out;
      if (/[A-Z]/.test(ch)) {
        let el = ch;
        i++;
        while (i < s.length && /[a-z]/.test(s[i])) el += s[i++];
        let num = '';
        while (i < s.length && /\d/.test(s[i])) num += s[i++];
        out[el] = (out[el] ?? 0) + (num ? Number(num) : 1);
        continue;
      }
      // 其他字符（如空格、·、未知符号）视为非法
      return null;
    }
    return out;
  };

  const grouped = parseGroup();
  if (!grouped || i !== s.length) return null;
  Object.assign(total, grouped);
  return total;
}

/** 最大公约数 */
const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

/**
 * 求解配平系数。
 *
 * 做法：对每个元素建立「左边原子数 − 右边原子数 = 0」的线性方程，
 * 未知数是各物质的系数。用**高斯消元**把它化成行最简形，再取一组正整数解。
 *
 * 化学方程式的系数通常很小（≤ 20），所以：
 *   1. 先按整数运算消元（用分数避免浮点误差）；
 *   2. 自由变量从 1 开始逐个试探，找到第一个让所有系数都是正整数的组合。
 */
function solveCoefficients(terms: Term[]): number[] | null {
  const elements = [...new Set(terms.flatMap((t) => Object.keys(t.atoms)))];
  const n = terms.length;
  if (!n) return null;

  // 构造矩阵：每个元素一行，每列是该物质在该元素上的净贡献（左边正、右边负）
  const rows: number[][] = [];
  for (const el of elements) {
    const row: number[] = terms.map((term) => {
      const count = term.atoms[el] ?? 0;
      return term.side === 'left' ? count : -count;
    });
    if (row.some((v) => v !== 0)) rows.push(row);
  }
  if (!rows.length) return null;

  // 高斯消元 → 行最简形
  const mat = rows.map((r) => [...r]);
  const pivotCols: number[] = [];
  let row = 0;
  for (let col = 0; col < n && row < mat.length; col++) {
    let pivot = -1;
    for (let r = row; r < mat.length; r++) {
      if (Math.abs(mat[r][col]) > 1e-9) { pivot = r; break; }
    }
    if (pivot < 0) continue;
    [mat[row], mat[pivot]] = [mat[pivot], mat[row]];
    const div = mat[row][col];
    for (let c = 0; c < n; c++) mat[row][c] /= div;
    for (let r = 0; r < mat.length; r++) {
      if (r === row) continue;
      const factor = mat[r][col];
      if (Math.abs(factor) < 1e-12) continue;
      for (let c = 0; c < n; c++) mat[r][c] -= factor * mat[row][c];
    }
    pivotCols.push(col);
    row++;
  }

  const freeCols = [...Array(n).keys()].filter((c) => !pivotCols.includes(c));

  // 没有自由变量：只有全零解，说明方程本身不成立
  if (!freeCols.length) {
    // 检查是否已经全零（所有系数取 0 才成立 → 无意义）
    return null;
  }

  // 试探自由变量：从 1 起，最多试到 30（化学式的系数不会太大）
  const MAX = 30;
  const freeValues = new Array(freeCols.length).fill(1);

  const trySolve = (): number[] | null => {
    const coef = new Array(n).fill(0);
    freeCols.forEach((c, idx) => { coef[c] = freeValues[idx]; });
    // 从下往上回代：每个主元列由自由变量决定
    for (let r = pivotCols.length - 1; r >= 0; r--) {
      const pc = pivotCols[r];
      let sum = 0;
      for (let c = 0; c < n; c++) {
        if (c !== pc) sum += mat[r][c] * coef[c];
      }
      coef[pc] = -sum;
    }
    return coef;
  };

  // 枚举自由变量的取值组合（自由变量一般 1~2 个，不会爆炸）
  const search = (depth: number): number[] | null => {
    if (depth === freeCols.length) {
      const coef = trySolve();
      if (!coef) return null;
      const cleaned = coef.map((v) => Math.round(v * 1e6) / 1e6);
      if (!cleaned.every((v) => Number.isFinite(v) && v > 0)) return null;

      // ⚠️ 关键校验：某些自由变量的取值会得到「正数但每个元素都不守恒」的解
      //    （例：Al + HCl 那组里 Al=1,HCl=2 也是正数，但 H 与 Cl 都对不上）。
      //    消元只保证「解满足线性方程组」，而这里传入的是**非方阵**，
      //    自由变量随便取会给出一组看似合理、实际不满足方程的数。
      //    所以必须回代每一项元素、确认两边原子数真的相等。
      const balanced = elements.every((el) => {
        let left = 0;
        let right = 0;
        terms.forEach((term, idx) => {
          const count = (term.atoms[el] ?? 0) * cleaned[idx];
          if (term.side === 'left') left += count;
          else right += count;
        });
        return Math.abs(left - right) < 1e-6;
      });
      if (!balanced) return null;

      let denom = 1;
      for (const v of cleaned) {
        let d = 1;
        for (let cand = 1; cand <= 1000; cand++) {
          if (Math.abs(v * cand - Math.round(v * cand)) < 1e-6) { d = cand; break; }
        }
        denom = (denom * d) / gcd(denom, d);
      }
      const ints = cleaned.map((v) => Math.round(v * denom));
      if (!ints.every((v) => v > 0)) return null;
      let g = ints[0];
      for (const v of ints) g = gcd(g, v);
      return ints.map((v) => v / g);
    }
    for (let v = 1; v <= MAX; v++) {
      freeValues[depth] = v;
      const got = search(depth + 1);
      if (got) return got;
    }
    return null;
  };

  return search(0);
}

/** 把输入拆成物质列表 */
function parseEquation(input: string): { terms: Term[]; error: string } {
  const s = input.replace(/→|->/g, '=').trim();
  if (!s) return { terms: [], error: t('chem.error-empty') };

  const parts = s.split('=');
  if (parts.length !== 2) return { terms: [], error: t('chem.error-equals') };

  const terms: Term[] = [];
  let op: '+' | '=' = '=';

  for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
    const side = sideIdx === 0 ? 'left' : 'right';
    const chunks = parts[sideIdx].split('+').map((x) => x.trim()).filter(Boolean);
    if (!chunks.length) return { terms: [], error: t('chem.error-empty-side') };

    for (const chunk of chunks) {
      // 去掉手写的系数（配平会重新算）
      const body = chunk.replace(/^\d+/, '').trim();
      const atoms = parseFormula(body);
      if (!atoms) return { terms: [], error: t('chem.error-formula', { formula: chunk }) };
      terms.push({
        formula: body,
        label: body,
        atoms,
        side,
        op: terms.length === 0 ? '+' : side === 'right' && terms[terms.length - 1]?.side === 'left' ? '=' : '+'
      });
      void op;
    }
  }

  return { terms, error: '' };
}

const balance = () => {
  error.value = '';
  result.value = null;
  copied.value = false;

  const { terms, error: parseErr } = parseEquation(equation.value);
  if (parseErr) {
    error.value = parseErr;
    return;
  }

  const coef = solveCoefficients(terms);
  if (!coef || !coef.length) {
    error.value = t('chem.error-unsolvable');
    return;
  }

  // 组装显示序列
  const display: { label: string; coef: number; op: '+' | '=' }[] = [];
  terms.forEach((term, idx) => {
    display.push({
      label: term.label,
      coef: coef[idx],
      op: idx === 0 ? '+' : term.side === 'right' && terms[idx - 1].side === 'left' ? '=' : '+'
    });
  });

  // 元素守恒表
  const elements = [...new Set(terms.flatMap((x) => Object.keys(x.atoms)))].sort();
  const rows = elements.map((symbol) => {
    let left = 0;
    let right = 0;
    terms.forEach((term, idx) => {
      const count = (term.atoms[symbol] ?? 0) * coef[idx];
      if (term.side === 'left') left += count;
      else right += count;
    });
    return { symbol, left, right };
  });

  result.value = { terms: display, elements: rows };
};

const copyResult = async () => {
  if (!result.value) return;
  const text = result.value.terms
    .map((term, i) => {
      if (i === 0) return `${term.coef > 1 ? term.coef : ''}${term.label}`;
      return `${term.op === '=' ? '=' : '+'} ${term.coef > 1 ? term.coef : ''}${term.label}`;
    })
    .join(' ')
    .replace(/=\s/g, '= ');
  try {
    await navigator.clipboard.writeText(text);
    copied.value = true;
    window.setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    /* 剪贴板不可用时不提示 */
  }
};

balance();
</script>

<style scoped>
.chem-input-row {
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.chem-input {
  flex: 1 1 320px;
  min-width: 220px;
}

.chem-samples {
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-top: 4px;
}

.chem-sample {
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--card-border, #d8dde6);
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.chem-sample:hover {
  background: var(--subtle-fill, rgba(0, 0, 0, 0.05));
}

.chem-error {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 8px;
  border-left: 3px solid #d29922;
  background: rgba(210, 153, 34, 0.08);
  font-size: 14px;
}

.chem-error-icon {
  font-family: 'WinUIOnWebIcons';
  font-size: 16px;
}

.chem-result {
  padding: 18px 20px;
  border-radius: 8px;
  border: 1px solid var(--card-border, #d8dde6);
  background: var(--card-bg, #fff);
}

.chem-result-eq {
  font-size: 20px;
  line-height: 1.8;
  font-family: 'Cambria', 'Georgia', serif;
  word-break: break-word;
}

.chem-coef {
  color: var(--accent, #2563eb);
  font-weight: 700;
  margin-right: 1px;
}

.chem-op {
  color: var(--text-secondary, #6b7484);
  margin: 0 4px;
}

.chem-result-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-secondary, #6b7484);
}

.chem-copy {
  padding: 3px 10px;
  border-radius: 5px;
  border: 1px solid var(--card-border, #d8dde6);
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}

.chem-table-wrap {
  margin-top: 12px;
  overflow-x: auto;
}

.chem-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.chem-table th,
.chem-table td {
  padding: 7px 10px;
  text-align: center;
  border-bottom: 1px solid var(--card-border, #e6eaf1);
}

.chem-table th {
  color: var(--text-secondary, #6b7484);
  font-weight: 600;
}

.chem-el {
  font-family: 'Consolas', monospace;
  font-weight: 600;
}

.chem-tip {
  margin-top: 14px;
}
</style>
