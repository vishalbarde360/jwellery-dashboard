import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { money } from '../status';
import { isoToday } from '../format';
import { Notice, Table } from '../components/Bits';

const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export default function Reports() {
  const { can, settings } = useAuth();
  const today = isoToday(settings.timezone);
  const [tab, setTab] = useState('sales');
  const [from, setFrom] = useState(addDays(today, -29));
  const [to, setTo] = useState(today);
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    setD(null);
    api.get(`/reports/${tab}`, { params: { from, to } }).then((r) => { setD(r.data); setMsg(null); }).catch((e) => setMsg({ type: 'err', text: errMsg(e) }));
  }, [tab, from, to]);

  const csv = async () => {
    try {
      const r = await api.get('/reports/tax', { params: { from, to, format: 'csv' }, responseType: 'blob' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(r.data); a.download = `tax-${from}-to-${to}.csv`; a.click(); URL.revokeObjectURL(a.href);
    } catch (x) { setMsg({ type: 'err', text: 'Could not export. ' + (x.response?.status === 403 ? "You don't have permission to export." : 'Try again.') }); }
  };

  const Tab = ({ k, l }) => <button role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === k ? 'bg-ink text-white' : 'bg-white text-slate-700 border border-paper-line'}`}>{l}</button>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Reports</h1>
      <div role="tablist" className="flex gap-2">{Tab({ k: 'sales', l: 'Sales' })}{Tab({ k: 'stock', l: 'Stock' })}{Tab({ k: 'tax', l: 'Tax' })}{can('cost.read') && Tab({ k: 'margin', l: 'Margin' })}</div>
      {tab !== 'stock' && (
        <div className="flex flex-wrap items-end gap-3">
          <div><label className="label" htmlFor="rf">From</label><input id="rf" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label className="label" htmlFor="rt">To</label><input id="rt" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          {tab === 'tax' && can('export.data') && <button className="btn-primary" onClick={csv}>Download CSV</button>}
        </div>
      )}
      <Notice msg={msg} />
      {!d && !msg && <p className="text-sm text-slate-500">Loading…</p>}

      {d && tab === 'sales' && (<>
        <div className="grid gap-3 md:grid-cols-4">
          {[['Bills', d.totals.count, false], ['Sales', d.totals.total], ['Discounts', d.totals.discount], ['GST', d.totals.gst]].map(([l, v, m = true]) => <div key={l} className="card p-4"><div className="text-sm text-slate-600">{l}</div><div className="text-2xl font-extrabold text-ink">{m === false ? v : money(v)}</div></div>)}
        </div>
        <p className="text-sm"><Link className="font-semibold text-ink-500 underline" to={`/invoices?from=${from}&to=${to}`}>See all {d.totals.count} bills in this period</Link>. Click a day or a payment type to open the bills behind it.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Table head={['Day', 'Bills', 'Sales']} min={300}>{d.byDay.map((r) => <tr key={r.date} className="border-b border-paper-line"><td className="p-3"><Link className="font-semibold text-ink-500 underline" to={`/invoices?from=${r.date}&to=${r.date}`}>{r.date}</Link></td><td className="p-3">{r.count}</td><td className="p-3">{money(r.total)}</td></tr>)}{!d.byDay.length && <tr><td className="p-4 text-slate-500" colSpan={3}>No sales in this period.</td></tr>}</Table>
          <Table head={['Paid by', 'Amount']} min={300}>{d.byMode.map((r) => <tr key={r.mode} className="border-b border-paper-line"><td className="p-3 capitalize"><Link className="font-semibold text-ink-500 underline" to={`/invoices?from=${from}&to=${to}&mode=${r.mode}`}>{r.mode}</Link></td><td className="p-3">{money(r.amount)}</td></tr>)}</Table>
        </div>
      </>)}

      {d && tab === 'stock' && (<>
        <div className={`rounded-md px-3 py-2 text-sm font-semibold ${d.reconcile.ok ? 'bg-leaf-soft text-leaf' : 'bg-ruby-soft text-ruby'}`}>
          {d.reconcile.ok ? `Balances reconcile: all ${d.reconcile.checked} pieces match their stock history.` : <>
            {d.reconcile.mismatches.length} piece(s) do not match their history, {d.reconcile.noHistory} have no history. {d.reconcile.mismatches.slice(0, 5).map((m) => <span key={m.barcode} className="mr-3"><Link className="underline" to={`/inventory?history=${m.barcode}`}>{m.barcode}</Link> is {m.status}, history says {m.expected}</span>)}</>}
        </div>
        <Table head={['Metal', 'Pieces', 'Gross g', 'Net g', 'Metal value today', ...(d.summary.rows[0]?.cost !== undefined ? ['Cost'] : [])]}>
          {d.summary.rows.map((r) => <tr key={r.metal + r.purity} className="border-b border-paper-line"><td className="p-3 font-semibold capitalize"><Link className="text-ink-500 underline" to={`/inventory?metal=${r.metal}&purity=${encodeURIComponent(r.purity)}&status=available`}>{r.metal} {r.purity}</Link></td><td className="p-3">{r.count}</td><td className="p-3">{r.grossWeight}</td><td className="p-3">{r.netWeight}</td><td className="p-3">{r.marketValue === null ? 'Rate not set' : money(r.marketValue)}</td>{r.cost !== undefined && <td className="p-3">{money(r.cost)}</td>}</tr>)}
        </Table>
      </>)}

      {d && tab === 'tax' && (<>
        <p className="text-xs text-slate-500">{d.note}</p>
        <Table head={['Type', 'Number', 'Date', 'Customer', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total']} min={900}>
          {d.rows.map((r) => <tr key={r.type + r.invoiceNo} className="border-b border-paper-line"><td className="p-3">{r.type}</td><td className="p-3 font-semibold">{r.type === 'Invoice' ? <Link className="text-ink-500 underline" to={`/invoices/no/${r.invoiceNo}`}>{r.invoiceNo}</Link> : <span title={`Against ${r.againstInvoice}`}>{r.invoiceNo}</span>}</td><td className="p-3">{r.date}</td><td className="p-3">{r.customer || '—'}</td><td className="p-3">{money(r.taxable)}</td><td className="p-3">{money(r.cgst)}</td><td className="p-3">{money(r.sgst)}</td><td className="p-3">{money(r.igst)}</td><td className="p-3">{money(r.total)}</td></tr>)}
          <tr className="bg-paper font-extrabold"><td className="p-3" colSpan={4}>Total</td><td className="p-3">{money(d.totals.taxable)}</td><td className="p-3">{money(d.totals.cgst)}</td><td className="p-3">{money(d.totals.sgst)}</td><td className="p-3">{money(d.totals.igst)}</td><td className="p-3">{money(d.totals.total)}</td></tr>
        </Table>
      </>)}

      {d && tab === 'margin' && (<>
        <p className="text-xs text-slate-500">{d.note} {d.returnedLeftOut > 0 && `${d.returnedLeftOut} returned piece(s) left out.`}</p>
        <Table head={['Metal', 'Pieces', 'Revenue (no GST)', 'Metal value', 'Making etc.', 'Cost', 'Margin', 'Margin %']} min={820}>
          {d.rows.map((r) => <tr key={r.metal + r.purity} className="border-b border-paper-line"><td className="p-3 font-semibold capitalize">{r.metal} {r.purity}</td><td className="p-3">{r.pieces}</td><td className="p-3">{money(r.revenue)}</td><td className="p-3">{money(r.metalValue)}</td><td className="p-3">{money(r.makingEtc)}</td><td className="p-3">{money(r.cost)}</td><td className="p-3">{money(r.margin)}</td><td className="p-3">{r.marginPercent ?? '—'}</td></tr>)}
          <tr className="bg-paper font-extrabold"><td className="p-3">Total</td><td className="p-3">{d.totals.pieces}</td><td className="p-3">{money(d.totals.revenue)}</td><td className="p-3">{money(d.totals.metalValue)}</td><td className="p-3">{money(d.totals.makingEtc)}</td><td className="p-3">{money(d.totals.cost)}</td><td className="p-3">{money(d.totals.margin)}</td><td className="p-3">{d.totals.marginPercent ?? '—'}</td></tr>
        </Table>
      </>)}
    </div>
  );
}
