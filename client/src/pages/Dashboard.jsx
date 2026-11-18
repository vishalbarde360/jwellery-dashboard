import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { money } from '../status';
import { Badge, Notice } from '../components/Bits';
import heroImg from '../assets/hero-necklace.jpg';

/*
  All numbers on this page come from GET /reports/dashboard?range=today|week|month
  Response fields used here:
    today, alerts[], sales{ total, count, byMode[{mode,amount}], goldGrams },
    stock{ byStatus, rows[{metal,purity,count,grossWeight,netWeight,marketValue,cost?}] },
    shop{ branch }, rates{ gold22, list[{ metal, purity, perGram, today }] },
    hourly[{ label:'04:00 PM', value:<rupees> }],      // graph points: per hour (today) or per day (week/month)
    mix[{ name:'Gold', amount:<rupees> }],             // sales split by metal
    recent[{ no, status, amount, party, note, mode }]  // latest invoices
*/

// Static banner copy (marketing content, not business data). Edit freely.
const BANNER = {
  badge: 'BIS 916 Hallmarked & IGI Certified Countertops',
  title: 'Bridal Heritage Polki & Antique Gold Collection',
  text: 'High-turnover festive wedding season inventory is now verified. Making charges auto-calculate based on net stone deduction and live daily bullion data.',
};

const MAROON = '#4a1424';
const GOLD = '#b8892f';
const card = 'rounded-xl border border-[#ece2d0] bg-white shadow-sm';
const REFRESH_MS = 30000; // dashboard refreshes by itself every 30 seconds

const compact = (n) => {
  n = Number(n) || 0;
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (n >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${n}`;
};

// Per-gram rates, shown at the very top of the page.
function RateTiles({ list }) {
  if (!list?.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {list.map((r) => (
        <Link
          key={r.metal + r.purity}
          to="/rates"
          title="Adjust rate"
          className={`${card} block px-3 py-2.5 transition hover:border-[#d9c79f]`}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-semibold capitalize text-stone-500">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.metal === 'gold' ? GOLD : '#9ca3af' }} />
            {r.metal} {r.purity}
          </div>
          <div className="mt-0.5 flex items-baseline gap-1">
            <span className="text-lg font-extrabold leading-tight" style={{ color: MAROON }}>{money(r.perGram)}</span>
            <span className="text-[10px] text-stone-500">per g</span>
          </div>
          {!r.today && <div className="text-[10px] font-semibold text-[#9b1c1c]">Not updated today</div>}
        </Link>
      ))}
    </div>
  );
}

function Kpi({ label, value, sub, bar }) {
  return (
    <div className={`${card} p-4`}>
      <div className="text-xs font-semibold text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-extrabold" style={{ color: MAROON }}>{value}</div>
      {bar !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#f1e7d3]">
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, bar)}%`, background: GOLD }} />
        </div>
      )}
      {sub && <div className="mt-2 text-xs text-stone-500">{sub}</div>}
    </div>
  );
}

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

const TABS = [['Today', 'today'], ['This Week', 'week'], ['Monthly', 'month']];

export default function Dashboard() {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState(null);
  const [range, setRange] = useState('today');

  // Load now, then refresh every 30 seconds so new bills and rate changes show up without reloading.
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

  return (
    <div className="space-y-5 bg-[#fbf6ee] p-4 md:p-6">
      {/* Per-gram rates, at the very top */}
      <RateTiles list={d?.rates?.list} />

      <div className={`${card} flex flex-wrap items-center justify-between gap-3 p-4`}>
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg text-white" style={{ background: MAROON }}>◈</div>
          <div>
            <h1 className="text-xl font-extrabold" style={{ color: MAROON }}>
              Executive Dashboard
              {d?.shop?.branch && <span className="ml-2 rounded bg-[#f6ead0] px-2 py-0.5 align-middle text-[10px] font-bold text-[#7a5a12]">{d.shop.branch}</span>}
            </h1>
            <p className="text-xs text-stone-500">{d ? `${d.today} · Welcome, ${user.name}` : `Welcome, ${user.name}`}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg bg-[#f6ead0] px-3 py-1.5 text-xs"><div className="text-stone-500">Gold spot (22K)</div><div className="font-extrabold text-[#7a5a12]">{d?.rates?.gold22 ? money(d.rates.gold22) : 'Rate not set'}</div></div>
          <Link to="/rates" className="rounded-lg border border-[#e2d5bc] px-3 py-2 text-sm font-semibold hover:bg-[#f6ead0]">Adjust Rate</Link>
          <Link to="/billing" className="rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: MAROON }}>New Bill</Link>
          <Link to="/purchases" className="rounded-lg border border-[#e2d5bc] px-3 py-2 text-sm font-semibold hover:bg-[#f6ead0]">Inward Stock</Link>
        </div>
      </div>

      <Notice msg={msg} />

      {d?.alerts?.length > 0 && (
        <ul className="space-y-2" aria-label="Alerts">
          {d.alerts.map((a, i) => (
            <li key={i} className={`rounded-md px-3 py-2 text-sm font-semibold ${a.level === 'error' ? 'bg-[#fbe3e3] text-[#9b1c1c]' : a.level === 'warn' ? 'bg-[#f6ead0] text-[#7a5a12]' : 'bg-[#f1ebe3] text-[#4a1424]'}`}>
              {a.href ? <Link className="underline" to={a.href}>{a.text}</Link> : a.text}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Today's realized sales" value={d?.sales ? money(d.sales.total) : '—'}
          sub={d?.sales && <Link className="underline" to={`/invoices?from=${d.today}&to=${d.today}`}>{d.sales.count} bill{d.sales.count === 1 ? '' : 's'}</Link>} />
        <Kpi label="Cash & digital realization" value={d?.sales ? money(collected) : '—'}
          bar={d?.sales?.total ? (collected / d.sales.total) * 100 : 0}
          sub={d?.sales?.byMode?.length ? d.sales.byMode.map((m) => <span key={m.mode} className="mr-2 capitalize">{m.mode} <b>{money(m.amount)}</b></span>) : 'Nothing yet today.'} />
        <Kpi label="Total gold outflow" value={d?.sales?.goldGrams !== undefined ? `${Number(d.sales.goldGrams).toFixed(3)} grams` : '—'} sub="Gold sold today" />
        <Kpi label="Active stock valuation" value={stockValue !== null ? money(stockValue) : '—'}
          sub={d?.stock && Object.entries(d.stock.byStatus).map(([k, n]) => <Link key={k} to={`/inventory?status=${k}`} className="mr-2 inline-flex items-center gap-1"><Badge status={k} /><b>{n}</b></Link>)} />
      </div>

      <div className={`${card} relative overflow-hidden`}>
        <img src={heroImg} alt="Polki bridal necklace on velvet bust" className="absolute inset-y-0 right-0 h-full w-3/5 object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 to-transparent md:via-white/80" />
        <div className="relative max-w-xl p-6">
          <span className="rounded-full bg-[#f6ead0] px-3 py-1 text-[11px] font-bold text-[#7a5a12]">{BANNER.badge}</span>
          <h2 className="mt-3 text-2xl font-extrabold leading-tight" style={{ color: MAROON }}>{BANNER.title}</h2>
          <p className="mt-2 text-sm text-stone-600">{BANNER.text}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/inventory" className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: MAROON }}>Inspect Vault Tray</Link>
            <Link to="/labels" className="rounded-lg border border-[#e2d5bc] bg-white px-4 py-2 text-sm font-semibold">Print Barcode Tags</Link>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className={`${card} p-4 lg:col-span-2`}>
          <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
            <div><h2 className="font-extrabold" style={{ color: MAROON }}>Sales Composition & Volume</h2><p className="text-xs text-stone-500">Sales flow across gold, diamond, and silver</p></div>
            <div className="flex rounded-lg bg-[#f6efe0] p-0.5 text-xs font-semibold">
              {TABS.map(([label, key]) => <button key={key} onClick={() => setRange(key)} className={`rounded-md px-3 py-1 ${range === key ? 'bg-white shadow-sm' : 'text-stone-500'}`} style={range === key ? { color: MAROON } : {}}>{label}</button>)}
            </div>
          </div>
          {hasGraph ? <AreaChart points={hourly} /> : <div className="grid h-44 place-items-center text-sm text-stone-400">{d ? 'No sales in this period yet.' : 'Loading…'}</div>}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {mix.length ? mix.map((m) => (
              <div key={m.name} className="rounded-lg bg-[#faf4e8] p-3">
                <div className="flex items-center justify-between text-[11px] text-stone-500"><span>{m.name}</span><b style={{ color: MAROON }}>{mixTotal ? Math.round((m.amount / mixTotal) * 100) : 0}%</b></div>
                <div className="mt-1 text-lg font-extrabold" style={{ color: MAROON }}>{money(m.amount)}</div>
              </div>
            )) : <div className="text-xs text-stone-400 sm:col-span-3">No category split yet.</div>}
          </div>
        </div>

        <div className={`${card} p-4`}>
          <div className="mb-3 flex items-center justify-between"><h2 className="font-extrabold" style={{ color: MAROON }}>Real-Time Transactions</h2><Link to="/invoices" className="text-xs font-semibold text-stone-500 underline">View All</Link></div>
          {recent.length ? (
            <ul className="space-y-3">
              {recent.map((t) => (
                <li key={t.no} className="rounded-lg border border-[#f0e6d4] p-3 text-sm">
                  <div className="flex items-center justify-between"><span className="font-bold">{t.no} <span className="ml-1 rounded bg-[#f6ead0] px-1.5 py-0.5 text-[10px] capitalize text-[#7a5a12]">{t.status}</span></span><b>{money(t.amount)}</b></div>
                  <div className="flex justify-between text-xs text-stone-500"><span className="font-semibold text-stone-700">{t.party}</span><span className="capitalize">{t.mode}</span></div>
                  {t.note && <div className="text-[11px] text-stone-400">{t.note}</div>}
                </li>
              ))}
            </ul>
          ) : <div className="text-sm text-stone-400">{d ? 'No invoices yet.' : 'Loading…'}</div>}
          <Link to="/billing" className="mt-4 block rounded-lg py-2.5 text-center text-sm font-bold text-white" style={{ background: MAROON }}>Open Fast Billing Terminal</Link>
        </div>
      </div>

      {rows.length > 0 && (
        <div className={`${card} overflow-x-auto p-4`}>
          <div className="mb-3 flex items-center justify-between"><h2 className="font-extrabold" style={{ color: MAROON }}>Stock Status</h2><Link to="/inventory" className="text-xs font-semibold text-stone-500 underline">Full Ledger ›</Link></div>
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-[#ece2d0] text-xs text-stone-500">{['Category', 'Pieces', 'Gross g', 'Net g', 'Metal value today', ...(hasCost ? ['Cost'] : [])].map((h) => <th key={h} className="p-3 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.metal + r.purity} className="border-b border-[#f3ebdc]">
                  <td className="p-3 font-semibold capitalize"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: GOLD }} />{r.metal} {r.purity}</td>
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