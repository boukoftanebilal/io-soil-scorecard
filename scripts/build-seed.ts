// Builds the encrypted Silal dataset shipped with the app (public/seed.enc.json).
// Usage: tsx scripts/build-seed.ts <reports-dir> <list.json> <access-key> [--plain out.json]
// The source laboratory reports are confidential and are NOT part of this repository;
// only the AES-256-GCM encrypted bundle is. Without the access key it cannot be read.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { webcrypto as crypto } from 'node:crypto';
import { gzipSync } from 'fflate';
import { parseLabDocx, normSampleNo } from '../src/engine/labreport';
import { DEFAULT_CROPS, matchCrop, matchSystem } from '../src/engine/agronomy';

const [dir, listPath, accessKey, flag, plainOut] = process.argv.slice(2);
if (!dir || !listPath || !accessKey) { console.error('usage: build-seed <reports-dir> <list.json> <access-key>'); process.exit(1); }

interface ListRow { status?: string; file?: string; supply?: string; farm_no?: string; engineer?: string; farmer?: string }
const list: ListRow[] = JSON.parse(readFileSync(listPath, 'utf8'));
const listBy: Record<string, ListRow> = {};
const listByNum: Record<string, ListRow> = {};
for (const r of list) if (r.file) { if (/\bN\s*$/i.test(r.file)) listBy[normSampleNo(r.file) + ' N'] ??= r; else listBy[normSampleNo(r.file)] = r; listBy[normSampleNo(r.file)] ??= r; listByNum[normSampleNo(r.file).split('-')[0]] ??= r; }

const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = walk(dir).filter(f => /\.docx$/i.test(f) && /sp[\s\-]*\d/i.test(basename(f))).sort();

const farms: Record<string, any> = {};
const samples: any[] = [];
const seen = new Set<string>();
const clean = (s?: string) => (s ?? '').replace(/\?/g, '').replace(/\s+/g, ' ').trim();
for (const f of files) {
  const engineerDir = basename(join(f, '..'));
  let rep;
  try { rep = parseLabDocx(new Uint8Array(readFileSync(f)), basename(f)); } catch (e) { console.warn('skip', f, (e as Error).message); continue; }
  if (!Object.keys(rep.values).length) { console.warn('no values', f); continue; }
  const fileNo = normSampleNo(basename(f));
  let no = rep.sampleNo ?? fileNo;
  if (seen.has(no)) no = no + ' B';
  seen.add(no);
  const isN = /\bN\.docx$/i.test(basename(f));
  const row = (isN ? listBy[fileNo + ' N'] : undefined) ?? listBy[fileNo] ?? listBy[rep.sampleNo ?? ''] ?? listByNum[fileNo.split('-')[0]] ?? {};
  const repNo = rep.supplyNo && /^\d{4,}$/.test(rep.supplyNo) ? rep.supplyNo : '';
  const supply = clean(row.supply) || repNo || '';
  const engineer = engineerDir !== 'Unknown' ? engineerDir : clean(row.engineer);
  if (supply) {
    const fm = (farms[supply] ??= { supply_no: supply, farm_no: '', owner: '', engineer: '', region: '', emirate: 'Abu Dhabi', irrigation_source: '', notes: '' });
    if (!fm.farm_no && row.farm_no) fm.farm_no = clean(row.farm_no);
    if (!fm.owner && row.farmer && clean(row.supply) === supply) fm.owner = clean(row.farmer);
    if (!fm.engineer && engineer) fm.engineer = engineer;
  }
  const desc = rep.description ?? '';
  const suffix = basename(f).toUpperCase().match(/\b(GH|NH|OF)\b/)?.[1] ?? (row.file ?? '').toUpperCase().match(/\b(GH|NH|OF)\b/)?.[1];
  samples.push({
    sample_no: no, supply_no: supply, description: desc, crop_id: matchCrop(desc, DEFAULT_CROPS)?.id ?? '', system: matchSystem(desc) ?? suffix ?? '',
    texture: rep.texture ?? '', sampled_on: rep.sampledOn ?? '', received_on: rep.receivedOn ?? '', analysed_on: rep.analysedOn ?? '',
    status: 'issued', notes: `Imported from laboratory report ${basename(f)}`, legacy: rep.legacy ?? null, values: rep.values, qualifiers: rep.qualifiers,
  });
}
const seed = { farms: Object.values(farms), samples };
console.log(`parsed ${files.length} files -> ${samples.length} samples, ${seed.farms.length} farms; owners named: ${seed.farms.filter((f: any) => f.owner).length}`);
if (flag === '--plain' && plainOut) writeFileSync(plainOut, JSON.stringify(seed, null, 1));

const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => Buffer.from(b as ArrayBuffer).toString('hex');
const iter = 600000;
const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
const km = await crypto.subtle.importKey('raw', enc.encode(accessKey.trim()), 'PBKDF2', false, ['deriveBits']);
const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, km, 256);
const key = await crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt']);
const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, gzipSync(enc.encode(JSON.stringify(seed)), { level: 9 }));
writeFileSync(new URL('../public/seed.enc.json', import.meta.url), JSON.stringify({ v: 1, iter, salt: hex(salt), iv: hex(iv), ct: Buffer.from(ct).toString('base64') }));
console.log('wrote public/seed.enc.json', Math.round(Buffer.from(ct).length / 1024), 'KB');
