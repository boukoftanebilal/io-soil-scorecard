import React, { useMemo, useState } from 'react';
import * as db from '../db/db';
import { Sample } from '../db/db';
import { ANALYTES, ANALYTE, ANALYTE_GROUPS, INDICATOR_LABEL, SCORE_LABEL, analyteOf, bandText } from '../engine/methodology';
import { qaChecks } from '../engine/score';
import { recommend, Reco, RecoContext } from '../engine/reco';
import { matchCrop, matchSystem } from '../engine/agronomy';
import { parseLabDocx, parseSampleCsv, parseValue, parseDate, toCsv, CSV_COLUMNS, CSV_META } from '../engine/labreport';
import { useApp, AppData, Scored, Panel, Rating, Status, Chip, F, Modal, Empty, Seg, ScoreRing, HBars, Histogram, RatingBar, ScoreMix, fmt, fmtDate, valText, farmName, ratingLabel, download, go, SYSTEMS, BASE, RATING_COL, tip } from './core';

export function ctxFor(sc: Scored, data: AppData): RecoContext {
  return { texture: sc.s.texture || undefined, crop: data.crops.find(c => c.id === sc.s.crop_id), system: sc.s.system, water: data.water.find(w => w.id === sc.s.water_id)?.values, bd: sc.s.values.bd, minCoverage: data.meth.data.minCoverage };
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);

// ================================================================ dashboard
export function Dashboard() {
  const { data } = useApp();
  const m = data.meth.data;
  const rated = data.scored.filter(x => x.res.score !== undefined);
  const scores = rated.map(x => x.res.score!);
  const counts: Record<string, number> = {}; rated.forEach(x => { counts[x.res.rating!] = (counts[x.res.rating!] ?? 0) + 1; });
  const mix = m.indicators.map(ind => { const c = [0, 0, 0, 0, 0, 0]; let n = 0; rated.forEach(x => { const s = x.res.byKey[ind.key]?.score; if (s) { c[s]++; n++; } }); return { label: INDICATOR_LABEL[ind.key]?.en ?? ind.key, counts: c, n }; }).sort((a, b) => (b.n ? (b.counts[1] + b.counts[2]) / b.n : -1) - (a.n ? (a.counts[1] + a.counts[2]) / a.n : -1));
  const bySys = Object.keys(SYSTEMS).map(k => { const xs = rated.filter(x => (x.s.system || 'Other') === k).map(x => x.res.score!); return { label: SYSTEMS[k], value: mean(xs) ?? 0, note: `${xs.length} samples`, n: xs.length }; }).filter(r => r.n);
  const lowCov = rated.filter(x => x.res.coverage < m.minCoverage).length;
  const worst = [...rated].sort((a, b) => a.res.score! - b.res.score!).slice(0, 8);
  if (!data.samples.length) return <Panel><Empty title="No soil samples yet">Add the first sample or import laboratory reports from <a href="#/samples">Soil samples</a>.</Empty></Panel>;
  return (
    <div className="stack">
      <div className="grid g4">
        <div className="panel kpi"><div className="l">Samples scored</div><div className="v">{rated.length}</div><div className="s">{data.farms.length} farms in the registry</div></div>
        <div className="panel kpi"><div className="l">Mean soil health score</div><div className="v">{fmt(mean(scores), 1)}</div><div className="s">Median {fmt([...scores].sort((a, b) => a - b)[Math.floor(scores.length / 2)], 1)}, range {fmt(Math.min(...scores), 0)} to {fmt(Math.max(...scores), 0)}</div></div>
        <div className="panel kpi"><div className="l">Marginal or poor</div><div className="v">{(counts.marginal ?? 0) + (counts.poor ?? 0)}</div><div className="s">{fmt((((counts.marginal ?? 0) + (counts.poor ?? 0)) / (rated.length || 1)) * 100, 0)}% of scored samples are below 60</div></div>
        <div className="panel kpi"><div className="l">Waiting for review</div><div className="v">{data.samples.filter(s => s.status === 'draft').length}</div><div className="s">{lowCov} samples below {m.minCoverage}% data coverage</div></div>
      </div>
      <div className="grid g2">
        <Panel title="Rating of scored samples" sub="Share of samples in each soil health band"><RatingBar counts={counts} m={m} /></Panel>
        <Panel title="Mean score by farming system" sub="Average soil health score, 0 to 100"><HBars rows={bySys} max={100} dp={1} /></Panel>
      </div>
      <div className="grid g-main">
        <Panel title="What limits these soils" sub="Share of samples at each score, per indicator. Most limiting first."><ScoreMix rows={mix} /></Panel>
        <div className="stack">
          <Panel title="Score distribution" sub="Number of samples per 10-point band"><Histogram values={scores} m={m} /></Panel>
          <Panel title="Lowest scores" sub="Samples that need attention first" flush>
            <table className="tbl dense"><tbody>{worst.map(x => <tr key={x.s.id} className="click" onClick={() => go(`/samples/${x.s.id}`)}><td><b>{x.s.sample_no}</b><div className="small mute">{farmName(x.farm)}</div></td><td className="n">{fmt(x.res.score, 1)}</td><td><Rating m={m} k={x.res.rating} /></td></tr>)}</tbody></table>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ================================================================ samples list + import
export function exportSamplesCsv(rows: Scored[], data: AppData) {
  const m = data.meth.data;
  const head = [...CSV_META, 'status', 'score', 'rating', 'coverage_pct', ...m.indicators.map(i => `score_${i.key}`), ...ANALYTES.map(a => a.key)];
  const body = rows.map(x => [x.s.sample_no, x.farm?.farm_no ?? '', x.farm?.supply_no ?? '', x.s.description, data.crops.find(c => c.id === x.s.crop_id)?.en ?? '', x.s.system, x.s.texture, x.s.depth_cm ?? '', x.s.sampled_on, x.s.received_on, x.s.analysed_on, x.s.lat ?? '', x.s.lon ?? '', x.s.status, x.res.score?.toFixed(1) ?? '', x.res.rating ?? '', x.res.coverage.toFixed(0), ...m.indicators.map(i => x.res.byKey[i.key]?.score ?? ''), ...ANALYTES.map(a => (x.s.values[a.key] === undefined ? '' : (x.s.qualifiers[a.key] ?? '') + x.s.values[a.key]))]);
  download(`soil-scorecard-samples-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([head, ...body]), 'text/csv');
}

export function SamplesPage() {
  const { data, can } = useApp();
  const m = data.meth.data;
  const [q, setQ] = useState(''), [rating, setRating] = useState(''), [sys, setSys] = useState(''), [status, setStatus] = useState(''), [imp, setImp] = useState(false);
  const rows = useMemo(() => data.scored.filter(x => {
    if (rating && (x.res.rating ?? 'none') !== rating) return false;
    if (sys && (x.s.system || 'Other') !== sys) return false;
    if (status && x.s.status !== status) return false;
    if (q) { const t = `${x.s.sample_no} ${x.s.description} ${x.farm?.farm_no ?? ''} ${x.farm?.supply_no ?? ''} ${x.farm?.owner ?? ''} ${x.farm?.engineer ?? ''}`.toLowerCase(); if (!q.toLowerCase().split(/\s+/).every(w => t.includes(w))) return false; }
    return true;
  }), [data.scored, q, rating, sys, status]);
  return (
    <div className="stack">
      <div className="row wrap spread no-print">
        <div className="row wrap">
          <input style={{ width: 260 }} placeholder="Search sample, farm, owner or engineer" value={q} onChange={e => setQ(e.target.value)} aria-label="Search samples" />
          <select style={{ width: 150 }} value={rating} onChange={e => setRating(e.target.value)} aria-label="Rating"><option value="">All ratings</option>{m.ratings.map(r => <option key={r.key} value={r.key}>{r.en}</option>)}<option value="none">Not rated</option></select>
          <select style={{ width: 150 }} value={sys} onChange={e => setSys(e.target.value)} aria-label="Farming system"><option value="">All systems</option>{Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select style={{ width: 140 }} value={status} onChange={e => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option><option value="draft">Draft</option><option value="reviewed">Reviewed</option><option value="issued">Issued</option></select>
        </div>
        <div className="row">
          <button className="btn" onClick={() => exportSamplesCsv(rows, data)}>Export CSV</button>
          {rows.length > 0 && rows.length <= 60 && <button className="btn" onClick={() => go(`/reports?ids=${rows.map(r => r.s.id).join(',')}`)}>Print {rows.length} reports</button>}
          {can('edit') && <><button className="btn" onClick={() => setImp(true)}>Import reports</button><button className="btn pri" onClick={() => go('/samples/new')}>Add sample</button></>}
        </div>
      </div>
      <Panel flush>
        {rows.length === 0 ? <Empty title="No samples match">Change the filters, or add a sample.</Empty> : (
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Sample</th><th>Farm</th><th>Description</th><th>System</th><th>Analysed</th><th className="r">Score</th><th>Rating</th><th className="r">Coverage</th><th>Status</th></tr></thead>
            <tbody>{rows.map(x => (
              <tr key={x.s.id} className="click" onClick={() => go(`/samples/${x.s.id}`)}>
                <td><b>{x.s.sample_no}</b></td><td>{x.farm ? <>{farmName(x.farm)}{x.farm.owner && <div className="small mute">{x.farm.owner}</div>}</> : <span className="mute">Not linked</span>}</td>
                <td>{x.s.description || <span className="mute">–</span>}{x.s.crop_id && <div className="small mute">{data.crops.find(c => c.id === x.s.crop_id)?.en}</div>}</td>
                <td>{SYSTEMS[x.s.system] ?? '–'}</td><td>{fmtDate(x.s.analysed_on)}</td><td className="n"><b>{fmt(x.res.score, 1)}</b></td><td><Rating m={m} k={x.res.rating} /></td>
                <td className="n" style={{ color: x.res.coverage < m.minCoverage ? 'var(--serious)' : undefined }}>{fmt(x.res.coverage, 0)}%</td><td><Status s={x.s.status} /></td>
              </tr>))}</tbody>
          </table></div>)}
      </Panel>
      <div className="small mute">{rows.length} of {data.samples.length} samples</div>
      {imp && <ImportModal onClose={() => setImp(false)} />}
    </div>
  );
}

interface Pending { sample_no: string; supply_no?: string; farm_no?: string; meta: Partial<Sample>; values: Record<string, number>; qualifiers: Record<string, string>; warnings: string[]; exists: boolean; source: string }
function ImportModal({ onClose }: { onClose: () => void }) {
  const { data, user, refresh, toast } = useApp();
  const [items, setItems] = useState<Pending[]>([]), [errs, setErrs] = useState<string[]>([]), [busy, setBusy] = useState(false);
  const read = async (files: FileList | null) => {
    if (!files) return; setBusy(true);
    const out: Pending[] = [], bad: string[] = [];
    const have = new Set(data.samples.map(s => s.sample_no));
    for (const f of Array.from(files)) {
      try {
        if (/\.docx$/i.test(f.name)) {
          const r = parseLabDocx(new Uint8Array(await f.arrayBuffer()), f.name);
          if (!r.sampleNo || !Object.keys(r.values).length) { bad.push(`${f.name}: no sample number or values found`); continue; }
          out.push({ sample_no: r.sampleNo, supply_no: r.supplyNo, values: r.values, qualifiers: r.qualifiers, warnings: r.warnings, exists: have.has(r.sampleNo), source: f.name, meta: { description: r.description ?? '', crop_id: matchCrop(r.description, data.crops)?.id ?? '', system: matchSystem(r.description) ?? '', texture: r.texture ?? '', sampled_on: r.sampledOn ?? '', received_on: r.receivedOn ?? '', analysed_on: r.analysedOn ?? '', legacy: r.legacy ?? null } });
        } else if (/\.(csv|txt)$/i.test(f.name)) {
          const { samples, unknown } = parseSampleCsv(await f.text());
          if (unknown.length) bad.push(`${f.name}: columns ignored - ${unknown.join(', ')}`);
          for (const s of samples) out.push({ sample_no: s.meta.sample_no, supply_no: s.meta.supply_no, farm_no: s.meta.farm_no, values: s.values, qualifiers: s.qualifiers, warnings: [], exists: have.has(s.meta.sample_no), source: f.name, meta: { description: s.meta.description ?? '', crop_id: (data.crops.find(c => c.id === s.meta.crop?.toLowerCase() || c.en.toLowerCase() === s.meta.crop?.toLowerCase()) ?? matchCrop(s.meta.crop, data.crops))?.id ?? '', system: s.meta.system && SYSTEMS[s.meta.system.toUpperCase()] ? s.meta.system.toUpperCase() : matchSystem(s.meta.system) ?? '', texture: s.meta.texture ?? '', depth_cm: s.meta.depth_cm ? Number(s.meta.depth_cm) : null, sampled_on: parseDate(s.meta.sampled_on) ?? '', received_on: parseDate(s.meta.received_on) ?? '', analysed_on: parseDate(s.meta.analysed_on) ?? '', lat: s.meta.lat ? Number(s.meta.lat) : null, lon: s.meta.lon ? Number(s.meta.lon) : null } });
        } else bad.push(`${f.name}: only .docx laboratory reports and .csv files can be imported`);
      } catch (e) { bad.push(`${f.name}: ${(e as Error).message}`); }
    }
    setItems(out); setErrs(bad); setBusy(false);
  };
  const fresh = items.filter(i => !i.exists);
  const doImport = () => {
    let n = 0;
    for (const it of fresh) {
      let farm = db.findFarm(it.supply_no, it.farm_no);
      let farmId = farm?.id ?? null;
      if (!farm && (it.supply_no || it.farm_no)) farmId = db.saveFarm({ supply_no: it.supply_no ?? '', farm_no: it.farm_no ?? '' });
      try { db.saveSample({ ...it.meta, sample_no: it.sample_no, farm_id: farmId, status: 'draft', notes: `Imported from ${it.source}`, values: it.values, qualifiers: it.qualifiers }, user.username); n++; } catch (e) { console.warn(e); }
    }
    db.audit(user.username, 'import', 'samples', `${n} samples`, [...new Set(fresh.map(f => f.source))].slice(0, 5).join(', '));
    refresh(); toast(`Imported ${n} sample${n === 1 ? '' : 's'}`); onClose();
  };
  return (
    <Modal title="Import laboratory results" onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" disabled={!fresh.length} onClick={doImport}>Import {fresh.length} sample{fresh.length === 1 ? '' : 's'}</button></>}>
      <div className="stack">
        <p>Choose Innovation Oasis soil reports in Word format (.docx), or a CSV file with one sample per row. Imported samples start as drafts. <a href="#" onClick={e => { e.preventDefault(); download('soil-sample-template.csv', toCsv([CSV_COLUMNS, ['SP 001-26', '347', '408611', 'Before greenhouse', 'Tomato', 'GH', 'Sand', 30, '2026-01-12', '2026-01-13', '2026-01-20', 24.2075, 55.7447, 7.8, 3.4, 0.9]]), 'text/csv'); }}>Download the CSV template</a>.</p>
        <input type="file" multiple accept=".docx,.csv,.txt" onChange={e => read(e.target.files)} />
        {busy && <p className="mute">Reading files…</p>}
        {errs.map((e, i) => <div key={i} className="flag warn">{e}</div>)}
        {items.length > 0 && <div className="scroll" style={{ maxHeight: 340 }}><table className="tbl dense"><thead><tr><th>Sample</th><th>Supply / farm</th><th>Description</th><th className="r">Values</th><th>Note</th></tr></thead><tbody>
          {items.map((it, i) => <tr key={i}><td><b>{it.sample_no}</b></td><td>{it.supply_no ?? it.farm_no ?? '–'}</td><td>{it.meta.description || '–'}</td><td className="n">{Object.keys(it.values).length}</td><td>{it.exists ? <span className="badge r-moderate">Already in the database - skipped</span> : it.warnings.length ? <span className="small" style={{ color: 'var(--serious)' }}>{it.warnings.join(' ')}</span> : <span className="badge st-issued">Ready</span>}</td></tr>)}
        </tbody></table></div>}
      </div>
    </Modal>
  );
}

// ================================================================ sample detail
export function SampleDetail({ id }: { id: number }) {
  const { data, can, user, refresh, toast } = useApp();
  const [edit, setEdit] = useState(id === 0), [lang, setLang] = useState<'en' | 'ar'>('en');
  const sc = data.scored.find(x => x.s.id === id);
  const m = data.meth.data;
  if (id === 0) return <SampleForm onClose={() => go('/samples')} />;
  if (!sc) return <Panel><Empty title="Sample not found">It may have been deleted. <a href="#/samples">Back to samples</a></Empty></Panel>;
  const { s, res } = sc;
  const reco = recommend(m, res, ctxFor(sc, data));
  const flags = qaChecks(m, s.values, res, { hasGps: s.lat != null && s.lon != null, qualifiers: s.qualifiers });
  const rating = ratingLabel(m, res.rating);
  const others = ANALYTES.filter(a => s.values[a.key] !== undefined && !m.indicators.some(i => analyteOf(i.key) === a.key));
  const setStatus = (st: Sample['status']) => { db.setSampleStatus(s.id, st, user.username); db.audit(user.username, st === 'draft' ? 'reopen' : st === 'reviewed' ? 'review' : 'issue', 'sample', s.sample_no); refresh(); toast(st === 'draft' ? 'Sample reopened as draft' : st === 'reviewed' ? 'Marked as reviewed' : 'Marked as issued'); };
  const del = () => { db.deleteSample(s.id); db.audit(user.username, 'delete', 'sample', s.sample_no); refresh(); toast(`Deleted ${s.sample_no}`); go('/samples'); };
  return (
    <div className="stack">
      <div className="row wrap spread">
        <div><div className="row"><h1>{s.sample_no}</h1><Status s={s.status} /></div>
          <div className="mute" style={{ marginTop: 4 }}>{sc.farm ? <a href={`#/farms/${sc.farm.id}`}>{farmName(sc.farm)}</a> : 'No farm linked'}{s.description && `, ${s.description}`}</div></div>
        <div className="row wrap no-print">
          <button className="btn pri" onClick={() => go(`/samples/${s.id}/report`)}>Open report</button>
          {can('edit') && s.status !== 'issued' && <button className="btn" onClick={() => setEdit(true)}>Edit results</button>}
          {can('review') && s.status === 'draft' && <button className="btn" onClick={() => setStatus('reviewed')}>Mark reviewed</button>}
          {can('review') && s.status !== 'draft' && <button className="btn" onClick={() => setStatus('draft')}>Reopen</button>}
          {can('edit') && s.status === 'draft' && <ConfirmButton label="Delete" confirm={`Delete ${s.sample_no} permanently?`} onYes={del} />}
        </div>
      </div>

      <div className="grid g-main">
        <Panel>
          <div className="hero">
            <div className="center"><ScoreRing score={res.score} rating={res.rating} size={220} /></div>
            <div>
              <div className="row" style={{ marginBottom: 8 }}><Rating m={m} k={res.rating} /></div>
              <p style={{ fontSize: 16, maxWidth: 420 }}>{rating?.meaning ?? 'No indicators measured yet.'}</p>
              <div className="small mute" style={{ marginTop: 14 }}>Data coverage {fmt(res.coverage, 0)}% of scorecard weight{res.coverage < m.minCoverage ? `, below the ${m.minCoverage}% recommended` : ''}</div>
              <div className="meter" style={{ marginTop: 5, maxWidth: 320 }}><i style={{ width: `${res.coverage}%`, background: res.coverage < m.minCoverage ? 'var(--serious)' : 'var(--io)' }} /></div>
              <p className="small mute" style={{ marginTop: 14, maxWidth: 420 }}>{res.indicators.filter(i => i.score !== undefined).length} of {m.indicators.length} indicators measured; {res.indicators.filter(i => (i.score ?? 5) <= 2).length} are limiting (score 1 or 2).</p>
            </div>
          </div>
        </Panel>
        <Panel title="Score by category" sub="Points achieved as a share of the measured weight">
          <HBars rows={res.categories.filter(c => c.pct !== undefined).map(c => ({ label: m.categories.find(x => x.key === c.key)?.en ?? c.key, value: c.pct!, note: `${fmt(c.points, 1)} of ${c.measuredWeight} points`, color: c.pct! >= 80 ? 'var(--s5)' : c.pct! >= 60 ? 'var(--s3)' : c.pct! >= 40 ? 'var(--s2)' : 'var(--s1)' }))} max={100} unit="%" />
          <dl className="small" style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 14px', margin: '16px 0 0' }}>
            <dt className="mute">Crop</dt><dd style={{ margin: 0 }}>{data.crops.find(c => c.id === s.crop_id)?.en ?? 'Not recorded'}</dd>
            <dt className="mute">System</dt><dd style={{ margin: 0 }}>{SYSTEMS[s.system] ?? 'Not recorded'}</dd>
            <dt className="mute">Texture</dt><dd style={{ margin: 0 }}>{s.texture || 'Not recorded'}{s.depth_cm ? `, 0-${s.depth_cm} cm` : ''}</dd>
            <dt className="mute">Sampled</dt><dd style={{ margin: 0 }}>{fmtDate(s.sampled_on)}; analysed {fmtDate(s.analysed_on)}</dd>
            <dt className="mute">Location</dt><dd style={{ margin: 0 }}>{s.lat != null && s.lon != null ? `${s.lat}, ${s.lon}` : 'No GPS coordinate'}</dd>
          </dl>
        </Panel>
      </div>

      {flags.length > 0 && <Panel title="Data quality checks" sub="Automatic checks on units, ion balance and consistency"><div className="stack" style={{ gap: 8 }}>{flags.map(f => <div key={f.code} className={`flag ${f.level}`} style={{ marginTop: 0 }}><b>{f.level === 'error' ? 'Error' : f.level === 'warn' ? 'Check' : 'Note'}</b><span>{f.text}</span></div>)}</div></Panel>}

      <div className="grid g-main">
        <Panel title="Scorecard" sub={`${m.indicators.length} indicators, scored 1 to 5 and weighted to 100`} flush>
          <div className="scroll"><table className="tbl dense">
            <thead><tr><th>Indicator</th><th className="r">Value</th><th>Unit</th><th>Score</th><th>Band</th><th className="r">Weight</th><th className="r">Points</th></tr></thead>
            <tbody>{m.categories.map(c => <React.Fragment key={c.key}>
              <tr><td colSpan={7} style={{ background: 'var(--io-wash)', fontWeight: 600, color: 'var(--navy)' }}>{c.en}</td></tr>
              {m.indicators.filter(i => i.category === c.key).map(ind => { const r = res.byKey[ind.key], a = ANALYTE[analyteOf(ind.key)]; return (
                <tr key={ind.key}><td>{INDICATOR_LABEL[ind.key]?.en}{r.source === 'calculated' && <span className="small mute"> (calculated)</span>}</td>
                  <td className="n">{r.value === undefined ? <span className="mute">not measured</span> : (s.qualifiers[a.key] ?? '') + fmt(r.value, a.dp)}</td><td className="small mute">{a.unit}</td>
                  <td><span className="row" style={{ gap: 8 }}><Chip score={r.score} />{r.score && <span className="small">{SCORE_LABEL[r.score].en}</span>}</span></td>
                  <td className="small mute" {...tip(`Optimum (score 5): ${bandText(ind, 5)} ${a.unit}. Method: ${ind.method}.`)}>{r.score ? bandText(ind, r.score) : `optimum ${bandText(ind, 5)}`}</td>
                  <td className="n">{ind.weight}</td><td className="n">{r.points !== undefined ? fmt(r.points, 1) : '–'}</td></tr>); })}
            </React.Fragment>)}
              <tr><td colSpan={5}><b>Total over measured indicators</b></td><td className="n"><b>{res.measuredWeight}</b></td><td className="n"><b>{fmt(res.points, 1)}</b></td></tr>
            </tbody></table></div>
        </Panel>
        <div className="stack">
          <Panel title="Other measured parameters" flush>
            {others.length === 0 ? <Empty title="None recorded" /> : <table className="tbl dense"><tbody>
              {others.map(a => <tr key={a.key}><td>{a.en}</td><td className="n">{valText(s, a.key)}</td><td className="small mute">{a.unit}</td></tr>)}
              {res.derived.sar_calc !== undefined && <tr><td>SAR calculated from soluble ions</td><td className="n">{fmt(res.derived.sar_calc)}</td><td className="small mute">-</td></tr>}
              {res.derived.esp_calc !== undefined && <tr><td>ESP calculated from exchangeable Na</td><td className="n">{fmt(res.derived.esp_calc)}</td><td className="small mute">%</td></tr>}
              {res.derived.cec_sum !== undefined && <tr><td>Sum of exchangeable cations</td><td className="n">{fmt(res.derived.cec_sum)}</td><td className="small mute">cmolc/kg</td></tr>}
              {res.derived.ca_mg_ratio !== undefined && <tr><td>Ca : Mg ratio (exchangeable)</td><td className="n">{fmt(res.derived.ca_mg_ratio, 1)}</td><td className="small mute">-</td></tr>}
              {res.supplementary.map(x => <tr key={x.key}><td>{ANALYTE[x.key].en} rating</td><td className="n"><span className={`badge ${x.cls === 'good' ? 'r-healthy' : x.cls === 'moderate' ? 'r-moderate' : 'r-poor'}`}>{x.cls === 'good' ? 'Good' : x.cls === 'moderate' ? 'Moderate' : 'Limiting'}</span></td><td /></tr>)}
            </tbody></table>}
          </Panel>
          {reco.estimates.length > 0 && <Panel title="Calculated estimates" sub="Indicative figures; confirm rates with the agronomist before application">
            {reco.estimates.map(e => <div key={e.key} style={{ marginBottom: 12 }}><div className="row spread"><b>{e.label.en}</b><span className="num" style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 18, color: 'var(--navy)' }}>{e.value}</span></div><div className="small mute">{e.note.en}</div></div>)}
          </Panel>}
        </div>
      </div>

      <Panel title="Interpretation and recommendations" sub="Generated by rule from the scorecard result" actions={<Seg value={lang} onChange={setLang} options={[['en', 'English'], ['ar', 'العربية']]} />}>
        <RecoView reco={reco} lang={lang} />
      </Panel>

      <NotesPanel s={s} />
      {s.legacy && <Panel title="Earlier interpretation from the laboratory report" sub="Kept for reference; written before this scorecard was applied">
        <details><summary className="small" style={{ cursor: 'pointer', color: 'var(--io-deep)' }}>Show the original text</summary>
          <table className="tbl dense" style={{ marginTop: 10 }}><tbody>{Object.entries(s.legacy).map(([k, v]) => <tr key={k}><td style={{ width: 130, textTransform: 'capitalize' }}><b>{k}</b></td><td>{v.en}</td><td className="ar" style={{ width: '38%' }}>{v.ar}</td></tr>)}</tbody></table></details>
      </Panel>}
      {edit && <SampleForm sample={s} onClose={() => setEdit(false)} />}
    </div>
  );
}

function ConfirmButton({ label, confirm, onYes }: { label: string; confirm: string; onYes: () => void }) {
  const [open, setOpen] = useState(false);
  return <>{open && <Modal title={label} onClose={() => setOpen(false)} footer={<><button className="btn" onClick={() => setOpen(false)}>Cancel</button><button className="btn danger" onClick={() => { setOpen(false); onYes(); }}>{label}</button></>}><p>{confirm}</p></Modal>}<button className="btn danger" onClick={() => setOpen(true)}>{label}</button></>;
}
export { ConfirmButton };

export function RecoView({ reco, lang }: { reco: Reco; lang: 'en' | 'ar' }) {
  const L = lang === 'ar';
  const t = (en: string, ar: string) => (L ? ar : en);
  const H = ({ children }: { children: React.ReactNode }) => <h3 style={{ margin: '16px 0 7px' }}>{children}</h3>;
  return (
    <div className={`reco ${L ? 'ar' : ''}`} style={{ maxWidth: 980 }}>
      <p style={{ fontSize: 15 }}>{reco.overall[lang]}</p>
      {reco.constraints.length > 0 && <><H>{t('Key soil constraints', 'القيود الرئيسية للتربة')}</H><ul style={{ listStyle: 'none', padding: 0 }}>{reco.constraints.map(c => <li key={c.id}><span className={`sev sev${c.sev}`} style={L ? { marginRight: 0, marginLeft: 7 } : undefined} title={c.sev === 1 ? 'Critical' : c.sev === 2 ? 'Important' : 'Advisory'} />{c[lang]}</li>)}</ul></>}
      {reco.crop && <><H>{t('Crop on this plot', 'المحصول في هذه القطعة')}</H><p>{reco.crop[lang]}</p></>}
      <H>{t('By crop group', 'حسب مجموعة المحاصيل')}</H>
      <table className="tbl dense"><tbody>
        <tr><td style={{ width: 130 }}><b>{t('Vegetables', 'الخضروات')}</b></td><td>{reco.groups.vegetables[lang]}</td></tr>
        <tr><td><b>{t('Field crops', 'المحاصيل الحقلية')}</b></td><td>{reco.groups.field[lang]}</td></tr>
        <tr><td><b>{t('Fruit trees', 'أشجار الفاكهة')}</b></td><td>{reco.groups.trees[lang]}</td></tr>
      </tbody></table>
      {reco.shortTerm.length > 0 && <><H>{t('Short-term actions (this season)', 'إجراءات قصيرة المدى (هذا الموسم)')}</H><ul>{reco.shortTerm.map(c => <li key={c.id}>{c[lang]}</li>)}</ul></>}
      {reco.longTerm.length > 0 && <><H>{t('Long-term actions', 'إجراءات طويلة المدى')}</H><ul>{reco.longTerm.map(c => <li key={c.id}>{c[lang]}</li>)}</ul></>}
      <H>{t('Monitoring', 'المتابعة')}</H><ul>{reco.monitoring.map((c, i) => <li key={i}>{c[lang]}</li>)}</ul>
    </div>
  );
}

function NotesPanel({ s }: { s: Sample }) {
  const { can, user, refresh, toast } = useApp();
  const [en, setEn] = useState(s.note_en ?? ''), [ar, setAr] = useState(s.note_ar ?? '');
  const dirty = en !== (s.note_en ?? '') || ar !== (s.note_ar ?? '');
  const save = () => { db.saveSample({ ...s, note_en: en, note_ar: ar }, user.username); db.audit(user.username, 'edit', 'sample', s.sample_no, 'agronomist note'); refresh(); toast('Agronomist note saved'); };
  if (!can('review') && !s.note_en && !s.note_ar) return null;
  return (
    <Panel title="Agronomist note" sub="Printed on the report under the generated recommendations" actions={can('review') && <button className="btn pri sm" disabled={!dirty} onClick={save}>Save note</button>}>
      <div className="grid g2"><F label="English"><textarea value={en} onChange={e => setEn(e.target.value)} readOnly={!can('review')} /></F><F label="العربية"><textarea className="ar" value={ar} onChange={e => setAr(e.target.value)} readOnly={!can('review')} /></F></div>
    </Panel>
  );
}

function SampleForm({ sample, onClose }: { sample?: Sample; onClose: () => void }) {
  const { data, user, refresh, toast } = useApp();
  const [f, setF] = useState<Record<string, string>>(() => ({ sample_no: sample?.sample_no ?? '', farm_id: String(sample?.farm_id ?? ''), description: sample?.description ?? '', crop_id: sample?.crop_id ?? '', system: sample?.system ?? '', texture: sample?.texture ?? 'Sand', depth_cm: String(sample?.depth_cm ?? '30'), sampled_on: sample?.sampled_on ?? '', received_on: sample?.received_on ?? '', analysed_on: sample?.analysed_on ?? '', lat: String(sample?.lat ?? ''), lon: String(sample?.lon ?? ''), water_id: String(sample?.water_id ?? ''), notes: sample?.notes ?? '' }));
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(ANALYTES.map(a => [a.key, sample?.values[a.key] !== undefined ? (sample.qualifiers[a.key] ?? '') + sample.values[a.key] : ''])));
  const [err, setErr] = useState('');
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const numOrNull = (x: string) => (x.trim() === '' || isNaN(Number(x)) ? null : Number(x));
  const save = () => {
    if (!f.sample_no.trim()) { setErr('Enter a sample number.'); return; }
    const values: Record<string, number> = {}, qualifiers: Record<string, string> = {};
    for (const a of ANALYTES) { const raw = vals[a.key].trim(); if (!raw) continue; const p = parseValue(raw); if (p.value === undefined) { setErr(`${a.en}: "${raw}" is not a number.`); return; } values[a.key] = p.value; if (p.qualifier) qualifiers[a.key] = p.qualifier; }
    try {
      const id = db.saveSample({ ...(sample ?? {}), sample_no: f.sample_no.trim(), farm_id: numOrNull(f.farm_id), description: f.description, crop_id: f.crop_id, system: f.system, texture: f.texture, depth_cm: numOrNull(f.depth_cm), sampled_on: f.sampled_on, received_on: f.received_on, analysed_on: f.analysed_on, lat: numOrNull(f.lat), lon: numOrNull(f.lon), water_id: numOrNull(f.water_id), notes: f.notes, status: sample?.status ?? 'draft', values, qualifiers }, user.username);
      db.audit(user.username, sample ? 'edit' : 'create', 'sample', f.sample_no.trim(), `${Object.keys(values).length} values`);
      refresh(); toast(sample ? 'Sample saved' : 'Sample added'); onClose(); if (!sample) go(`/samples/${id}`);
    } catch (e) { setErr((e as Error).message); }
  };
  const farmWater = data.water.filter(w => !f.farm_id || String(w.farm_id) === f.farm_id);
  return (
    <Modal title={sample ? `Edit ${sample.sample_no}` : 'Add soil sample'} onClose={onClose} wide footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn pri" onClick={save}>Save sample</button></>}>
      <div className="stack">
        {err && <div className="flag error">{err}</div>}
        <div className="fields">
          <F label="Sample number"><input value={f.sample_no} onChange={set('sample_no')} placeholder="SP 001-26" /></F>
          <F label="Farm"><select value={f.farm_id} onChange={set('farm_id')}><option value="">Not linked</option>{data.farms.map(x => <option key={x.id} value={x.id}>{farmName(x)}{x.owner ? ` (${x.owner})` : ''}</option>)}</select></F>
          <F label="Crop"><select value={f.crop_id} onChange={set('crop_id')}><option value="">Not recorded</option>{data.crops.map(c => <option key={c.id} value={c.id}>{c.en}</option>)}</select></F>
          <F label="Farming system"><select value={f.system} onChange={set('system')}><option value="">Not recorded</option>{Object.entries(SYSTEMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></F>
          <F label="Texture class"><input value={f.texture} onChange={set('texture')} list="textures" /><datalist id="textures">{['Sand', 'Loamy sand', 'Sandy loam', 'Loam', 'Sandy clay loam', 'Clay loam'].map(t => <option key={t} value={t} />)}</datalist></F>
          <F label="Sampling depth (cm)"><input value={f.depth_cm} onChange={set('depth_cm')} inputMode="decimal" /></F>
          <F label="Sampled on"><input type="date" value={f.sampled_on} onChange={set('sampled_on')} /></F>
          <F label="Received on"><input type="date" value={f.received_on} onChange={set('received_on')} /></F>
          <F label="Analysed on"><input type="date" value={f.analysed_on} onChange={set('analysed_on')} /></F>
          <F label="Latitude"><input value={f.lat} onChange={set('lat')} inputMode="decimal" placeholder="24.2075" /></F>
          <F label="Longitude"><input value={f.lon} onChange={set('lon')} inputMode="decimal" placeholder="55.7447" /></F>
          <F label="Irrigation water sample"><select value={f.water_id} onChange={set('water_id')}><option value="">Not linked</option>{farmWater.map(w => <option key={w.id} value={w.id}>{w.sample_no} ({w.source || 'source not recorded'})</option>)}</select></F>
          <F label="Description" span={2}><input value={f.description} onChange={set('description')} /></F>
        </div>
        {ANALYTE_GROUPS.map(g => <div key={g.key}><h3 style={{ marginBottom: 8 }}>{g.en}</h3><div className="fields">{ANALYTES.filter(a => a.group === g.key).map(a => <F key={a.key} label={`${a.en}${a.unit !== '-' ? ` (${a.unit})` : ''}`}><input value={vals[a.key]} onChange={e => setVals({ ...vals, [a.key]: e.target.value })} inputMode="decimal" placeholder="not measured" /></F>)}</div></div>)}
        <p className="small mute">Leave a field empty if it was not measured. Enter results below the detection limit with a less-than sign, for example &lt;0.05. ECe must be in dS/m.</p>
      </div>
    </Modal>
  );
}

// ================================================================ report
export function SampleReport({ sc, lang }: { sc: Scored; lang: 'en' | 'ar' | 'both' }) {
  const { data, user } = useApp();
  const m = data.meth.data, { s, res } = sc;
  const reco = recommend(m, res, ctxFor(sc, data));
  const flags = qaChecks(m, s.values, res, { qualifiers: s.qualifiers }).filter(f => f.level !== 'info');
  const rating = ratingLabel(m, res.rating);
  const en = lang !== 'ar', ar = lang !== 'en';
  const H = ({ e, a }: { e: string; a: string }) => <h2>{en && <span>{e}</span>}{ar && <span className="ar">{a}</span>}</h2>;
  const Two = ({ e, a }: { e: React.ReactNode; a: React.ReactNode }) => (lang === 'both' ? <div className="two"><div>{e}</div><div className="ar">{a}</div></div> : lang === 'ar' ? <div className="ar">{a}</div> : <div>{e}</div>);
  const others = ANALYTES.filter(x => s.values[x.key] !== undefined && !m.indicators.some(i => analyteOf(i.key) === x.key));
  const crop = data.crops.find(c => c.id === s.crop_id);
  const list = (xs: { en: string; ar: string }[], k: 'en' | 'ar') => <ul>{xs.map((x, i) => <li key={i}>{x[k]}</li>)}</ul>;
  return (
    <article className="report">
      <div className="rep-head">
        <img className="io" src={BASE + 'brand/io-logo-full.png'} alt="Innovation Oasis" />
        <div className="rep-title"><h1>Soil Health Report</h1><div className="ar">تقرير صحة التربة</div></div>
        <img className="silal" src={BASE + 'brand/silal-logo.png'} alt="Silal" />
      </div>
      <div className="rep-meta">
        <div><span>Sample no.</span><b>{s.sample_no}</b></div><div><span>Farm no.</span>{sc.farm?.farm_no || '–'}</div><div><span>Supply no.</span>{sc.farm?.supply_no || '–'}</div><div><span>Owner</span>{sc.farm?.owner || '–'}</div>
        <div><span>Description</span>{s.description || '–'}</div><div><span>Crop / system</span>{[crop?.en, SYSTEMS[s.system]].filter(Boolean).join(', ') || '–'}</div><div><span>Texture / depth</span>{s.texture || '–'}{s.depth_cm ? `, 0-${s.depth_cm} cm` : ''}</div><div><span>Engineer</span>{sc.farm?.engineer || '–'}</div>
        <div><span>Sampled</span>{fmtDate(s.sampled_on)}</div><div><span>Received</span>{fmtDate(s.received_on)}</div><div><span>Analysed</span>{fmtDate(s.analysed_on)}</div><div><span>Report date</span>{fmtDate(new Date().toISOString())}</div>
      </div>
      <div className="rep-score avoid">
        <div className="center"><ScoreRing score={res.score} rating={res.rating} size={124} /></div>
        <div>
          {rating && <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: '17pt', color: RATING_COL[rating.key] }}>{en && rating.en}{lang === 'both' && ' | '}{ar && <span style={{ fontFamily: 'IBM Plex Sans Arabic' }}>{rating.ar}</span>}</div>}
          <div style={{ fontSize: '9pt', marginTop: 4 }}>{en && <div>{rating?.meaning}. Data coverage {fmt(res.coverage, 0)}% of scorecard weight.</div>}{ar && <div className="ar">{rating?.meaningAr}. تغطية البيانات {fmt(res.coverage, 0)}٪ من وزن بطاقة التقييم.</div>}</div>
          <div style={{ display: 'flex', gap: 3, marginTop: 10 }}>{[...m.ratings].reverse().map((r, i, arr) => <div key={r.key} style={{ flex: (arr[i + 1]?.min ?? 100) - r.min, fontSize: '7.5pt', textAlign: 'center' }}><div style={{ height: 5, borderRadius: 3, background: RATING_COL[r.key], opacity: r.key === res.rating ? 1 : 0.3 }} />{r.en} {r.min}+</div>)}</div>
        </div>
      </div>

      <H e="Scorecard" a="بطاقة التقييم" />
      <table><thead><tr><th>Indicator</th><th>Value</th><th>Unit</th><th>Optimum</th><th>Score</th><th>Assessment</th><th>Weight</th><th>Points</th></tr></thead><tbody>
        {m.indicators.map(ind => { const r = res.byKey[ind.key], a = ANALYTE[analyteOf(ind.key)]; return <tr key={ind.key}><td>{INDICATOR_LABEL[ind.key]?.en}{ar && <span style={{ fontFamily: 'IBM Plex Sans Arabic', color: 'var(--mute)' }}> / {INDICATOR_LABEL[ind.key]?.ar}</span>}</td><td className="num">{r.value === undefined ? '–' : (s.qualifiers[a.key] ?? '') + fmt(r.value, a.dp)}{r.source === 'calculated' ? '*' : ''}</td><td>{a.unit}</td><td>{bandText(ind, 5)}</td><td>{r.score ? <span className={`chip c${r.score}`} style={{ width: 18, height: 18, fontSize: '8.5pt' }}>{r.score}</span> : '–'}</td><td>{r.score ? SCORE_LABEL[r.score].en : 'Not measured'}</td><td className="num">{ind.weight}</td><td className="num">{r.points !== undefined ? fmt(r.points, 1) : '–'}</td></tr>; })}
        <tr><td colSpan={6}><b>Total over measured indicators = {fmt(res.points, 1)} / {res.measuredWeight} = {fmt(res.score, 1)}</b></td><td className="num"><b>{res.measuredWeight}</b></td><td className="num"><b>{fmt(res.points, 1)}</b></td></tr>
      </tbody></table>
      {res.indicators.some(i => i.source === 'calculated') && <div style={{ fontSize: '7.8pt', color: 'var(--mute)', marginTop: 3 }}>* Calculated from the reported soluble or exchangeable ions.</div>}

      {others.length > 0 && <div className="avoid"><H e="Other measured parameters" a="قياسات أخرى" />
        <table><tbody>{Array.from({ length: Math.ceil(others.length / 2) }, (_, i) => <tr key={i}>{[others[i * 2], others[i * 2 + 1]].map((a, j) => (a ? <React.Fragment key={j}><td>{a.en}</td><td className="num">{valText(s, a.key)} {a.unit !== '-' ? a.unit : ''}</td></React.Fragment> : <React.Fragment key={j}><td /><td /></React.Fragment>))}</tr>)}</tbody></table></div>}

      <H e="Interpretation" a="التفسير" />
      <Two e={<p>{reco.overall.en}</p>} a={<p>{reco.overall.ar}</p>} />
      {reco.constraints.length > 0 && <><H e="Key soil constraints" a="القيود الرئيسية للتربة" /><Two e={list(reco.constraints, 'en')} a={list(reco.constraints, 'ar')} /></>}
      <H e="Recommendations by crop group" a="التوصيات حسب مجموعة المحاصيل" />
      {reco.crop && <Two e={<p><b>{crop?.en}:</b> {reco.crop.en}</p>} a={<p>{reco.crop.ar}</p>} />}
      <Two e={<><p><b>Vegetables:</b> {reco.groups.vegetables.en}</p><p><b>Field crops:</b> {reco.groups.field.en}</p><p><b>Fruit trees:</b> {reco.groups.trees.en}</p></>} a={<><p><b>الخضروات:</b> {reco.groups.vegetables.ar}</p><p><b>المحاصيل الحقلية:</b> {reco.groups.field.ar}</p><p><b>أشجار الفاكهة:</b> {reco.groups.trees.ar}</p></>} />
      {reco.shortTerm.length > 0 && <><H e="Short-term actions" a="إجراءات قصيرة المدى" /><Two e={list(reco.shortTerm, 'en')} a={list(reco.shortTerm, 'ar')} /></>}
      {reco.longTerm.length > 0 && <><H e="Long-term actions" a="إجراءات طويلة المدى" /><Two e={list(reco.longTerm, 'en')} a={list(reco.longTerm, 'ar')} /></>}
      {reco.estimates.length > 0 && <div className="avoid"><H e="Calculated estimates" a="تقديرات محسوبة" /><table><tbody>{reco.estimates.map(e => <tr key={e.key}><td style={{ width: '26%' }}><b>{en ? e.label.en : e.label.ar}</b></td><td className="num" style={{ width: '12%', whiteSpace: 'nowrap' }}><b>{e.value}</b></td><td className={en ? '' : 'ar'}>{en ? e.note.en : e.note.ar}</td></tr>)}</tbody></table></div>}
      <div className="avoid"><H e="Monitoring" a="المتابعة" /><Two e={list(reco.monitoring, 'en')} a={list(reco.monitoring, 'ar')} /></div>
      {(s.note_en || s.note_ar) && <div className="avoid"><H e="Agronomist note" a="ملاحظة المهندس الزراعي" /><Two e={<p style={{ whiteSpace: 'pre-wrap' }}>{s.note_en}</p>} a={<p style={{ whiteSpace: 'pre-wrap' }}>{s.note_ar}</p>} /></div>}
      {flags.length > 0 && <div className="avoid"><H e="Data quality notes" a="ملاحظات جودة البيانات" /><ul>{flags.map(f => <li key={f.code}>{f.text}</li>)}</ul></div>}

      <div className="sign avoid"><div>Prepared by<br /><b>{user.name}</b></div><div>Reviewed by<br /><b>{s.reviewed_by ? data.users.find(u => u.username === s.reviewed_by)?.name ?? s.reviewed_by : ' '}</b></div><div>Status<br /><b>{s.status === 'issued' ? 'Issued' : s.status === 'reviewed' ? 'Reviewed' : 'Draft - not for distribution'}</b></div></div>
      <div className="rep-foot"><span>{m.name} v{m.version} ({m.status}). Scores are calculated over measured indicators only. Thresholds are adapted for arid, sandy, calcareous UAE soils and remain subject to validation. Recommendations are generated by rule from the laboratory results and should be confirmed on site by a qualified agronomist before application rates are set.</span><span style={{ whiteSpace: 'nowrap' }}>Innovation Oasis, part of Silal</span></div>
    </article>
  );
}

export function ReportPage({ ids }: { ids: number[] }) {
  const { data, can, user, refresh, toast } = useApp();
  const [lang, setLang] = useState<'en' | 'ar' | 'both'>('both');
  const list = ids.map(id => data.scored.find(x => x.s.id === id)).filter((x): x is Scored => !!x);
  if (!list.length) return <Panel><Empty title="Nothing to report">The selected samples were not found. <a href="#/samples">Back to samples</a></Empty></Panel>;
  const issue = () => {
    for (const x of list) { db.addReport({ sample_id: x.s.id, issued_at: db.now(), issued_by: user.username, score: x.res.score ?? null, rating: x.res.rating ?? '', coverage: x.res.coverage, methodology: `${data.meth.data.name} v${data.meth.data.version}`, lang }); db.setSampleStatus(x.s.id, 'issued', user.username); db.audit(user.username, 'issue', 'report', x.s.sample_no, `score ${x.res.score?.toFixed(1) ?? 'n/a'}`); }
    refresh(); toast(`${list.length} report${list.length === 1 ? '' : 's'} recorded as issued`);
  };
  return (
    <div className="stack">
      <div className="row wrap spread no-print">
        <div className="row">{list.length === 1 && <a className="btn" href={`#/samples/${list[0].s.id}`}>Back to sample</a>}<Seg value={lang} onChange={setLang} options={[['both', 'Bilingual'], ['en', 'English'], ['ar', 'العربية']]} /></div>
        <div className="row">{can('review') && <button className="btn" onClick={issue}>Record as issued</button>}<button className="btn pri" onClick={() => window.print()}>Print or save as PDF</button></div>
      </div>
      <div className="report-wrap">{list.map(x => <SampleReport key={x.s.id} sc={x} lang={lang} />)}</div>
    </div>
  );
}
