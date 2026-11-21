import { describe, it, expect } from 'vitest';
import { DEFAULT_METHODOLOGY as M, validateMethodology } from '../src/engine/methodology';
import { scoreSample, scoreValue, derive, qaChecks } from '../src/engine/score';
import { recommend } from '../src/engine/reco';
import { DEFAULT_CROPS, relativeYield, gypsumRequirement, leachingRequirement, classifyWater, matchCrop, matchSystem } from '../src/engine/agronomy';
import { parseValue, parseDate, normSampleNo, parseSampleCsv, toCsv } from '../src/engine/labreport';

// Independent transcription of the IF() formulas in UAE_Soil_Health_Scorecard.xlsx, column E.
const X: Record<string, (d: number) => number> = {
  ece: d => (d <= 2 ? 5 : d <= 4 ? 4 : d <= 8 ? 3 : d <= 16 ? 2 : 1),
  sar: d => (d <= 3 ? 5 : d <= 6 ? 4 : d <= 9 ? 3 : d <= 13 ? 2 : 1),
  esp: d => (d <= 5 ? 5 : d <= 10 ? 4 : d <= 15 ? 3 : d <= 20 ? 2 : 1),
  om: d => (d >= 2 ? 5 : d >= 1 ? 4 : d >= 0.5 ? 3 : d >= 0.25 ? 2 : 1),
  ph: d => (d >= 6.5 && d <= 7.5 ? 5 : d >= 6 && d <= 8 ? 4 : d >= 5.5 && d <= 8.5 ? 3 : d >= 5 && d <= 9 ? 2 : 1),
  n: d => (d >= 40 ? 5 : d >= 25 ? 4 : d >= 15 ? 3 : d >= 8 ? 2 : 1),
  p: d => (d >= 20 ? 5 : d >= 12 ? 4 : d >= 7 ? 3 : d >= 4 ? 2 : 1),
  k: d => (d >= 175 ? 5 : d >= 120 ? 4 : d >= 80 ? 3 : d >= 50 ? 2 : 1),
  cec: d => (d >= 15 ? 5 : d >= 10 ? 4 : d >= 5 ? 3 : d >= 2 ? 2 : 1),
  ca: d => (d >= 2000 ? 5 : d >= 1500 ? 4 : d >= 1000 ? 3 : d >= 500 ? 2 : 1),
  mg: d => (d >= 180 ? 5 : d >= 120 ? 4 : d >= 60 ? 3 : d >= 30 ? 2 : 1),
  s: d => (d >= 15 ? 5 : d >= 10 ? 4 : d >= 6 ? 3 : d >= 3 ? 2 : 1),
  fe: d => (d >= 4.5 ? 5 : d >= 2.5 ? 4 : d >= 1.5 ? 3 : d >= 0.5 ? 2 : 1),
  zn: d => (d >= 1.5 ? 5 : d >= 1 ? 4 : d >= 0.6 ? 3 : d >= 0.3 ? 2 : 1),
  mn: d => (d >= 5 ? 5 : d >= 3 ? 4 : d >= 1 ? 3 : d >= 0.5 ? 2 : 1),
  cu: d => (d >= 1 ? 5 : d >= 0.5 ? 4 : d >= 0.2 ? 3 : d >= 0.1 ? 2 : 1),
  b: d => (d >= 0.5 && d <= 2 ? 5 : d >= 0.3 && d <= 4 ? 4 : d >= 0.2 && d <= 5 ? 3 : d >= 0.1 && d <= 8 ? 2 : 1),
};
const RANGE: Record<string, number> = { ece: 25, sar: 20, esp: 30, om: 4, ph: 11, n: 60, p: 40, k: 300, cec: 25, ca: 3000, mg: 300, s: 25, fe: 8, zn: 3, mn: 8, cu: 2, b: 12 };

describe('methodology', () => {
  it('weights sum to 100 and the default definition validates', () => {
    expect(M.indicators.reduce((a, i) => a + i.weight, 0)).toBe(100);
    expect(M.indicators).toHaveLength(17);
    expect(validateMethodology(M)).toEqual([]);
  });
  it('matches the workbook formulas on a dense grid and at every threshold', () => {
    for (const ind of M.indicators) {
      const pts: number[] = [];
      for (let i = 0; i <= 2000; i++) pts.push((RANGE[ind.key] * i) / 2000);
      for (const c of (ind.cuts as (number | number[])[]).flat()) pts.push(c, c - 1e-9, c + 1e-9);
      for (const d of pts) expect(scoreValue(ind, d).score, `${ind.key}=${d}`).toBe(X[ind.key](d));
    }
  });
});

describe('scoring', () => {
  it('computes score, coverage and rating on the measured basis', () => {
    const r = scoreSample(M, { ece: 1.5, sar: 2, esp: 4, om: 2.5, ph: 7 });
    expect(r.score).toBeCloseTo(100, 6); expect(r.coverage).toBeCloseTo(48, 6); expect(r.rating).toBe('healthy');
    const worst = scoreSample(M, { ece: 20, sar: 15, esp: 25, om: 0.1, ph: 9.5 });
    expect(worst.score).toBeCloseTo(20, 6); expect(worst.rating).toBe('poor');
    expect(scoreSample(M, {}).score).toBeUndefined();
  });
  it('reproduces a hand-calculated mixed sample', () => {
    // ECe 4 ->4 (13), SAR 8.42 ->3 (8), ESP 7.36 ->4 (7), OM 1.03 ->4 (13), pH 7.48 ->5 (7), P 10.67 ->3 (9), K 161.1 ->4 (8)
    const r = scoreSample(M, { ece: 4, sar: 8.42, esp: 7.36, om: 1.03, ph: 7.48, p: 10.67, k: 161.1 });
    const pts = (4 * 13 + 3 * 8 + 4 * 7 + 4 * 13 + 5 * 7 + 3 * 9 + 4 * 8) / 5;
    expect(r.points).toBeCloseTo(pts, 6); expect(r.measuredWeight).toBe(65); expect(r.score).toBeCloseTo((pts / 65) * 100, 6);
  });
  it('derives SAR, ESP and CEC consistent with the laboratory reports', () => {
    expect(derive({ sol_ca: 1040.7, sol_mg: 538.8, sol_na: 772.9 }).sar_calc).toBeCloseTo(4.84, 1);
    const d = derive({ ex_ca: 525.23, ex_mg: 37.43, ex_na: 57.2, ex_k: 73.65 });
    expect(d.cec_sum).toBeCloseTo(3.37, 1); expect(d.esp_calc).toBeCloseTo(7.36, 0);
    expect(derive({ ex_na: 363.97, cec: 6.74 }).esp_calc).toBeCloseTo(23.45, 0);
    const r = scoreSample(M, { sol_ca: 1040.7, sol_mg: 538.8, sol_na: 772.9 });
    expect(r.byKey.sar.source).toBe('calculated'); expect(r.byKey.sar.score).toBe(4);
  });
  it('flags unit and consistency problems', () => {
    const v = { ece: 2550, ph: 7.2 }; const codes = qaChecks(M, v, scoreSample(M, v)).map(f => f.code);
    expect(codes).toContain('ece-unit'); expect(codes).toContain('coverage');
    const v2 = { ece: 2.55, sol_ca: 128.58, sol_mg: 26.54, sol_na: 137.64, sol_k: 87.64, sol_cl: 5508.93, sol_hco3: 622.2 };
    expect(qaChecks(M, v2, scoreSample(M, v2)).map(f => f.code)).toContain('ion-balance');
  });
});

const tomato = DEFAULT_CROPS.find(c => c.id === 'tomato')!;
describe('agronomy', () => {
  it('salt tolerance, gypsum and leaching', () => {
    expect(relativeYield(tomato, 2)).toBe(100); expect(relativeYield(tomato, 5)).toBeCloseTo(75.25, 2); expect(relativeYield(tomato, 30)).toBe(0);
    expect(gypsumRequirement(20, 10, { purity: 1 })).toBeCloseTo(3.87, 1); expect(gypsumRequirement(8, 10)).toBe(0);
    expect(leachingRequirement(1, 2.5)).toBeCloseTo(1 / 11.5, 6); expect(leachingRequirement(13, 2.5)).toBeUndefined();
  });
  it('classifies irrigation water', () => {
    const w = classifyWater({ ecw: 4, na: 600, ca: 100, mg: 40, cl: 900, b: 0.5 });
    expect(w.worst).toBe('severe'); expect(w.items.find(i => i.key === 'b')!.restriction).toBe('none'); expect(w.sar).toBeGreaterThan(9);
  });
  it('reads crop and system from descriptions', () => {
    expect(matchCrop('624-16461-Cucumber-before net house', DEFAULT_CROPS)?.id).toBe('cucumber');
    expect(matchSystem('624-16461-Cucumber-before net house')).toBe('NH'); expect(matchSystem('422557-Tomato Round NT')).toBe('NH');
    expect(matchSystem('434255/OPEN FIELD')).toBe('OF'); expect(matchSystem('GH RO')).toBe('GH');
  });
});

describe('recommendations', () => {
  it('saline-sodic soil: gypsum before leaching, with a quantified requirement', () => {
    const v = { ece: 10.29, sar: 36.58, esp: 23.45, cec: 6.74, om: 2.82, ph: 6.87, p: 12.2, k: 221.6, fe: 2.17, zn: 1.32, cu: 0.26, mn: 1.63, b: 0.32, ex_ca: 735.4, ex_mg: 110.4, sol_cl: 1667.57, sol_hco3: 988.2 };
    const r = recommend(M, scoreSample(M, v), { texture: 'Sand', crop: tomato });
    expect(r.constraints[0].topic).toMatch(/salinity|sodicity/);
    expect(r.shortTerm.find(x => x.id === 'sod-gyp')!.en).toMatch(/before leaching/);
    expect(r.estimates.find(e => e.key === 'gypsum')).toBeTruthy(); expect(r.estimates.find(e => e.key === 'yield')!.value).toBe('23%');
    expect(r.constraints.some(c => c.id === 'cl')).toBe(true); expect(r.overall.ar.length).toBeGreaterThan(40);
    for (const c of [...r.constraints, ...r.shortTerm, ...r.longTerm]) { expect(c.en).not.toMatch(/undefined|NaN/); expect(c.ar).not.toMatch(/undefined|NaN/); }
  });
  it('healthy soil produces no critical constraints', () => {
    const v = { ece: 1.2, sar: 2, esp: 3, om: 2.4, ph: 7.2, n: 45, p: 24, k: 190, cec: 16, ex_ca: 2100, ex_mg: 190, s: 16, fe: 5, zn: 1.8, mn: 6, cu: 1.2, b: 1 };
    const res = scoreSample(M, v); const r = recommend(M, res);
    expect(res.score).toBe(100); expect(r.constraints).toHaveLength(0); expect(r.groups.vegetables.en).toMatch(/does not limit/);
  });
});

describe('import helpers', () => {
  it('parses values, dates, sample numbers and CSV', () => {
    expect(parseValue('<0.05')).toEqual({ value: 0.05, qualifier: '<' }); expect(parseValue('1,040.70').value).toBe(1040.7); expect(parseValue('Not analyzed').value).toBeUndefined();
    expect(parseDate('19/9/2025')).toBe('2025-09-19'); expect(parseDate('18-09-2025')).toBe('2025-09-18');
    expect(normSampleNo('SP12-25 N')).toBe('SP 12-25'); expect(normSampleNo('sp 208-25')).toBe('SP 208-25');
    const csv = toCsv([['sample_no', 'ece', 'zn', 'crop'], ['SP 1-26', 3.2, '<0.05', 'Tomato']]);
    const { samples } = parseSampleCsv(csv);
    expect(samples[0].values).toEqual({ ece: 3.2, zn: 0.05 }); expect(samples[0].qualifiers.zn).toBe('<'); expect(samples[0].meta.crop).toBe('Tomato');
  });
});
