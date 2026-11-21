import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as db from '../db/db';
import { AppCtx, AppData, AppState, BASE, F, Icon, PERMS, ROLE_LABEL, loadData, useHash, go } from './core';
import { Dashboard, SamplesPage, SampleDetail, ReportPage } from './pages1';
import { FarmsPage, FarmDetail, WaterPage, AnalyticsPage, MethodologyPage, AdminPage, ReportsLog } from './pages2';

type Phase = 'boot' | 'login' | 'app' | 'error';

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
        if (!has || db.listUsers().length === 0) { setPhase('login'); return; }
        if (db.ensurePlaceholderLocations()) await db.saveNow();
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
  if (phase === 'login' || !state) return <AuthFrame><Login onDone={enter} /></AuthFrame>;
  return <AppCtx.Provider value={state}><Shell />{toastMsg && <div className={`toast ${toastMsg.err ? 'err' : ''}`} role="status">{toastMsg.msg}</div>}</AppCtx.Provider>;
}

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-art">
        <img src={BASE + 'brand/io-mark.png'} alt="Innovation Oasis" style={{ height: 58, alignSelf: 'flex-start' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1>UAE Soil Health Scorecard</h1>
          <p style={{ marginTop: 16 }}>Score every soil sample against thresholds built for sandy, calcareous desert soils, see what is limiting the crop, and issue a bilingual report with clear actions for the farm.</p>
          <p className="small" style={{ marginTop: 22, color: '#8fa1c8' }}>Innovation Oasis, part of Silal. Methodology developed with Cranfield University.</p>
        </div>
        <img className="watermark" src={BASE + 'brand/io-mark.png'} alt="" aria-hidden="true" />
      </div>
      <div className="auth-form">
        <div className="logos"><img src={BASE + 'brand/io-logo-full.png'} alt="Innovation Oasis" /><img className="silal" src={BASE + 'brand/silal-logo.png'} alt="Silal" /></div>
        {children}
      </div>
    </div>
  );
}

// One sign-in screen. On a device that does not hold the soil database yet, the username and
// password also unlock the encrypted dataset shipped with the app and load it.
function Login({ onDone }: { onDone: (u: db.User) => void }) {
  const [u, setU] = useState(''), [p, setP] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setBusy('Checking…');
    const uname = u.trim().toLowerCase();
    try {
      const hasDb = db.isOpen() && db.listUsers().length > 0;
      let user: db.User | null = null;
      if (hasDb && db.getSetting('dataset') === 'silal') user = await db.login(uname, p);
      else {
        let wrap: db.SeedEnvelope, envelope: db.SeedEnvelope;
        try {
          const [w, d] = await Promise.all([fetch(BASE + 'keywrap.json'), fetch(BASE + 'seed.enc.json')]);
          if (!w.ok || !d.ok) throw new Error();
          wrap = await w.json(); envelope = await d.json();
        } catch { throw new Error('The soil database could not be downloaded. Check the connection and try again.'); }
        let seed: db.SeedData | null = null, fullName = uname;
        try { const k = await db.unwrapSignIn(wrap, uname, p); fullName = k.name || uname; seed = (await db.decryptSeed(envelope, k.key)) as db.SeedData; } catch { seed = null; }
        if (seed) {
          setBusy('Loading the soil database…');
          await db.wipeDevice(); db.createEmpty();
          const r = db.loadSeed(seed, uname);
          db.setSetting('dataset', 'silal'); db.ensurePlaceholderLocations();
          const id = await db.createUser({ username: uname, name: fullName, role: 'admin', password: p });
          db.audit(uname, 'load', 'dataset', 'silal', `${r.samples} samples, ${r.farms} farms`);
          await db.saveNow();
          user = db.listUsers().find(x => x.id === id)!;
        } else if (hasDb) user = await db.login(uname, p);
        else throw new Error('Username or password is incorrect.');
      }
      db.audit(user.username, 'sign in', 'user', user.username); db.scheduleSave(); onDone(user);
    } catch (x) { setErr((x as Error).message); setBusy(''); }
  };
  return (
    <form onSubmit={submit} className="stack">
      <div><h1>Sign in</h1><p className="mute" style={{ marginTop: 6 }}>Enter your username and password to open the soil database.</p></div>
      <F label="Username"><input value={u} onChange={e => setU(e.target.value)} autoFocus autoComplete="username" /></F>
      <F label="Password"><input type="password" value={p} onChange={e => setP(e.target.value)} autoComplete="current-password" /></F>
      {err && <div className="flag error">{err}</div>}
      <button className="btn pri" disabled={!!busy || !u || !p} style={{ justifyContent: 'center', padding: '10px 14px' }}>{busy || 'Sign in'}</button>
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
        <div className="brand"><img src={BASE + 'brand/io-mark.png'} alt="Innovation Oasis" /><div><b>Soil Health Scorecard</b><span>Innovation Oasis, part of Silal</span></div></div>
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
