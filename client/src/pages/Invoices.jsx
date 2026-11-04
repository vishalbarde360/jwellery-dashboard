import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { money } from '../status';
import { fmtDateTime } from '../format';
import { Notice, Table } from '../components/Bits';

export default function Invoices() {
  const { settings } = useAuth();
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') || '', from = sp.get('from') || '', to = sp.get('to') || '', mode = sp.get('mode') || '';
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => { const n = new URLSearchParams(sp); e.target.value ? n.set(k, e.target.value) : n.delete(k); setSp(n, { replace: true }); };

  useEffect(() => {
    const t = setTimeout(() => api.get('/invoices', { params: { q, from, to, mode } }).then((r) => { setList(r.data); setMsg(null); }).catch((e) => setMsg({ type: 'err', text: errMsg(e) })), 200);
    return () => clearTimeout(t);
  }, [q, from, to, mode]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Invoices</h1>
      <Notice msg={msg} />
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="iq">Bill number, customer or phone</label><input id="iq" className="input !w-72" value={q} onChange={set('q')} /></div>
        <div><label className="label" htmlFor="if">From</label><input id="if" type="date" className="input" value={from} onChange={set('from')} /></div>
        <div><label className="label" htmlFor="it">To</label><input id="it" type="date" className="input" value={to} onChange={set('to')} /></div>
        <div><label className="label" htmlFor="im">Paid by</label><select id="im" className="input" value={mode} onChange={set('mode')}><option value="">Any</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank transfer</option></select></div>
      </div>
      <Table head={['Bill', 'Date', 'Customer', 'Pieces', 'Total', 'Status']} min={720}>
        {list.map((i) => <tr key={i._id} className="border-b border-paper-line"><td className="p-3 font-semibold"><Link className="text-ink-500 underline" to={`/invoices/${i._id}`}>{i.invoiceNo}</Link></td><td className="p-3">{fmtDateTime(i.createdAt, settings.timezone)}</td><td className="p-3">{i.customer?.name || 'Walk-in'}</td><td className="p-3">{i.lines.length}</td><td className="p-3">{money(i.grandTotal)}</td><td className="p-3 capitalize">{i.status}</td></tr>)}
        {!list.length && <tr><td className="p-4 text-slate-500" colSpan={6}>No bills found.</td></tr>}
      </Table>
    </div>
  );
}
