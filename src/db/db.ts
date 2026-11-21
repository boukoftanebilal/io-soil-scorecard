// In-browser relational database: SQLite (sql.js / WebAssembly) persisted to IndexedDB.
// The whole database can be exported as a standard .sqlite file and restored on another device.
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { gunzipSync } from 'fflate';
import { DEFAULT_METHODOLOGY, Methodology } from '../engine/methodology';
import { DEFAULT_CROPS, Crop, WaterValues } from '../engine/agronomy';

export type Role = 'admin' | 'analyst' | 'agronomist' | 'viewer';
export interface User { id: number; username: string; name: string; role: Role; active: number; created_at: string }
export interface Farm { id: number; farm_no: string; supply_no: string; owner: string; engineer: string; region: string; emirate: string; lat: number | null; lon: number | null; area_ha: number | null; irrigation_source: string; notes: string }
export interface Sample {
  id: number; sample_no: string; farm_id: number | null; description: string; crop_id: string; system: string; texture: string; depth_cm: number | null;
  sampled_on: string; received_on: string; analysed_on: string; lat: number | null; lon: number | null; status: 'draft' | 'reviewed' | 'issued';
  notes: string; note_en: string; note_ar: string; water_id: number | null; legacy: Record<string, { en: string; ar: string }> | null;
  created_at: string; created_by: string; reviewed_by: string;
  values: Record<string, number>; qualifiers: Record<string, string>;
}
export interface WaterSample { id: number; sample_no: string; farm_id: number | null; source: string; sampled_on: string; values: WaterValues; notes: string }
export interface ReportRec { id: number; sample_id: number; issued_at: string; issued_by: string; score: number | null; rating: string; coverage: number | null; methodology: string; lang: string }
export interface Audit { id: number; ts: string; user: string; action: string; entity: string; ref: string; detail: string }
export interface MethodologyRec { id: number; active: number; created_at: string; created_by: string; data: Methodology }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, salt TEXT NOT NULL, pw_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS farms (id INTEGER PRIMARY KEY AUTOINCREMENT, farm_no TEXT, supply_no TEXT, owner TEXT, engineer TEXT, region TEXT, emirate TEXT, lat REAL, lon REAL, area_ha REAL, irrigation_source TEXT, notes TEXT);
CREATE TABLE IF NOT EXISTS water_samples (id INTEGER PRIMARY KEY AUTOINCREMENT, sample_no TEXT, farm_id INTEGER REFERENCES farms(id), source TEXT, sampled_on TEXT, data TEXT, notes TEXT);
CREATE TABLE IF NOT EXISTS samples (id INTEGER PRIMARY KEY AUTOINCREMENT, sample_no TEXT UNIQUE NOT NULL, farm_id INTEGER REFERENCES farms(id), description TEXT, crop_id TEXT, system TEXT, texture TEXT, depth_cm REAL,
  sampled_on TEXT, received_on TEXT, analysed_on TEXT, lat REAL, lon REAL, status TEXT NOT NULL DEFAULT 'draft', notes TEXT, note_en TEXT, note_ar TEXT, water_id INTEGER REFERENCES water_samples(id), legacy TEXT, created_at TEXT, created_by TEXT, reviewed_by TEXT);
CREATE TABLE IF NOT EXISTS results (sample_id INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE, analyte TEXT NOT NULL, value REAL NOT NULL, qualifier TEXT, PRIMARY KEY (sample_id, analyte));
CREATE TABLE IF NOT EXISTS methodologies (id INTEGER PRIMARY KEY AUTOINCREMENT, active INTEGER NOT NULL DEFAULT 0, created_at TEXT, created_by TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS crops (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, sample_id INTEGER NOT NULL REFERENCES samples(id) ON DELETE CASCADE, issued_at TEXT, issued_by TEXT, score REAL, rating TEXT, coverage REAL, methodology TEXT, lang TEXT);
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, user TEXT, action TEXT, entity TEXT, ref TEXT, detail TEXT);
CREATE INDEX IF NOT EXISTS idx_results_sample ON results(sample_id);
CREATE INDEX IF NOT EXISTS idx_samples_farm ON samples(farm_id);
`;

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const IDB_NAME = 'io-soil-scorecard', IDB_STORE = 'db', IDB_KEY = 'main';

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idbGet(): Promise<Uint8Array | undefined> {
  const d = await idb();
  return new Promise((res, rej) => { const q = d.transaction(IDB_STORE).objectStore(IDB_STORE).get(IDB_KEY); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
async function idbPut(v: Uint8Array | undefined): Promise<void> {
  const d = await idb();
  return new Promise((res, rej) => { const tx = d.transaction(IDB_STORE, 'readwrite'); if (v) tx.objectStore(IDB_STORE).put(v, IDB_KEY); else tx.objectStore(IDB_STORE).delete(IDB_KEY); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}

export async function initEngine(wasmUrl: string) { if (!SQL) SQL = await initSqlJs({ locateFile: () => wasmUrl } as unknown as Parameters<typeof initSqlJs>[0]); }

/** Opens the saved database. Returns false when this device has no database yet. */
export async function openSaved(): Promise<boolean> {
  let bytes: Uint8Array | undefined;
  try { bytes = await idbGet(); } catch { bytes = undefined; }
  if (!bytes) return false;
  db = new SQL!.Database(bytes); db.run('PRAGMA foreign_keys = ON;'); db.run(SCHEMA);
  return true;
}
export function createEmpty() {
  db = new SQL!.Database(); db.run('PRAGMA foreign_keys = ON;'); db.run(SCHEMA);
  run('INSERT INTO methodologies (active, created_at, created_by, data) VALUES (1, ?, ?, ?)', [now(), 'system', JSON.stringify(DEFAULT_METHODOLOGY)]);
  for (const c of DEFAULT_CROPS) run('INSERT INTO crops (id, data) VALUES (?, ?)', [c.id, JSON.stringify(c)]);
  setSetting('created_at', now());
}
export function loadBytes(bytes: Uint8Array) {
  const test = new SQL!.Database(bytes);
  const t = test.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('samples','users','methodologies')");
  if (!t.length || t[0].values.length < 3) { test.close(); throw new Error('This file is not a Soil Scorecard database.'); }
  db?.close(); db = test; db.run('PRAGMA foreign_keys = ON;'); db.run(SCHEMA);
}
export const exportBytes = (): Uint8Array => db!.export();
export async function saveNow() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } if (db) await idbPut(db.export()); }
export function scheduleSave() { if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveNow().catch(e => console.error('save failed', e)); }, 250); }
export async function wipeDevice() { db?.close(); db = null; await idbPut(undefined); }
export const isOpen = () => !!db;

export const now = () => new Date().toISOString();
type P = (string | number | null | Uint8Array)[];
export function run(sql: string, params: P = []) { db!.run(sql, params); }
export function all<T = Record<string, unknown>>(sql: string, params: P = []): T[] {
  const st = db!.prepare(sql); st.bind(params); const out: T[] = [];
  while (st.step()) out.push(st.getAsObject() as T);
  st.free(); return out;
}
export const one = <T = Record<string, unknown>>(sql: string, params: P = []): T | undefined => all<T>(sql, params)[0];
const lastId = () => (one<{ id: number }>('SELECT last_insert_rowid() AS id')!.id);
/** Runs a read-only query typed by the user in the admin console. */
export function query(sql: string): { columns: string[]; values: unknown[][] } {
  if (!/^\s*(select|with|pragma table_info)/i.test(sql) || /;\s*\S/.test(sql)) throw new Error('Only a single SELECT statement is allowed here.');
  const r = db!.exec(sql);
  return r[0] ? { columns: r[0].columns, values: r[0].values as unknown[][] } : { columns: [], values: [] };
}

export const getSetting = (k: string) => one<{ value: string }>('SELECT value FROM settings WHERE key = ?', [k])?.value;
export function setSetting(k: string, v: string) { run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [k, v]); }

export function audit(user: string, action: string, entity: string, ref: string, detail = '') {
  run('INSERT INTO audit_log (ts, user, action, entity, ref, detail) VALUES (?, ?, ?, ?, ?, ?)', [now(), user, action, entity, ref, detail]);
}

// ---------------------------------------------------------------- crypto
const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => new Uint8Array(s.match(/../g)!.map(h => parseInt(h, 16)));
async function pbkdf2(secret: string, salt: Uint8Array, iterations: number, bits = 256) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, bits);
}
const PW_ITER = 150000;
async function hashPw(pw: string, saltHex?: string) {
  const salt = saltHex ? unhex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  return { salt: hex(salt), hash: hex(await pbkdf2(pw, salt, PW_ITER)) };
}

export interface SeedEnvelope { v: number; iter: number; salt: string; iv: string; ct: string }
export async function decryptSeed(envelope: SeedEnvelope, accessKey: string): Promise<unknown> {
  const bits = await pbkdf2(accessKey.trim(), unhex(envelope.salt), envelope.iter);
  const key = await crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['decrypt']);
  const ct = Uint8Array.from(atob(envelope.ct), c => c.charCodeAt(0));
  let plain: ArrayBuffer;
  try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unhex(envelope.iv) as BufferSource }, key, ct); }
  catch { throw new Error('That access key does not unlock the dataset.'); }
  return JSON.parse(new TextDecoder().decode(gunzipSync(new Uint8Array(plain))));
}

// ---------------------------------------------------------------- users
export const listUsers = () => all<User>('SELECT id, username, name, role, active, created_at FROM users ORDER BY id');
export async function createUser(u: { username: string; name: string; role: Role; password: string }) {
  if (u.password.length < 8) throw new Error('Password must be at least 8 characters.');
  if (one('SELECT 1 FROM users WHERE username = ?', [u.username.trim().toLowerCase()])) throw new Error('That username is already taken.');
  const { salt, hash } = await hashPw(u.password);
  run('INSERT INTO users (username, name, role, salt, pw_hash, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)', [u.username.trim().toLowerCase(), u.name.trim(), u.role, salt, hash, now()]);
  return lastId();
}
export async function setPassword(id: number, password: string) {
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');
  const { salt, hash } = await hashPw(password);
  run('UPDATE users SET salt = ?, pw_hash = ? WHERE id = ?', [salt, hash, id]);
}
export function updateUser(id: number, patch: { name?: string; role?: Role; active?: number }) {
  const u = one<User>('SELECT * FROM users WHERE id = ?', [id]); if (!u) return;
  run('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?', [patch.name ?? u.name, patch.role ?? u.role, patch.active ?? u.active, id]);
}
export async function login(username: string, password: string): Promise<User> {
  const u = one<User & { salt: string; pw_hash: string }>('SELECT * FROM users WHERE username = ?', [username.trim().toLowerCase()]);
  if (!u || !u.active) throw new Error('Username or password is incorrect.');
  const { hash } = await hashPw(password, u.salt);
  if (hash !== u.pw_hash) throw new Error('Username or password is incorrect.');
  return { id: u.id, username: u.username, name: u.name, role: u.role, active: u.active, created_at: u.created_at };
}

// ---------------------------------------------------------------- reference data
export function activeMethodology(): MethodologyRec {
  const r = one<{ id: number; active: number; created_at: string; created_by: string; data: string }>('SELECT * FROM methodologies WHERE active = 1 ORDER BY id DESC LIMIT 1');
  if (!r) return { id: 0, active: 1, created_at: '', created_by: '', data: DEFAULT_METHODOLOGY };
  return { ...r, data: JSON.parse(r.data, reviveInf) };
}
const reviveInf = (_k: string, v: unknown) => (v === null ? Infinity : v);
export const listMethodologies = (): MethodologyRec[] => all<{ id: number; active: number; created_at: string; created_by: string; data: string }>('SELECT * FROM methodologies ORDER BY id DESC').map(r => ({ ...r, data: JSON.parse(r.data, reviveInf) }));
export function saveMethodology(m: Methodology, user: string) {
  run('UPDATE methodologies SET active = 0');
  run('INSERT INTO methodologies (active, created_at, created_by, data) VALUES (1, ?, ?, ?)', [now(), user, JSON.stringify(m)]);
  audit(user, 'publish', 'methodology', `v${m.version}`, m.status);
}
export function activateMethodology(id: number, user: string) {
  run('UPDATE methodologies SET active = 0'); run('UPDATE methodologies SET active = 1 WHERE id = ?', [id]);
  audit(user, 'activate', 'methodology', String(id));
}
export const listCrops = (): Crop[] => all<{ data: string }>('SELECT data FROM crops').map(r => JSON.parse(r.data) as Crop).sort((a, b) => a.en.localeCompare(b.en));
export function saveCrop(c: Crop) { run('INSERT INTO crops (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data', [c.id, JSON.stringify(c)]); }
export function deleteCrop(id: string) { run('DELETE FROM crops WHERE id = ?', [id]); }

// ---------------------------------------------------------------- farms
export const listFarms = () => all<Farm>('SELECT * FROM farms ORDER BY farm_no, supply_no');
const FARM_COLS = ['farm_no', 'supply_no', 'owner', 'engineer', 'region', 'emirate', 'lat', 'lon', 'area_ha', 'irrigation_source', 'notes'] as const;
export function saveFarm(f: Partial<Farm>): number {
  const vals = FARM_COLS.map(c => { const v = (f as Record<string, unknown>)[c]; return v === undefined || v === '' ? (['lat', 'lon', 'area_ha'].includes(c) ? null : '') : (v as string | number | null); });
  if (f.id) { run(`UPDATE farms SET ${FARM_COLS.map(c => c + ' = ?').join(', ')} WHERE id = ?`, [...vals, f.id]); return f.id; }
  run(`INSERT INTO farms (${FARM_COLS.join(', ')}) VALUES (${FARM_COLS.map(() => '?').join(', ')})`, vals); return lastId();
}
export function deleteFarm(id: number) { run('UPDATE samples SET farm_id = NULL WHERE farm_id = ?', [id]); run('UPDATE water_samples SET farm_id = NULL WHERE farm_id = ?', [id]); run('DELETE FROM farms WHERE id = ?', [id]); }
export function findFarm(supplyNo?: string, farmNo?: string): Farm | undefined {
  if (supplyNo) { const f = one<Farm>('SELECT * FROM farms WHERE supply_no = ?', [supplyNo]); if (f) return f; }
  if (farmNo) return one<Farm>('SELECT * FROM farms WHERE farm_no = ?', [farmNo]);
  return undefined;
}

// ---------------------------------------------------------------- samples
const SAMPLE_COLS = ['sample_no', 'farm_id', 'description', 'crop_id', 'system', 'texture', 'depth_cm', 'sampled_on', 'received_on', 'analysed_on', 'lat', 'lon', 'status', 'notes', 'note_en', 'note_ar', 'water_id', 'legacy', 'created_at', 'created_by', 'reviewed_by'] as const;
const NUM_COLS = ['farm_id', 'depth_cm', 'lat', 'lon', 'water_id'];
export function listSamples(): Sample[] {
  const rows = all<Record<string, unknown>>('SELECT * FROM samples ORDER BY id DESC');
  const res = all<{ sample_id: number; analyte: string; value: number; qualifier: string | null }>('SELECT * FROM results');
  const by: Record<number, { values: Record<string, number>; qualifiers: Record<string, string> }> = {};
  for (const r of res) { const b = (by[r.sample_id] ??= { values: {}, qualifiers: {} }); b.values[r.analyte] = r.value; if (r.qualifier) b.qualifiers[r.analyte] = r.qualifier; }
  return rows.map(r => ({ ...(r as unknown as Sample), legacy: r.legacy ? JSON.parse(r.legacy as string) : null, values: by[r.id as number]?.values ?? {}, qualifiers: by[r.id as number]?.qualifiers ?? {} }));
}
export function saveSample(s: Partial<Sample> & { sample_no: string }, user: string): number {
  const rec: Record<string, unknown> = { status: 'draft', ...s, legacy: s.legacy ? JSON.stringify(s.legacy) : null };
  if (!s.id) { rec.created_at = now(); rec.created_by = user; }
  const vals = SAMPLE_COLS.map(c => { const v = rec[c]; return v === undefined || v === '' ? (NUM_COLS.includes(c) || c === 'legacy' ? null : '') : (v as string | number | null); });
  let id = s.id;
  if (id) {
    const keep = one<{ created_at: string; created_by: string }>('SELECT created_at, created_by FROM samples WHERE id = ?', [id]);
    vals[SAMPLE_COLS.indexOf('created_at')] = keep?.created_at ?? now(); vals[SAMPLE_COLS.indexOf('created_by')] = keep?.created_by ?? user;
    run(`UPDATE samples SET ${SAMPLE_COLS.map(c => c + ' = ?').join(', ')} WHERE id = ?`, [...vals, id]);
  } else {
    if (one('SELECT 1 FROM samples WHERE sample_no = ?', [s.sample_no])) throw new Error(`Sample ${s.sample_no} already exists.`);
    run(`INSERT INTO samples (${SAMPLE_COLS.join(', ')}) VALUES (${SAMPLE_COLS.map(() => '?').join(', ')})`, vals); id = lastId();
  }
  if (s.values) {
    run('DELETE FROM results WHERE sample_id = ?', [id]);
    for (const [k, v] of Object.entries(s.values)) if (typeof v === 'number' && isFinite(v)) run('INSERT INTO results (sample_id, analyte, value, qualifier) VALUES (?, ?, ?, ?)', [id, k, v, s.qualifiers?.[k] ?? null]);
  }
  return id;
}
export function deleteSample(id: number) { run('DELETE FROM results WHERE sample_id = ?', [id]); run('DELETE FROM reports WHERE sample_id = ?', [id]); run('DELETE FROM samples WHERE id = ?', [id]); }
export function setSampleStatus(id: number, status: Sample['status'], user: string) { run('UPDATE samples SET status = ?, reviewed_by = CASE WHEN ? = \'draft\' THEN \'\' ELSE ? END WHERE id = ?', [status, status, user, id]); }

// ---------------------------------------------------------------- water
export const listWater = (): WaterSample[] => all<Record<string, unknown>>('SELECT * FROM water_samples ORDER BY id DESC').map(r => ({ ...(r as unknown as WaterSample), values: JSON.parse((r.data as string) || '{}') }));
export function saveWater(w: Partial<WaterSample>): number {
  const p: P = [w.sample_no ?? '', w.farm_id ?? null, w.source ?? '', w.sampled_on ?? '', JSON.stringify(w.values ?? {}), w.notes ?? ''];
  if (w.id) { run('UPDATE water_samples SET sample_no = ?, farm_id = ?, source = ?, sampled_on = ?, data = ?, notes = ? WHERE id = ?', [...p, w.id]); return w.id; }
  run('INSERT INTO water_samples (sample_no, farm_id, source, sampled_on, data, notes) VALUES (?, ?, ?, ?, ?, ?)', p); return lastId();
}
export function deleteWater(id: number) { run('UPDATE samples SET water_id = NULL WHERE water_id = ?', [id]); run('DELETE FROM water_samples WHERE id = ?', [id]); }

// ---------------------------------------------------------------- reports + audit
export const listReports = () => all<ReportRec>('SELECT * FROM reports ORDER BY id DESC');
export function addReport(r: Omit<ReportRec, 'id'>) { run('INSERT INTO reports (sample_id, issued_at, issued_by, score, rating, coverage, methodology, lang) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [r.sample_id, r.issued_at, r.issued_by, r.score, r.rating, r.coverage, r.methodology, r.lang]); }
export const listAudit = (limit = 500) => all<Audit>('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', [limit]);
export const tableCounts = () => ['users', 'farms', 'samples', 'results', 'water_samples', 'methodologies', 'crops', 'reports', 'audit_log'].map(t => ({ table: t, rows: one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)!.n }));

// ---------------------------------------------------------------- bulk load (seed / demo)
export interface SeedData {
  farms: Partial<Farm>[];
  samples: (Partial<Sample> & { sample_no: string; supply_no?: string; farm_no?: string })[];
  water?: (Partial<WaterSample> & { supply_no?: string })[];
}
export function loadSeed(seed: SeedData, user: string): { farms: number; samples: number } {
  run('BEGIN');
  try {
    const bySupply: Record<string, number> = {}, byFarmNo: Record<string, number> = {};
    for (const f of seed.farms) { const id = saveFarm(f); if (f.supply_no) bySupply[f.supply_no] = id; if (f.farm_no) byFarmNo[f.farm_no] = id; }
    const waterIds: Record<string, number> = {};
    for (const w of seed.water ?? []) { const id = saveWater({ ...w, farm_id: w.supply_no ? bySupply[w.supply_no] ?? null : null }); if (w.supply_no) waterIds[w.supply_no] = id; }
    let n = 0;
    for (const s of seed.samples) {
      if (one('SELECT 1 FROM samples WHERE sample_no = ?', [s.sample_no])) continue;
      const farm_id = (s.supply_no && bySupply[s.supply_no]) || (s.farm_no && byFarmNo[s.farm_no]) || null;
      saveSample({ ...s, farm_id, water_id: s.supply_no ? waterIds[s.supply_no] ?? null : null }, user); n++;
    }
    run('COMMIT');
    return { farms: seed.farms.length, samples: n };
  } catch (e) { run('ROLLBACK'); throw e; }
}
