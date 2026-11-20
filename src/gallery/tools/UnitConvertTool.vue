<template>
  <ToolShell
    :title="t('tool.unit-convert.name')"
    :subtitle="t('tool.unit-convert.subtitle')">
    <div class="tool-grid-2">
      <div class="tool-panel">
        <label class="tool-label" for="uc-cat">{{ t('unit-convert.category') }}</label>
        <select id="uc-cat" v-model="catId" class="tool-select">
          <option v-for="category in CATS" :key="category.id" :value="category.id">{{ t(`unit-convert.cat.${category.id}`) }}</option>
        </select>

        <label class="tool-label uc-value-label" for="uc-value">{{ t('unit-convert.value') }}</label>
        <input id="uc-value" v-model="input" class="tool-input mono" inputmode="decimal" spellcheck="false" />

        <div class="uc-fromto">
          <div class="uc-unit">
            <span class="tool-label">{{ t('unit-convert.from') }}</span>
            <select v-model="fromId" class="tool-select">
              <option v-for="unit in cat.units" :key="unit.id" :value="unit.id">{{ unit.id }}</option>
            </select>
          </div>
          <button type="button" class="tool-btn small uc-swap" :title="t('unit-convert.swap')" @click="swap">⇄</button>
          <div class="uc-unit">
            <span class="tool-label">{{ t('unit-convert.to') }}</span>
            <select v-model="toId" class="tool-select">
              <option v-for="unit in cat.units" :key="unit.id" :value="unit.id">{{ unit.id }}</option>
            </select>
          </div>
        </div>

        <div v-if="result !== null" class="uc-result">
          <span class="uc-result-value mono">{{ fmt(result) }}</span>
          <span class="uc-result-unit">{{ to.id }}</span>
        </div>
        <div v-else class="uc-error">{{ t('unit-convert.error') }}</div>
        <div class="tool-hint uc-formula">
          {{ input || '—' }} {{ from.id }} = {{ result !== null ? fmt(result) : '—' }} {{ to.id }}
        </div>
      </div>

      <div class="tool-panel">
        <span class="tool-section-title">{{ t('unit-convert.all') }}</span>
        <div v-if="rows.length" class="uc-rows">
          <button
            v-for="row in rows"
            :key="row.id"
            type="button"
            class="uc-row"
            :class="{ 'is-active': row.id === toId }"
            :title="t('unit-convert.copy-title', { unit: row.id })"
            @click="copyRow(row)">
            <span class="uc-row-unit">{{ row.id }}</span>
            <span class="uc-row-value mono">{{ fmt(row.value) }}</span>
          </button>
        </div>
        <div v-else class="tool-hint">{{ t('unit-convert.error') }}</div>
      </div>
    </div>

    <div class="tool-hint uc-note">{{ t('unit-convert.note') }}</div>

    <div v-if="toast" class="tool-toast" role="status">{{ toast }}</div>
  </ToolShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ToolShell from './ToolShell.vue';
import { useCopy } from './useCopy';
import { useI18n } from '../../components/i18n/index';

interface Unit {
  id: string;
  to: (value: number) => number;
  from: (value: number) => number;
}

interface Category {
  id: string;
  units: Unit[];
}

const linear = (id: string, factor: number): Unit => ({
  id,
  to: (value) => value * factor,
  from: (value) => value / factor
});

/** 以「每单位等于多少个基准单位」定义；温度需要偏移量，单独写 */
const CATS: Category[] = [
  {
    id: 'length',
    units: [
      linear('m', 1),
      linear('km', 1000),
      linear('cm', 0.01),
      linear('mm', 0.001),
      linear('mi', 1609.344),
      linear('yd', 0.9144),
      linear('ft', 0.3048),
      linear('in', 0.0254),
      linear('nmi', 1852)
    ]
  },
  {
    id: 'mass',
    units: [
      linear('kg', 1),
      linear('g', 0.001),
      linear('mg', 0.000001),
      linear('t', 1000),
      linear('lb', 0.45359237),
      linear('oz', 0.028349523125)
    ]
  },
  {
    id: 'area',
    units: [
      linear('m²', 1),
      linear('km²', 1e6),
      linear('cm²', 1e-4),
      linear('ha', 1e4),
      linear('acre', 4046.8564224),
      linear('ft²', 0.09290304),
      linear('in²', 0.00064516)
    ]
  },
  {
    id: 'volume',
    units: [
      linear('L', 1),
      linear('mL', 0.001),
      linear('m³', 1000),
      linear('cm³', 0.001),
      linear('gal', 3.785411784),
      linear('qt', 0.946352946),
      linear('fl oz', 0.0295735295625)
    ]
  },
  {
    id: 'temperature',
    units: [
      { id: '°C', to: (v) => v + 273.15, from: (v) => v - 273.15 },
      { id: '°F', to: (v) => (v + 459.67) * (5 / 9), from: (v) => v * (9 / 5) - 459.67 },
      { id: 'K', to: (v) => v, from: (v) => v }
    ]
  },
  {
    id: 'time',
    units: [
      linear('s', 1),
      linear('ms', 0.001),
      linear('min', 60),
      linear('h', 3600),
      linear('d', 86400),
      linear('wk', 604800)
    ]
  },
  {
    id: 'speed',
    units: [
      linear('m/s', 1),
      linear('km/h', 1 / 3.6),
      linear('mph', 0.44704),
      linear('kn', 0.5144444444)
    ]
  },
  {
    id: 'storage',
    units: [
      linear('B', 1),
      linear('KB', 1024),
      linear('MB', 1024 ** 2),
      linear('GB', 1024 ** 3),
      linear('TB', 1024 ** 4),
      linear('bit', 0.125)
    ]
  },
  {
    id: 'rate',
    units: [
      linear('bps', 1),
      linear('Kbps', 1e3),
      linear('Mbps', 1e6),
      linear('Gbps', 1e9),
      linear('KB/s', 8e3),
      linear('MB/s', 8e6),
      linear('GB/s', 8e9)
    ]
  },
  {
    id: 'energy',
    units: [
      linear('J', 1),
      linear('kJ', 1e3),
      linear('MJ', 1e6),
      linear('cal', 4.184),
      linear('kcal', 4184),
      linear('kWh', 3.6e6),
      linear('eV', 1.602176634e-19)
    ]
  },
  {
    id: 'pressure',
    units: [
      linear('Pa', 1),
      linear('kPa', 1e3),
      linear('MPa', 1e6),
      linear('bar', 1e5),
      linear('atm', 101325),
      linear('mmHg', 133.322387415),
      linear('psi', 6894.757293168)
    ]
  }
];

const { t, locale } = useI18n();
const { toast, copy } = useCopy();

const catId = ref('length');
const fromId = ref('m');
const toId = ref('km');
const input = ref('1');

const cat = computed(() => CATS.find((item) => item.id === catId.value) ?? CATS[0]);
const from = computed(() => cat.value.units.find((unit) => unit.id === fromId.value) ?? cat.value.units[0]);
const to = computed(() => cat.value.units.find((unit) => unit.id === toId.value) ?? cat.value.units[1] ?? cat.value.units[0]);

watch(catId, () => {
  const units = cat.value.units;
  fromId.value = units[0].id;
  toId.value = (units[1] ?? units[0]).id;
});

const value = computed(() => {
  const cleaned = input.value.replace(/[,\s_]/g, '');
  if (!cleaned) return Number.NaN;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
});

const baseValue = computed(() => (Number.isFinite(value.value) ? from.value.to(value.value) : Number.NaN));
const result = computed(() => (Number.isFinite(baseValue.value) ? to.value.from(baseValue.value) : null));
const rows = computed(() =>
  Number.isFinite(baseValue.value) ? cat.value.units.map((unit) => ({ id: unit.id, value: unit.from(baseValue.value) })) : []
);

const fmt = (value: number) => {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e15 || abs < 1e-9) return value.toExponential(6);
  return Number(value.toPrecision(10)).toLocaleString(locale, { maximumFractionDigits: 12, useGrouping: false });
};

const swap = () => {
  const previous = fromId.value;
  fromId.value = toId.value;
  toId.value = previous;
};

const copyRow = (row: { id: string; value: number }) => {
  void copy(fmt(row.value), row.id);
};
</script>

<style scoped>
.mono {
  font-family: Consolas, 'Courier New', monospace;
}

.uc-value-label {
  margin-top: 14px;
}

.uc-fromto {
  margin-top: 14px;
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.uc-unit {
  flex: 1 1 0;
  min-width: 0;
}

.uc-swap {
  margin-bottom: 0;
}

.uc-result {
  margin-top: 18px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 14px 16px;
  border-radius: 8px;
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.04));
  overflow: hidden;
}

.uc-result-value {
  font-size: 30px;
  font-weight: 600;
  line-height: 1.1;
  color: var(--accent-base, #0067c0);
  word-break: break-all;
}

.uc-result-unit {
  flex: 0 0 auto;
  font-size: 15px;
  color: var(--text-secondary);
}

.uc-error {
  margin-top: 18px;
  font-size: 13px;
  color: var(--system-error, #c42b1c);
}

.uc-formula {
  margin-top: 10px;
  word-break: break-all;
}

.uc-rows {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.uc-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: var(--ctrl-fill-secondary, rgba(0, 0, 0, 0.04));
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.uc-row:hover {
  border-color: var(--accent-base, #0067c0);
}

.uc-row.is-active {
  border-color: var(--accent-base, #0067c0);
  background: rgba(0, 103, 192, 0.1);
}

.uc-row-unit {
  flex: 0 0 auto;
  font-size: 13px;
  color: var(--text-secondary);
}

.uc-row-value {
  font-size: 14px;
  word-break: break-all;
  text-align: right;
}

.uc-note {
  margin-top: 14px;
}
</style>
