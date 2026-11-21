import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { money, STATUS } from '../status';
import { fmtDateTime } from '../format';
import { Badge, Notice } from '../components/Bits';

const MAROON = '#4a1424';
const GOLD = '#b8892f';
const card = 'rounded-xl border border-[#ece2d0] bg-white shadow-sm';
const input = 'w-full rounded-lg border border-[#e2d5bc] bg-white px-3 py-2 text-sm outline-none focus:border-[#b8892f] focus:ring-2 focus:ring-[#b8892f]/30';
const lab = 'mb-1 block text-[11px] font-semibold text-stone-500';
const btnGhost = 'rounded-lg border border-[#e2d5bc] bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-[#f6ead0] disabled:opacity-40';
const btnMain = 'rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50';

const METHODS = [['weight', 'Net weight x rate + wastage + making'], ['gross_weight', 'Gross weight x rate + making'], ['fixed', 'Fixed price']];
const TYPES = ['purchase', 'sale', 'return', 'transfer', 'adjustment', 'inspection'];
const SIZES = [25, 50, 100];

// Stock summary cards: gold, silver and artificial (every piece whose metal is not gold or silver).
// `filter` is the metal filter that opens when the card is clicked.
const GROUPS = [
  { key: 'gold', label: 'Gold', color: '#b8892f', filter: 'gold', pred: (r) => r.metal === 'gold' },
  { key: 'silver', label: 'Silver', color: '#8fa0b8', filter: 'silver', pred: (r) => r.metal === 'silver' },

];
const fmtG = (n) => (n >= 1000 ? `${(n / 1000).toFixed(3)} kg` : `${n.toFixed(3)} g`);

// Where a stock movement came from: the source transaction.
const sourceLink = (m) => (m.type === 'sale' && m.ref ? `/invoices/no/${m.ref}` : m.type === 'return' ? '/returns' : m.type === 'purchase' && m.ref?.startsWith('PUR') ? '/purchases' : null);

const pageNums = (p, n) => {
  const s = new Set([1, n, p - 1, p, p + 1].filter((x) => x >= 1 && x <= n));
  const out = []; let prev = 0;
  [...s].sort((a, b) => a - b).forEach((x) => { if (x - prev > 1) out.push('…'); out.push(x); prev = x; });
  return out;
};

export default function Inventory() {
  const { can, settings } = useAuth();
  const [sp, setSp] = useSearchParams();
  const get = (k) => sp.get(k) || '';
  const setParam = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); if (k !== 'page') n.delete('page'); setSp(n, { replace: true }); };
  const tab = get('tab') || 'pieces';
  const page = Number(get('page')) || 1;
  const limit = SIZES.includes(Number(get('limit'))) ? Number(get('limit')) : 25;

  const [items, setItems] = useState([]);
  const [moves, setMoves] = useState([]);
  const [total, setTotal] = useState(0);
  const [cats, setCats] = useState([]);
  const [hist, setHist] = useState(null);
  const [edit, setEdit] = useState(null);
  const [adjs, setAdjs] = useState([]);
  const [adj, setAdj] = useState({ barcode: '', newStatus: 'damaged', reason: '' });
  const [found, setFound] = useState(null);
  const [summary, setSummary] = useState(null); // available-stock totals from /reports/dashboard
  const [msg, setMsg] = useState(null);

  const loadItems = () => api.get('/items', { params: { q: get('q'), status: get('status'), metal: get('metal'), purity: get('purity'), category: get('category'), page, limit } })
    .then((r) => { setItems(r.data); setTotal(Number(r.headers['x-total-count']) || 0); }).catch((e) => setMsg({ type: 'err', text: errMsg(e) }));
  const loadMoves = () => api.get('/inventory/movements', { params: { q: get('mq'), type: get('type'), from: get('from'), to: get('to'), page } })
    .then((r) => { setMoves(r.data); setTotal(Number(r.headers['x-total-count']) || 0); }).catch((e) => setMsg({ type: 'err', text: errMsg(e) }));
  const loadAdj = () => api.get('/adjustments').then((r) => setAdjs(r.data)).catch(() => {});
  const loadSummary = () => api.get('/reports/dashboard').then((r) => setSummary(r.data?.stock?.rows || [])).catch(() => setSummary(null));

  useEffect(() => { api.get('/categories').then((r) => setCats(r.data)); loadAdj(); loadSummary(); }, []);
  useEffect(() => { if (tab === 'corrections') return undefined; const t = setTimeout(() => (tab === 'pieces' ? loadItems() : loadMoves()), 200); return () => clearTimeout(t); }, [sp.toString()]); // eslint-disable-line
  useEffect(() => { const b = get('history'); if (!b) { setHist(null); return; } api.get(`/items/${encodeURIComponent(b)}/history`).then((r) => setHist(r.data)).catch((e) => setMsg({ type: 'err', text: errMsg(e) })); }, [get('history')]); // eslint-disable-line
  // Look up the barcode typed in the correction form so the person sees which piece it is.
  useEffect(() => {
    const b = adj.barcode.trim();
    if (!b) { setFound(null); return undefined; }
    const t = setTimeout(() => api.get('/items', { params: { q: b, limit: 5 } }).then((r) => setFound(r.data.find((i) => i.barcode === b) || false)).catch(() => setFound(null)), 300);
    return () => clearTimeout(t);
  }, [adj.barcode]);

  const act = async (fn, ok) => { try { await fn(); setMsg({ type: 'ok', text: ok }); if (tab === 'pieces') loadItems(); loadAdj(); loadSummary(); } catch (e) { setMsg({ type: 'err', text: errMsg(e) }); } };
  const inspect = (barcode, result) => act(() => api.post(`/items/${barcode}/inspect`, { result }), `${barcode} updated`);
  const requestAdj = (e) => { e.preventDefault(); act(async () => { await api.post('/adjustments', adj); setAdj({ barcode: '', newStatus: 'damaged', reason: '' }); }, 'Correction sent for approval'); };
  const saveEdit = (e) => {
    e.preventDefault();
    const num = ['grossWeight', 'stoneWeight', 'stoneValue', 'wastagePercent', 'makingValue', 'fixedPrice', 'costPrice'];
    const body = {};
    for (const k of ['name', 'sku', 'makingType', 'priceMethod', 'attrs', ...num]) if (edit[k] !== undefined) body[k] = num.includes(k) ? Number(edit[k]) : edit[k];
    act(async () => { await api.patch(`/items/${edit._id}`, body); setEdit(null); }, 'Saved. The change is in the audit log.');
  };
  const exportCsv = () => {
    const lines = [['Barcode', 'Name', 'SKU', 'Metal', 'Purity', 'Gross g', 'Net g', 'Status'], ...items.map((i) => [i.barcode, i.name, i.sku || '', i.metal, i.purity, i.grossWeight, i.netWeight, i.status])];
    const csv = lines.map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'inventory.csv'; a.click(); URL.revokeObjectURL(a.href);
  };

  const showCost = items.some((i) => i.costPrice !== undefined);
  const editCat = edit && cats.find((c) => c.key === edit.category);
  const catLabel = (k) => cats.find((c) => c.key === k)?.label || k || '';
  const pending = adjs.filter((a) => a.status === 'pending');
  const resolved = adjs.filter((a) => a.status !== 'pending').sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 6);
  const pages = Math.max(Math.ceil(total / (tab === 'pieces' ? limit : 50)), 1);

  // Summary cards: available stock only, straight from the dashboard report.
  const sTotal = summary ? summary.reduce((s, r) => s + Number(r.count || 0), 0) : null;
  const priced = summary ? summary.filter((r) => r.marketValue !== null && r.marketValue !== undefined) : [];
  const sValue = summary && priced.length ? priced.reduce((s, r) => s + Number(r.marketValue), 0) : null;
  const hasCostRows = !!summary && summary[0]?.cost !== undefined;
  const groups = GROUPS.map((g) => {
    const rs = (summary || []).filter(g.pred);
    const pr = rs.filter((r) => r.marketValue !== null && r.marketValue !== undefined);
    return {
      ...g,
      count: rs.reduce((s, r) => s + Number(r.count || 0), 0),
      net: rs.reduce((s, r) => s + Number(r.netWeight || 0), 0),
      value: pr.length ? pr.reduce((s, r) => s + Number(r.marketValue), 0) : null,
      cost: hasCostRows ? rs.reduce((s, r) => s + Number(r.cost || 0), 0) : null,
    };
  });
  const openGroup = (g) => { const n = new URLSearchParams(); n.set('metal', g.filter); setSp(n); };
  const openCorrections = () => { const n = new URLSearchParams(); n.set('tab', 'corrections'); setSp(n); };

  const field = (k, label, type = 'text') => <div key={k}><label className={lab} htmlFor={`e-${k}`}>{label}</label><input id={`e-${k}`} type={type} step="any" className={input} value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></div>;
  const TabBtn = (k, l, extra) => (
    <button key={k} role="tab" aria-selected={tab === k} onClick={() => { const n = new URLSearchParams(); n.set('tab', k); setSp(n); }}
      className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold ${tab === k ? 'text-white' : 'border border-[#e2d5bc] bg-white text-stone-600 hover:bg-[#faf4e8]'}`} style={tab === k ? { background: MAROON } : {}}>{l}{extra}</button>
  );
  const Pager = () => (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-stone-500">
      <div className="flex items-center gap-2">
        {tab === 'pieces' && (<><span>Rows per page</span><select className="rounded-lg border border-[#e2d5bc] bg-white px-2 py-1" value={limit} onChange={(e) => setParam('limit', e.target.value)}>{SIZES.map((s) => <option key={s}>{s}</option>)}</select></>)}
        <span>Showing {total ? (page - 1) * (tab === 'pieces' ? limit : 50) + 1 : 0}–{Math.min(page * (tab === 'pieces' ? limit : 50), total)} of {total}</span>
      </div>
      <div className="flex items-center gap-1">
        <button className={btnGhost} disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}>‹</button>
        {pageNums(page, pages).map((n, i) => n === '…' ? <span key={i} className="px-1">…</span> : (
          <button key={n} onClick={() => setParam('page', String(n))} className={`h-7 min-w-[1.75rem] rounded-lg px-2 text-xs font-bold ${n === page ? 'text-white' : 'border border-[#e2d5bc] bg-white'}`} style={n === page ? { background: MAROON } : {}}>{n}</button>
        ))}
        <button className={btnGhost} disabled={page >= pages} onClick={() => setParam('page', String(page + 1))}>›</button>
      </div>
    </div>
  );
  const Th = ({ children }) => <th className="whitespace-nowrap p-3 text-[11px] font-semibold text-stone-500">{children}</th>;

  return (
    <div className="space-y-5 bg-[#fbf6ee] p-4 md:p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold" style={{ color: MAROON }}>Inventory & Pieces</h1>
        <p className="text-xs text-stone-500">Showroom vault & counter register</p>
      </div>

      {/* Stock summary: total, gold, silver, artificial */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Stock summary">
        <div className="relative overflow-hidden rounded-2xl p-4 text-white shadow-sm" style={{ background: `linear-gradient(135deg, ${MAROON} 0%, #2f0b15 100%)` }}>
          <svg className="pointer-events-none absolute -right-4 -top-4 h-28 w-28 text-[#d9b869] opacity-20" viewBox="0 0 100 100" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth="2"><circle cx="50" cy="50" r="44" /><circle cx="50" cy="50" r="30" strokeDasharray="4 5" /><circle cx="50" cy="50" r="14" /></g>
          </svg>
          <div className="relative">
            <div className="text-xs font-semibold text-[#f1e3bd]">Total stock</div>
            <div className="mt-2 flex items-baseline gap-2"><span className="text-4xl font-extrabold leading-none">{sTotal ?? '—'}</span><span className="text-sm font-semibold text-white/70">pieces available</span></div>
            <div className="mt-3 text-[11px] text-white/60">Estimated value</div>
            <div className="text-xl font-extrabold text-[#f3dc9a]">{sValue !== null ? money(sValue) : summary ? 'Rate not set' : '—'}</div>
            <button onClick={openCorrections} className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold text-white hover:bg-white/20">
              <span className={`h-1.5 w-1.5 rounded-full ${pending.length ? 'bg-red-400' : 'bg-emerald-400'}`} />
              {pending.length ? `${pending.length} pending audit request${pending.length === 1 ? '' : 's'}` : 'No pending audits'}
            </button>
          </div>
        </div>

        {groups.map((g) => {
          const share = sTotal ? Math.round((g.count / sTotal) * 100) : 0;
          const valueText = g.value !== null ? money(g.value) : g.cost ? money(g.cost) : g.count ? 'Rate not set' : 'No stock';
          const valueLabel = g.value !== null ? 'Estimated value' : g.cost ? 'Cost value' : 'Value';
          return (
            <button key={g.key} onClick={() => openGroup(g)} title={`Show ${g.label} pieces`}
              className="group rounded-2xl border border-[#ece2d0] bg-white p-4 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#d9c9a3] hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-extrabold" style={{ color: MAROON }}><span className="h-3 w-3 rounded-full" style={{ background: g.color }} />{g.label}</span>
                <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: `${g.color}26`, color: MAROON }}>{summary ? g.count : '—'} pcs</span>
              </div>
              <div className="mt-3 text-2xl font-extrabold leading-tight" style={{ color: MAROON }}>{summary ? fmtG(g.net) : '—'}</div>
              <div className="text-[11px] text-stone-500">Net weight in stock</div>
              <div className="mt-3 flex items-center justify-between border-t border-[#f3ebdc] pt-2 text-xs">
                <span className="text-stone-500">{valueLabel}</span>
                <b className="text-stone-800">{summary ? valueText : '—'}</b>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f1e7d3]"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${share}%`, background: g.color }} /></div>
                <span className="text-[10px] font-semibold text-stone-500">{share}%</span>
              </div>
            </button>
          );
        })}
      </div>

      <Notice msg={msg} />

      {/* Tabs + actions */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex flex-wrap gap-2">
          {TabBtn('pieces', 'All pieces in stock', tab === 'pieces' && <span className="rounded bg-white/20 px-1.5 text-[11px]">{total}</span>)}
          {TabBtn('movements', 'Movement & audit history')}
          {TabBtn('corrections', 'Stock corrections & approvals', pending.length > 0 && <span className="h-2 w-2 rounded-full bg-red-500" aria-label="Pending approvals" />)}
        </div>
        <div className="ml-auto flex gap-2">
          {tab === 'pieces' && items.length > 0 && <button className={btnGhost} onClick={exportCsv}>Export CSV</button>}
          {can('products.write') && <Link to="/register" className={btnMain} style={{ background: MAROON }}>+ Register new product</Link>}
        </div>
      </div>

      {tab === 'pieces' && (<>
        <div className={`${card} p-4`}>
          <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
            <div><label className={lab} htmlFor="fq">Search</label><input id="fq" className={input} placeholder="Scan barcode, name or SKU" value={get('q')} onChange={(e) => setParam('q', e.target.value)} /></div>
            <div><label className={lab} htmlFor="fs">Status</label><select id="fs" className={input} value={get('status')} onChange={(e) => setParam('status', e.target.value)}><option value="">All</option>{Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}</select></div>
            <div><label className={lab} htmlFor="fm">Metal</label><select id="fm" className={input} value={get('metal')} onChange={(e) => setParam('metal', e.target.value)}><option value="">All</option>{['gold', 'silver', 'platinum', 'diamond', 'other'].map((m) => <option key={m}>{m}</option>)}</select></div>
            <div><label className={lab} htmlFor="fp">Purity</label><input id="fp" className={input} placeholder="22K" value={get('purity')} onChange={(e) => setParam('purity', e.target.value)} /></div>
            <div><label className={lab} htmlFor="fc">Category</label><select id="fc" className={input} value={get('category')} onChange={(e) => setParam('category', e.target.value)}><option value="">All</option>{cats.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-stone-500">
            <span>Showing {items.length} of {total} filtered items</span>
            {sp.toString() && <button className="font-semibold underline" onClick={() => setSp({})}>Clear filters</button>}
          </div>
        </div>

        <div className={`${card} overflow-x-auto`}>
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead><tr className="border-b border-[#ece2d0]"><Th>Item & category</Th><Th>Barcode / SKU</Th><Th>Metal & purity</Th><Th>Gross wt</Th><Th>Net wt</Th>{showCost && <Th>Cost</Th>}<Th>Status</Th><Th> </Th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i._id} className="border-b border-[#f3ebdc] align-middle">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {i.image ? <img src={i.image} alt="" className="h-11 w-11 rounded-lg object-cover" /> : <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-sm font-extrabold text-white" style={{ background: `linear-gradient(135deg, ${MAROON}, ${GOLD})` }}>{(i.name || '?')[0]}</div>}
                      <div><div className="font-bold" style={{ color: MAROON }}>{i.name}</div><div className="text-xs text-stone-500">{catLabel(i.category)}{i.attrs && Object.keys(i.attrs).length > 0 && ` · ${Object.values(i.attrs).join(' · ')}`}</div></div>
                    </div>
                  </td>
                  <td className="p-3"><div className="font-semibold">{i.barcode}</div><div className="text-xs text-stone-500">{i.sku || '—'}</div></td>
                  <td className="p-3"><span className="rounded bg-[#f6ead0] px-2 py-0.5 text-xs font-bold capitalize text-[#7a5a12]">{i.metal} {i.purity}</span></td>
                  <td className="p-3">{i.grossWeight} g</td><td className="p-3 font-bold">{i.netWeight} g</td>
                  {showCost && <td className="p-3 font-bold">{i.costPrice !== undefined ? money(i.costPrice) : '—'}</td>}
                  <td className="p-3"><Badge status={i.status} /></td>
                  <td className="p-3"><div className="flex flex-wrap justify-end gap-1.5">
                    <button className={btnGhost} onClick={() => setParam('history', i.barcode)}>History</button>
                    {can('products.write') && i.status !== 'sold' && <button className={btnGhost} onClick={() => setEdit({ ...i, attrs: { ...(i.attrs || {}) } })}>Edit</button>}
                    {can('stock.inspect') && (i.status === 'returned_check' || i.status === 'repair') && (<>
                      <button className={btnGhost} onClick={() => inspect(i.barcode, 'available')}>Passed, make available</button>
                      {i.status === 'returned_check' && <button className={btnGhost} onClick={() => inspect(i.barcode, 'repair')}>Needs repair</button>}
                      <button className={`${btnGhost} !text-red-700`} onClick={() => inspect(i.barcode, 'damaged')}>Damaged</button>
                    </>)}
                  </div></td>
                </tr>
              ))}
              {!items.length && <tr><td className="p-4 text-stone-500" colSpan={8}>No pieces match.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager />
      </>)}

      {tab === 'movements' && (<>
        <div className={`${card} grid gap-3 p-4 md:grid-cols-4`}>
          <div><label className={lab} htmlFor="mq">Barcode or bill number</label><input id="mq" className={input} value={get('mq')} onChange={(e) => setParam('mq', e.target.value)} /></div>
          <div><label className={lab} htmlFor="mt">Type</label><select id="mt" className={input} value={get('type')} onChange={(e) => setParam('type', e.target.value)}><option value="">All</option>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><label className={lab} htmlFor="mf">From</label><input id="mf" type="date" className={input} value={get('from')} onChange={(e) => setParam('from', e.target.value)} /></div>
          <div><label className={lab} htmlFor="mto">To</label><input id="mto" type="date" className={input} value={get('to')} onChange={(e) => setParam('to', e.target.value)} /></div>
        </div>
        <div className={`${card} overflow-x-auto`}>
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead><tr className="border-b border-[#ece2d0]">{['When', 'Type', 'Piece', 'Became', 'Source', 'Note', 'By'].map((h) => <Th key={h}>{h}</Th>)}</tr></thead>
            <tbody>
              {moves.map((m) => { const link = sourceLink(m); return (
                <tr key={m._id} className="border-b border-[#f3ebdc]">
                  <td className="whitespace-nowrap p-3">{fmtDateTime(m.createdAt, settings.timezone)}</td><td className="p-3 font-semibold capitalize">{m.type}</td>
                  <td className="p-3"><button className="font-semibold underline" style={{ color: MAROON }} onClick={() => { const n = new URLSearchParams(); n.set('history', m.item?.barcode); setSp(n); }}>{m.item?.barcode}</button> <span className="text-stone-500">{m.item?.name}</span></td>
                  <td className="p-3">{m.toStatus && <Badge status={m.toStatus} />}</td>
                  <td className="p-3">{link ? <Link className="font-semibold underline" style={{ color: MAROON }} to={link}>{m.ref}</Link> : m.ref || '—'}</td>
                  <td className="p-3 text-stone-600">{m.note}</td><td className="p-3">{m.by?.name}</td>
                </tr>); })}
              {!moves.length && <tr><td className="p-4 text-stone-500" colSpan={7}>No movements match.</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager />
      </>)}

      {tab === 'corrections' && (
        <section className="space-y-4">
          <div className={`${card} flex flex-wrap items-center gap-3 p-4`}>
            <div className="grid h-10 w-10 place-items-center rounded-lg text-white" style={{ background: MAROON }}>⚖</div>
            <div className="min-w-0 flex-1"><h2 className="font-extrabold" style={{ color: MAROON }}>Dual-authorization stock corrections</h2><p className="text-xs text-stone-500">One person asks, a different person approves. A correction always needs a reason.</p></div>
            <span className="rounded-full bg-[#f6ead0] px-3 py-1 text-xs font-bold text-[#7a5a12]">{pending.length} pending review</span>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {can('stock.adjust.request') && (
              <form onSubmit={requestAdj} className={`${card} space-y-3 p-4`}>
                <h3 className="font-extrabold" style={{ color: MAROON }}>Request status correction</h3>
                <div><label className={lab} htmlFor="ab">Piece barcode or tag ID</label><input id="ab" required className={input} value={adj.barcode} onChange={(e) => setAdj({ ...adj, barcode: e.target.value })} />
                  {found && <div className="mt-1 text-xs text-emerald-700">Detected: {found.name} ({found.netWeight} g net) · now <span className="capitalize">{STATUS[found.status]?.label || found.status}</span></div>}
                  {found === false && <div className="mt-1 text-xs text-red-700">No piece with this barcode.</div>}</div>
                <div><label className={lab} htmlFor="as">Target adjustment status</label><select id="as" className={input} value={adj.newStatus} onChange={(e) => setAdj({ ...adj, newStatus: e.target.value })}>{['available', 'reserved', 'in_transit', 'damaged', 'lost'].map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}</select></div>
                <div><label className={lab} htmlFor="ar">Reason (mandatory)</label><textarea id="ar" required rows={3} className={input} value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} /></div>
                <button className={`${btnMain} w-full`} style={{ background: MAROON }} disabled={found === false}>Submit for manager approval</button>
              </form>
            )}

            <div className={`${card} space-y-3 p-4`}>
              <div className="flex items-center justify-between"><h3 className="font-extrabold" style={{ color: MAROON }}>Pending manager approvals</h3><span className="text-xs text-stone-500">{pending.length} awaiting</span></div>
              {pending.map((a) => (
                <div key={a._id} className="rounded-lg border border-[#f0e6d4] p-3 text-sm">
                  <div className="flex items-center justify-between"><b>{a.item?.name || a.item?.barcode}</b><span className="flex items-center gap-1 text-xs">→ <Badge status={a.newStatus} /></span></div>
                  <div className="text-xs text-stone-500">{a.item?.barcode}</div>
                  <p className="mt-2 rounded bg-[#faf4e8] p-2 text-xs text-stone-700"><b>Reason:</b> {a.reason}</p>
                  <div className="mt-1 text-[11px] text-stone-400">Requested by {a.requestedBy?.name}{a.createdAt ? ` · ${fmtDateTime(a.createdAt, settings.timezone)}` : ''}</div>
                  {can('stock.adjust.approve') && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button className={btnGhost} onClick={() => act(() => api.post(`/adjustments/${a._id}/reject`), 'Rejected')}>Reject request</button>
                      <button className={`${btnMain} !py-1.5 text-xs`} style={{ background: MAROON }} onClick={() => act(() => api.post(`/adjustments/${a._id}/approve`), 'Approved')}>Approve & lock piece</button>
                    </div>
                  )}
                </div>
              ))}
              {!pending.length && <div className="text-sm text-stone-400">Nothing waiting for approval.</div>}

              <div className="border-t border-[#f0e6d4] pt-3">
                <h4 className="mb-2 text-xs font-bold text-stone-500">Recently resolved corrections</h4>
                <ul className="space-y-2">
                  {resolved.map((a) => (
                    <li key={a._id} className="flex items-center justify-between gap-2 rounded-lg bg-[#faf4e8] px-3 py-2 text-xs">
                      <span><b>{a.item?.barcode}</b> {a.item?.name && <span className="text-stone-500">· {a.item.name}</span>}<div className="text-stone-500">{a.reason}</div></span>
                      <span className="shrink-0 text-right"><b className={a.status === 'approved' ? 'text-emerald-700' : 'text-red-700'}>{a.status === 'approved' ? 'Approved' : 'Rejected'}</b>{a.decidedBy && <div className="text-stone-400">by {a.decidedBy.name}</div>}</span>
                    </li>
                  ))}
                  {!resolved.length && <li className="text-xs text-stone-400">No corrections resolved yet.</li>}
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}

      {hist && (
        <section className={`${card} p-4`}>
          <div className="mb-2 flex items-center justify-between"><h2 className="font-extrabold" style={{ color: MAROON }}>History of {hist.barcode} ({hist.name}) <Badge status={hist.status} /></h2><button className={btnGhost} onClick={() => setParam('history', '')}>Close</button></div>
          <ul className="divide-y divide-[#f3ebdc] text-sm">
            {hist.moves.map((m) => { const link = sourceLink(m); return <li key={m._id} className="flex flex-wrap items-center gap-x-4 py-2"><span className="w-44 text-stone-500">{fmtDateTime(m.createdAt, settings.timezone)}</span><b className="w-24 capitalize">{m.type}</b>{m.toStatus && <Badge status={m.toStatus} />}<span className="text-stone-600">{link ? <Link className="font-semibold underline" style={{ color: MAROON }} to={link}>{m.ref}</Link> : m.ref} {m.note}</span><span className="text-stone-500">{m.by?.name}</span></li>; })}
          </ul>
        </section>
      )}

      {edit && (
        <form onSubmit={saveEdit} className={`${card} space-y-3 p-4`}>
          <h2 className="font-extrabold" style={{ color: MAROON }}>Edit {edit.barcode}</h2>
          <p className="text-xs text-stone-500">Weights are what you measured. Wastage only changes the price, never the weight. Every edit is logged with the old and new value.</p>
          <div className="grid gap-3 md:grid-cols-4">
            {field('name', 'Name')}{field('sku', 'SKU')}{field('grossWeight', 'Gross weight g', 'number')}{field('stoneWeight', 'Stone weight g', 'number')}
            {field('stoneValue', 'Stone value ₹', 'number')}{field('wastagePercent', 'Wastage %', 'number')}{field('makingValue', 'Making value', 'number')}{field('fixedPrice', 'Fixed price ₹', 'number')}
            <div><label className={lab} htmlFor="e-mt">Making type</label><select id="e-mt" className={input} value={edit.makingType} onChange={(e) => setEdit({ ...edit, makingType: e.target.value })}><option value="percent">Percent</option><option value="per_gram">Per gram</option><option value="fixed">Fixed</option></select></div>
            <div><label className={lab} htmlFor="e-pm">Price method</label><select id="e-pm" className={input} value={edit.priceMethod || 'weight'} onChange={(e) => setEdit({ ...edit, priceMethod: e.target.value })}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            {edit.costPrice !== undefined && field('costPrice', 'Cost ₹', 'number')}
            {editCat?.fields.map((a) => <div key={a.key}><label className={lab} htmlFor={`ea-${a.key}`}>{a.label}</label>
              {a.type === 'select' ? <select id={`ea-${a.key}`} className={input} value={edit.attrs[a.key] ?? ''} onChange={(e) => setEdit({ ...edit, attrs: { ...edit.attrs, [a.key]: e.target.value } })}><option value="">Choose</option>{a.options.map((o) => <option key={o}>{o}</option>)}</select>
                : <input id={`ea-${a.key}`} className={input} type={a.type === 'number' ? 'number' : 'text'} step="any" value={edit.attrs[a.key] ?? ''} onChange={(e) => setEdit({ ...edit, attrs: { ...edit.attrs, [a.key]: e.target.value } })} />}</div>)}
          </div>
          <div className="flex gap-2"><button className={btnMain} style={{ background: MAROON }}>Save</button><button type="button" className={btnGhost} onClick={() => setEdit(null)}>Cancel</button></div>
        </form>
      )}
    </div>
  );
}
