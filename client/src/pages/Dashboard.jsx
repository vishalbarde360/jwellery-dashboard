import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { money } from '../status';
import { Badge, Notice } from '../components/Bits';

/*
  Same API as before: GET /reports/dashboard?range=today|week|month
  today, alerts[], sales{ total, count, byMode[], goldGrams },
  stock{ byStatus, rows[] }, shop{ branch }, rates{ gold22, list[] },
  hourly[{label,value}], mix[{name,amount}], recent[{no,status,amount,party,note,mode}]
  Optional: rates.list[i].change (percent) shows the green/red % chip in the ticker.
*/

const BANNER = {
  badge: 'BIS 916 Hallmarked & IGI Certified Countertops',
  // Heading is split so the gold words can be coloured: [line 1, gold &, line 2, gold words]
  titleParts: ['Bridal Heritage Polki', '&', 'Antique', 'Gold Collection'],
  // Right-side picture: put your image path here (e.g. '/images/bridal-set.jpg' from /public, or an imported file).
  // If the file is missing (or this is ''), the gold-rings artwork shows instead.
  image: '/hero.jpeg',
  imageAlt: 'Bridal polki necklace set',
  text: 'High-turnover festive wedding season inventory is now verified. Making charges auto-calculate based on net stone deduction and live daily bullion data.',
};

const MAROON = '#4a1424';
const DEEP = '#2f0b15';
const GOLD = '#b8892f';
const SILVER = '#b5c3d6';
const goldText = { background: 'linear-gradient(90deg,#f3dc9a,#d9a441)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' };
const serif = { fontFamily: "'Playfair Display', Georgia, serif" };
const card = 'rounded-2xl border border-[#efe6d6] bg-white shadow-[0_1px_3px_rgba(74,20,36,0.06)]';
const REFRESH_MS = 30000;

const compact = (n) => {
  n = Number(n) || 0;
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${n}`;
};

/* ---------- small inline icons (no extra package needed) ---------- */
const Ico = ({ d, size = 14, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d={d} /></svg>
);
const I = {
  cash: 'M3 7h18v10H3zM12 9.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z',
  wallet: 'M4 7h14a2 2 0 012 2v9H6a2 2 0 01-2-2V7zM4 7l12-3v3M16 13h2',
  hourglass: 'M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9',
  gem: 'M6 4h12l3 5-9 11L3 9zM3 9h18M9 4l-2 5 5 11 5-11-2-5',
  pie: 'M12 3v9h9M12 3a9 9 0 109 9',
  list: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3',
  bell: 'M6 16V11a6 6 0 1112 0v5l2 2H4zM10 21h4',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  cart: 'M4 5h2l2 10h9l2-7H7M10 20h.01M17 20h.01',
  box: 'M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
  scan: 'M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3M8 9v6M12 9v6M16 9v6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12l5 5 9-10',
  chev: 'M9 6l6 6-6 6',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
};

/* ---------- KPI card: title + icon on top, value, chip / helper text below ---------- */
function Kpi({ label, icon, value, bar, helper, chip, deco }) {
  return (
    <div className={`${card} relative overflow-hidden p-4`}>
      {deco && (
        <svg className="pointer-events-none absolute bottom-0 right-2 h-14 w-28 text-[#b8892f] opacity-[0.13]" viewBox="0 0 100 50" aria-hidden="true">
          {[8, 18, 12, 26, 20, 34, 28, 42].map((h, i) => <rect key={i} x={i * 12 + 2} y={50 - h} width="8" height={h} fill="currentColor" />)}
        </svg>
      )}
      <div className="flex items-start justify-between">
        <div className="text-[13px] font-bold" style={{ ...serif, color: MAROON }}>{label}</div>
        <Ico d={icon} size={15} className="text-[#b8892f]" />
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-2">
        <div className="text-2xl font-extrabold" style={{ ...serif, color: MAROON }}>{value}</div>
        {bar !== undefined && <span className="font-mono text-[10px] text-stone-500">{bar.toFixed(2)} %</span>}
      </div>
      {bar !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#f1e7d3]">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, bar)}%`, background: GOLD }} />
        </div>
      )}
      <div className="relative mt-3 flex items-center justify-between gap-2 text-[11px] text-stone-500">
        <span>{helper}</span>
        {chip && <span className="shrink-0 rounded-full bg-[#f6ead0] px-2.5 py-1 text-[10px] font-semibold text-[#7a5a12]">{chip}</span>}
      </div>
    </div>
  );
}

/* ---------- sales area chart ---------- */
function AreaChart({ points }) {
  const W = 640, H = 200, L = 48, R = 16, T = 30, B = 28;
  const max = Math.max(...points.map((p) => p.value), 1);
  const step = (W - L - R) / Math.max(points.length - 1, 1);
  const xy = points.map((p, i) => [L + i * step, H - B - (p.value / max) * (H - T - B)]);
  const line = xy.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `${L},${H - B} ${line} ${L + (points.length - 1) * step},${H - B}`;
  const peak = points.reduce((a, p, i) => (p.value > points[a].value ? i : a), 0);
  const [px, py] = xy[peak];
  const px0 = Math.min(Math.max(px, L + 70), W - R - 70);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Sales graph">
      <defs>
        <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={GOLD} stopOpacity="0.4" />
          <stop offset="1" stopColor={GOLD} stopOpacity="0.03" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((i) => {
        const y = T + i * ((H - T - B) / 3);
        return <g key={i}><line x1={L} x2={W - R} y1={y} y2={y} stroke="#efe6d6" strokeDasharray="3 4" /><text x={L - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#9a8f7e">{compact(max - (i * max) / 3)}</text></g>;
      })}
      <polygon points={area} fill="url(#areaFill)" />
      <polyline points={line} fill="none" stroke={MAROON} strokeWidth="1.8" />
      {xy.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.5" fill="#fff" stroke={MAROON} strokeWidth="1.8" />)}
      <rect x={px0 - 68} y={Math.max(py - 26, 2)} width="136" height="18" rx="4" fill="#fff" stroke="#e2d5bc" />
      <text x={px0} y={Math.max(py - 26, 2) + 12.5} textAnchor="middle" fontSize="10" fontWeight="700" fill={MAROON}>Peak: {compact(points[peak].value)} at {points[peak].label}</text>
      {points.map((p, i) => (points.length <= 7 || i % 2 === 0) && <text key={i} x={xy[i][0]} y={H - 8} textAnchor="middle" fontSize="9" fill="#9a8f7e">{p.label}</text>)}
    </svg>
  );
}

/* ---------- hero artwork: photo on the right, fades into maroon; rings SVG if no photo ---------- */
function HeroArt() {
  return (
    <svg viewBox="0 0 320 176" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden="true">
      <g fill="none" stroke="#d9b869" strokeOpacity="0.85">
        <circle cx="230" cy="88" r="84" strokeWidth="1.6" />
        <circle cx="230" cy="88" r="62" strokeWidth="1" strokeDasharray="3 4" />
        <circle cx="230" cy="88" r="40" strokeWidth="1.4" />
        <circle cx="230" cy="88" r="18" strokeWidth="1" strokeDasharray="2 3" />
        <path d="M146 88h168M230 4v168M170 28l120 120M290 28L170 148" strokeOpacity="0.4" strokeWidth="0.8" />
      </g>
    </svg>
  );
}

function HeroVisual() {
  const [ok, setOk] = useState(Boolean(BANNER.image));
  return (
    <>
      {/* full-banner background image (rings artwork if the file is missing) */}
      <div className="absolute inset-0">
        {ok
          ? <img src={BANNER.image} alt={BANNER.imageAlt} onError={() => setOk(false)} className="h-full w-full object-cover object-right" />
          : <HeroArt />}
      </div>
      {/* dark overlay so the text stays readable on top of the photo */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(47,11,21,0.6) 0%, rgba(47,11,21,0.35) 45%, rgba(47,11,21,0) 100%)' }} />
    </>
  );
}

const TABS = [['Today', 'today'], ['This Week', 'week'], ['Monthly', 'month']];

export default function Dashboard() {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState(null);
  const [range, setRange] = useState('today');

  useEffect(() => {
    let alive = true;
    const load = () =>
      api.get('/reports/dashboard', { params: { range } })
        .then((r) => { if (alive) { setD(r.data); setMsg(null); } })
        .catch((e) => { if (alive) setMsg({ type: 'err', text: errMsg(e) }); });
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(t); };
  }, [range]);

  const rows = d?.stock?.rows || [];
  const hasCost = rows[0]?.cost !== undefined;
  const collected = d?.sales?.byMode?.reduce((s, m) => s + Number(m.amount), 0) || 0;
  const hourly = d?.hourly || [];
  const hasGraph = hourly.length > 0 && hourly.some((p) => p.value > 0);
  const mix = d?.mix || [];
  const mixTotal = mix.reduce((s, m) => s + Number(m.amount), 0);
  const recent = d?.recent || [];
  const stockValue = hasCost ? rows.reduce((s, r) => s + Number(r.cost || 0), 0) : null;
  const bills = d?.sales?.count ?? 0;

  return (
    <div className="space-y-5">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&display=swap');`}</style>

      {/* Header card */}
      <div className={`${card} p-5`}>
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[#e8cf8e]" style={{ background: MAROON }}><Ico d={I.spark} size={20} /></div>
          <div>
            <h1 className="text-2xl font-extrabold leading-tight" style={{ ...serif, color: MAROON }}>
              Executive Atelier Dashboard
              {d?.shop?.branch && <span className="ml-2 rounded bg-[#f6ead0] px-2 py-0.5 align-middle font-sans text-[10px] font-bold text-[#7a5a12]">{d.shop.branch}</span>}
            </h1>
            <p className="text-xs text-stone-500">
              Welcome back, <b className="text-stone-700">{user.name}</b> <span className="mx-1 text-stone-300">|</span>
              <span className="text-[#7a5a12]">Master Proprietor</span> <span className="mx-1">•</span> Ready for counter session
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-[#e8d9b4] bg-[#fbf1d8] px-3 py-1.5">
            <Ico d={I.bell} size={14} className="text-[#7a5a12]" />
            <div className="leading-tight"><div className="text-[9px] font-semibold uppercase text-stone-500">Gold spot (22K)</div><div className="text-sm font-extrabold text-[#4a1424]">{d?.rates?.gold22 ? money(d.rates.gold22) : 'Rate not set'}</div></div>
          </div>
          <Link to="/rates" className="flex items-center gap-1.5 rounded-xl border border-[#e2d5bc] bg-white px-3 py-2 text-sm font-semibold hover:bg-[#f6ead0]"><Ico d={I.sliders} />Adjust Rate</Link>
          <Link to="/billing" className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold text-white shadow-sm" style={{ background: MAROON }}><Ico d={I.cart} />New Bill (F2)</Link>
          <Link to="/purchases" className="flex items-center gap-1.5 rounded-xl border border-[#e2d5bc] bg-white px-3 py-2 text-sm font-semibold hover:bg-[#f6ead0]"><Ico d={I.box} />Inward Stock</Link>
        </div>
      </div>

      <Notice msg={msg} />

      {d?.alerts?.length > 0 && (
        <ul className="space-y-2" aria-label="Alerts">
          {d.alerts.map((a, i) => {
            const tone = a.level === 'error' ? 'bg-[#fbe3e3] text-[#9b1c1c]' : a.level === 'warn' ? 'bg-[#f6ead0] text-[#7a5a12]' : 'bg-[#dcf3e4] text-[#1f7a45]';
            const cls = 'flex items-center gap-3 rounded-xl border border-[#efe6d6] bg-white/80 px-3 py-2.5 text-sm font-semibold text-stone-700';
            const body = (
              <>
                <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${tone}`}><Ico d={a.level === 'error' || a.level === 'warn' ? I.bell : I.check} size={13} /></span>
                <span className="flex-1">{a.text}</span>
                {a.href && <Ico d={I.chev} size={14} className="text-stone-400" />}
              </>
            );
            return <li key={i}>{a.href ? <Link to={a.href} className={`${cls} hover:bg-white`}>{body}</Link> : <div className={cls}>{body}</div>}</li>;
          })}
        </ul>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi deco label="Today's realized sales" icon={I.cash} value={d?.sales ? money(d.sales.total) : '—'}
          helper="All counter tills combined"
          chip={<Link to={d ? `/invoices?from=${d.today}&to=${d.today}` : '/invoices'}>{bills} receipt{bills === 1 ? '' : 's'}</Link>} />
        <Kpi deco label="Cash & digital realization" icon={I.wallet} value={d?.sales ? money(collected) : '—'}
          bar={d?.sales?.total ? (collected / d.sales.total) * 100 : 0}
          helper={d?.sales?.byMode?.length ? d.sales.byMode.map((m) => <span key={m.mode} className="mr-2 capitalize">{m.mode} <b>{money(m.amount)}</b></span>) : 'Nothing yet today.'} />
        <Kpi label="Total gold outflow" icon={I.hourglass} value={d?.sales?.goldGrams !== undefined ? '' : '—'}
          helper="Gold sold today"
          chip={`${Number(d?.sales?.goldGrams || 0).toFixed(3)} g net`} />
        <Kpi deco label="Active stock valuation" icon={I.gem} value={stockValue !== null ? money(stockValue) : '—'}
          helper={d?.stock && Object.keys(d.stock.byStatus || {}).length
            ? Object.entries(d.stock.byStatus).map(([k, n]) => <Link key={k} to={`/inventory?status=${k}`} className="mr-2 inline-flex items-center gap-1"><Badge status={k} /><b>{n}</b></Link>)
            : 'Calculated at current spot rates'} />
      </div>

      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl" style={{ background: `linear-gradient(120deg, ${MAROON} 0%, ${DEEP} 100%)` }}>
        <HeroVisual />
        <div className="relative max-w-xl p-6 md:px-8 md:py-7">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] font-semibold text-[#f1e3bd]"><Ico d={I.shield} size={12} />{BANNER.badge}</span>
          <h2 className="mt-4 text-3xl font-bold leading-[1.15] text-white md:text-[2.15rem]" style={serif}>
            {BANNER.titleParts[0]} <span style={goldText}>{BANNER.titleParts[1]}</span>
            <br />{BANNER.titleParts[2]} <span style={goldText}>{BANNER.titleParts[3]}</span>
          </h2>
          <div className="mt-3 flex items-center gap-2" aria-hidden="true">
            <span className="h-px w-16 bg-gradient-to-r from-transparent to-[#d9b869]" />
            <span className="h-1.5 w-1.5 rotate-45 border border-[#d9b869]" />
            <span className="h-px w-40 bg-gradient-to-r from-[#d9b869] to-transparent" />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-white/80">{BANNER.text}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/inventory" className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#2f0b15]" style={{ background: '#d9a441' }}><Ico d={I.eye} />Inspect Vault Tray</Link>
            <Link to="/labels" className="flex items-center gap-2 rounded-xl border border-[#d9b869]/60 px-4 py-2.5 text-sm font-semibold text-[#f1e3bd] hover:bg-white/10"><Ico d={I.scan} />Print Barcode Tags</Link>
          </div>
        </div>
      </div>

      {/* Chart + transactions */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className={`${card} flex flex-col p-5 lg:col-span-2`}>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#f6ead0] text-[#7a5a12]"><Ico d={I.pie} size={18} /></div>
              <div><h2 className="text-lg font-bold leading-tight" style={{ ...serif, color: MAROON }}>Sales Composition &amp; Volume</h2><p className="text-xs text-stone-500">Sales flow across gold, diamond, and silver</p></div>
            </div>
            <div className="flex rounded-xl border border-[#efe6d6] bg-[#faf4e8] p-0.5 text-xs font-semibold">
              {TABS.map(([label, key]) => (
                <button key={key} onClick={() => setRange(key)}
                  className={`rounded-[10px] px-3.5 py-1.5 transition ${range === key ? 'text-white shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}
                  style={range === key ? { background: MAROON } : {}}>{label}</button>
              ))}
            </div>
          </div>
          <div className="border-t border-[#f3ebdc] pt-3">
            {hasGraph ? <AreaChart points={hourly} /> : (
              <div className="grid h-56 place-items-center text-center">
                <div>
                  <div className="mx-auto mb-3 grid h-10 w-10 animate-spin place-items-center rounded-full border border-[#e8d9b4] border-t-[#b8892f]" />
                  <div className="text-xs font-bold" style={{ color: MAROON }}>{d ? 'Awaiting counter transactions...' : 'Loading…'}</div>
                  {d && <div className="mt-1 text-[11px] text-stone-400">Live analytics will chart when the first receipt is created</div>}
                </div>
              </div>
            )}
          </div>
          {mix.length > 0 && (
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {mix.map((m) => (
                <div key={m.name} className="rounded-xl bg-[#faf4e8] p-3">
                  <div className="flex items-center justify-between text-[11px] text-stone-500"><span>{m.name}</span><b style={{ color: MAROON }}>{mixTotal ? Math.round((m.amount / mixTotal) * 100) : 0}%</b></div>
                  <div className="mt-1 text-lg font-extrabold" style={{ ...serif, color: MAROON }}>{money(m.amount)}</div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-auto flex flex-wrap items-center justify-center gap-x-6 gap-y-1 border-t border-[#f3ebdc] pt-3 text-[11px] font-semibold text-stone-600">
            {[['22K & 18K Gold', '#c0a05a'], ['Diamond & Polki', MAROON], ['Silver 925', SILVER]].map(([n, c]) => (
              <span key={n} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c }} />{n}</span>
            ))}
          </div>
        </div>

        <div className={`${card} flex flex-col p-5`}>
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <Ico d={I.list} size={18} className="mt-1 text-[#7a5a12]" />
              <h2 className="text-lg font-bold leading-tight" style={{ ...serif, color: MAROON }}>Real-Time Transactions</h2>
            </div>
            <Link to="/invoices" className="flex shrink-0 items-center gap-1 text-xs font-bold" style={{ color: MAROON }}>View All <Ico d={I.arrow} size={12} /></Link>
          </div>
          <div className="mb-2 flex items-center justify-between border-t border-[#f3ebdc] pt-3 text-[11px]">
            <span className="flex items-center gap-1.5 font-bold" style={{ color: MAROON }}><span className="inline-block h-1.5 w-1.5 rounded-full bg-[#2e9e5b]" />Live Till Queue</span>
            <span className="text-stone-400">{recent.length ? `${recent.length} recent` : 'Waiting for bill'}</span>
          </div>
          {recent.length ? (
            <ul className="space-y-2.5">
              {recent.map((t) => (
                <li key={t.no} className="rounded-xl border border-[#f0e6d4] p-3 text-sm">
                  <div className="flex items-center justify-between"><span className="font-bold">{t.no} <span className="ml-1 rounded bg-[#f6ead0] px-1.5 py-0.5 text-[10px] capitalize text-[#7a5a12]">{t.status}</span></span><b>{money(t.amount)}</b></div>
                  <div className="flex justify-between text-xs text-stone-500"><span className="font-semibold text-stone-700">{t.party}</span><span className="capitalize">{t.mode}</span></div>
                  {t.note && <div className="text-[11px] text-stone-400">{t.note}</div>}
                </li>
              ))}
            </ul>
          ) : d ? (
            <div className="space-y-2.5" aria-label="No invoices yet">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex h-11 items-center justify-between rounded-xl bg-[#faf6ee] px-3">
                  <span className="h-2 w-20 rounded-full bg-[#eee4d1]" /><span className="h-2 w-10 rounded-full bg-[#f3e3b8]" />
                </div>
              ))}
            </div>
          ) : <div className="text-sm text-stone-400">Loading…</div>}
          <Link to="/billing" className="mt-auto flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white" style={{ background: MAROON, marginTop: '1.25rem' }}>
            <Ico d={I.cart} size={15} />Open Fast Billing Terminal
          </Link>
        </div>
      </div>

      {/* Stock status */}
      {rows.length > 0 && (
        <div className={`${card} overflow-x-auto p-5`}>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold" style={{ ...serif, color: MAROON }}>Stock Status</h2><Link to="/inventory" className="text-xs font-bold" style={{ color: MAROON }}>Full Ledger ›</Link></div>
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-[#ece2d0] text-xs text-stone-500">{['Category', 'Pieces', 'Gross g', 'Net g', 'Metal value today', ...(hasCost ? ['Cost'] : [])].map((h) => <th key={h} className="p-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.metal + r.purity} className="border-b border-[#f3ebdc]">
                  <td className="p-3 font-semibold capitalize"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: r.metal === 'gold' ? GOLD : SILVER }} />{r.metal} {r.purity}</td>
                  <td className="p-3">{r.count}</td><td className="p-3">{r.grossWeight}</td><td className="p-3">{r.netWeight}</td>
                  <td className="p-3">{r.marketValue === null ? 'Rate not set' : money(r.marketValue)}</td>
                  {r.cost !== undefined && <td className="p-3">{money(r.cost)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
