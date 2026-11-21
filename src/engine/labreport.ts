// Parser for Innovation Oasis soil laboratory reports in Word (.docx) format, and for CSV templates.
// Works in the browser and in Node (used by scripts/build-seed.ts): no DOM required.
import { unzipSync, strFromU8 } from 'fflate';
import { ANALYTES } from './methodology';

export interface ParsedReport {
  sampleNo?: string; supplyNo?: string; description?: string; sampledOn?: string; receivedOn?: string; analysedOn?: string;
  texture?: string; values: Record<string, number>; qualifiers: Record<string, string>;
  legacy?: Record<string, { en: string; ar: string }>; warnings: string[];
}

const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const textOf = (xml: string) => decode([...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)].map(m => (m[1] !== undefined ? m[1] : ' ')).join('')).replace(/\s+/g, ' ').trim();

export function docxTables(buf: Uint8Array): { tables: string[][][]; paragraphs: string[] } {
  const files = unzipSync(buf, { filter: f => f.name === 'word/document.xml' });
  const doc = files['word/document.xml'];
  if (!doc) throw new Error('Not a Word document (word/document.xml missing).');
  const xml = strFromU8(doc);
  const tables: string[][][] = [];
  for (const t of xml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)) {
    const rows: string[][] = [];
    for (const r of t[1].matchAll(/<w:tr[ >]([\s\S]*?)<\/w:tr>/g)) rows.push([...r[1].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map(c => textOf(c[1])));
    tables.push(rows);
  }
  const outside = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, '');
  const paragraphs = [...outside.matchAll(/<w:p[ >]([\s\S]*?)<\/w:p>/g)].map(p => textOf(p[1])).filter(Boolean);
  return { tables, paragraphs };
}

const NAME_MAP: [RegExp, string][] = [
  [/^ph\b/i, 'ph'], [/^ece?\b/i, 'ece'], [/^organic matter/i, 'om'], [/^sar\b/i, 'sar'], [/^esp\b/i, 'esp'], [/^cec\b|cation exchange/i, 'cec'],
  [/^caco/i, 'caco3'], [/^saturation/i, 'sp'], [/texture/i, 'texture'],
  [/soluble calcium/i, 'sol_ca'], [/soluble magnesium/i, 'sol_mg'], [/soluble sodium/i, 'sol_na'], [/soluble potassium/i, 'sol_k'],
  [/soluble chloride/i, 'sol_cl'], [/soluble bicarbonate/i, 'sol_hco3'], [/soluble sul(f|ph)ate/i, 'sol_so4'],
  [/exchangeable calcium/i, 'ex_ca'], [/exchangeable magnesium/i, 'ex_mg'], [/exchangeable sodium/i, 'ex_na'], [/exchangeable potassium/i, 'ex_k'],
  [/available nitrogen|mineral n/i, 'n'], [/available phosph/i, 'p'], [/available potassium/i, 'k'], [/available sul(f|ph)ur/i, 's'],
  [/^iron|\(fe\)/i, 'fe'], [/^zinc|\(zn\)/i, 'zn'], [/^copper|\(cu\)/i, 'cu'], [/^manganese|\(mn\)/i, 'mn'], [/^boron|\(b\)/i, 'b'],
  [/bulk density/i, 'bd'], [/infiltration/i, 'infil'], [/respiration/i, 'resp'], [/microbial biomass/i, 'mbc'],
];
export const analyteFromName = (name: string): string | undefined => NAME_MAP.find(([re]) => re.test(name.trim()))?.[1];

export function parseValue(raw: string): { value?: number; qualifier?: string } {
  const t = raw.replace(/,/g, '').trim();
  const m = t.match(/^([<>≤≥])?\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return {};
  return { value: parseFloat(m[2]), qualifier: m[1] ? (m[1] === '≤' ? '<' : m[1] === '≥' ? '>' : m[1]) : undefined };
}

/** Normalises dd/mm/yyyy, dd-mm-yyyy and d/m/yy to ISO yyyy-mm-dd. */
export function parseDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const m = raw.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  const iso = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? iso[0] : undefined;
}

export const normSampleNo = (s: string) => {
  const m = s.toUpperCase().match(/SP[\s\-]*0*(\d+)[\s\-]*(\d{2})?/);
  return m ? `SP ${m[1].padStart(2, '0')}-${m[2] ?? '25'}` : s.trim();
};

const LEGACY_KEYS: [RegExp, string][] = [[/overall/i, 'overall'], [/constraint/i, 'constraints'], [/vegetable/i, 'vegetables'], [/field/i, 'field'], [/fruit|tree/i, 'trees'], [/short/i, 'short'], [/long/i, 'long']];

export function parseLabDocx(buf: Uint8Array, fileName?: string): ParsedReport {
  const { tables, paragraphs } = docxTables(buf);
  const out: ParsedReport = { values: {}, qualifiers: {}, warnings: [] };
  const kv: Record<string, string> = {};
  for (const t of tables) {
    const head = (t[0] ?? []).map(c => c.toLowerCase());
    if (head[0]?.startsWith('customer name') && t[1]) { kv['customer'] = t[1][0]; continue; }
    if (head[0] === 'parameter' || t.some(r => analyteFromName(r[0] ?? '') === 'ph')) {
      for (const r of t) {
        const key = analyteFromName(r[0] ?? '');
        if (!key) continue;
        const cell = r.slice(1).find(c => c && c.trim() !== '');
        if (!cell || /not analy[sz]ed/i.test(cell)) continue;
        if (key === 'texture') { out.texture = cell; continue; }
        const { value, qualifier } = parseValue(cell);
        if (value === undefined) continue;
        out.values[key] = value; if (qualifier) out.qualifiers[key] = qualifier;
      }
      continue;
    }
    if (head[0] === 'component') {
      out.legacy = {};
      for (const r of t.slice(1)) { const k = LEGACY_KEYS.find(([re]) => re.test(r[0] ?? ''))?.[1]; if (k) out.legacy[k] = { en: r[1] ?? '', ar: r[2] ?? '' }; }
      continue;
    }
    for (const r of t) if (r.length >= 2 && r[0]) kv[r[0].toLowerCase().replace(/[*:]/g, '').trim()] = r[r.length - 1];
  }
  const get = (...keys: string[]) => { for (const k of keys) { const hit = Object.keys(kv).find(x => x.startsWith(k)); if (hit && kv[hit] && kv[hit] !== 'N/A') return kv[hit]; } return undefined; };
  const noPara = paragraphs.map(p => p.match(/sample no\s*:?\s*(SP[\s\-]*\d+[\s\-]*\d*)/i)?.[1]).find(Boolean);
  const no = noPara ?? get('report_no', 'report no') ?? fileName?.replace(/\.docx$/i, '');
  if (no) out.sampleNo = normSampleNo(no);
  out.supplyNo = get('customer')?.trim();
  if (out.supplyNo && /^x+$/i.test(out.supplyNo)) out.supplyNo = undefined;
  out.description = get('sample description', 'description');
  out.sampledOn = parseDate(get('date of manufacture', 'sampled'));
  out.receivedOn = parseDate(get('received'));
  out.analysedOn = parseDate(get('analysed', 'analyzed'));
  if (!Object.keys(out.values).length) out.warnings.push('No analytical values were found in this document.');
  if (out.values.ece !== undefined && out.values.ece > 60) out.warnings.push('ECe looks like µS/cm; it was kept as reported - correct the unit before scoring.');
  return out;
}

// ---------------------------------------------------------------- CSV

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = '', q = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === ';' || c === '\t') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (c !== '\r') cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

export const csvEscape = (v: unknown) => { const s = v === undefined || v === null ? '' : String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export const toCsv = (rows: unknown[][]) => '﻿' + rows.map(r => r.map(csvEscape).join(',')).join('\r\n');

export const CSV_META = ['sample_no', 'farm_no', 'supply_no', 'description', 'crop', 'system', 'texture', 'depth_cm', 'sampled_on', 'received_on', 'analysed_on', 'lat', 'lon'];
export const CSV_COLUMNS = [...CSV_META, ...ANALYTES.map(a => a.key)];

export interface CsvSample { meta: Record<string, string>; values: Record<string, number>; qualifiers: Record<string, string> }
export function parseSampleCsv(text: string): { samples: CsvSample[]; unknown: string[] } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { samples: [], unknown: [] };
  const head = rows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const keys = new Set(ANALYTES.map(a => a.key));
  const unknown = head.filter(h => h && !keys.has(h) && !CSV_META.includes(h));
  const samples = rows.slice(1).map(r => {
    const s: CsvSample = { meta: {}, values: {}, qualifiers: {} };
    head.forEach((h, i) => {
      const cell = (r[i] ?? '').trim(); if (!cell) return;
      if (keys.has(h)) { const { value, qualifier } = parseValue(cell); if (value !== undefined) { s.values[h] = value; if (qualifier) s.qualifiers[h] = qualifier; } }
      else if (CSV_META.includes(h)) s.meta[h] = cell;
    });
    return s;
  }).filter(s => s.meta.sample_no);
  return { samples, unknown };
}
