import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as db from '../db/db';
import { Farm, WaterSample, Role } from '../db/db';
import { Methodology, INDICATOR_LABEL, ANALYTE, analyteOf, bandText, validateMethodology, Indicator } from '../engine/methodology';
import { scoreSample } from '../engine/score';
import { classifyWater, WATER_FIELDS, WaterValues, Crop } from '../engine/agronomy';
import { toCsv } from '../engine/labreport';
import { useApp, Panel, Rating, Status, F, Modal, Empty, HBars, TrendLine, fmt, fmtDate, farmName, download, go, SYSTEMS, ROLE_LABEL, Scored, RATING_COL, tip } from './core';
import { exportSamplesCsv, ConfirmButton } from './pages1';

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const median = (xs: number[]) => { if (!xs.length) return undefined; const s = [...xs].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const latest = (xs: Scored[]) => [...xs].sort((a, b) => (b.s.analysed_on || b.s.created_at || '').localeCompare(a.s.analysed_on || a.s.created_at || ''))[0];
const RATING_HEX: Record<string, string> = { healthy: '#2e9e6e', moderate: '#d99a1c', marginal: '#db6b2c', poor: '#c23b3b' };

// ================================================================ farms
function FarmMap({ farms, onPick }: { farms: { f: Farm; rating?: string; score?: number }[]; onPick: (id: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const map = L.map(ref.current, { scrollWheelZoom: false }).setView([24.2, 54.8], 8);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    const pts: [number, number][] = [];
    for (const { f, rating, score } of farms) {
      if (f.lat == null || f.lon == null) continue;
      pts.push([f.lat, f.lon]);
      L.circleMarker([f.lat, f.lon], { radius: 8, color: '#fff', weight: 2, fillColor: rating ? RATING_HEX[rating] : '#7b8496', fillOpacity: 1 })
        .bindTooltip(`${farmName(f)}${score !== undefined ? ` - latest score ${score.toFixed(1)}` : ' - not scored'}`).on('click', () => onPick(f.id)).addTo(map);
    }
    if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.25));
    return () => { map.remove(); };
  }, [farms, onPick]);
  return <div ref={ref} className="map" />;
}

function FarmForm({ farm, onClose }: { farm?: Farm; onClose: () => void }) {
  const { user, refresh, toast } = useApp();
  const [f, setF] = useState<Record<string, string>>(() => Object.fromEntries(['farm_no', 'supply_no', 'owner', 'engineer', 'region', 'emirate', 'lat', 'lon', 'area_ha', 'irrigation_source', 'notes'].map(k => [k, String((farm as unknown as Record<string, unknown>)?.[k] ?? '')])));
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const n = (x: string) => (x.trim() === '' || isNaN(Number(x)) ? null : Number(x));
  const save = () => { const id = db.saveFarm({ id: farm?.id, ...f, lat: n(f.lat), lon: n(f.lon), area_ha: n(f.area_ha) } as Partial<Farm>); db.audit(user.username, farm ? 'edit' : 'create', 'farm', f.farm_no || f.supply_no || String(id)); refresh(); toast('Farm saved'); onClose(); };
  return (
    <Modal title={farm ? 'Edit farm' : 'Add farm'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" onClick={save} disabled={!f.farm_no && !f.supply_no}>Save farm</button></>}>
      <div className="fields">
        <F label="Farm number"><input value={f.farm_no} onChange={set('farm_no')} /></F><F label="Supply number"><input value={f.supply_no} onChange={set('supply_no')} /></F>
        <F label="Owner"><input value={f.owner} onChange={set('owner')} /></F><F label="Extension engineer"><input value={f.engineer} onChange={set('engineer')} /></F>
        <F label="Region"><input value={f.region} onChange={set('region')} /></F><F label="Emirate"><input value={f.emirate} onChange={set('emirate')} /></F>
        <F label="Latitude"><input value={f.lat} onChange={set('lat')} inputMode="decimal" /></F><F label="Longitude"><input value={f.lon} onChange={set('lon')} inputMode="decimal" /></F>
        <F label="Area (ha)"><input value={f.area_ha} onChange={set('area_ha')} inputMode="decimal" /></F>
        <F label="Irrigation source"><input value={f.irrigation_source} onChange={set('irrigation_source')} list="sources" /><datalist id="sources">{['Borehole', 'Reverse osmosis', 'Municipal', 'Treated sewage effluent', 'Blended'].map(s => <option key={s} value={s} />)}</datalist></F>
        <F label="Notes" span={2}><textarea value={f.notes} onChange={set('notes')} /></F>
      </div>
    </Modal>
  );
}

export function FarmsPage() {
  const { data, can } = useApp();
  const m = data.meth.data;
  const [q, setQ] = useState(''), [add, setAdd] = useState(false);
  const rows = useMemo(() => data.farms.map(f => { const xs = data.scored.filter(x => x.s.farm_id === f.id && x.res.score !== undefined); const l = latest(xs); return { f, n: data.samples.filter(s => s.farm_id === f.id).length, score: l?.res.score, rating: l?.res.rating, last: l?.s.analysed_on }; }), [data]);
  const shown = rows.filter(r => !q || `${r.f.farm_no} ${r.f.supply_no} ${r.f.owner} ${r.f.engineer} ${r.f.region}`.toLowerCase().includes(q.toLowerCase()));
  const geo = data.farms.filter(f => f.lat != null && f.lon != null).length;
  const pick = React.useCallback((id: number) => go(`/farms/${id}`), []);
  return (
    <div className="stack">
      <div className="row wrap spread no-print"><input style={{ width: 300 }} placeholder="Search farm, supply number, owner or engineer" value={q} onChange={e => setQ(e.target.value)} aria-label="Search farms" />{can('edit') && <button className="btn pri" onClick={() => setAdd(true)}>Add farm</button>}</div>
      <Panel title="Farm locations" sub={`${geo} of ${data.farms.length} farms have a validated coordinate. Marker colour is the rating of the latest sample.`} flush>
        {geo === 0 ? <Empty title="No farm has coordinates yet">Add latitude and longitude to a farm to place it on the map. Geolocation is what joins the registry, samples and scores to one physical location.</Empty> : <FarmMap farms={rows} onPick={pick} />}
        {geo > 0 && <div className="row wrap small" style={{ padding: '10px 16px', gap: 16 }}>{m.ratings.map(r => <span key={r.key} className="row" style={{ gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: '50%', background: RATING_COL[r.key] }} />{r.en}</span>)}<span className="row" style={{ gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--mute)' }} />Not scored</span></div>}
      </Panel>
      <Panel flush>{shown.length === 0 ? <Empty title="No farms">Add a farm, or import laboratory reports to create farms from their supply numbers.</Empty> : <div className="scroll"><table className="tbl">
        <thead><tr><th>Farm no.</th><th>Supply no.</th><th>Owner</th><th>Engineer</th><th>Region</th><th className="r">Samples</th><th className="r">Latest score</th><th>Rating</th><th>Location</th></tr></thead>
        <tbody>{shown.map(r => <tr key={r.f.id} className="click" onClick={() => go(`/farms/${r.f.id}`)}><td><b>{r.f.farm_no || '–'}</b></td><td>{r.f.supply_no || '–'}</td><td>{r.f.owner || '–'}</td><td>{r.f.engineer || '–'}</td><td>{r.f.region || '–'}</td><td className="n">{r.n}</td><td className="n"><b>{fmt(r.score, 1)}</b></td><td>{r.score !== undefined ? <Rating m={m} k={r.rating} /> : <span className="mute">–</span>}</td><td>{r.f.lat != null ? <span className="badge st-issued">GPS</span> : <span className="badge">Missing</span>}</td></tr>)}</tbody></table></div>}</Panel>
      {add && <FarmForm onClose={() => setAdd(false)} />}
    </div>
  );
}

export function FarmDetail({ id }: { id: number }) {
  const { data, can, user, refresh, toast } = useApp();
  const [edit, setEdit] = useState(false);
  const farm = data.farms.find(f => f.id === id), m = data.meth.data;
  if (!farm) return <Panel><Empty title="Farm not found"><a href="#/farms">Back to farms</a></Empty></Panel>;
  const xs = data.scored.filter(x => x.s.farm_id === id).sort((a, b) => (a.s.analysed_on || '').localeCompare(b.s.analysed_on || ''));
  const rated = xs.filter(x => x.res.score !== undefined);
  const prof = m.indicators.map(ind => ({ label: INDICATOR_LABEL[ind.key]?.en ?? ind.key, value: mean(rated.map(x => x.res.byKey[ind.key]?.score).filter((s): s is number => !!s)) ?? 0 })).filter(r => r.value > 0);
  const water = data.water.filter(w => w.farm_id === id);
  const del = () => { db.deleteFarm(id); db.audit(user.username, 'delete', 'farm', farmName(farm)); refresh(); toast('Farm deleted; its samples are kept without a farm link'); go('/farms'); };
  return (
    <div className="stack">
      <div className="row wrap spread"><div><h1>{farmName(farm)}</h1><div className="mute" style={{ marginTop: 4 }}>{[farm.owner, farm.region, farm.emirate].filter(Boolean).join(', ') || 'No owner or region recorded'}</div></div>
        <div className="row no-print">{rated.length > 0 && <button className="btn" onClick={() => go(`/reports?ids=${xs.map(x => x.s.id).join(',')}`)}>Print all reports</button>}<button className="btn" onClick={() => window.print()}>Print farm summary</button>{can('edit') && <button className="btn" onClick={() => setEdit(true)}>Edit farm</button>}{can('admin') && <ConfirmButton label="Delete" confirm="Delete this farm? Its samples are kept without a farm link." onYes={del} />}</div></div>
      <div className="grid g4">
        <div className="panel kpi"><div className="l">Samples</div><div className="v">{xs.length}</div><div className="s">{rated.length} scored</div></div>
        <div className="panel kpi"><div className="l">Latest score</div><div className="v">{fmt(latest(rated)?.res.score, 1)}</div><div className="s">{latest(rated) ? <Rating m={m} k={latest(rated)!.res.rating} /> : 'No scored sample'}</div></div>
        <div className="panel kpi"><div className="l">Mean score</div><div className="v">{fmt(mean(rated.map(x => x.res.score!)), 1)}</div><div className="s">{rated.length > 1 ? `Change first to latest ${fmt(rated[rated.length - 1].res.score! - rated[0].res.score!, 1)}` : 'One sample only'}</div></div>
        <div className="panel kpi"><div className="l">Engineer</div><div className="v" style={{ fontSize: 18, lineHeight: 1.4 }}>{farm.engineer || '–'}</div><div className="s">{farm.lat != null ? `${farm.lat}, ${farm.lon}` : 'No GPS coordinate'}{farm.irrigation_source ? `, ${farm.irrigation_source}` : ''}</div></div>
      </div>
      <div className="grid g2">
        <Panel title="Soil health score over time" sub="Each point is one sample, by date analysed">{rated.length ? <TrendLine m={m} points={rated.map(x => ({ label: x.s.analysed_on ? x.s.analysed_on.slice(2, 7) : x.s.sample_no, y: x.res.score!, note: x.s.sample_no }))} /> : <Empty title="No scored samples" />}</Panel>
        <Panel title="Mean indicator score" sub="Average score per indicator across this farm's samples, 1 to 5">{prof.length ? <HBars rows={prof.map(p => ({ ...p, color: p.value >= 4.5 ? 'var(--s5)' : p.value >= 3.5 ? 'var(--s4)' : p.value >= 2.5 ? 'var(--s3)' : p.value >= 1.5 ? 'var(--s2)' : 'var(--s1)' }))} max={5} dp={1} /> : <Empty title="No data" />}</Panel>
      </div>
      <Panel title="Samples" flush>{xs.length === 0 ? <Empty title="No samples linked to this farm" /> : <table className="tbl"><thead><tr><th>Sample</th><th>Description</th><th>System</th><th>Analysed</th><th className="r">Score</th><th>Rating</th><th>Status</th></tr></thead><tbody>{[...xs].reverse().map(x => <tr key={x.s.id} className="click" onClick={() => go(`/samples/${x.s.id}`)}><td><b>{x.s.sample_no}</b></td><td>{x.s.description || '–'}</td><td>{SYSTEMS[x.s.system] ?? '–'}</td><td>{fmtDate(x.s.analysed_on)}</td><td className="n"><b>{fmt(x.res.score, 1)}</b></td><td><Rating m={m} k={x.res.rating} /></td><td><Status s={x.s.status} /></td></tr>)}</tbody></table>}</Panel>
      {water.length > 0 && <Panel title="Irrigation water" flush><table className="tbl"><thead><tr><th>Sample</th><th>Source</th><th>Sampled</th><th className="r">ECw dS/m</th><th>Restriction on use</th></tr></thead><tbody>{water.map(w => { const c = classifyWater(w.values); return <tr key={w.id} className="click" onClick={() => go('/water')}><td><b>{w.sample_no}</b></td><td>{w.source || '–'}</td><td>{fmtDate(w.sampled_on)}</td><td className="n">{fmt(w.values.ecw)}</td><td><Restr r={c.worst} /></td></tr>; })}</tbody></table></Panel>}
      {edit && <FarmForm farm={farm} onClose={() => setEdit(false)} />}
    </div>
  );
}

// ================================================================ water
const Restr = ({ r }: { r: string }) => <span className={`badge ${r === 'none' ? 'r-healthy' : r === 'moderate' ? 'r-moderate' : 'r-poor'}`}><i />{r === 'none' ? 'None' : r === 'moderate' ? 'Slight to moderate' : 'Severe'}</span>;
function WaterForm({ w, onClose }: { w?: WaterSample; onClose: () => void }) {
  const { data, user, refresh, toast } = useApp();
  const [f, setF] = useState({ sample_no: w?.sample_no ?? '', farm_id: String(w?.farm_id ?? ''), source: w?.source ?? '', sampled_on: w?.sampled_on ?? '', notes: w?.notes ?? '' });
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(WATER_FIELDS.map(x => [x.key, w?.values[x.key] !== undefined ? String(w.values[x.key]) : ''])));
  const save = () => { const values: WaterValues = {}; for (const x of WATER_FIELDS) if (v[x.key].trim() !== '' && !isNaN(Number(v[x.key]))) values[x.key] = Number(v[x.key]); db.saveWater({ id: w?.id, ...f, farm_id: f.farm_id ? Number(f.farm_id) : null, values }); db.audit(user.username, w ? 'edit' : 'create', 'water sample', f.sample_no); refresh(); toast('Water sample saved'); onClose(); };
  return (
    <Modal title={w ? `Edit ${w.sample_no}` : 'Add irrigation water sample'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" disabled={!f.sample_no} onClick={save}>Save water sample</button></>}>
      <div className="stack"><div className="fields">
        <F label="Sample number"><input value={f.sample_no} onChange={e => setF({ ...f, sample_no: e.target.value })} placeholder="WT 001-26" /></F>
        <F label="Farm"><select value={f.farm_id} onChange={e => setF({ ...f, farm_id: e.target.value })}><option value="">Not linked</option>{data.farms.map(x => <option key={x.id} value={x.id}>{farmName(x)}</option>)}</select></F>
        <F label="Source"><select value={f.source} onChange={e => setF({ ...f, source: e.target.value })}><option value="">Not recorded</option>{['Borehole', 'Reverse osmosis', 'Municipal', 'Treated sewage effluent', 'Blended'].map(s => <option key={s}>{s}</option>)}</select></F>
        <F label="Sampled on"><input type="date" value={f.sampled_on} onChange={e => setF({ ...f, sampled_on: e.target.value })} /></F>
      </div><div className="fields">{WATER_FIELDS.map(x => <F key={x.key} label={`${x.en}${x.unit !== '-' ? ` (${x.unit})` : ''}`}><input value={v[x.key]} onChange={e => setV({ ...v, [x.key]: e.target.value })} inputMode="decimal" /></F>)}</div></div>
    </Modal>
  );
}
export function WaterPage() {
  const { data, can, user, refresh, toast } = useApp();
  const [edit, setEdit] = useState<WaterSample | 'new' | null>(null), [open, setOpen] = useState<number | null>(null);
  return (
    <div className="stack">
      <div className="row spread no-print"><p className="mute" style={{ margin: 0, maxWidth: 760 }}>Soil salinity and sodicity follow the irrigation water. Link a water sample to a soil sample to calculate the leaching requirement and flag water-driven constraints.</p>{can('edit') && <button className="btn pri" onClick={() => setEdit('new')}>Add water sample</button>}</div>
      <Panel flush>{data.water.length === 0 ? <Empty title="No irrigation water samples">Add a water analysis to classify it against the FAO irrigation water quality guidelines.</Empty> : <table className="tbl">
        <thead><tr><th>Sample</th><th>Farm</th><th>Source</th><th>Sampled</th><th className="r">ECw dS/m</th><th className="r">SAR</th><th>Restriction on use</th><th /></tr></thead>
        <tbody>{data.water.map(w => { const c = classifyWater(w.values), farm = data.farms.find(f => f.id === w.farm_id); return <React.Fragment key={w.id}>
          <tr className="click" onClick={() => setOpen(open === w.id ? null : w.id)}><td><b>{w.sample_no}</b></td><td>{farm ? farmName(farm) : <span className="mute">Not linked</span>}</td><td>{w.source || '–'}</td><td>{fmtDate(w.sampled_on)}</td><td className="n">{fmt(w.values.ecw)}</td><td className="n">{fmt(c.sar, 1)}</td><td><Restr r={c.worst} /></td><td className="r">{can('edit') && <button className="btn sm" onClick={e => { e.stopPropagation(); setEdit(w); }}>Edit</button>}</td></tr>
          {open === w.id && <tr><td colSpan={8} style={{ background: 'var(--io-wash)' }}><table className="tbl dense"><thead><tr><th>Potential problem</th><th>Value</th><th>Restriction</th><th>Guideline</th></tr></thead><tbody>{c.items.map(i => <tr key={i.key}><td>{i.en}</td><td className="num">{i.value}</td><td><Restr r={i.restriction} /></td><td className="small mute">{i.note}</td></tr>)}</tbody></table>
            <div className="row spread" style={{ marginTop: 8 }}><span className="small mute">Guidelines: FAO Irrigation and Drainage Paper 29 (Ayers and Westcot, 1985), Table 1.</span>{can('edit') && <ConfirmButton label="Delete" confirm={`Delete water sample ${w.sample_no}?`} onYes={() => { db.deleteWater(w.id); db.audit(user.username, 'delete', 'water sample', w.sample_no); refresh(); toast('Water sample deleted'); }} />}</div></td></tr>}
        </React.Fragment>; })}</tbody></table>}</Panel>
      {edit && <WaterForm w={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

// ================================================================ reports log
export function ReportsLog() {
  const { data } = useApp();
  const byId = new Map(data.scored.map(x => [x.s.id, x]));
  const ready = data.scored.filter(x => x.s.status === 'reviewed');
  return (
    <div className="stack">
      {ready.length > 0 && <Panel title="Reviewed and ready to issue" sub="Samples marked as reviewed that have not been issued yet" actions={<button className="btn pri" onClick={() => go(`/reports?ids=${ready.map(r => r.s.id).join(',')}`)}>Open {ready.length} report{ready.length === 1 ? '' : 's'}</button>} flush>
        <table className="tbl"><tbody>{ready.map(x => <tr key={x.s.id} className="click" onClick={() => go(`/samples/${x.s.id}/report`)}><td><b>{x.s.sample_no}</b></td><td>{farmName(x.farm)}</td><td className="n">{fmt(x.res.score, 1)}</td><td><Rating m={data.meth.data} k={x.res.rating} /></td></tr>)}</tbody></table></Panel>}
      <Panel title="Issued reports" sub="Every report recorded as issued, with the score and methodology version at the time" flush>
        {data.reports.length === 0 ? <Empty title="No reports issued yet">Open a sample, choose Open report, then Record as issued.</Empty> : <div className="scroll"><table className="tbl"><thead><tr><th>Issued</th><th>Sample</th><th>Farm</th><th className="r">Score</th><th>Rating</th><th>Methodology</th><th>Language</th><th>Issued by</th></tr></thead>
          <tbody>{data.reports.map(r => { const x = byId.get(r.sample_id); return <tr key={r.id} className="click" onClick={() => go(`/samples/${r.sample_id}/report`)}><td>{fmtDate(r.issued_at)}</td><td><b>{x?.s.sample_no ?? `#${r.sample_id}`}</b></td><td>{farmName(x?.farm)}</td><td className="n">{fmt(r.score, 1)}</td><td><Rating m={data.meth.data} k={r.rating} /></td><td className="small">{r.methodology}</td><td>{r.lang === 'both' ? 'Bilingual' : r.lang === 'ar' ? 'Arabic' : 'English'}</td><td>{r.issued_by}</td></tr>; })}</tbody></table></div>}
      </Panel>
    </div>
  );
}

// ================================================================ analytics
function rng(seed: number) { return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function spearman(a: number[], b: number[]) { const rank = (xs: number[]) => { const o = xs.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = new Array(xs.length); o.forEach(([, i], k) => { r[i] = k; }); return r as number[]; }; const ra = rank(a), rb = rank(b), n = a.length; if (n < 3) return 1; const d2 = ra.reduce((s, x, i) => s + (x - rb[i]) ** 2, 0); return 1 - (6 * d2) / (n * (n * n - 1)); }

export function AnalyticsPage() {
  const { data } = useApp();
  const m = data.meth.data;
  const [tab, setTab] = useState<'ind' | 'groups' | 'sens' | 'split'>('ind');
  const [pct, setPct] = useState(20);
  const rated = data.scored.filter(x => x.res.score !== undefined);
  const stats = m.indicators.map(ind => { const vals = rated.map(x => x.res.byKey[ind.key]).filter(r => r?.value !== undefined); const v = vals.map(r => r.value!); const lim = vals.filter(r => (r.score ?? 5) <= 2).length; return { ind, n: v.length, min: v.length ? Math.min(...v) : undefined, med: median(v), mean: mean(v), max: v.length ? Math.max(...v) : undefined, lim: v.length ? (lim / v.length) * 100 : undefined, ms: mean(vals.map(r => r.score!)) }; });
  const group = (key: (x: Scored) => string) => { const g: Record<string, number[]> = {}; rated.forEach(x => { (g[key(x) || 'Not recorded'] ??= []).push(x.res.score!); }); return Object.entries(g).map(([label, xs]) => ({ label, value: mean(xs)!, note: `${xs.length} samples`, n: xs.length })).sort((a, b) => b.value - a.value); };
  const sens = useMemo(() => {
    if (tab !== 'sens' || rated.length < 3) return null;
    const r = rng(42), base = rated.map(x => x.res.score!), runs = 200;
    const lo = base.map(() => Infinity), hi = base.map(() => -Infinity); let flips = 0, rho = 0, mad = 0;
    for (let k = 0; k < runs; k++) {
      const w = m.indicators.map(i => i.weight * (1 + (r() * 2 - 1) * pct / 100)), tot = w.reduce((a, b) => a + b, 0);
      const mm: Methodology = { ...m, indicators: m.indicators.map((i, j) => ({ ...i, weight: (w[j] / tot) * 100 })) };
      const sc = rated.map(x => scoreSample(mm, x.s.values));
      const s = sc.map(z => z.score!);
      s.forEach((v, i) => { lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v); mad += Math.abs(v - base[i]); if (sc[i].rating !== rated[i].res.rating) flips++; });
      rho += spearman(base, s);
    }
    const spread = rated.map((x, i) => ({ x, range: hi[i] - lo[i], lo: lo[i], hi: hi[i] })).sort((a, b) => b.range - a.range);
    return { rho: rho / runs, mad: mad / (runs * rated.length), flip: (flips / (runs * rated.length)) * 100, spread };
  }, [tab, pct, data]); // eslint-disable-line
  const split = useMemo(() => {
    const r = rng(7), sets: Record<string, Scored[]> = { Development: [], Validation: [] };
    const farms = [...new Set(rated.map(x => x.s.farm_id ?? -x.s.id))];
    const bySys: Record<string, number[]> = {};
    farms.forEach(fid => { const sys = rated.find(x => (x.s.farm_id ?? -x.s.id) === fid)?.s.system || 'Other'; (bySys[sys] ??= []).push(fid); });
    const assign = new Map<number, string>();
    Object.values(bySys).forEach(ids => { const sh = ids.map(i => [r(), i] as [number, number]).sort((a, b) => a[0] - b[0]).map(z => z[1]); sh.forEach((fid, i) => assign.set(fid, i % 10 < 7 ? 'Development' : 'Validation')); });
    rated.forEach(x => sets[assign.get(x.s.farm_id ?? -x.s.id)!].push(x));
    return sets;
  }, [data]); // eslint-disable-line
  return (
    <div className="stack">
      <div className="tabs no-print">{([['ind', 'Indicator statistics'], ['groups', 'Comparisons'], ['sens', 'Weight sensitivity'], ['split', 'Development and validation sets']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {rated.length === 0 && <Panel><Empty title="No scored samples yet" /></Panel>}
      {tab === 'ind' && rated.length > 0 && <Panel title="Measured values across all scored samples" sub="Limiting means a score of 1 or 2" actions={<button className="btn sm" onClick={() => exportSamplesCsv(rated, data)}>Export scores as CSV</button>} flush>
        <div className="scroll"><table className="tbl"><thead><tr><th>Indicator</th><th>Unit</th><th className="r">Samples</th><th className="r">Minimum</th><th className="r">Median</th><th className="r">Mean</th><th className="r">Maximum</th><th>Optimum</th><th className="r">Mean score</th><th className="r">Limiting</th></tr></thead>
          <tbody>{stats.map(s => { const a = ANALYTE[analyteOf(s.ind.key)]; return <tr key={s.ind.key}><td><b>{INDICATOR_LABEL[s.ind.key]?.en}</b></td><td className="small mute">{a.unit}</td><td className="n">{s.n}</td><td className="n">{fmt(s.min, a.dp)}</td><td className="n">{fmt(s.med, a.dp)}</td><td className="n">{fmt(s.mean, a.dp)}</td><td className="n">{fmt(s.max, a.dp)}</td><td className="small mute">{bandText(s.ind, 5)}</td><td className="n">{fmt(s.ms, 1)}</td><td className="n" style={{ color: (s.lim ?? 0) >= 50 ? 'var(--crit)' : undefined }}>{s.lim === undefined ? '–' : fmt(s.lim, 0) + '%'}</td></tr>; })}</tbody></table></div></Panel>}
      {tab === 'groups' && rated.length > 0 && <div className="grid g2">
        <Panel title="Mean score by farming system"><HBars rows={group(x => SYSTEMS[x.s.system] ?? '')} max={100} dp={1} /></Panel>
        <Panel title="Mean score by crop"><HBars rows={group(x => data.crops.find(c => c.id === x.s.crop_id)?.en ?? '')} max={100} dp={1} /></Panel>
        <Panel title="Mean score by extension engineer"><HBars rows={group(x => x.farm?.engineer ?? '')} max={100} dp={1} /></Panel>
        <Panel title="Mean score by data coverage" sub="Scores from incomplete indicator sets are not directly comparable"><HBars rows={group(x => (x.res.coverage >= 80 ? '80% or more' : x.res.coverage >= 60 ? '60 to 79%' : 'Below 60%'))} max={100} dp={1} /></Panel>
      </div>}
      {tab === 'sens' && (sens ? <div className="stack">
        <Panel title="How much do the weights matter?" sub="Every indicator weight is varied at random within the range below and re-normalised to 100, 200 times. Stable rankings mean the result does not hinge on the exact weights." actions={<label className="row small">Vary weights by ±<select style={{ width: 80 }} value={pct} onChange={e => setPct(Number(e.target.value))}>{[10, 20, 30, 50].map(p => <option key={p} value={p}>{p}%</option>)}</select></label>}>
          <div className="grid g3">
            <div className="kpi" style={{ padding: 0 }}><div className="l">Rank agreement with the published weights</div><div className="v">{fmt(sens.rho, 3)}</div><div className="s">Mean Spearman correlation; 1.000 is identical ranking</div></div>
            <div className="kpi" style={{ padding: 0 }}><div className="l">Mean change in score</div><div className="v">{fmt(sens.mad, 1)}</div><div className="s">Points on the 0 to 100 scale</div></div>
            <div className="kpi" style={{ padding: 0 }}><div className="l">Rating changes</div><div className="v">{fmt(sens.flip, 1)}%</div><div className="s">Share of sample-runs landing in a different band</div></div>
          </div></Panel>
        <Panel title="Samples most sensitive to weighting" sub="Range of scores each sample took across the runs" flush><table className="tbl dense"><thead><tr><th>Sample</th><th className="r">Published score</th><th className="r">Lowest</th><th className="r">Highest</th><th className="r">Range</th><th>Rating</th></tr></thead><tbody>{sens.spread.slice(0, 12).map(z => <tr key={z.x.s.id} className="click" onClick={() => go(`/samples/${z.x.s.id}`)}><td><b>{z.x.s.sample_no}</b></td><td className="n">{fmt(z.x.res.score, 1)}</td><td className="n">{fmt(z.lo, 1)}</td><td className="n">{fmt(z.hi, 1)}</td><td className="n"><b>{fmt(z.range, 1)}</b></td><td><Rating m={m} k={z.x.res.rating} /></td></tr>)}</tbody></table></Panel>
      </div> : rated.length > 0 && <Panel><Empty title="At least three scored samples are needed" /></Panel>)}
      {tab === 'split' && rated.length > 0 && <Panel title="Development and validation sets" sub="Farms are assigned 70 / 30 at random within each farming system, so that all samples from one farm stay in the same set. Thresholds are calibrated on the development set and tested on the validation set." actions={<button className="btn sm" onClick={() => download('development-validation-split.csv', toCsv([['set', 'sample_no', 'farm_no', 'supply_no', 'system', 'score', 'rating', 'coverage_pct'], ...Object.entries(split).flatMap(([k, xs]) => xs.map(x => [k, x.s.sample_no, x.farm?.farm_no ?? '', x.farm?.supply_no ?? '', x.s.system, x.res.score!.toFixed(1), x.res.rating, x.res.coverage.toFixed(0)]))]), 'text/csv')}>Export the split as CSV</button>} flush>
        <table className="tbl"><thead><tr><th>Set</th><th className="r">Farms</th><th className="r">Samples</th><th className="r">Mean score</th><th className="r">Median</th><th className="r">Greenhouse</th><th className="r">Net house</th><th className="r">Open field</th><th className="r">Below 60</th></tr></thead>
          <tbody>{Object.entries(split).map(([k, xs]) => <tr key={k}><td><b>{k}</b></td><td className="n">{new Set(xs.map(x => x.s.farm_id ?? -x.s.id)).size}</td><td className="n">{xs.length}</td><td className="n">{fmt(mean(xs.map(x => x.res.score!)), 1)}</td><td className="n">{fmt(median(xs.map(x => x.res.score!)), 1)}</td>{['GH', 'NH', 'OF'].map(s => <td key={s} className="n">{xs.filter(x => x.s.system === s).length}</td>)}<td className="n">{xs.filter(x => x.res.score! < 60).length}</td></tr>)}</tbody></table></Panel>}
    </div>
  );
}

// ================================================================ methodology
function MethodologyEditor({ m, onClose }: { m: Methodology; onClose: () => void }) {
  const { user, refresh, toast } = useApp();
  const [d, setD] = useState<Methodology>(() => JSON.parse(JSON.stringify(m), (_k, v) => (v === null ? Infinity : v)));
  const errs = validateMethodology(d);
  const total = d.indicators.reduce((a, i) => a + (Number(i.weight) || 0), 0);
  const upd = (i: number, fn: (ind: Indicator) => void) => { const c: Methodology = { ...d, indicators: d.indicators.map(x => ({ ...x, cuts: (x.cuts as (number | number[])[]).map(q => (Array.isArray(q) ? [...q] : q)) as Indicator['cuts'] })) }; fn(c.indicators[i]); setD(c); };
  const num = (s: string) => (s === '' || isNaN(Number(s)) ? 0 : Number(s));
  const save = () => { db.saveMethodology(d, user.username); refresh(); toast(`Methodology v${d.version} published; all samples re-scored`); onClose(); };
  const same = d.version === m.version;
  return (
    <Modal title="Edit thresholds and weights" onClose={onClose} wide footer={<><span className="small grow" style={{ color: Math.abs(total - 100) > 0.001 ? 'var(--crit)' : 'var(--mute)' }}>Weights total {fmt(total, 1)}%</span><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" disabled={errs.length > 0 || same} onClick={save}>Publish as v{d.version}</button></>}>
      <div className="stack">
        <div className="flag info"><span>Publishing creates a new methodology version and re-scores every sample with it. Earlier versions are kept and can be restored. Issued reports keep the score recorded when they were issued.</span></div>
        <div className="fields"><F label="Version"><input value={d.version} onChange={e => setD({ ...d, version: e.target.value })} /></F><F label="Status"><input value={d.status} onChange={e => setD({ ...d, status: e.target.value })} /></F><F label="Minimum data coverage (%)"><input value={d.minCoverage} onChange={e => setD({ ...d, minCoverage: num(e.target.value) })} /></F><F label="Change note" span={2}><input value={d.note} onChange={e => setD({ ...d, note: e.target.value })} /></F></div>
        {same && <div className="flag warn"><span>Change the version number to publish.</span></div>}
        {errs.map((e, i) => <div key={i} className="flag error"><span>{e}</span></div>)}
        <div className="scroll"><table className="tbl dense"><thead><tr><th>Indicator</th><th>Rule</th><th>Score 5</th><th>Score 4</th><th>Score 3</th><th>Score 2</th><th style={{ width: 80 }}>Weight %</th></tr></thead>
          <tbody>{d.indicators.map((ind, i) => <tr key={ind.key}><td><b>{INDICATOR_LABEL[ind.key]?.en}</b><div className="small mute">{ANALYTE[analyteOf(ind.key)].unit}</div></td><td className="small">{ind.kind === 'lower' ? 'at or below' : ind.kind === 'higher' ? 'at or above' : 'within'}</td>
            {[0, 1, 2, 3].map(j => <td key={j}>{ind.kind === 'window' ? <span className="row" style={{ gap: 4 }}><input style={{ width: 62 }} value={(ind.cuts as number[][])[j][0]} onChange={e => upd(i, x => { (x.cuts as number[][])[j][0] = num(e.target.value); })} aria-label="from" /><input style={{ width: 62 }} value={(ind.cuts as number[][])[j][1]} onChange={e => upd(i, x => { (x.cuts as number[][])[j][1] = num(e.target.value); })} aria-label="to" /></span> : <input style={{ width: 80 }} value={(ind.cuts as number[])[j]} onChange={e => upd(i, x => { (x.cuts as number[])[j] = num(e.target.value); })} />}</td>)}
            <td><input value={ind.weight} onChange={e => upd(i, x => { x.weight = num(e.target.value); })} /></td></tr>)}</tbody></table></div>
        <p className="small mute">Score 1 is given to any value outside the score 2 limit.</p>
      </div>
    </Modal>
  );
}

export function MethodologyPage() {
  const { data, can, user, refresh, toast } = useApp();
  const m = data.meth.data;
  const [edit, setEdit] = useState(false);
  const versions = db.listMethodologies();
  return (
    <div className="stack">
      <Panel title={`${m.name}, version ${m.version}`} sub={`${m.status}. Dated ${fmtDate(m.date)}.`} actions={can('admin') && <button className="btn pri" onClick={() => setEdit(true)}>Edit thresholds and weights</button>}>
        <p style={{ maxWidth: 900 }}>{m.note}</p>
        <p style={{ maxWidth: 900 }}>Each indicator is scored from 1 (severely limiting) to 5 (optimum). Points are score ÷ 5 × weight. The overall score is points achieved ÷ weight of the indicators actually measured × 100, so a sample is not penalised for analyses that were not run. Data coverage is the share of total weight that was measured; at least {m.minCoverage}% is recommended before a score is treated as representative.</p>
        <div className="row wrap" style={{ gap: 10, marginTop: 6 }}>{m.ratings.map((r, i) => <span key={r.key} className={`badge r-${r.key}`} {...tip(r.meaning)}><i />{r.en} {r.min}–{i === 0 ? 100 : m.ratings[i - 1].min - 1}</span>)}</div>
      </Panel>
      <div className="grid g-main">
        <Panel title="Scoring bands" sub="Value range for each score. ECe, SAR and ESP: lower is better. pH and boron: optimum window. All others: higher is better up to the optimum." flush>
          <div className="scroll"><table className="tbl dense"><thead><tr><th>Indicator</th><th>Unit</th><th>5 Optimum</th><th>4</th><th>3</th><th>2</th><th>1</th><th className="r">Weight</th></tr></thead>
            <tbody>{m.categories.map(c => <React.Fragment key={c.key}><tr><td colSpan={8} style={{ background: 'var(--io-wash)', fontWeight: 600, color: 'var(--navy)' }}>{c.en} <span className="small mute" style={{ fontWeight: 400 }}>{m.indicators.filter(i => i.category === c.key).reduce((a, i) => a + i.weight, 0)}% of the score</span></td></tr>
              {m.indicators.filter(i => i.category === c.key).map(ind => <tr key={ind.key} {...tip(`${ind.method}. ${ind.basis}`)}><td><b>{INDICATOR_LABEL[ind.key]?.en}</b><div className="small mute">{ind.method}</div></td><td className="small mute">{ANALYTE[analyteOf(ind.key)].unit}</td>{[5, 4, 3, 2, 1].map(s => <td key={s} className="small num">{bandText(ind, s)}</td>)}<td className="n"><b>{ind.weight}</b></td></tr>)}</React.Fragment>)}</tbody></table></div>
        </Panel>
        <div className="stack">
          <Panel title="Category weights" sub="Share of the 100-point score"><HBars rows={m.categories.map(c => ({ label: c.en, value: m.indicators.filter(i => i.category === c.key).reduce((a, i) => a + i.weight, 0), note: c.rationale }))} max={30} unit="%" color="var(--navy)" /></Panel>
          <Panel title="Supplementary indicators" sub="Physical and biological measures, reported alongside the score but not part of it" flush><table className="tbl dense"><thead><tr><th>Indicator</th><th>Good</th><th>Moderate</th><th>Method</th></tr></thead><tbody>{m.supplementary.map(s => <tr key={s.key} {...tip(s.note)}><td><b>{ANALYTE[s.key].en}</b><div className="small mute">{ANALYTE[s.key].unit}</div></td><td className="small">{s.good[1] === Infinity ? `≥ ${s.good[0]}` : s.good[0] === 0 ? `< ${s.good[1]}` : `${s.good[0]}–${s.good[1]}`}</td><td className="small">{s.moderate.map(r => `${r[0]}–${r[1]}`).join(' or ')}</td><td className="small mute">{s.method}</td></tr>)}</tbody></table></Panel>
          <Panel title="Versions" flush><table className="tbl dense"><tbody>{versions.map(v => <tr key={v.id}><td><b>v{v.data.version}</b><div className="small mute">{v.data.status}</div></td><td className="small">{fmtDate(v.created_at)} by {v.created_by}</td><td className="r">{v.active ? <span className="badge st-issued">In use</span> : can('admin') && <button className="btn sm" onClick={() => { db.activateMethodology(v.id, user.username); refresh(); toast(`Methodology v${v.data.version} restored`); }}>Restore</button>}</td></tr>)}</tbody></table></Panel>
        </div>
      </div>
      <Panel title="Basis for thresholds">
        <ul className="small" style={{ margin: 0, paddingLeft: 18, maxWidth: 980, lineHeight: 1.7 }}>
          <li>Richards, L.A. (ed.) 1954. Diagnosis and Improvement of Saline and Alkali Soils. USDA Agriculture Handbook 60. ECe salinity classes; SAR and ESP sodicity thresholds.</li>
          <li>Olsen, S.R., Cole, C.V., Watanabe, F.S. and Dean, L.A. 1954. Estimation of available phosphorus in soils by extraction with sodium bicarbonate. USDA Circular 939.</li>
          <li>Lindsay, W.L. and Norvell, W.A. 1978. Development of a DTPA soil test for zinc, iron, manganese, and copper. Soil Science Society of America Journal 42: 421–428.</li>
          <li>Ayers, R.S. and Westcot, D.W. 1985. Water Quality for Agriculture. FAO Irrigation and Drainage Paper 29 Rev. 1. Crop salt tolerance (after Maas and Hoffman, 1977), leaching requirement and irrigation water guidelines.</li>
          <li>UAE and Abu Dhabi soil survey context: sandy, calcareous Entisols and Aridisols, organic matter typically below 1%, alkaline pH.</li>
          <li>Rating bands are a project-defined classification. Thresholds and weights are a starting point to be validated against UAE field data.</li>
        </ul>
      </Panel>
      {edit && <MethodologyEditor m={m} onClose={() => setEdit(false)} />}
    </div>
  );
}

// ================================================================ administration
export function AdminPage() {
  const [tab, setTab] = useState<'users' | 'data' | 'crops' | 'audit' | 'sql'>('users');
  return <div><div className="tabs">{([['users', 'Users'], ['data', 'Database and backup'], ['crops', 'Crop salt tolerance'], ['audit', 'Audit log'], ['sql', 'Query console']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'users' ? <UsersTab /> : tab === 'data' ? <DataTab /> : tab === 'crops' ? <CropsTab /> : tab === 'audit' ? <AuditTab /> : <SqlTab />}</div>;
}

function UsersTab() {
  const { data, user, refresh, toast } = useApp();
  const [add, setAdd] = useState(false), [pw, setPw] = useState<db.User | null>(null), [f, setF] = useState({ name: '', username: '', role: 'analyst' as Role, password: '' }), [err, setErr] = useState(''), [np, setNp] = useState('');
  const create = async () => { try { await db.createUser(f); db.audit(user.username, 'create', 'user', f.username, f.role); refresh(); toast('User created'); setAdd(false); setF({ name: '', username: '', role: 'analyst', password: '' }); setErr(''); } catch (e) { setErr((e as Error).message); } };
  const reset = async () => { try { await db.setPassword(pw!.id, np); db.audit(user.username, 'reset password', 'user', pw!.username); refresh(); toast('Password changed'); setPw(null); setNp(''); setErr(''); } catch (e) { setErr((e as Error).message); } };
  return (
    <div className="stack">
      <Panel title="Users on this device" sub="Roles: administrators manage everything; analysts enter and import results; agronomists also review and issue reports; viewers read only." actions={<button className="btn pri" onClick={() => setAdd(true)}>Add user</button>} flush>
        <table className="tbl"><thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Status</th><th>Created</th><th /></tr></thead><tbody>{data.users.map(u => <tr key={u.id}><td><b>{u.name}</b></td><td>{u.username}</td><td><select style={{ width: 190 }} value={u.role} disabled={u.id === user.id} onChange={e => { db.updateUser(u.id, { role: e.target.value as Role }); db.audit(user.username, 'change role', 'user', u.username, e.target.value); refresh(); }}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td><td>{u.active ? <span className="badge st-issued">Active</span> : <span className="badge">Disabled</span>}</td><td>{fmtDate(u.created_at)}</td><td className="r"><span className="row" style={{ justifyContent: 'flex-end' }}><button className="btn sm" onClick={() => { setPw(u); setErr(''); }}>Change password</button>{u.id !== user.id && <button className="btn sm" onClick={() => { db.updateUser(u.id, { active: u.active ? 0 : 1 }); db.audit(user.username, u.active ? 'disable' : 'enable', 'user', u.username); refresh(); }}>{u.active ? 'Disable' : 'Enable'}</button>}</span></td></tr>)}</tbody></table>
      </Panel>
      <div className="flag info"><span>Accounts and data are stored in this browser on this computer. Sign-in keeps colleagues' work separate and feeds the audit log; it is not a substitute for securing the computer itself.</span></div>
      {add && <Modal title="Add user" onClose={() => setAdd(false)} footer={<><button className="btn" onClick={() => setAdd(false)}>Cancel</button><button className="btn pri" onClick={create} disabled={!f.name || !f.username || !f.password}>Create user</button></>}><div className="stack">{err && <div className="flag error">{err}</div>}<div className="fields"><F label="Full name"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></F><F label="Username"><input value={f.username} onChange={e => setF({ ...f, username: e.target.value })} /></F><F label="Role"><select value={f.role} onChange={e => setF({ ...f, role: e.target.value as Role })}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></F><F label="Password (8 characters or more)"><input type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} autoComplete="new-password" /></F></div></div></Modal>}
      {pw && <Modal title={`Change password for ${pw.name}`} onClose={() => setPw(null)} footer={<><button className="btn" onClick={() => setPw(null)}>Cancel</button><button className="btn pri" onClick={reset} disabled={!np}>Change password</button></>}><div className="stack">{err && <div className="flag error">{err}</div>}<F label="New password (8 characters or more)"><input type="password" value={np} onChange={e => setNp(e.target.value)} autoComplete="new-password" /></F></div></Modal>}
    </div>
  );
}

function DataTab() {
  const { data, user, refresh, toast } = useApp();
  const counts = db.tableCounts();
  const backup = async () => { await db.saveNow(); download(`soil-scorecard-backup-${new Date().toISOString().slice(0, 10)}.sqlite`, db.exportBytes() as BlobPart, 'application/x-sqlite3'); db.audit(user.username, 'backup', 'database', 'download'); refresh(); };
  const restore = async (file?: File) => { if (!file) return; try { db.loadBytes(new Uint8Array(await file.arrayBuffer())); await db.saveNow(); toast('Backup restored. Sign in again.'); setTimeout(() => window.location.reload(), 900); } catch (e) { toast((e as Error).message, true); } };
  return (
    <div className="grid g2">
      <Panel title="Backup and restore" sub="The database is a standard SQLite file. Download it to keep a copy or to move the data to another computer.">
        <div className="stack"><div className="row wrap"><button className="btn pri" onClick={backup}>Download backup (.sqlite)</button><button className="btn" onClick={() => exportSamplesCsv(data.scored, data)}>Export all samples as CSV</button></div>
          <F label="Restore from a backup file. This replaces everything on this device."><input type="file" accept=".sqlite,.db" onChange={e => restore(e.target.files?.[0])} /></F>
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}><p className="small mute">Erasing removes the database from this browser. Download a backup first.</p><ConfirmButton label="Erase this device" confirm="Erase the whole database from this browser? This cannot be undone unless you have a backup file." onYes={async () => { await db.wipeDevice(); window.location.reload(); }} /></div></div>
      </Panel>
      <Panel title="Database tables" sub={`Dataset loaded at setup: ${db.getSetting('dataset') ?? 'unknown'}`} flush><table className="tbl dense"><thead><tr><th>Table</th><th className="r">Rows</th></tr></thead><tbody>{counts.map(c => <tr key={c.table}><td><code>{c.table}</code></td><td className="n">{c.rows.toLocaleString()}</td></tr>)}</tbody></table></Panel>
    </div>
  );
}

function CropsTab() {
  const { data, refresh, toast } = useApp();
  const [rows, setRows] = useState<Crop[]>(data.crops);
  const upd = (i: number, k: 'a' | 'b', v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v === '' ? undefined : Number(v) } : r)));
  return <Panel title="Crop salt tolerance" sub="Threshold ECe and yield loss per dS/m (Maas-Hoffman, FAO 29). Used for the yield-potential and leaching estimates." actions={<button className="btn pri" onClick={() => { rows.forEach(r => db.saveCrop(r)); refresh(); toast('Crop table saved'); }}>Save crop table</button>} flush>
    <div className="scroll"><table className="tbl dense"><thead><tr><th>Crop</th><th>Arabic</th><th>Group</th><th>Tolerance</th><th style={{ width: 130 }}>Threshold ECe (dS/m)</th><th style={{ width: 130 }}>Loss per dS/m (%)</th></tr></thead><tbody>{rows.map((c, i) => <tr key={c.id}><td><b>{c.en}</b></td><td className="ar">{c.ar}</td><td style={{ textTransform: 'capitalize' }}>{c.group}</td><td>{c.tolerance}</td><td><input value={c.a ?? ''} onChange={e => upd(i, 'a', e.target.value)} inputMode="decimal" placeholder="not tabulated" /></td><td><input value={c.b ?? ''} onChange={e => upd(i, 'b', e.target.value)} inputMode="decimal" placeholder="not tabulated" /></td></tr>)}</tbody></table></div></Panel>;
}

function AuditTab() {
  const rows = db.listAudit(400);
  return <Panel title="Audit log" sub="Latest 400 actions on this device" actions={<button className="btn sm" onClick={() => download('audit-log.csv', toCsv([['time', 'user', 'action', 'entity', 'reference', 'detail'], ...rows.map(r => [r.ts, r.user, r.action, r.entity, r.ref, r.detail])]), 'text/csv')}>Export CSV</button>} flush>
    <div className="scroll" style={{ maxHeight: 560 }}><table className="tbl dense"><thead><tr><th>Time</th><th>User</th><th>Action</th><th>Record</th><th>Detail</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td className="small num">{new Date(r.ts).toLocaleString('en-GB')}</td><td>{r.user}</td><td>{r.action}</td><td>{r.entity} <b>{r.ref}</b></td><td className="small mute">{r.detail}</td></tr>)}</tbody></table></div></Panel>;
}

function SqlTab() {
  const [sql, setSql] = useState("SELECT s.sample_no, f.supply_no, r.value AS ece\nFROM samples s JOIN results r ON r.sample_id = s.id AND r.analyte = 'ece'\nLEFT JOIN farms f ON f.id = s.farm_id\nORDER BY r.value DESC LIMIT 20");
  const [res, setRes] = useState<{ columns: string[]; values: unknown[][] } | null>(null), [err, setErr] = useState('');
  const run = () => { try { setRes(db.query(sql)); setErr(''); } catch (e) { setErr((e as Error).message); setRes(null); } };
  return <Panel title="Query console" sub="Read-only SQL against the database. Tables: samples, results, farms, water_samples, reports, methodologies, crops, users, audit_log." actions={<>{res && res.values.length > 0 && <button className="btn sm" onClick={() => download('query-result.csv', toCsv([res.columns, ...res.values]), 'text/csv')}>Export CSV</button>}<button className="btn pri sm" onClick={run}>Run query</button></>}>
    <textarea value={sql} onChange={e => setSql(e.target.value)} spellCheck={false} style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 13, minHeight: 110 }} aria-label="SQL query" />
    {err && <div className="flag error" style={{ marginTop: 10 }}>{err}</div>}
    {res && <div className="scroll" style={{ maxHeight: 420, marginTop: 12 }}>{res.values.length === 0 ? <Empty title="No rows" /> : <table className="tbl dense"><thead><tr>{res.columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{res.values.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={typeof c === 'number' ? 'n' : ''}>{c === null ? '' : String(c)}</td>)}</tr>)}</tbody></table>}</div>}
  </Panel>;
}
