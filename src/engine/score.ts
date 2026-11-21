import { Methodology, Indicator, analyteOf, INDICATOR_LABEL, ANALYTE } from './methodology';

export type Values = Record<string, number | undefined>;

export interface Derived {
  sar_calc?: number; esp_calc?: number; cec_sum?: number;
  cations_meq?: number; anions_meq?: number; ec_est?: number;
  ca_mg_ratio?: number; k_mg_ratio?: number;
  cl_meq?: number; hco3_meq?: number; na_meq?: number;
}

export interface IndicatorScore {
  key: string; category: string; value?: number; score?: number; weight: number; points?: number;
  source: 'measured' | 'calculated' | 'missing'; side?: 'low' | 'high';
}

export interface ScoreResult {
  indicators: IndicatorScore[];
  byKey: Record<string, IndicatorScore>;
  categories: { key: string; weight: number; measuredWeight: number; points: number; pct?: number }[];
  score?: number; coverage: number; rating?: string;
  measuredWeight: number; points: number;
  used: Values; derived: Derived;
  supplementary: { key: string; value: number; cls: 'good' | 'moderate' | 'poor' }[];
}

export interface QaFlag { level: 'error' | 'warn' | 'info'; code: string; text: string }

// equivalent weights (mg per meq)
const EQ = { ca: 20.04, mg: 12.153, na: 22.99, k: 39.098, cl: 35.45, hco3: 61.02, so4: 48.03 };

const num = (x: unknown): number | undefined => (typeof x === 'number' && isFinite(x) ? x : undefined);

export function derive(v: Values): Derived {
  const d: Derived = {};
  const ca = num(v.sol_ca), mg = num(v.sol_mg), na = num(v.sol_na), k = num(v.sol_k);
  if (ca !== undefined && mg !== undefined && na !== undefined) {
    const caM = ca / EQ.ca, mgM = mg / EQ.mg, naM = na / EQ.na;
    d.na_meq = naM;
    if (caM + mgM > 0) d.sar_calc = naM / Math.sqrt((caM + mgM) / 2);
    d.cations_meq = caM + mgM + naM + (k !== undefined ? k / EQ.k : 0);
    d.ec_est = d.cations_meq / 10;
  }
  const cl = num(v.sol_cl), hco3 = num(v.sol_hco3), so4 = num(v.sol_so4);
  if (cl !== undefined) d.cl_meq = cl / EQ.cl;
  if (hco3 !== undefined) d.hco3_meq = hco3 / EQ.hco3;
  if (cl !== undefined && hco3 !== undefined) d.anions_meq = cl / EQ.cl + hco3 / EQ.hco3 + (so4 !== undefined ? so4 / EQ.so4 : 0);
  const eca = num(v.ex_ca), emg = num(v.ex_mg), ena = num(v.ex_na), ek = num(v.ex_k);
  if (eca !== undefined && emg !== undefined && ena !== undefined && ek !== undefined) {
    d.cec_sum = eca / (EQ.ca * 10) + emg / (EQ.mg * 10) + ena / (EQ.na * 10) + ek / (EQ.k * 10);
  }
  const cec = num(v.cec) ?? d.cec_sum;
  if (ena !== undefined && cec !== undefined && cec > 0) d.esp_calc = (ena / (EQ.na * 10) / cec) * 100;
  if (eca !== undefined && emg !== undefined && emg > 0) d.ca_mg_ratio = (eca / EQ.ca) / (emg / EQ.mg);
  if (ek !== undefined && emg !== undefined && emg > 0) d.k_mg_ratio = (ek / EQ.k) / (emg / EQ.mg);
  return d;
}

/** Scores one value 1-5 exactly as the D2 workbook formulas do. */
export function scoreValue(ind: Indicator, v: number): { score: number; side?: 'low' | 'high' } {
  if (ind.kind === 'lower') {
    const c = ind.cuts as number[];
    const s = v <= c[0] ? 5 : v <= c[1] ? 4 : v <= c[2] ? 3 : v <= c[3] ? 2 : 1;
    return { score: s, side: s < 5 ? 'high' : undefined };
  }
  if (ind.kind === 'higher') {
    const c = ind.cuts as number[];
    const s = v >= c[0] ? 5 : v >= c[1] ? 4 : v >= c[2] ? 3 : v >= c[3] ? 2 : 1;
    return { score: s, side: s < 5 ? 'low' : undefined };
  }
  const w = ind.cuts as [number, number][];
  let s = 1;
  for (let i = 0; i < w.length; i++) if (v >= w[i][0] && v <= w[i][1]) { s = 5 - i; break; }
  return { score: s, side: s < 5 ? (v < w[0][0] ? 'low' : 'high') : undefined };
}

export function ratingOf(m: Methodology, score: number): string {
  for (const r of m.ratings) if (score >= r.min) return r.key;
  return m.ratings[m.ratings.length - 1].key;
}

export function scoreSample(m: Methodology, values: Values): ScoreResult {
  const derived = derive(values);
  const used: Values = { ...values };
  const calc: Record<string, boolean> = {};
  // Fill indicators the laboratory did not report from the ions it did report.
  if (num(used.sar) === undefined && derived.sar_calc !== undefined) { used.sar = derived.sar_calc; calc.sar = true; }
  if (num(used.cec) === undefined && derived.cec_sum !== undefined) { used.cec = derived.cec_sum; calc.cec = true; }
  if (num(used.esp) === undefined && derived.esp_calc !== undefined) { used.esp = derived.esp_calc; calc.esp = true; }
  if (num(used.k) === undefined && num(used.ex_k) !== undefined) { used.k = used.ex_k; calc.k = true; }

  const indicators: IndicatorScore[] = m.indicators.map(ind => {
    const v = num(used[analyteOf(ind.key)]);
    if (v === undefined) return { key: ind.key, category: ind.category, weight: ind.weight, source: 'missing' as const };
    const { score, side } = scoreValue(ind, v);
    return {
      key: ind.key, category: ind.category, value: v, score, side, weight: ind.weight,
      points: (score / 5) * ind.weight, source: calc[ind.key] ? 'calculated' as const : 'measured' as const,
    };
  });
  const measured = indicators.filter(i => i.score !== undefined);
  const measuredWeight = measured.reduce((a, i) => a + i.weight, 0);
  const points = measured.reduce((a, i) => a + (i.points ?? 0), 0);
  const totalWeight = m.indicators.reduce((a, i) => a + i.weight, 0) || 100;
  const score = measuredWeight > 0 ? (points / measuredWeight) * 100 : undefined;
  const categories = m.categories.map(c => {
    const inds = indicators.filter(i => i.category === c.key);
    const mw = inds.filter(i => i.score !== undefined).reduce((a, i) => a + i.weight, 0);
    const pts = inds.reduce((a, i) => a + (i.points ?? 0), 0);
    return { key: c.key, weight: inds.reduce((a, i) => a + i.weight, 0), measuredWeight: mw, points: pts, pct: mw > 0 ? (pts / mw) * 100 : undefined };
  });
  const supplementary = m.supplementary.flatMap(s => {
    const v = num(values[s.key]);
    if (v === undefined) return [];
    const cls = v >= s.good[0] && v < s.good[1] || (s.good[1] === Infinity && v >= s.good[0]) ? 'good'
      : s.moderate.some(([a, b]) => v >= a && v <= b) ? 'moderate' : 'poor';
    return [{ key: s.key, value: v, cls: cls as 'good' | 'moderate' | 'poor' }];
  });
  return {
    indicators, byKey: Object.fromEntries(indicators.map(i => [i.key, i])), categories,
    score, coverage: (measuredWeight / totalWeight) * 100, rating: score !== undefined ? ratingOf(m, score) : undefined,
    measuredWeight, points, used, derived, supplementary,
  };
}

const f = (x: number, dp = 2) => x.toFixed(dp);

/** Data-quality checks on a set of laboratory values. */
export function qaChecks(m: Methodology, values: Values, res: ScoreResult, meta?: { hasGps?: boolean; qualifiers?: Record<string, string> }): QaFlag[] {
  const flags: QaFlag[] = [];
  const d = res.derived;
  const v = values;
  const ece = num(v.ece), ph = num(v.ph);
  if (ece !== undefined && ece > 60) flags.push({ level: 'error', code: 'ece-unit', text: `ECe of ${f(ece, 1)} is far above any soil extract in dS/m. It was probably reported in µS/cm - divide by 1000.` });
  if (ph !== undefined && (ph < 3.5 || ph > 11)) flags.push({ level: 'error', code: 'ph-range', text: `pH ${f(ph)} is outside the plausible range for soil (3.5-11). Check the entry.` });
  const espV = num(v.esp) ?? d.esp_calc, cecV = num(v.cec) ?? d.cec_sum;
  if (espV !== undefined && espV > 60) flags.push({ level: 'error', code: 'esp-range', text: `ESP of ${f(espV, 1)}% is outside the plausible range for an agricultural soil. Check exchangeable sodium (mg/kg) and CEC with the laboratory; the score and sodium advice are unreliable until this is corrected.` });
  if (cecV !== undefined && cecV > 50) flags.push({ level: 'error', code: 'cec-range', text: `CEC of ${f(cecV, 1)} cmolc/kg is far above what a sandy desert soil can hold (usually below 10). Check the exchangeable cation values and their units.` });
  const sar = num(v.sar);
  if (sar !== undefined && d.sar_calc !== undefined && Math.abs(sar - d.sar_calc) > Math.max(0.5, 0.15 * d.sar_calc))
    flags.push({ level: 'warn', code: 'sar-mismatch', text: `Reported SAR (${f(sar)}) differs from SAR calculated from soluble Ca, Mg and Na (${f(d.sar_calc)}).` });
  const esp = num(v.esp);
  if (esp !== undefined && d.esp_calc !== undefined && Math.abs(esp - d.esp_calc) > Math.max(1, 0.15 * d.esp_calc))
    flags.push({ level: 'warn', code: 'esp-mismatch', text: `Reported ESP (${f(esp)}%) differs from ESP calculated from exchangeable Na and CEC (${f(d.esp_calc)}%).` });
  const cec = num(v.cec);
  if (cec !== undefined && d.cec_sum !== undefined && Math.abs(cec - d.cec_sum) > Math.max(0.5, 0.2 * cec))
    flags.push({ level: 'info', code: 'cec-sum', text: `Reported CEC (${f(cec)}) differs from the sum of exchangeable cations (${f(d.cec_sum)} cmolc/kg). Confirm which method was used.` });
  if (ece !== undefined && ece <= 60 && d.cations_meq !== undefined && ece > 0.2) {
    const ratio = d.cations_meq / (10 * ece);
    if (ratio < 0.5 || ratio > 2)
      flags.push({ level: 'warn', code: 'ec-cations', text: `Sum of soluble cations (${f(d.cations_meq, 1)} meq/L) does not agree with ECe × 10 (${f(ece * 10, 1)} meq/L). Check units and dilution of the extract.` });
  }
  if (d.cations_meq !== undefined && d.anions_meq !== undefined && d.cations_meq > 0) {
    const hasSo4 = num(v.sol_so4) !== undefined;
    const diff = (d.anions_meq - d.cations_meq) / (d.anions_meq + d.cations_meq) * 100;
    if (hasSo4 ? Math.abs(diff) > 15 : diff > 15)
      flags.push({ level: 'warn', code: 'ion-balance', text: `Ion balance is off by ${f(Math.abs(diff), 0)}%: anions ${f(d.anions_meq, 1)} vs cations ${f(d.cations_meq, 1)} meq/L${hasSo4 ? '' : ' (sulfate not analysed)'}. Check chloride and bicarbonate.` });
  }
  const om = num(v.om);
  if (om !== undefined && om > 10) flags.push({ level: 'warn', code: 'om-high', text: `Organic matter of ${f(om)}% is unusually high for a mineral desert soil. Confirm the sample is not a growing medium or compost mix.` });
  for (const ind of m.indicators) {
    const x = num(v[analyteOf(ind.key)]);
    if (x !== undefined && x < 0) flags.push({ level: 'error', code: 'negative', text: `${INDICATOR_LABEL[ind.key]?.en ?? ind.key} is negative.` });
  }
  const lod = Object.entries(meta?.qualifiers ?? {}).filter(([, q]) => q === '<').map(([k]) => ANALYTE[k]?.short ?? ANALYTE[k]?.en ?? k);
  if (lod.length) flags.push({ level: 'info', code: 'lod', text: `Below detection limit: ${lod.join(', ')}. The detection limit is used as the value for scoring.` });
  const calc = res.indicators.filter(i => i.source === 'calculated').map(i => INDICATOR_LABEL[i.key]?.en ?? i.key);
  if (calc.length) flags.push({ level: 'info', code: 'calculated', text: `Calculated from reported ions rather than reported directly: ${calc.join(', ')}.` });
  if (res.score !== undefined && res.coverage < m.minCoverage) {
    const missing = res.indicators.filter(i => i.source === 'missing').map(i => INDICATOR_LABEL[i.key]?.en ?? i.key);
    flags.push({ level: 'warn', code: 'coverage', text: `Data coverage is ${f(res.coverage, 0)}%, below the ${m.minCoverage}% recommended for a representative score. Not measured: ${missing.join(', ')}.` });
  }
  if (meta && meta.hasGps === false) flags.push({ level: 'info', code: 'gps', text: 'No validated GPS coordinate for this sample. Geolocation is needed to join results to the farm and to maps.' });
  return flags;
}
