// UAE Soil Health Scorecard - methodology definition.
// Source: "UAE Soil Health Scorecard - Methodology & Scoring Framework" v1.0 (draft, 29 May 2026)
// and the companion workbook UAE_Soil_Health_Scorecard.xlsx (Deliverable D2 basis, Cranfield-Silal
// project). Thresholds and weights are a draft pending validation in Deliverable D3; they are
// stored in the database as an editable, versioned methodology rather than hard-coded.

export type BandKind = 'lower' | 'higher' | 'window';

export interface Indicator {
  key: string;
  category: string;
  weight: number;
  kind: BandKind;
  /** lower: v<=c0 ->5 ... ; higher: v>=c0 ->5 ... ; window: [lo,hi] pairs for 5,4,3,2 */
  cuts: number[] | [number, number][];
  method: string;
  basis: string;
}

export interface Category { key: string; en: string; ar: string; rationale: string }

export interface RatingBand { min: number; key: string; en: string; ar: string; meaning: string; meaningAr: string }

export interface SuppIndicator {
  key: string; good: [number, number]; moderate: [number, number][]; method: string; note: string;
}

export interface Methodology {
  id: string; name: string; version: string; status: string; date: string; note: string;
  categories: Category[];
  indicators: Indicator[];
  ratings: RatingBand[];
  supplementary: SuppIndicator[];
  minCoverage: number;
}

export interface AnalyteDef {
  key: string; en: string; ar: string; unit: string; group: string; dp: number; short?: string;
}

export const ANALYTE_GROUPS: { key: string; en: string }[] = [
  { key: 'basic', en: 'Reaction, salinity and organic matter' },
  { key: 'sodicity', en: 'Sodicity and exchange' },
  { key: 'soluble', en: 'Soluble ions (saturation extract)' },
  { key: 'exch', en: 'Exchangeable cations' },
  { key: 'macro', en: 'Available macronutrients' },
  { key: 'micro', en: 'Micronutrients' },
  { key: 'supp', en: 'Physical and biological (supplementary)' },
];

export const ANALYTES: AnalyteDef[] = [
  { key: 'ph', en: 'pH (paste extract)', ar: 'الرقم الهيدروجيني (مستخلص العجينة)', unit: '-', group: 'basic', dp: 2, short: 'pH' },
  { key: 'ece', en: 'ECe (salinity)', ar: 'الملوحة ECe', unit: 'dS/m', group: 'basic', dp: 2, short: 'ECe' },
  { key: 'om', en: 'Organic matter', ar: 'المادة العضوية', unit: '%', group: 'basic', dp: 2, short: 'OM' },
  { key: 'caco3', en: 'Calcium carbonate (CaCO₃)', ar: 'كربونات الكالسيوم', unit: '%', group: 'basic', dp: 1, short: 'CaCO₃' },
  { key: 'sp', en: 'Saturation percentage', ar: 'نسبة التشبع', unit: '%', group: 'basic', dp: 1, short: 'SP' },
  { key: 'sar', en: 'SAR', ar: 'نسبة ادمصاص الصوديوم SAR', unit: '-', group: 'sodicity', dp: 2, short: 'SAR' },
  { key: 'esp', en: 'ESP', ar: 'نسبة الصوديوم المتبادل ESP', unit: '%', group: 'sodicity', dp: 2, short: 'ESP' },
  { key: 'cec', en: 'Cation exchange capacity', ar: 'السعة التبادلية الكاتيونية', unit: 'cmolc/kg', group: 'sodicity', dp: 2, short: 'CEC' },
  { key: 'sol_ca', en: 'Soluble calcium (Ca²⁺)', ar: 'الكالسيوم الذائب', unit: 'mg/L', group: 'soluble', dp: 1 },
  { key: 'sol_mg', en: 'Soluble magnesium (Mg²⁺)', ar: 'المغنيسيوم الذائب', unit: 'mg/L', group: 'soluble', dp: 1 },
  { key: 'sol_na', en: 'Soluble sodium (Na⁺)', ar: 'الصوديوم الذائب', unit: 'mg/L', group: 'soluble', dp: 1 },
  { key: 'sol_k', en: 'Soluble potassium (K⁺)', ar: 'البوتاسيوم الذائب', unit: 'mg/L', group: 'soluble', dp: 1 },
  { key: 'sol_cl', en: 'Soluble chloride (Cl⁻)', ar: 'الكلوريد الذائب', unit: 'mg/L', group: 'soluble', dp: 1 },
  { key: 'sol_hco3', en: 'Soluble bicarbonate (HCO₃⁻)', ar: 'البيكربونات الذائبة', unit: 'mg/L', group: 'soluble', dp: 1 },
  { key: 'sol_so4', en: 'Soluble sulfate (SO₄²⁻)', ar: 'الكبريتات الذائبة', unit: 'mg/L', group: 'soluble', dp: 1 },
  { key: 'ex_ca', en: 'Exchangeable calcium', ar: 'الكالسيوم المتبادل', unit: 'mg/kg', group: 'exch', dp: 1, short: 'Ca' },
  { key: 'ex_mg', en: 'Exchangeable magnesium', ar: 'المغنيسيوم المتبادل', unit: 'mg/kg', group: 'exch', dp: 1, short: 'Mg' },
  { key: 'ex_na', en: 'Exchangeable sodium', ar: 'الصوديوم المتبادل', unit: 'mg/kg', group: 'exch', dp: 1 },
  { key: 'ex_k', en: 'Exchangeable potassium', ar: 'البوتاسيوم المتبادل', unit: 'mg/kg', group: 'exch', dp: 1 },
  { key: 'n', en: 'Available nitrogen (mineral N)', ar: 'النيتروجين المتاح', unit: 'mg/kg', group: 'macro', dp: 1, short: 'N' },
  { key: 'p', en: 'Available phosphorus (Olsen)', ar: 'الفوسفور المتاح', unit: 'mg/kg', group: 'macro', dp: 2, short: 'P' },
  { key: 'k', en: 'Available potassium', ar: 'البوتاسيوم المتاح', unit: 'mg/kg', group: 'macro', dp: 1, short: 'K' },
  { key: 's', en: 'Available sulfur', ar: 'الكبريت المتاح', unit: 'mg/kg', group: 'macro', dp: 1, short: 'S' },
  { key: 'fe', en: 'Iron (Fe, DTPA)', ar: 'الحديد', unit: 'mg/kg', group: 'micro', dp: 2, short: 'Fe' },
  { key: 'zn', en: 'Zinc (Zn, DTPA)', ar: 'الزنك', unit: 'mg/kg', group: 'micro', dp: 2, short: 'Zn' },
  { key: 'mn', en: 'Manganese (Mn, DTPA)', ar: 'المنغنيز', unit: 'mg/kg', group: 'micro', dp: 2, short: 'Mn' },
  { key: 'cu', en: 'Copper (Cu, DTPA)', ar: 'النحاس', unit: 'mg/kg', group: 'micro', dp: 2, short: 'Cu' },
  { key: 'b', en: 'Boron (B, hot water)', ar: 'البورون', unit: 'mg/kg', group: 'micro', dp: 2, short: 'B' },
  { key: 'bd', en: 'Bulk density', ar: 'الكثافة الظاهرية', unit: 'g/cm³', group: 'supp', dp: 2 },
  { key: 'infil', en: 'Infiltration rate', ar: 'معدل التسرب', unit: 'mm/hr', group: 'supp', dp: 0 },
  { key: 'resp', en: 'Soil respiration', ar: 'تنفس التربة', unit: 'mg CO₂-C/kg/day', group: 'supp', dp: 0 },
  { key: 'mbc', en: 'Microbial biomass C', ar: 'كربون الكتلة الحيوية الميكروبية', unit: 'mg/kg', group: 'supp', dp: 0 },
];

export const ANALYTE: Record<string, AnalyteDef> = Object.fromEntries(ANALYTES.map(a => [a.key, a]));

/** Maps an indicator key to the analyte it scores (identical except exchangeable Ca/Mg). */
export const INDICATOR_ANALYTE: Record<string, string> = { ca: 'ex_ca', mg: 'ex_mg' };
export const analyteOf = (indKey: string) => INDICATOR_ANALYTE[indKey] ?? indKey;

export const INDICATOR_LABEL: Record<string, { en: string; ar: string }> = {
  ece: { en: 'ECe (salinity)', ar: 'الملوحة (ECe)' },
  sar: { en: 'SAR', ar: 'نسبة ادمصاص الصوديوم (SAR)' },
  esp: { en: 'ESP', ar: 'نسبة الصوديوم المتبادل (ESP)' },
  om: { en: 'Organic matter', ar: 'المادة العضوية' },
  ph: { en: 'pH', ar: 'الرقم الهيدروجيني' },
  n: { en: 'Available nitrogen', ar: 'النيتروجين المتاح' },
  p: { en: 'Available phosphorus', ar: 'الفوسفور المتاح' },
  k: { en: 'Available potassium', ar: 'البوتاسيوم المتاح' },
  cec: { en: 'CEC', ar: 'السعة التبادلية الكاتيونية' },
  ca: { en: 'Exchangeable calcium', ar: 'الكالسيوم المتبادل' },
  mg: { en: 'Exchangeable magnesium', ar: 'المغنيسيوم المتبادل' },
  s: { en: 'Available sulfur', ar: 'الكبريت المتاح' },
  fe: { en: 'Iron (Fe)', ar: 'الحديد' },
  zn: { en: 'Zinc (Zn)', ar: 'الزنك' },
  mn: { en: 'Manganese (Mn)', ar: 'المنغنيز' },
  cu: { en: 'Copper (Cu)', ar: 'النحاس' },
  b: { en: 'Boron (B)', ar: 'البورون' },
};

export const SCORE_LABEL: Record<number, { en: string; ar: string }> = {
  5: { en: 'Optimum', ar: 'مثالي' },
  4: { en: 'Adequate', ar: 'كافٍ' },
  3: { en: 'Marginal', ar: 'حدّي' },
  2: { en: 'Deficient / excess', ar: 'نقص / زيادة' },
  1: { en: 'Critical', ar: 'حرج' },
};

export const DEFAULT_METHODOLOGY: Methodology = {
  id: 'uae-shs-1.0',
  name: 'UAE Soil Health Scorecard',
  version: '1.0',
  status: 'Draft - pending D3 validation',
  date: '2026-05-29',
  note: 'Deliverable D2 basis (Silal / Innovation Oasis). 17 chemical indicators in 7 weighted categories, scored 1-5 and combined into a 0-100 index on the measured basis. Thresholds adapted for arid, sandy, calcareous UAE soils.',
  minCoverage: 80,
  categories: [
    { key: 'salinity', en: 'Salinity & sodicity', ar: 'الملوحة والصودية', rationale: 'Dominant yield-limiting factors in UAE desert agriculture' },
    { key: 'om', en: 'Organic matter', ar: 'المادة العضوية', rationale: 'Drives water and nutrient retention; critically low in sandy desert soils' },
    { key: 'ph', en: 'Reaction (pH)', ar: 'تفاعل التربة (pH)', rationale: 'Governs nutrient availability' },
    { key: 'macro', en: 'Macronutrients', ar: 'العناصر الكبرى', rationale: 'Primary fertility; N leaches in sand, P fixed by calcareous soils' },
    { key: 'cec', en: 'Cation exchange', ar: 'التبادل الكاتيوني', rationale: 'Nutrient-holding and buffering capacity' },
    { key: 'secondary', en: 'Secondary nutrients', ar: 'العناصر الثانوية', rationale: 'Usually adequate in calcareous soils - lower priority' },
    { key: 'micro', en: 'Micronutrients', ar: 'العناصر الصغرى', rationale: 'Deficiency common in high-pH calcareous soils; boron toxicity risk' },
  ],
  indicators: [
    { key: 'ece', category: 'salinity', weight: 13, kind: 'lower', cuts: [2, 4, 8, 16], method: 'Saturated paste extract', basis: 'USDA salinity classes (Richards 1954; FAO)' },
    { key: 'sar', category: 'salinity', weight: 8, kind: 'lower', cuts: [3, 6, 9, 13], method: 'Saturated paste extract', basis: 'USDA sodicity guidelines; SAR >= 13 = sodic' },
    { key: 'esp', category: 'salinity', weight: 7, kind: 'lower', cuts: [5, 10, 15, 20], method: 'Exchangeable cations', basis: 'USDA: ESP >= 15 = sodic soil' },
    { key: 'om', category: 'om', weight: 13, kind: 'higher', cuts: [2, 1, 0.5, 0.25], method: 'Walkley-Black / LOI', basis: 'Arid desert soils typically < 1% OM; UAE / Abu Dhabi soil surveys' },
    { key: 'ph', category: 'ph', weight: 7, kind: 'window', cuts: [[6.5, 7.5], [6, 8], [5.5, 8.5], [5, 9]], method: 'Saturated paste / 1:1 H2O', basis: 'Nutrient-availability optimum; UAE soils typically alkaline calcareous' },
    { key: 'n', category: 'macro', weight: 9, kind: 'higher', cuts: [40, 25, 15, 8], method: 'NO3-N + NH4-N', basis: 'Soil-test N interpretation; sandy soils leach N readily' },
    { key: 'p', category: 'macro', weight: 9, kind: 'higher', cuts: [20, 12, 7, 4], method: 'Olsen (bicarbonate)', basis: 'Olsen P for calcareous soils (Olsen 1954; FAO)' },
    { key: 'k', category: 'macro', weight: 8, kind: 'higher', cuts: [175, 120, 80, 50], method: 'Ammonium acetate', basis: 'NH4-acetate K; coarse soils need higher K' },
    { key: 'cec', category: 'cec', weight: 4, kind: 'higher', cuts: [15, 10, 5, 2], method: 'NH4-acetate (or sum of cations)', basis: 'Sandy soils characteristically low CEC (< 5)' },
    { key: 'ca', category: 'secondary', weight: 2, kind: 'higher', cuts: [2000, 1500, 1000, 500], method: 'NH4-acetate', basis: 'Usually abundant in calcareous UAE soils' },
    { key: 'mg', category: 'secondary', weight: 3, kind: 'higher', cuts: [180, 120, 60, 30], method: 'NH4-acetate', basis: 'General sufficiency ranges' },
    { key: 's', category: 'secondary', weight: 3, kind: 'higher', cuts: [15, 10, 6, 3], method: 'SO4-S (monocalcium phosphate)', basis: 'General S sufficiency; arid soils often adequate (gypsum)' },
    { key: 'fe', category: 'micro', weight: 3, kind: 'higher', cuts: [4.5, 2.5, 1.5, 0.5], method: 'DTPA', basis: 'DTPA critical Fe ~ 4.5 mg/kg (Lindsay & Norvell 1978)' },
    { key: 'zn', category: 'micro', weight: 4, kind: 'higher', cuts: [1.5, 1, 0.6, 0.3], method: 'DTPA', basis: 'DTPA critical Zn ~ 0.6-1.0 mg/kg' },
    { key: 'mn', category: 'micro', weight: 2, kind: 'higher', cuts: [5, 3, 1, 0.5], method: 'DTPA', basis: 'DTPA critical Mn ~ 1.0-5.0 mg/kg' },
    { key: 'cu', category: 'micro', weight: 2, kind: 'higher', cuts: [1, 0.5, 0.2, 0.1], method: 'DTPA', basis: 'DTPA critical Cu ~ 0.2 mg/kg' },
    { key: 'b', category: 'micro', weight: 3, kind: 'window', cuts: [[0.5, 2], [0.3, 4], [0.2, 5], [0.1, 8]], method: 'Hot-water extractable', basis: 'Critical 0.5, sufficient 1-4, toxic > 4-5 mg/kg' },
  ],
  ratings: [
    { min: 80, key: 'healthy', en: 'Healthy', ar: 'سليمة', meaning: 'Few limitations; maintain current management', meaningAr: 'قيود قليلة؛ يُحافظ على الإدارة الحالية' },
    { min: 60, key: 'moderate', en: 'Moderate', ar: 'متوسطة', meaning: 'Some constraints; targeted improvement needed', meaningAr: 'بعض القيود؛ تحتاج إلى تحسين موجّه' },
    { min: 40, key: 'marginal', en: 'Marginal', ar: 'حدّية', meaning: 'Significant constraints limiting productivity', meaningAr: 'قيود كبيرة تحدّ من الإنتاجية' },
    { min: 0, key: 'poor', en: 'Poor', ar: 'ضعيفة', meaning: 'Severe constraints; major remediation required', meaningAr: 'قيود شديدة؛ تتطلب معالجة جذرية' },
  ],
  supplementary: [
    { key: 'bd', good: [0, 1.4], moderate: [[1.4, 1.75]], method: 'Core / clod', note: 'Root-limiting bulk density is higher in sandy soils (~1.75)' },
    { key: 'infil', good: [15, 50], moderate: [[50, 100], [8, 15]], method: 'Double ring', note: 'Sandy desert soils are naturally high; very high = poor water retention' },
    { key: 'resp', good: [40, Infinity], moderate: [[20, 40]], method: 'Incubation / field', note: 'Low in arid soils; interpret with caution' },
    { key: 'mbc', good: [250, Infinity], moderate: [[100, 250]], method: 'Fumigation-extraction', note: 'Generally low in desert soils' },
  ],
};

/** Human-readable band text for a given score, e.g. "> 2 - 4". */
export function bandText(ind: Indicator, score: number): string {
  const i = 5 - score; // 0..4
  if (ind.kind === 'lower') {
    const c = ind.cuts as number[];
    if (i === 0) return `≤ ${c[0]}`;
    if (i === 4) return `> ${c[3]}`;
    return `> ${c[i - 1]} – ${c[i]}`;
  }
  if (ind.kind === 'higher') {
    const c = ind.cuts as number[];
    if (i === 0) return `≥ ${c[0]}`;
    if (i === 4) return `< ${c[3]}`;
    return `${c[i]} – < ${c[i - 1]}`;
  }
  const w = ind.cuts as [number, number][];
  if (i === 0) return `${w[0][0]} – ${w[0][1]}`;
  if (i === 4) return `< ${w[3][0]} or > ${w[3][1]}`;
  return `${w[i][0]} – ${w[i - 1][0]} or ${w[i - 1][1]} – ${w[i][1]}`;
}

export function validateMethodology(m: Methodology): string[] {
  const errs: string[] = [];
  const total = m.indicators.reduce((a, i) => a + Number(i.weight || 0), 0);
  if (Math.abs(total - 100) > 0.001) errs.push(`Weights sum to ${total.toFixed(1)}%, they must sum to exactly 100%.`);
  for (const ind of m.indicators) {
    const name = INDICATOR_LABEL[ind.key]?.en ?? ind.key;
    if (ind.kind === 'window') {
      const w = ind.cuts as [number, number][];
      for (let i = 0; i < w.length; i++) {
        if (!(w[i][0] < w[i][1])) errs.push(`${name}: window ${i + 1} lower bound must be below its upper bound.`);
        if (i > 0 && !(w[i][0] <= w[i - 1][0] && w[i][1] >= w[i - 1][1])) errs.push(`${name}: each window must contain the previous one.`);
      }
    } else {
      const c = ind.cuts as number[];
      for (let i = 1; i < c.length; i++) {
        if (ind.kind === 'lower' && !(c[i] > c[i - 1])) errs.push(`${name}: thresholds must increase from score 5 to score 2.`);
        if (ind.kind === 'higher' && !(c[i] < c[i - 1])) errs.push(`${name}: thresholds must decrease from score 5 to score 2.`);
      }
    }
    if (!(ind.weight >= 0)) errs.push(`${name}: weight must be zero or positive.`);
  }
  for (let i = 1; i < m.ratings.length; i++) if (!(m.ratings[i].min < m.ratings[i - 1].min)) errs.push('Rating bands must descend.');
  return errs;
}
