import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import * as db from '../db/db';
import { Farm, Sample, WaterSample, User, ReportRec, MethodologyRec } from '../db/db';
import { Crop } from '../engine/agronomy';
import { Methodology, INDICATOR_LABEL, SCORE_LABEL, ANALYTE, analyteOf } from '../engine/methodology';
import { scoreSample, ScoreResult } from '../engine/score';

export const BASE = import.meta.env.BASE_URL;
export interface Scored { s: Sample; res: ScoreResult; farm?: Farm }
export interface AppData { farms: Farm[]; samples: Sample[]; water: WaterSample[]; meth: MethodologyRec; crops: Crop[]; users: User[]; reports: ReportRec[]; scored: Scored[] }
export type Perm = 'edit' | 'review' | 'admin';
export interface AppState { data: AppData; user: User; refresh: () => void; can: (p: Perm) => boolean; toast: (msg: string, err?: boolean) => void; logout: () => void }
export const AppCtx = createContext<AppState>(null!);
export const useApp = () => useContext(AppCtx);

export function loadData(): AppData {
  const farms = db.listFarms(), samples = db.listSamples(), meth = db.activeMethodology();
  const fById = new Map(farms.map(f => [f.id, f]));
  return { farms, samples, water: db.listWater(), meth, crops: db.listCrops(), users: db.listUsers(), reports: db.listReports(), scored: samples.map(s => ({ s, res: scoreSample(meth.data, s.values), farm: s.farm_id ? fById.get(s.farm_id) : undefined })) };
}
export const ROLE_LABEL: Record<string, string> = { admin: 'Administrator', analyst: 'Laboratory analyst', agronomist: 'Agronomist', viewer: 'Viewer' };
export const PERMS: Record<string, Perm[]> = { admin: ['edit', 'review', 'admin'], analyst: ['edit'], agronomist: ['edit', 'review'], viewer: [] };
export const SYSTEMS: Record<string, string> = { GH: 'Greenhouse', NH: 'Net house', OF: 'Open field', Other: 'Other' };

// ---------------------------------------------------------------- router
export function useHash(): string {
  const [h, setH] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => { const f = () => { setH(window.location.hash.slice(1) || '/'); window.scrollTo(0, 0); }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return h;
}
export const go = (path: string) => { window.location.hash = path; };

// ---------------------------------------------------------------- formatting
export const fmt = (x: number | undefined | null, dp = 2) => (x === undefined || x === null || !isFinite(x) ? '–' : x.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp }));
export const fmtDate = (iso?: string) => { if (!iso) return '–'; const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso); return isNaN(+d) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); };
export const valText = (s: Sample, key: string) => { const v = s.values[key]; if (v === undefined) return '–'; return (s.qualifiers[key] ?? '') + fmt(v, ANALYTE[key]?.dp ?? 2); };
export const ratingLabel = (m: Methodology, key?: string) => m.ratings.find(r => r.key === key);
export const farmName = (f?: Farm) => (f ? [f.farm_no && `Farm ${f.farm_no}`, f.supply_no && `Supply ${f.supply_no}`].filter(Boolean).join(', ') || f.owner || `Farm #${f.id}` : 'No farm linked');
export function download(name: string, content: BlobPart, type = 'text/plain') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

// ---------------------------------------------------------------- tooltip
let tipEl: HTMLDivElement | null = null;
export function tip(text: string) {
  return {
    onMouseMove: (e: React.MouseEvent) => { if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; document.body.appendChild(tipEl); } tipEl.textContent = text; tipEl.style.display = 'block'; const x = Math.min(e.clientX + 14, window.innerWidth - 300); tipEl.style.left = x + 'px'; tipEl.style.top = e.clientY + 16 + 'px'; },
    onMouseLeave: () => { if (tipEl) tipEl.style.display = 'none'; },
  };
}

// ---------------------------------------------------------------- small components
export const Panel = ({ title, sub, actions, children, flush }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children?: ReactNode; flush?: boolean }) => (
  <section className="panel">
    {(title || actions) && <header><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{actions && <div className="row no-print">{actions}</div>}</header>}
    {flush ? children : <div className="body">{children}</div>}
  </section>
);
export const Rating = ({ m, k }: { m: Methodology; k?: string }) => { const r = ratingLabel(m, k); return r ? <span className={`badge r-${r.key}`}><i />{r.en}</span> : <span className="badge">Not rated</span>; };
export const Status = ({ s }: { s: string }) => <span className={`badge st-${s}`}>{s === 'draft' ? 'Draft' : s === 'reviewed' ? 'Reviewed' : 'Issued'}</span>;
export const Chip = ({ score }: { score?: number }) => <span className={`chip c${score ?? 0}`} {...tip(score ? `Score ${score} of 5 - ${SCORE_LABEL[score].en}` : 'Not measured')}>{score ?? '–'}</span>;
export const F = ({ label, children, span }: { label: string; children: ReactNode; span?: number }) => <label className="f" style={span ? { gridColumn: `span ${span}` } : undefined}><span>{label}</span>{children}</label>;
export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [onClose]);
  return <div className="modal-bg" onMouseDown={e => e.target === e.currentTarget && onClose()}><div className="modal" style={wide ? { width: 'min(1080px, 100%)' } : undefined} role="dialog" aria-label={title}><header><h2>{title}</h2><button className="btn sm" onClick={onClose}>Close</button></header><div className="body">{children}</div>{footer && <footer>{footer}</footer>}</div></div>;
}
export const Empty = ({ title, children }: { title: string; children?: ReactNode }) => <div className="empty"><h3>{title}</h3><div>{children}</div></div>;
export const Seg = <T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) => <div className="seg">{options.map(([v, l]) => <button key={v} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>)}</div>;

// ---------------------------------------------------------------- score ring
export function ScoreRing({ score, rating, size = 200 }: { score?: number; rating?: string; size?: number }) {
  const R = 84, C = 2 * Math.PI * R, frac = Math.max(0, Math.min(1, (score ?? 0) / 100));
  return (
    <svg viewBox="-100 -100 200 200" width={size} height={size} role="img" aria-label={score === undefined ? 'Not scored' : `Soil health score ${score.toFixed(1)} out of 100`}>
      <circle r={R} fill="none" stroke="#e3e9f0" strokeWidth={14} />
      {score !== undefined && <circle r={R} fill="none" stroke={rating ? RATING_COL[rating] : 'var(--io)'} strokeWidth={14} strokeLinecap="round" strokeDasharray={`${frac * C} ${C}`} transform="rotate(-90)" />}
      <text y={8} textAnchor="middle" fontFamily="var(--display)" fontWeight={700} fontSize={46} fill="var(--navy)">{score === undefined ? '–' : score.toFixed(1)}</text>
      <text y={34} textAnchor="middle" fontSize={15} fill="var(--mute)">out of 100</text>
    </svg>
  );
}

// ---------------------------------------------------------------- charts (single-axis SVG, labelled, with hover)
export const SCORE_COL = ['', 'var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)'];
export const RATING_COL: Record<string, string> = { healthy: 'var(--good)', moderate: 'var(--warn)', marginal: 'var(--serious)', poor: 'var(--crit)' };

export function HBars({ rows, max, unit = '', color = 'var(--io)', dp = 0 }: { rows: { label: string; value: number; note?: string; color?: string }[]; max?: number; unit?: string; color?: string; dp?: number }) {
  const mx = max ?? Math.max(1, ...rows.map(r => r.value));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr max-content', gap: '7px 10px', alignItems: 'center' }}>
      {rows.map(r => (
        <React.Fragment key={r.label}>
          <div className="small" style={{ color: 'var(--ink-2)' }}>{r.label}</div>
          <div style={{ height: 14, background: 'var(--line-2)', borderRadius: 4 }} {...tip(`${r.label}: ${fmt(r.value, dp)}${unit}${r.note ? ' - ' + r.note : ''}`)}>
            <div style={{ width: `${Math.max(0, Math.min(100, (r.value / mx) * 100))}%`, height: '100%', background: r.color ?? color, borderRadius: 4 }} />
          </div>
          <div className="small num right" style={{ minWidth: 44 }}>{fmt(r.value, dp)}{unit}</div>
        </React.Fragment>
      ))}
    </div>
  );
}

export function Histogram({ values, m }: { values: number[]; m: Methodology }) {
  const bins = Array.from({ length: 10 }, (_, i) => ({ lo: i * 10, n: 0 }));
  values.forEach(v => { bins[Math.min(9, Math.floor(v / 10))].n++; });
  const mx = Math.max(1, ...bins.map(b => b.n)), W = 560, H = 190, pad = { l: 30, r: 12, t: 20, b: 38 }, bw = (W - pad.l - pad.r) / 10, ph = H - pad.t - pad.b;
  const ticks = [...new Set([0, Math.ceil(mx / 2), mx])];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Distribution of soil health scores">
      {ticks.map(t => <g key={t}><line x1={pad.l} x2={W - pad.r} y1={pad.t + ph - (t / mx) * ph} y2={pad.t + ph - (t / mx) * ph} stroke="var(--line-2)" /><text x={pad.l - 6} y={pad.t + ph - (t / mx) * ph + 4} textAnchor="end" fontSize="11" fill="var(--mute)">{t}</text></g>)}
      {bins.map((b, i) => { const h = (b.n / mx) * ph; const rk = m.ratings.find(r => b.lo >= r.min)?.key ?? 'poor'; return <g key={i} {...tip(`Score ${b.lo}-${b.lo + 10}: ${b.n} sample${b.n === 1 ? '' : 's'} (${ratingLabel(m, rk)?.en})`)}><rect x={pad.l + i * bw} y={pad.t} width={bw} height={ph} fill="transparent" /><rect x={pad.l + i * bw + 1} y={pad.t + ph - h} width={bw - 2} height={h} rx={3} fill="var(--io)" />{b.n > 0 && <text x={pad.l + i * bw + bw / 2} y={pad.t + ph - h - 4} textAnchor="middle" fontSize="11" fill="var(--ink-2)">{b.n}</text>}</g>; })}
      {bins.map((b, i) => <text key={i} x={pad.l + i * bw} y={H - 22} textAnchor="middle" fontSize="11" fill="var(--mute)">{b.lo}</text>)}
      <text x={W - pad.r} y={H - 22} textAnchor="middle" fontSize="11" fill="var(--mute)">100</text>
      {[...m.ratings].reverse().map((r, i, arr) => { const x0 = pad.l + (r.min / 100) * (W - pad.l - pad.r), x1 = pad.l + ((arr[i + 1]?.min ?? 100) / 100) * (W - pad.l - pad.r); return <g key={r.key}><rect x={x0 + 1} y={H - 12} width={x1 - x0 - 2} height={4} rx={2} fill={RATING_COL[r.key]} /></g>; })}
    </svg>
  );
}

export function RatingBar({ counts, m }: { counts: Record<string, number>; m: Methodology }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  return (
    <div>
      <div style={{ display: 'flex', gap: 2, height: 22, borderRadius: 5, overflow: 'hidden' }}>
        {m.ratings.map(r => (counts[r.key] ? <div key={r.key} style={{ width: `${(counts[r.key] / total) * 100}%`, background: RATING_COL[r.key] }} {...tip(`${r.en}: ${counts[r.key]} (${fmt((counts[r.key] / total) * 100, 0)}%)`)} /> : null))}
      </div>
      <div className="row wrap small" style={{ marginTop: 9, gap: 16 }}>
        {m.ratings.map(r => <span key={r.key} className="row" style={{ gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: RATING_COL[r.key] }} />{r.en} <b className="num">{counts[r.key] ?? 0}</b><span className="mute">{r.min}{r.min === 80 ? '–100' : `–${(m.ratings[m.ratings.indexOf(r) - 1]?.min ?? 100) - 1}`}</span></span>)}
      </div>
    </div>
  );
}

/** One 100% bar per indicator, split by the share of samples at each score. */
export function ScoreMix({ rows }: { rows: { label: string; counts: number[]; n: number }[] }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr max-content', gap: '6px 10px', alignItems: 'center' }}>
        {rows.map(r => (
          <React.Fragment key={r.label}>
            <div className="small" style={{ color: 'var(--ink-2)' }}>{r.label}</div>
            <div style={{ display: 'flex', gap: 2, height: 14 }}>
              {r.n === 0 ? <div style={{ flex: 1, background: 'var(--line-2)', borderRadius: 3 }} /> : [1, 2, 3, 4, 5].map(sc => (r.counts[sc] ? <div key={sc} style={{ width: `${(r.counts[sc] / r.n) * 100}%`, background: SCORE_COL[sc], borderRadius: 3 }} {...tip(`${r.label} - score ${sc} (${SCORE_LABEL[sc].en}): ${r.counts[sc]} of ${r.n} samples`)} /> : null))}
            </div>
            <div className="small num mute right">{r.n ? `${fmt(((r.counts[1] + r.counts[2]) / r.n) * 100, 0)}% limiting` : 'no data'}</div>
          </React.Fragment>
        ))}
      </div>
      <div className="row wrap small" style={{ marginTop: 10, gap: 14 }}>{[1, 2, 3, 4, 5].map(sc => <span key={sc} className="row" style={{ gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: SCORE_COL[sc] }} />{sc} {SCORE_LABEL[sc].en}</span>)}</div>
    </div>
  );
}

export function TrendLine({ points, m, height = 200 }: { points: { label: string; y: number; note?: string }[]; m: Methodology; height?: number }) {
  const W = 560, H = height, pad = { l: 34, r: 16, t: 12, b: 30 }, pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (points.length === 1 ? pw / 2 : (i / (points.length - 1)) * pw), y = (v: number) => pad.t + ph - (v / 100) * ph;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Soil health score over time">
      {m.ratings.map(r => <g key={r.key}><line x1={pad.l} x2={W - pad.r} y1={y(r.min)} y2={y(r.min)} stroke="var(--line)" strokeDasharray={r.min ? '3 4' : undefined} /><text x={pad.l - 6} y={y(r.min) + 4} textAnchor="end" fontSize="11" fill="var(--mute)">{r.min}</text></g>)}
      <text x={pad.l - 6} y={y(100) + 4} textAnchor="end" fontSize="11" fill="var(--mute)">100</text>
      {points.length > 1 && <polyline points={points.map((p, i) => `${x(i)},${y(p.y)}`).join(' ')} fill="none" stroke="var(--io-deep)" strokeWidth={2} strokeLinejoin="round" />}
      {points.map((p, i) => <g key={i} {...tip(`${p.label}: ${fmt(p.y, 1)}${p.note ? ' - ' + p.note : ''}`)}><circle cx={x(i)} cy={y(p.y)} r={12} fill="transparent" /><circle cx={x(i)} cy={y(p.y)} r={4.5} fill="var(--io-deep)" stroke="#fff" strokeWidth={2} />{(i === 0 || i === points.length - 1) && <text x={x(i)} y={y(p.y) - 9} textAnchor={i === 0 && points.length > 1 ? 'start' : 'end'} fontSize="11.5" fontWeight="600" fill="var(--ink)">{fmt(p.y, 1)}</text>}<text x={x(i)} y={H - 10} textAnchor="middle" fontSize="10.5" fill="var(--mute)">{points.length <= 8 || i % Math.ceil(points.length / 8) === 0 ? p.label : ''}</text></g>)}
    </svg>
  );
}

// ---------------------------------------------------------------- icons
const P: Record<string, string> = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7.5 15h9', farm: 'M3 21V10l6-4 6 4v11M9 21v-6h0M15 21h6V8l-3-2-3 2M3 21h18',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z', chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3', book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11', cog: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4', doc: 'M7 3h7l4 4v14H7zM14 3v4h4M9.5 12h6M9.5 16h6',
};
export const Icon = ({ n }: { n: string }) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[n]} /></svg>;
