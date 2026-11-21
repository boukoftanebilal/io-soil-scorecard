// Crop salt tolerance and irrigation-water quality guidelines.
// Salt tolerance: Maas & Hoffman (1977) threshold-slope model as tabulated in
// FAO Irrigation and Drainage Paper 29 Rev.1 (Ayers & Westcot 1985), Table 4.
// Water quality: FAO 29 Rev.1, Table 1 (guidelines for interpretation of water quality for irrigation).
// These are reference values stored in the database so the agronomy team can review and edit them.

export interface Crop {
  id: string; en: string; ar: string; group: 'vegetables' | 'field' | 'trees' | 'forage';
  /** ECe threshold (dS/m) at which yield starts to decline, and % yield loss per dS/m above it */
  a?: number; b?: number; tolerance: 'sensitive' | 'moderately sensitive' | 'moderately tolerant' | 'tolerant';
}

export const DEFAULT_CROPS: Crop[] = [
  { id: 'tomato', en: 'Tomato', ar: 'طماطم', group: 'vegetables', a: 2.5, b: 9.9, tolerance: 'moderately sensitive' },
  { id: 'cucumber', en: 'Cucumber', ar: 'خيار', group: 'vegetables', a: 2.5, b: 13, tolerance: 'moderately sensitive' },
  { id: 'pepper', en: 'Pepper / capsicum', ar: 'فلفل', group: 'vegetables', a: 1.5, b: 14, tolerance: 'moderately sensitive' },
  { id: 'eggplant', en: 'Eggplant', ar: 'باذنجان', group: 'vegetables', a: 1.1, b: 6.9, tolerance: 'moderately sensitive' },
  { id: 'lettuce', en: 'Lettuce', ar: 'خس', group: 'vegetables', a: 1.3, b: 13, tolerance: 'moderately sensitive' },
  { id: 'onion', en: 'Onion', ar: 'بصل', group: 'vegetables', a: 1.2, b: 16, tolerance: 'sensitive' },
  { id: 'carrot', en: 'Carrot', ar: 'جزر', group: 'vegetables', a: 1.0, b: 14, tolerance: 'sensitive' },
  { id: 'bean', en: 'Bean', ar: 'فاصوليا', group: 'vegetables', a: 1.0, b: 19, tolerance: 'sensitive' },
  { id: 'cabbage', en: 'Cabbage', ar: 'ملفوف', group: 'vegetables', a: 1.8, b: 9.7, tolerance: 'moderately sensitive' },
  { id: 'broccoli', en: 'Broccoli', ar: 'بروكلي', group: 'vegetables', a: 2.8, b: 9.2, tolerance: 'moderately sensitive' },
  { id: 'spinach', en: 'Spinach', ar: 'سبانخ', group: 'vegetables', a: 2.0, b: 7.6, tolerance: 'moderately sensitive' },
  { id: 'zucchini', en: 'Zucchini squash', ar: 'كوسا', group: 'vegetables', a: 4.7, b: 9.4, tolerance: 'moderately tolerant' },
  { id: 'melon', en: 'Melon (cantaloupe)', ar: 'شمام', group: 'vegetables', a: 2.2, b: 7.3, tolerance: 'moderately sensitive' },
  { id: 'potato', en: 'Potato', ar: 'بطاطس', group: 'vegetables', a: 1.7, b: 12, tolerance: 'moderately sensitive' },
  { id: 'sweetcorn', en: 'Sweet corn', ar: 'ذرة حلوة', group: 'vegetables', a: 1.7, b: 12, tolerance: 'moderately sensitive' },
  { id: 'beet', en: 'Beetroot', ar: 'شمندر', group: 'vegetables', a: 4.0, b: 9.0, tolerance: 'moderately tolerant' },
  { id: 'strawberry', en: 'Strawberry', ar: 'فراولة', group: 'vegetables', a: 1.0, b: 33, tolerance: 'sensitive' },
  { id: 'blueberry', en: 'Blueberry', ar: 'توت أزرق', group: 'vegetables', tolerance: 'sensitive' },
  { id: 'okra', en: 'Okra', ar: 'بامية', group: 'vegetables', tolerance: 'sensitive' },
  { id: 'barley', en: 'Barley', ar: 'شعير', group: 'field', a: 8.0, b: 5.0, tolerance: 'tolerant' },
  { id: 'wheat', en: 'Wheat', ar: 'قمح', group: 'field', a: 6.0, b: 7.1, tolerance: 'moderately tolerant' },
  { id: 'sorghum', en: 'Sorghum', ar: 'ذرة رفيعة', group: 'field', a: 6.8, b: 16, tolerance: 'moderately tolerant' },
  { id: 'maize', en: 'Maize', ar: 'ذرة', group: 'field', a: 1.7, b: 12, tolerance: 'moderately sensitive' },
  { id: 'alfalfa', en: 'Alfalfa', ar: 'برسيم', group: 'forage', a: 2.0, b: 7.3, tolerance: 'moderately sensitive' },
  { id: 'rhodes', en: 'Rhodes grass', ar: 'حشيشة الرودس', group: 'forage', tolerance: 'moderately tolerant' },
  { id: 'datepalm', en: 'Date palm', ar: 'نخيل التمر', group: 'trees', a: 4.0, b: 3.6, tolerance: 'tolerant' },
  { id: 'citrus', en: 'Citrus (orange)', ar: 'حمضيات', group: 'trees', a: 1.7, b: 16, tolerance: 'sensitive' },
  { id: 'grape', en: 'Grape', ar: 'عنب', group: 'trees', a: 1.5, b: 9.6, tolerance: 'moderately sensitive' },
  { id: 'fig', en: 'Fig', ar: 'تين', group: 'trees', tolerance: 'moderately tolerant' },
  { id: 'olive', en: 'Olive', ar: 'زيتون', group: 'trees', tolerance: 'moderately tolerant' },
  { id: 'pomegranate', en: 'Pomegranate', ar: 'رمان', group: 'trees', tolerance: 'moderately tolerant' },
  { id: 'mango', en: 'Mango', ar: 'مانجو', group: 'trees', tolerance: 'sensitive' },
];

/** Relative yield potential (%) at a given root-zone ECe, Maas-Hoffman. */
export function relativeYield(crop: Crop, ece: number): number | undefined {
  if (crop.a === undefined || crop.b === undefined) return undefined;
  return Math.max(0, Math.min(100, 100 - crop.b * (ece - crop.a)));
}

/** Guess the crop from a free-text sample description such as "624-16461-Cucumber-before net house". */
export function matchCrop(text: string | undefined, crops: Crop[]): Crop | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  const alias: Record<string, string[]> = {
    pepper: ['pepper', 'capsicum', 'chili', 'chilli'], zucchini: ['zucchini', 'squash', 'marrow', 'courgette'],
    melon: ['melon', 'cantaloupe'], datepalm: ['date', 'palm'], citrus: ['citrus', 'orange', 'lemon', 'lime'],
    sweetcorn: ['sweet corn', 'sweetcorn', 'corn'], eggplant: ['eggplant', 'aubergine'], bean: ['bean'],
    alfalfa: ['alfalfa', 'lucerne'], rhodes: ['rhodes'], beet: ['beet'], maize: ['maize'],
  };
  for (const c of crops) {
    const words = alias[c.id] ?? [c.en.toLowerCase().split(' ')[0]];
    if (words.some(w => t.includes(w))) return c;
  }
  return undefined;
}

export function matchSystem(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const t = ' ' + text.toLowerCase().replace(/[-_/]/g, ' ') + ' ';
  if (/\b(gh|green ?house)\b/.test(t)) return 'GH';
  if (/\b(nh|nt|net ?house)\b/.test(t)) return 'NH';
  if (/\b(of|open ?field)\b/.test(t)) return 'OF';
  return undefined;
}

// ---------------------------------------------------------------- irrigation water

export interface WaterValues {
  ecw?: number; tds?: number; ph?: number; na?: number; ca?: number; mg?: number;
  cl?: number; hco3?: number; b?: number; no3n?: number;
}
export type Restriction = 'none' | 'moderate' | 'severe';
export interface WaterItem { key: string; en: string; ar: string; value: string; restriction: Restriction; note: string }

export const WATER_FIELDS: { key: keyof WaterValues; en: string; unit: string }[] = [
  { key: 'ecw', en: 'ECw (salinity)', unit: 'dS/m' }, { key: 'tds', en: 'TDS', unit: 'mg/L' }, { key: 'ph', en: 'pH', unit: '-' },
  { key: 'na', en: 'Sodium (Na⁺)', unit: 'mg/L' }, { key: 'ca', en: 'Calcium (Ca²⁺)', unit: 'mg/L' }, { key: 'mg', en: 'Magnesium (Mg²⁺)', unit: 'mg/L' },
  { key: 'cl', en: 'Chloride (Cl⁻)', unit: 'mg/L' }, { key: 'hco3', en: 'Bicarbonate (HCO₃⁻)', unit: 'mg/L' },
  { key: 'b', en: 'Boron (B)', unit: 'mg/L' }, { key: 'no3n', en: 'Nitrate-N', unit: 'mg/L' },
];

export function waterSar(w: WaterValues): number | undefined {
  if (w.na === undefined || w.ca === undefined || w.mg === undefined) return undefined;
  const d = (w.ca / 20.04 + w.mg / 12.153) / 2;
  return d > 0 ? (w.na / 22.99) / Math.sqrt(d) : undefined;
}

export function classifyWater(w: WaterValues): { items: WaterItem[]; worst: Restriction; sar?: number } {
  const items: WaterItem[] = [];
  const cls = (v: number, a: number, b: number): Restriction => (v < a ? 'none' : v <= b ? 'moderate' : 'severe');
  const sar = waterSar(w);
  if (w.ecw !== undefined) items.push({ key: 'ecw', en: 'Salinity (ECw)', ar: 'الملوحة', value: `${w.ecw.toFixed(2)} dS/m`, restriction: cls(w.ecw, 0.7, 3), note: 'Affects crop water availability. < 0.7 none, 0.7-3.0 slight to moderate, > 3.0 severe.' });
  if (w.tds !== undefined) items.push({ key: 'tds', en: 'Total dissolved solids', ar: 'الأملاح الذائبة الكلية', value: `${w.tds.toFixed(0)} mg/L`, restriction: cls(w.tds, 450, 2000), note: '< 450 none, 450-2000 slight to moderate, > 2000 severe.' });
  if (sar !== undefined && w.ecw !== undefined) {
    const t: [number, number, number][] = [[3, 0.7, 0.2], [6, 1.2, 0.3], [12, 1.9, 0.5], [20, 2.9, 1.3], [40, 5.0, 2.9]];
    const row = t.find(r => sar <= r[0]) ?? t[t.length - 1];
    const r: Restriction = w.ecw > row[1] ? 'none' : w.ecw >= row[2] ? 'moderate' : 'severe';
    items.push({ key: 'infil', en: 'Infiltration (SAR with ECw)', ar: 'نفاذية التربة (SAR مع ECw)', value: `SAR ${sar.toFixed(1)} at ${w.ecw.toFixed(2)} dS/m`, restriction: r, note: 'Low-salinity, high-SAR water reduces the rate water enters the soil.' });
  }
  if (sar !== undefined) items.push({ key: 'na', en: 'Sodium toxicity (surface irrigation)', ar: 'سمية الصوديوم', value: `SAR ${sar.toFixed(1)}`, restriction: cls(sar, 3, 9), note: 'SAR < 3 none, 3-9 slight to moderate, > 9 severe for sensitive crops.' });
  if (w.cl !== undefined) { const m = w.cl / 35.45; items.push({ key: 'cl', en: 'Chloride toxicity (surface irrigation)', ar: 'سمية الكلوريد', value: `${m.toFixed(1)} meq/L`, restriction: cls(m, 4, 10), note: '< 4 none, 4-10 slight to moderate, > 10 meq/L severe.' }); }
  if (w.b !== undefined) items.push({ key: 'b', en: 'Boron toxicity', ar: 'سمية البورون', value: `${w.b.toFixed(2)} mg/L`, restriction: cls(w.b, 0.7, 3), note: '< 0.7 none, 0.7-3.0 slight to moderate, > 3.0 mg/L severe.' });
  if (w.hco3 !== undefined) { const m = w.hco3 / 61.02; items.push({ key: 'hco3', en: 'Bicarbonate (overhead irrigation, emitter scaling)', ar: 'البيكربونات', value: `${m.toFixed(1)} meq/L`, restriction: cls(m, 1.5, 8.5), note: '< 1.5 none, 1.5-8.5 slight to moderate, > 8.5 meq/L severe.' }); }
  if (w.no3n !== undefined) items.push({ key: 'no3n', en: 'Nitrate-nitrogen', ar: 'نترات النيتروجين', value: `${w.no3n.toFixed(1)} mg/L`, restriction: cls(w.no3n, 5, 30), note: 'Counts toward the crop nitrogen supply. < 5 none, 5-30 slight to moderate, > 30 severe.' });
  if (w.ph !== undefined) items.push({ key: 'ph', en: 'pH', ar: 'الرقم الهيدروجيني', value: w.ph.toFixed(2), restriction: w.ph >= 6.5 && w.ph <= 8.4 ? 'none' : 'moderate', note: 'Normal range 6.5-8.4.' });
  const order: Restriction[] = ['none', 'moderate', 'severe'];
  const worst = items.reduce<Restriction>((a, i) => (order.indexOf(i.restriction) > order.indexOf(a) ? i.restriction : a), 'none');
  return { items, worst, sar };
}

/** Leaching requirement for surface irrigation (Rhoades 1974; FAO 29): LR = ECw / (5 ECe_t - ECw). */
export function leachingRequirement(ecw: number, eceThreshold: number): number | undefined {
  const den = 5 * eceThreshold - ecw;
  if (den <= 0) return undefined;
  return ecw / den;
}

/**
 * Gypsum requirement in t/ha to lower ESP to a target over a soil depth.
 * Na to replace (cmolc/kg) = (ESP - target)/100 x CEC; 1 cmolc/kg = 0.861 g gypsum per kg soil.
 */
export function gypsumRequirement(esp: number, cec: number, opts?: { target?: number; depthM?: number; bd?: number; purity?: number }): number {
  const target = opts?.target ?? 10, depth = opts?.depthM ?? 0.3, bd = opts?.bd ?? 1.5, purity = opts?.purity ?? 0.85;
  const na = Math.max(0, (esp - target) / 100 * cec);
  return (8.61 * na * depth * bd) / purity;
}
