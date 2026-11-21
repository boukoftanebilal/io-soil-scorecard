import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as db from '../db/db';
import { demoSeed } from '../db/demo';
import { AppCtx, AppData, AppState, BASE, F, Icon, PERMS, ROLE_LABEL, loadData, useHash, go } from './core';
import { Dashboard, SamplesPage, SampleDetail, ReportPage } from './pages1';
import { FarmsPage, FarmDetail, WaterPage, AnalyticsPage, MethodologyPage, AdminPage, ReportsLog } from './pages2';

type Phase = 'boot' | 'setup' | 'login' | 'app' | 'error';

export default function App() {
  const [phase, setPhase] = useState<Phase>('boot');
  const [err, setErr] = useState('');
  const [user, setUser] = useState<db.User | null>(null);
  const [data, setData] = useState<AppData | null>(null);
  const [toastMsg, setToast] = useState<{ msg: string; err?: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await db.initEngine(BASE + 'sql-wasm.wasm');
        const has = await db.openSaved();
        if (!has || db.listUsers().length === 0) { setPhase('setup'); return; }
        let uid: string | null = null; try { uid = sessionStorage.getItem('io-ssc-user'); } catch { /* storage unavailable */ }
        const u = uid ? db.listUsers().find(x => String(x.id) === uid && x.active) : undefined;
        if (u) { setUser(u); setData(loadData()); setPhase('app'); } else setPhase('login');
      } catch (e) { setErr((e as Error).message); setPhase('error'); }
    })();
  }, []);

  const refresh = useCallback(() => { setData(loadData()); db.scheduleSave(); }, []);
  const toast = useCallback((msg: string, isErr?: boolean) => { setToast({ msg, err: isErr }); setTimeout(() => setToast(null), isErr ? 6000 : 3200); }, []);
  const enter = (u: db.User) => { try { sessionStorage.setItem('io-ssc-user', String(u.id)); } catch { /* ignore */ } setUser(u); setData(loadData()); setPhase('app'); };
  const logout = useCallback(() => { try { sessionStorage.removeItem('io-ssc-user'); } catch { /* ignore */ } setUser(null); setPhase('login'); go('/'); }, []);
  const state = useMemo<AppState | null>(() => (user && data ? { data, user, refresh, toast, logout, can: p => PERMS[user.role]?.includes(p) ?? false } : null), [user, data, refresh, toast, logout]);

  if (phase === 'boot') return <div className="empty" style={{ paddingTop: '30vh' }}><h3>Opening the database…</h3></div>;
  if (phase === 'error') return <div className="empty" style={{ paddingTop: '25vh' }}><h3>The database could not be opened</h3><p>{err}</p><p>Reload the page. If the problem continues, use a current version of Chrome, Edge, Firefox or Safari.</p></div>;
  if (phase === 'setup') return <AuthFrame><Setup onDone={enter} onRestored={() => setPhase('login')} /></AuthFrame>;
  if (phase === 'login' || !state) return <AuthFrame><Login onDone={enter} /></AuthFrame>;
  return <AppCtx.Provider value={state}><Shell />{toastMsg && <div className={`toast ${toastMsg.err ? 'err' : ''}`} role="status">{toastMsg.msg}</div>}</AppCtx.Provider>;
}

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-art">
        <img src={BASE + 'brand/io-mark-white.png'} alt="" style={{ height: 54, alignSelf: 'flex-start' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1>UAE Soil Health Scorecard</h1>
          <p style={{ marginTop: 16 }}>Score every soil sample against thresholds built for sandy, calcareous desert soils, see what is limiting the crop, and issue a bilingual report with clear actions for the farm.</p>
          <p className="small" style={{ marginTop: 22, color: '#8fa1c8' }}>Innovation Oasis, part of Silal. Methodology developed with Cranfield University.</p>
        </div>
        <svg className="veins" viewBox="-110 -110 220 220" aria-hidden="true">
          <circle r="100" fill="#2a4283" />
          {Array.from({ length: 11 }, (_, i) => { const y = -62 + i * 12.4, half = Math.sqrt(10000 - y * y) * 0.7 * Math.sin(Math.PI * (0.18 + 0.064 * i)) ** 0.6, s = i % 2 ? 1 : -1; return <g key={i}><line x1={-half} x2={half} y1={y} y2={y} stroke="#40a7cf" strokeWidth="2.6" strokeLinecap="round" /><circle cx={s * half} cy={y} r="3.6" fill="#40a7cf" /></g>; })}
          <circle cy="-80" r="5.5" fill="#40a7cf" /><circle cy="80" r="5.5" fill="#40a7cf" />
        </svg>
      </div>
      <div className="auth-form">
        <div className="logos"><img src={BASE + 'brand/io-logo-full.png'} alt="Innovation Oasis" /><img className="silal" src={BASE + 'brand/silal-logo.png'} alt="Silal" /></div>
        {children}
      </div>
    </div>
  );
}

function Login({ onDone }: { onDone: (u: db.User) => void }) {
  const [u, setU] = useState(''), [p, setP] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(''); try { const user = await db.login(u, p); db.audit(user.username, 'sign in', 'user', user.username); db.scheduleSave(); onDone(user); } catch (x) { setErr((x as Error).message); } setBusy(false); };
  return (
    <form onSubmit={submit} className="stack">
      <div><h1>Sign in</h1><p className="mute" style={{ marginTop: 6 }}>Use the account your administrator created on this device.</p></div>
      <F label="Username"><input value={u} onChange={e => setU(e.target.value)} autoFocus autoComplete="username" /></F>
      <F label="Password"><input type="password" value={p} onChange={e => setP(e.target.value)} autoComplete="current-password" /></F>
      {err && <div className="flag error">{err}</div>}
      <button className="btn pri" disabled={busy || !u || !p} style={{ justifyContent: 'center', padding: '10px 14px' }}>{busy ? 'Checking…' : 'Sign in'}</button>
    </form>
  );
}

type Source = 'silal' | 'demo' | 'restore' | 'empty';
function Setup({ onDone, onRestored }: { onDone: (u: db.User) => void; onRestored: () => void }) {
  const [src, setSrc] = useState<Source>('silal');
  const [key, setKey] = useState(''), [name, setName] = useState(''), [uname, setUname] = useState(''), [pw, setPw] = useState(''), [pw2, setPw2] = useState('');
  const [file, setFile] = useState<File | null>(null), [err, setErr] = useState(''), [busy, setBusy] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('');
    try {
      if (src === 'restore') {
        if (!file) throw new Error('Choose a backup file first.');
        setBusy('Restoring the backup…'); db.loadBytes(new Uint8Array(await file.arrayBuffer())); await db.saveNow(); onRestored(); return;
      }
      if (pw !== pw2) throw new Error('The two passwords do not match.');
      if (pw.length < 8) throw new Error('Password must be at least 8 characters.');
      let seed: db.SeedData | null = null;
      if (src === 'silal') {
        setBusy('Unlocking the Silal dataset…');
        const res = await fetch(BASE + 'seed.enc.json'); if (!res.ok) throw new Error('The dataset file could not be loaded.');
        seed = (await db.decryptSeed(await res.json(), key)) as db.SeedData;
      } else if (src === 'demo') seed = demoSeed();
      setBusy('Creating the database…');
      db.createEmpty();
      const username = uname.trim().toLowerCase();
      if (seed) { const r = db.loadSeed(seed, username); db.audit(username, 'load', 'dataset', src, `${r.samples} samples, ${r.farms} farms`); }
      db.setSetting('dataset', src);
      const id = await db.createUser({ username, name, role: 'admin', password: pw });
      db.audit(username, 'create', 'user', username, 'administrator (first run)');
      await db.saveNow();
      onDone(db.listUsers().find(x => x.id === id)!);
    } catch (x) { setErr((x as Error).message); setBusy(''); }
  };
  const Opt = ({ v, title, text }: { v: Source; title: string; text: string }) => <button type="button" className={`opt ${src === v ? 'on' : ''}`} onClick={() => setSrc(v)}><b>{title}</b><span className="small mute">{text}</span></button>;
  return (
    <form onSubmit={submit} className="stack">
      <div><h1>Set up this device</h1><p className="mute" style={{ marginTop: 6 }}>The database lives in this browser. Choose what it starts with, then create the administrator account.</p></div>
      <div className="grid g2" style={{ gap: 10 }}>
        <Opt v="silal" title="Silal dataset" text="Laboratory results and farm registry. Needs the access key." />
        <Opt v="demo" title="Demonstration data" text="Invented farms and samples for training." />
        <Opt v="restore" title="Restore a backup" text="Load a .sqlite backup from another device." />
        <Opt v="empty" title="Start empty" text="Methodology and crop tables only." />
      </div>
      {src === 'silal' && <F label="Dataset access key"><input value={key} onChange={e => setKey(e.target.value)} placeholder="Provided by the project lead" autoComplete="off" /></F>}
      {src === 'restore' ? <F label="Backup file (.sqlite)"><input type="file" accept=".sqlite,.db" onChange={e => setFile(e.target.files?.[0] ?? null)} /></F> : (
        <div className="fields" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <F label="Your full name"><input value={name} onChange={e => setName(e.target.value)} required /></F>
          <F label="Administrator username"><input value={uname} onChange={e => setUname(e.target.value)} required pattern="[A-Za-z0-9._\-]{3,}" title="At least 3 letters, digits, dots or dashes" /></F>
          <F label="Password (8 characters or more)"><input type="password" value={pw} onChange={e => setPw(e.target.value)} required autoComplete="new-password" /></F>
          <F label="Repeat password"><input type="password" value={pw2} onChange={e => setPw2(e.target.value)} required autoComplete="new-password" /></F>
        </div>
      )}
      {err && <div className="flag error">{err}</div>}
      <button className="btn pri" disabled={!!busy} style={{ justifyContent: 'center', padding: '10px 14px' }}>{busy || (src === 'restore' ? 'Restore backup' : 'Create database')}</button>
    </form>
  );
}

const NAV: { path: string; label: string; icon: string; sep?: string; admin?: boolean }[] = [
  { path: '/', label: 'Dashboard', icon: 'home' }, { path: '/samples', label: 'Soil samples', icon: 'flask' }, { path: '/farms', label: 'Farms', icon: 'farm' },
  { path: '/water', label: 'Irrigation water', icon: 'drop' }, { path: '/reports', label: 'Reports', icon: 'doc' }, { path: '/analytics', label: 'Analytics', icon: 'chart' },
  { path: '/methodology', label: 'Methodology', icon: 'book', sep: 'Reference' }, { path: '/admin', label: 'Administration', icon: 'cog', admin: true },
];

function Shell() {
  const { user, logout, data, can } = React.useContext(AppCtx);
  const path = useHash();
  const [pathOnly, qs] = path.split('?');
  const seg = pathOnly.split('/').filter(Boolean);
  const idsParam = new URLSearchParams(qs ?? '').get('ids');
  let page: React.ReactNode, title = 'Dashboard';
  if (seg[0] === 'samples' && seg[1] && seg[2] === 'report') { page = <ReportPage ids={[Number(seg[1])]} />; title = 'Soil health report'; }
  else if (seg[0] === 'samples' && seg[1]) { page = <SampleDetail id={seg[1] === 'new' ? 0 : Number(seg[1])} />; title = 'Soil sample'; }
  else if (seg[0] === 'samples') { page = <SamplesPage />; title = 'Soil samples'; }
  else if (seg[0] === 'farms' && seg[1]) { page = <FarmDetail id={Number(seg[1])} />; title = 'Farm'; }
  else if (seg[0] === 'farms') { page = <FarmsPage />; title = 'Farms'; }
  else if (seg[0] === 'water') { page = <WaterPage />; title = 'Irrigation water'; }
  else if (seg[0] === 'reports' && idsParam) { page = <ReportPage ids={idsParam.split(',').map(Number)} />; title = 'Soil health reports'; }
  else if (seg[0] === 'reports') { page = <ReportsLog />; title = 'Reports'; }
  else if (seg[0] === 'analytics') { page = <AnalyticsPage />; title = 'Analytics'; }
  else if (seg[0] === 'methodology') { page = <MethodologyPage />; title = 'Methodology'; }
  else if (seg[0] === 'admin') { page = can('admin') ? <AdminPage /> : <div className="empty"><h3>Administrators only</h3></div>; title = 'Administration'; }
  else page = <Dashboard />;
  const active = (p: string) => (p === '/' ? seg.length === 0 : seg[0] === p.slice(1));
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><img src={BASE + 'brand/io-mark-white.png'} alt="Innovation Oasis" /><div><b>Soil Health Scorecard</b><span>Innovation Oasis, part of Silal</span></div></div>
        <nav className="nav" aria-label="Main">
          {NAV.filter(n => !n.admin || can('admin')).map(n => <React.Fragment key={n.path}>{n.sep && <div className="sep">{n.sep}</div>}<a href={'#' + n.path} className={active(n.path) ? 'on' : ''}><Icon n={n.icon} />{n.label}</a></React.Fragment>)}
        </nav>
        <div className="side-foot"><b>{user.name}</b>{ROLE_LABEL[user.role]}<br /><button onClick={logout}>Sign out</button></div>
      </aside>
      <div className="main">
        <div className="top no-print"><div><h1>{title}</h1></div><div className="crumb">Methodology v{data.meth.data.version}, {data.meth.data.status}</div></div>
        <div className="page">{page}</div>
      </div>
    </div>
  );
}
