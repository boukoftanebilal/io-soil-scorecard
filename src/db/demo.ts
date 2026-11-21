// Synthetic demonstration dataset. Farms, people and results are invented and do not describe
// any real farm; the value ranges only mimic irrigated sandy, calcareous desert soils.
import { SeedData } from './db';

function rng(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const AREAS: [string, string, number, number][] = [
  ['Al Ain', 'Abu Dhabi', 24.19, 55.74], ['Al Khazna', 'Abu Dhabi', 24.17, 55.11], ['Sweihan', 'Abu Dhabi', 24.47, 55.33],
  ['Al Wathba', 'Abu Dhabi', 24.2, 54.72], ['Liwa', 'Abu Dhabi', 23.13, 53.77], ['Madinat Zayed', 'Abu Dhabi', 23.68, 53.71], ['Al Dhaid', 'Sharjah', 25.28, 55.88],
];
const CROPS = ['tomato', 'cucumber', 'pepper', 'lettuce', 'datepalm', 'alfalfa', 'sweetcorn', 'zucchini', 'eggplant', 'strawberry', 'barley', 'melon'];
const SOURCES = ['Borehole', 'Reverse osmosis', 'Blended', 'Treated sewage effluent', 'Municipal'];

export function demoSeed(): SeedData {
  const r = rng(20261120);
  const u = (a: number, b: number) => a + (b - a) * r();
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;
  const seed: SeedData = { farms: [], samples: [], water: [] };
  let sp = 1;
  for (let i = 1; i <= 16; i++) {
    const [region, emirate, la, lo] = AREAS[(i - 1) % AREAS.length];
    const supply = String(900000 + i * 137);
    const source = pick(SOURCES);
    const stress = r(); // 0 = well managed, 1 = saline/sodic
    seed.farms.push({ farm_no: `D-${String(i).padStart(3, '0')}`, supply_no: supply, owner: `Demo Farm ${String(i).padStart(2, '0')}`, engineer: `Demo Engineer ${1 + (i % 4)}`, region, emirate, lat: round(la + u(-0.12, 0.12), 5), lon: round(lo + u(-0.12, 0.12), 5), area_ha: round(u(2, 40), 1), irrigation_source: source, notes: 'Demonstration record' });
    const ecw = source === 'Reverse osmosis' ? u(0.2, 0.6) : source === 'Municipal' ? u(0.3, 0.8) : u(1.5, 9) * (0.5 + stress);
    const na = ecw * u(110, 150), ca = ecw * u(35, 60), mg = ecw * u(12, 25);
    seed.water!.push({ sample_no: `WT ${String(i).padStart(2, '0')}-26`, supply_no: supply, source, sampled_on: '2026-02-10', notes: 'Demonstration record', values: { ecw: round(ecw, 2), tds: round(ecw * 640, 0), ph: round(u(7.1, 8.3), 2), na: round(na, 0), ca: round(ca, 0), mg: round(mg, 0), cl: round(ecw * u(180, 240), 0), hco3: round(u(120, 420), 0), b: round(u(0.2, 2.8) * (0.4 + stress), 2), no3n: round(u(1, 18), 1) } });
    const nSamples = 2 + Math.floor(r() * 4);
    const system = pick(['GH', 'NH', 'OF', 'OF']);
    const crop = system === 'OF' ? pick(['datepalm', 'alfalfa', 'sweetcorn', 'barley', 'melon', 'tomato']) : pick(CROPS.slice(0, 4).concat(['zucchini', 'eggplant', 'strawberry']));
    for (let j = 0; j < nSamples; j++) {
      const improve = 1 - j * 0.12; // later samples slightly better
      const ece = Math.max(0.4, (0.6 + stress * 14 * r() + (system === 'GH' ? 1.5 : 0)) * improve);
      const om = Math.max(0.08, (system === 'OF' ? u(0.1, 1.2) : u(0.6, 3.2)) + j * 0.12);
      const exCa = u(450, 2100), exMg = u(30, 210), exK = u(40, 260);
      const cecTarget = exCa / 200.4 + exMg / 121.5 + exK / 391;
      const espT = Math.max(1, 2 + stress * 22 * r() * improve);
      const exNa = (espT / 100) * cecTarget / (1 - espT / 100) * 229.9;
      const cec = cecTarget + exNa / 229.9;
      const cat = ece * 10; // meq/L
      const naF = Math.min(0.75, 0.25 + stress * 0.5 * r());
      const solNa = cat * naF * 22.99, solCa = cat * (1 - naF) * 0.6 * 20.04, solMg = cat * (1 - naF) * 0.3 * 12.153, solK = cat * (1 - naF) * 0.1 * 39.1;
      const sar = (solNa / 22.99) / Math.sqrt((solCa / 20.04 + solMg / 12.153) / 2);
      const month = String(1 + ((j * 5 + i) % 12)).padStart(2, '0');
      const year = 2025 + Math.floor((j * 5 + i) / 12) % 2;
      const full = r() > 0.35;
      const values: Record<string, number> = {
        ph: round(u(7.0, 8.7), 2), ece: round(ece, 2), om: round(om, 2), sar: round(sar, 2), esp: round((exNa / 229.9) / cec * 100, 2), cec: round(cec, 2),
        sp: round(u(22, 34), 1), caco3: round(u(4, 32), 1),
        sol_ca: round(solCa, 1), sol_mg: round(solMg, 1), sol_na: round(solNa, 1), sol_k: round(solK, 1), sol_cl: round(cat * u(0.5, 0.75) * 35.45, 1), sol_hco3: round(u(120, 520), 1),
        ex_ca: round(exCa, 1), ex_mg: round(exMg, 1), ex_na: round(exNa, 1), ex_k: round(exK, 1),
        p: round(u(2, 55), 2), k: round(exK, 1), fe: round(u(0.2, 6.5), 2), zn: round(u(0.05, 2.2), 2), mn: round(u(0.1, 6.5), 2), cu: round(u(0.05, 1.4), 2), b: round(u(0.1, 3.2) * (0.5 + stress), 2),
      };
      if (full) { values.n = round(u(4, 48), 1); values.s = round(u(2, 24), 1); }
      if (r() > 0.7) { values.bd = round(u(1.3, 1.82), 2); values.infil = round(u(20, 160), 0); values.mbc = round(u(40, 290), 0); values.resp = round(u(8, 48), 0); }
      seed.samples.push({
        sample_no: `SP ${String(sp++).padStart(2, '0')}-${String(year).slice(2)} D`, supply_no: supply, description: `${system === 'GH' ? 'Greenhouse' : system === 'NH' ? 'Net house' : 'Open field'} - demonstration sample`, crop_id: crop, system, texture: r() > 0.85 ? 'Loamy sand' : 'Sand', depth_cm: 30,
        sampled_on: `${year}-${month}-${String(3 + (i % 20)).padStart(2, '0')}`, received_on: `${year}-${month}-${String(4 + (i % 20)).padStart(2, '0')}`, analysed_on: `${year}-${month}-${String(8 + (i % 20)).padStart(2, '0')}`,
        lat: round(seed.farms[i - 1].lat! + u(-0.004, 0.004), 5), lon: round(seed.farms[i - 1].lon! + u(-0.004, 0.004), 5), status: pick(['draft', 'reviewed', 'issued', 'issued']), notes: 'Demonstration record', values, qualifiers: {},
      });
    }
  }
  return seed;
}
