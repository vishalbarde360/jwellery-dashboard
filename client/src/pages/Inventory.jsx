import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { money, STATUS } from '../status';
import { fmtDateTime } from '../format';
import { Badge, Notice, Table } from '../components/Bits';

const METHODS = [['weight', 'Net weight x rate + wastage + making'], ['gross_weight', 'Gross weight x rate + making'], ['fixed', 'Fixed price']];
const TYPES = ['purchase', 'sale', 'return', 'transfer', 'adjustment', 'inspection'];
const PAGE = 50;

// Where a stock movement came from: the source transaction.
const sourceLink = (m) => (m.type === 'sale' && m.ref ? `/invoices/no/${m.ref}` : m.type === 'return' ? '/returns' : m.type === 'purchase' && m.ref?.startsWith('PUR') ? '/purchases' : null);

export default function Inventory() {
  const { can, settings } = useAuth();
  const [sp, setSp] = useSearchParams();
  const get = (k) => sp.get(k) || '';
  const setParam = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); if (k !== 'page') n.delete('page'); setSp(n, { replace: true }); };
  const tab = get('tab') || 'pieces';
  const page = Number(get('page')) || 1;

  const [items, setItems] = useState([]);
  const [moves, setMoves] = useState([]);
  const [total, setTotal] = useState(0);
  const [cats, setCats] = useState([]);
  const [hist, setHist] = useState(null);
  const [edit, setEdit] = useState(null);
  const [adjs, setAdjs] = useState([]);
  const [adj, setAdj] = useState({ barcode: '', newStatus: 'damaged', reason: '' });
  const [msg, setMsg] = useState(null);

  const loadItems = () => api.get('/items', { params: { q: get('q'), status: get('status'), metal: get('metal'), purity: get('purity'), category: get('category'), page, limit: PAGE } })
    .then((r) => { setItems(r.data); setTotal(Number(r.headers['x-total-count']) || 0); }).catch((e) => setMsg({ type: 'err', text: errMsg(e) }));
  const loadMoves = () => api.get('/inventory/movements', { params: { q: get('mq'), type: get('type'), from: get('from'), to: get('to'), page } })
    .then((r) => { setMoves(r.data); setTotal(Number(r.headers['x-total-count']) || 0); }).catch((e) => setMsg({ type: 'err', text: errMsg(e) }));
  const loadAdj = () => api.get('/adjustments').then((r) => setAdjs(r.data)).catch(() => {});

  useEffect(() => { api.get('/categories').then((r) => setCats(r.data)); loadAdj(); }, []);
  useEffect(() => { const t = setTimeout(() => (tab === 'pieces' ? loadItems() : loadMoves()), 200); return () => clearTimeout(t); }, [sp.toString()]); // eslint-disable-line
  useEffect(() => { const b = get('history'); if (!b) { setHist(null); return; } api.get(`/items/${encodeURIComponent(b)}/history`).then((r) => setHist(r.data)).catch((e) => setMsg({ type: 'err', text: errMsg(e) })); }, [get('history')]); // eslint-disable-line

  const act = async (fn, ok) => { try { await fn(); setMsg({ type: 'ok', text: ok }); loadItems(); loadAdj(); } catch (e) { setMsg({ type: 'err', text: errMsg(e) }); } };
  const inspect = (barcode, result) => act(() => api.post(`/items/${barcode}/inspect`, { result }), `${barcode} updated`);
  const requestAdj = (e) => { e.preventDefault(); act(async () => { await api.post('/adjustments', adj); setAdj({ barcode: '', newStatus: 'damaged', reason: '' }); }, 'Correction sent for approval'); };
  const saveEdit = (e) => {
    e.preventDefault();
    const num = ['grossWeight', 'stoneWeight', 'stoneValue', 'wastagePercent', 'makingValue', 'fixedPrice', 'costPrice'];
    const body = {};
    for (const k of ['name', 'sku', 'makingType', 'priceMethod', 'attrs', ...num]) if (edit[k] !== undefined) body[k] = num.includes(k) ? Number(edit[k]) : edit[k];
    act(async () => { await api.patch(`/items/${edit._id}`, body); setEdit(null); }, 'Saved. The change is in the audit log.');
  };

  const showCost = items.some((i) => i.costPrice !== undefined);
  const editCat = edit && cats.find((c) => c.key === edit.category);
  const field = (k, label, type = 'text') => <div key={k}><label className="label" htmlFor={`e-${k}`}>{label}</label><input id={`e-${k}`} type={type} step="any" className="input" value={edit[k] ?? ''} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} /></div>;
  const pages = Math.max(Math.ceil(total / (tab === 'pieces' ? PAGE : 50)), 1);
  const Pager = () => (
    <div className="flex items-center gap-3 text-sm"><button className="btn-ghost" disabled={page <= 1} onClick={() => setParam('page', String(page - 1))}>Previous</button><span>Page {page} of {pages} · {total} total</span><button className="btn-ghost" disabled={page >= pages} onClick={() => setParam('page', String(page + 1))}>Next</button></div>
  );
  const TabBtn = (k, l) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => { const n = new URLSearchParams(); n.set('tab', k); setSp(n); }} className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-ink text-white' : 'border border-paper-line bg-white text-slate-700'}`}>{l}</button>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold text-ink">Inventory</h1>
        <div role="tablist" className="flex gap-2">{TabBtn('pieces', 'Pieces')}{TabBtn('movements', 'Movement history')}</div>
        {can('products.write') && <Link to="/register" className="btn-ghost ml-auto">Register product</Link>}
      </div>
      <Notice msg={msg} />

      {tab === 'pieces' && (<>
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="label" htmlFor="fq">Search</label><input id="fq" className="input !w-64" placeholder="Barcode, name or SKU" value={get('q')} onChange={(e) => setParam('q', e.target.value)} /></div>
          <div><label className="label" htmlFor="fs">Status</label><select id="fs" className="input" value={get('status')} onChange={(e) => setParam('status', e.target.value)}><option value="">All</option>{Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}</select></div>
          <div><label className="label" htmlFor="fm">Metal</label><select id="fm" className="input" value={get('metal')} onChange={(e) => setParam('metal', e.target.value)}><option value="">All</option>{['gold', 'silver', 'platinum', 'diamond', 'other'].map((m) => <option key={m}>{m}</option>)}</select></div>
          <div><label className="label" htmlFor="fp">Purity</label><input id="fp" className="input !w-24" placeholder="22K" value={get('purity')} onChange={(e) => setParam('purity', e.target.value)} /></div>
          <div><label className="label" htmlFor="fc">Category</label><select id="fc" className="input" value={get('category')} onChange={(e) => setParam('category', e.target.value)}><option value="">All</option>{cats.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
          {sp.toString() && <button className="btn-ghost" onClick={() => setSp({})}>Clear filters</button>}
        </div>

        <Table head={['Barcode', 'Piece', 'SKU', 'Metal', 'Gross g', 'Net g', ...(showCost ? ['Cost'] : []), 'Status', '']} min={900}>
          {items.map((i) => (
            <tr key={i._id} className="border-b border-paper-line">
              <td className="p-3 font-semibold">{i.barcode}</td><td className="p-3">{i.name}{i.attrs && Object.keys(i.attrs).length > 0 && <div className="text-xs text-slate-500">{Object.values(i.attrs).join(' · ')}</div>}</td><td className="p-3 text-slate-500">{i.sku || '—'}</td>
              <td className="p-3">{i.metal} {i.purity}</td><td className="p-3">{i.grossWeight}</td><td className="p-3">{i.netWeight}</td>
              {showCost && <td className="p-3">{money(i.costPrice)}</td>}
              <td className="p-3"><Badge status={i.status} /></td>
              <td className="p-3"><div className="flex flex-wrap justify-end gap-2">
                <button className="btn-ghost !px-2 !py-1" onClick={() => setParam('history', i.barcode)}>History</button>
                {can('products.write') && i.status !== 'sold' && <button className="btn-ghost !px-2 !py-1" onClick={() => setEdit({ ...i, attrs: { ...(i.attrs || {}) } })}>Edit</button>}
                {can('stock.inspect') && (i.status === 'returned_check' || i.status === 'repair') && (<>
                  <button className="btn-ghost !px-2 !py-1" onClick={() => inspect(i.barcode, 'available')}>Passed, make available</button>
                  {i.status === 'returned_check' && <button className="btn-ghost !px-2 !py-1" onClick={() => inspect(i.barcode, 'repair')}>Needs repair</button>}
                  <button className="btn-ghost !px-2 !py-1 text-ruby" onClick={() => inspect(i.barcode, 'damaged')}>Damaged</button>
                </>)}
              </div></td>
            </tr>
          ))}
          {!items.length && <tr><td className="p-4 text-slate-500" colSpan={9}>No pieces match.</td></tr>}
        </Table>
        <Pager />
      </>)}

      {tab === 'movements' && (<>
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="label" htmlFor="mq">Barcode or bill number</label><input id="mq" className="input !w-64" value={get('mq')} onChange={(e) => setParam('mq', e.target.value)} /></div>
          <div><label className="label" htmlFor="mt">Type</label><select id="mt" className="input" value={get('type')} onChange={(e) => setParam('type', e.target.value)}><option value="">All</option>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><label className="label" htmlFor="mf">From</label><input id="mf" type="date" className="input" value={get('from')} onChange={(e) => setParam('from', e.target.value)} /></div>
          <div><label className="label" htmlFor="mto">To</label><input id="mto" type="date" className="input" value={get('to')} onChange={(e) => setParam('to', e.target.value)} /></div>
        </div>
        <Table head={['When', 'Type', 'Piece', 'Became', 'Source', 'Note', 'By']} min={900}>
          {moves.map((m) => { const link = sourceLink(m); return (
            <tr key={m._id} className="border-b border-paper-line">
              <td className="whitespace-nowrap p-3">{fmtDateTime(m.createdAt, settings.timezone)}</td><td className="p-3 font-semibold capitalize">{m.type}</td>
              <td className="p-3"><button className="font-semibold text-ink-500 underline" onClick={() => { const n = new URLSearchParams(); n.set('history', m.item?.barcode); setSp(n); }}>{m.item?.barcode}</button> <span className="text-slate-500">{m.item?.name}</span></td>
              <td className="p-3">{m.toStatus && <Badge status={m.toStatus} />}</td>
              <td className="p-3">{link ? <Link className="font-semibold text-ink-500 underline" to={link}>{m.ref}</Link> : m.ref || '—'}</td>
              <td className="p-3 text-slate-600">{m.note}</td><td className="p-3">{m.by?.name}</td>
            </tr>); })}
          {!moves.length && <tr><td className="p-4 text-slate-500" colSpan={7}>No movements match.</td></tr>}
        </Table>
        <Pager />
      </>)}

      {hist && (
        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-extrabold text-ink">History of {hist.barcode} ({hist.name}) <Badge status={hist.status} /></h2><button className="btn-ghost !py-1" onClick={() => setParam('history', '')}>Close</button></div>
          <ul className="divide-y divide-paper-line text-sm">
            {hist.moves.map((m) => { const link = sourceLink(m); return <li key={m._id} className="flex flex-wrap items-center gap-x-4 py-2"><span className="w-44 text-slate-500">{fmtDateTime(m.createdAt, settings.timezone)}</span><b className="w-24 capitalize">{m.type}</b>{m.toStatus && <Badge status={m.toStatus} />}<span className="text-slate-600">{link ? <Link className="font-semibold text-ink-500 underline" to={link}>{m.ref}</Link> : m.ref} {m.note}</span><span className="text-slate-500">{m.by?.name}</span></li>; })}
          </ul>
        </section>
      )}

      {edit && (
        <form onSubmit={saveEdit} className="card space-y-3 p-4">
          <h2 className="font-extrabold text-ink">Edit {edit.barcode}</h2>
          <p className="text-xs text-slate-500">Weights are what you measured. Wastage only changes the price, never the weight. Every edit is logged with the old and new value.</p>
          <div className="grid gap-3 md:grid-cols-4">
            {field('name', 'Name')}{field('sku', 'SKU')}{field('grossWeight', 'Gross weight g', 'number')}{field('stoneWeight', 'Stone weight g', 'number')}
            {field('stoneValue', 'Stone value ₹', 'number')}{field('wastagePercent', 'Wastage %', 'number')}{field('makingValue', 'Making value', 'number')}{field('fixedPrice', 'Fixed price ₹', 'number')}
            <div><label className="label" htmlFor="e-mt">Making type</label><select id="e-mt" className="input" value={edit.makingType} onChange={(e) => setEdit({ ...edit, makingType: e.target.value })}><option value="percent">Percent</option><option value="per_gram">Per gram</option><option value="fixed">Fixed</option></select></div>
            <div><label className="label" htmlFor="e-pm">Price method</label><select id="e-pm" className="input" value={edit.priceMethod || 'weight'} onChange={(e) => setEdit({ ...edit, priceMethod: e.target.value })}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            {edit.costPrice !== undefined && field('costPrice', 'Cost ₹', 'number')}
            {editCat?.fields.map((a) => <div key={a.key}><label className="label" htmlFor={`ea-${a.key}`}>{a.label}</label>
              {a.type === 'select' ? <select id={`ea-${a.key}`} className="input" value={edit.attrs[a.key] ?? ''} onChange={(e) => setEdit({ ...edit, attrs: { ...edit.attrs, [a.key]: e.target.value } })}><option value="">Choose</option>{a.options.map((o) => <option key={o}>{o}</option>)}</select>
                : <input id={`ea-${a.key}`} className="input" type={a.type === 'number' ? 'number' : 'text'} step="any" value={edit.attrs[a.key] ?? ''} onChange={(e) => setEdit({ ...edit, attrs: { ...edit.attrs, [a.key]: e.target.value } })} />}</div>)}
          </div>
          <div className="flex gap-2"><button className="btn-primary">Save</button><button type="button" className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button></div>
        </form>
      )}

      {tab === 'pieces' && (
        <section className="space-y-3">
          <h2 className="text-lg font-extrabold text-ink">Stock corrections</h2>
          <p className="text-sm text-slate-600">One person asks, a different person approves. A correction always needs a reason.</p>
          {can('stock.adjust.request') && (
            <form onSubmit={requestAdj} className="card grid gap-3 p-4 md:grid-cols-4 md:items-end">
              <div><label className="label" htmlFor="ab">Barcode</label><input id="ab" required className="input" value={adj.barcode} onChange={(e) => setAdj({ ...adj, barcode: e.target.value })} /></div>
              <div><label className="label" htmlFor="as">Change to</label><select id="as" className="input" value={adj.newStatus} onChange={(e) => setAdj({ ...adj, newStatus: e.target.value })}>{['available', 'reserved', 'in_transit', 'damaged', 'lost'].map((k) => <option key={k} value={k}>{STATUS[k].label}</option>)}</select></div>
              <div><label className="label" htmlFor="ar">Reason</label><input id="ar" required className="input" value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} /></div>
              <button className="btn-primary">Ask for approval</button>
            </form>
          )}
          <Table head={['Piece', 'Change to', 'Reason', 'Asked by', 'Status', '']} min={700}>
            {adjs.map((a) => (
              <tr key={a._id} className="border-b border-paper-line">
                <td className="p-3 font-semibold">{a.item?.barcode}</td><td className="p-3"><Badge status={a.newStatus} /></td><td className="p-3">{a.reason}</td>
                <td className="p-3">{a.requestedBy?.name}</td><td className="p-3 capitalize">{a.status}{a.decidedBy ? ` by ${a.decidedBy.name}` : ''}</td>
                <td className="p-3 text-right">{a.status === 'pending' && can('stock.adjust.approve') && (<div className="flex justify-end gap-2"><button className="btn-primary !px-3 !py-1" onClick={() => act(() => api.post(`/adjustments/${a._id}/approve`), 'Approved')}>Approve</button><button className="btn-ghost !px-3 !py-1" onClick={() => act(() => api.post(`/adjustments/${a._id}/reject`), 'Rejected')}>Reject</button></div>)}</td>
              </tr>
            ))}
            {!adjs.length && <tr><td className="p-4 text-slate-500" colSpan={6}>No corrections yet.</td></tr>}
          </Table>
        </section>
      )}
    </div>
  );
}
