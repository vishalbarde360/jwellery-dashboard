import { useEffect, useState } from 'react';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { money } from '../status';
import { fmtDate } from '../format';
import { Notice, Table } from '../components/Bits';

export default function Customers() {
  const { can, settings } = useAuth();
  const [q, setQ] = useState('');
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(null);
  const [f, setF] = useState({ name: '', phone: '', email: '' });
  const [msg, setMsg] = useState(null);
  const load = () => api.get('/customers', { params: { q } }).then((r) => setList(r.data)).catch((e) => setMsg({ type: 'err', text: errMsg(e) }));
  useEffect(() => { load(); }, [q]); // eslint-disable-line

  const add = async (e) => {
    e.preventDefault();
    try { await api.post('/customers', f); setF({ name: '', phone: '', email: '' }); setMsg({ type: 'ok', text: 'Customer added' }); load(); }
    catch (x) { setMsg({ type: 'err', text: errMsg(x) }); }
  };
  const open = async (id) => { try { setSel((await api.get(`/customers/${id}`)).data); } catch (x) { setMsg({ type: 'err', text: errMsg(x) }); } };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-ink">Customers</h1>
      <p className="text-sm text-slate-600">Only name, phone and optional email are kept.</p>
      <Notice msg={msg} />
      {can('customers.write') && (
        <form onSubmit={add} className="card grid gap-3 p-4 md:grid-cols-4 md:items-end">
          <div><label className="label" htmlFor="cn">Name</label><input id="cn" required className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div><label className="label" htmlFor="cp">Phone</label><input id="cp" required inputMode="tel" className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          <div><label className="label" htmlFor="ce">Email (optional)</label><input id="ce" type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
          <button className="btn-primary">Add customer</button>
        </form>
      )}
      <input aria-label="Search customers" className="input !w-72" placeholder="Search name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
      <Table head={['Name', 'Phone', 'Email', '']} min={520}>
        {list.map((c) => <tr key={c._id} className="border-b border-paper-line"><td className="p-3 font-semibold">{c.name}</td><td className="p-3">{c.phone}</td><td className="p-3 text-slate-500">{c.email || '—'}</td><td className="p-3 text-right"><button className="btn-ghost !py-1" onClick={() => open(c._id)}>Purchase history</button></td></tr>)}
        {!list.length && <tr><td className="p-4 text-slate-500" colSpan={4}>No customers found.</td></tr>}
      </Table>
      {sel && (
        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-extrabold text-ink">{sel.customer.name} · {sel.customer.phone}</h2><button className="btn-ghost !py-1" onClick={() => setSel(null)}>Close</button></div>
          <p className="mb-2 text-sm text-slate-600">Total bought: <b>{money(sel.totalSpent)}</b> in {sel.invoices.length} bill{sel.invoices.length === 1 ? '' : 's'}</p>
          <ul className="divide-y divide-paper-line text-sm">{sel.invoices.map((i) => <li key={i._id} className="flex flex-wrap justify-between gap-2 py-2"><span><b>{i.invoiceNo}</b> <span className="text-slate-500">{fmtDate(i.createdAt, settings.timezone)}</span></span><span className="text-slate-600">{i.lines.map((l) => l.name).join(', ')}</span><b>{money(i.grandTotal)}</b></li>)}</ul>
        </section>
      )}
    </div>
  );
}
