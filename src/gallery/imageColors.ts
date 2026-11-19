
export interface Hsl {
  /** 色相 0–360 */
  h: number;
  /** 饱和度 0–100 */
  s: number;
  /** 亮度 0–100 */
  l: number;
}

export interface PaletteVariant {
  /** 变体代号，如 Light3 / Base / Dark1 */
  key: string;
  /** 中文标签，如「亮色 3」 */
  label: string;
  /** 相对基准色的亮度偏移 */
  delta: number;
  /** #RRGGBB */
  hex: string;
  /** HSL 数值 */
  hsl: Hsl;
  /** 便于直接显示/使用的 CSS 色值，如 hsl(210, 60%, 45%) */
  css: string;
}

export interface PaletteResult {
  /** 种子色（未做柔和化调整前的原始提取结果） */
  seedHex: string;
  seedHsl: Hsl;
  /** 柔和化后的基准色 */
  baseHex: string;
  baseHsl: Hsl;
  /** 7 个明暗变体：Light3 → Dark3 */
  variants: PaletteVariant[];
}

type Rgb = [number, number, number];

/** 判定「不透明」的 alpha 阈值：半透明边缘像素往往是脏色，直接跳过 */
const ALPHA_THRESHOLD = 125;
/** 中位切分的目标区域数（候选色个数） */
const TARGET_CLUSTERS = 8;
/** 柔和化区间：亮度 25%–75%，饱和度 30%–85% */
const BASE_L_RANGE: [number, number] = [25, 75];
const BASE_S_RANGE: [number, number] = [30, 85];

/** 7 个变体的亮度偏移（顺序 = 从最亮到最暗） */
const VARIANTS: { key: string; label: string; delta: number }[] = [
  { key: 'Light3', label: '亮色 3', delta: 48 },
  { key: 'Light2', label: '亮色 2', delta: 32 },
  { key: 'Light1', label: '亮色 1', delta: 16 },
  { key: 'Base', label: '基准色', delta: 0 },
  { key: 'Dark1', label: '暗色 1', delta: -14 },
  { key: 'Dark2', label: '暗色 2', delta: -26 },
  { key: 'Dark3', label: '暗色 3', delta: -36 }
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value);

/** RGB(0–255) → HSL(h 0–360, s/l 0–100) */
export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
    }
    h *= 60;
  }
  return { h: round(h), s: round(s * 100), l: round(l * 100) };
}

/** HSL(h 0–360, s/l 0–100) → RGB(0–255) */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  const hn = ((h % 360) + 360) % 360 / 360;
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  if (sn === 0) {
    const v = round(ln * 255);
    return [v, v, v];
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  const hue = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return [
    round(hue(hn + 1 / 3) * 255),
    round(hue(hn) * 255),
    round(hue(hn - 1 / 3) * 255)
  ];
}

const toHex = (value: number) => clamp(round(value), 0, 255).toString(16).padStart(2, '0');

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hslToCss({ h, s, l }: Hsl): string {
  return `hsl(${round(h)}, ${round(s)}%, ${round(l)}%)`;
}

/** 某个色块在某个通道上的取值范围（找最宽通道用） */
function boxStats(box: Rgb[]) {
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
  for (const [r, g, b] of box) {
    if (r < rMin) rMin = r;
    if (r > rMax) rMax = r;
    if (g < gMin) gMin = g;
    if (g > gMax) gMax = g;
    if (b < bMin) bMin = b;
    if (b > bMax) bMax = b;
  }
  const rr = rMax - rMin;
  const gr = gMax - gMin;
  const br = bMax - bMin;
  const range = Math.max(rr, gr, br);
  const channel: 0 | 1 | 2 = range === rr ? 0 : range === gr ? 1 : 2;
  return { range, channel };
}

function averageColor(box: Rgb[]): Rgb {
  let r = 0, g = 0, b = 0;
  for (const [pr, pg, pb] of box) {
    r += pr;
    g += pg;
    b += pb;
  }
  const n = box.length || 1;
  return [round(r / n), round(g / n), round(b / n)];
}
function medianCut(pixels: Rgb[], target: number) {
  let boxes: Rgb[][] = [pixels];
  while (boxes.length < target) {
    let pickIndex = -1;
    let maxRange = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue;
      const { range } = boxStats(boxes[i]);
      if (range > maxRange) {
        maxRange = range;
        pickIndex = i;
      }
    }
    if (pickIndex < 0) break;
    const box = boxes.splice(pickIndex, 1)[0];
    const { channel } = boxStats(box);
    box.sort((a, b) => a[channel] - b[channel]);
    const mid = Math.floor(box.length / 2);
    boxes.push(box.slice(0, mid), box.slice(mid));
  }
  return boxes.filter((box) => box.length > 0);
}

/** 候选色 + 它在图里出现的次数 */
function candidateScores(pixels: Rgb[]) {
  const total = pixels.length || 1;
  const boxes = medianCut(pixels, TARGET_CLUSTERS);
  return boxes.map((box) => {
    const rgb = averageColor(box);
    const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    const s = hsl.s / 100;
    const l = hsl.l / 100;
    const frequency = box.length / total;

    // 饱和度低于 10% 的灰度色，权重降至 0.15
    const satWeight = s < 0.1 ? 0.15 : 1;
    // 过暗（<12%）或过亮（>88%）的颜色，权重降至 0.25
    const lightWeight = l < 0.12 || l > 0.88 ? 0.25 : 1;
    // 饱和度越接近 55% 越加分（最高约 1.6 倍）
    const midSatBonus = 1 + 0.6 * (1 - Math.min(1, Math.abs(s - 0.55) / 0.45));

    return {
      rgb,
      hsl,
      score: frequency * satWeight * lightWeight * midSatBonus
    };
  });
}
export function extractPalette(imageData: ImageData): PaletteResult | null {
  const { data } = imageData;
  const pixels: Rgb[] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < ALPHA_THRESHOLD) continue;
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (pixels.length === 0) return null;

  const candidates = candidateScores(pixels);
  if (candidates.length === 0) return null;

  // 打分最高的候选色 = 种子色
  const seed = candidates.reduce((best, item) => (item.score > best.score ? item : best), candidates[0]);

  // 把种子色夹进柔和区间：亮度 25–75，饱和度 30–85
  const baseHsl: Hsl = {
    h: seed.hsl.h,
    s: clamp(seed.hsl.s, BASE_S_RANGE[0], BASE_S_RANGE[1]),
    l: clamp(seed.hsl.l, BASE_L_RANGE[0], BASE_L_RANGE[1])
  };

  const variants: PaletteVariant[] = VARIANTS.map(({ key, label, delta }) => {
    const l = clamp(baseHsl.l + delta, 0, 100);
    // 饱和度随亮度轻微反向调整：越亮越降饱和，越暗略微提饱和
    const s = clamp(baseHsl.s - delta * 0.4, 0, 100);
    const hsl: Hsl = { h: baseHsl.h, s: round(s), l: round(l) };
    const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    return { key, label, delta, hsl, hex: rgbToHex(rgb), css: hslToCss(hsl) };
  });

  const seedRgb = seed.rgb;
  const baseRgb = hslToRgb(baseHsl.h, baseHsl.s, baseHsl.l);
  return {
    seedHex: rgbToHex(seedRgb),
    seedHsl: seed.hsl,
    baseHex: rgbToHex(baseRgb),
    baseHsl,
    variants
  };
}
