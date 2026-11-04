import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { money } from '../status';
import { Badge, Notice, Table } from '../components/Bits';

const LEVEL = { warn: 'bg-gold-soft text-gold-deep', info: 'bg-ink-100 text-ink', error: 'bg-ruby-soft text-ruby' };

export default function Dashboard() {
  const { user } = useAuth();
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { api.get('/reports/dashboard').then((r) => setD(r.data)).catch((e) => setMsg({ type: 'err', text: errMsg(e) })); }, []);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-extrabold text-ink">Hello, {user.name}</h1><p className="text-sm text-slate-600">{d ? `Today is ${d.today}` : ''}</p></div>
      <Notice msg={msg} />
      {d?.alerts.length > 0 && (
        <ul className="space-y-2" aria-label="Alerts">
          {d.alerts.map((a, i) => <li key={i} className={`rounded-md px-3 py-2 text-sm font-semibold ${LEVEL[a.level]}`}>{a.href ? <Link className="underline" to={a.href}>{a.text}</Link> : a.text}</li>)}
        </ul>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {d?.sales && (<>
          <div className="card p-4"><div className="text-sm text-slate-600">Today's sales</div><div className="text-3xl font-extrabold text-ink">{money(d.sales.total)}</div><Link className="text-sm font-semibold text-ink-500 underline" to={`/invoices?from=${d.today}&to=${d.today}`}>{d.sales.count} bill{d.sales.count === 1 ? '' : 's'}</Link></div>
          <div className="card p-4 md:col-span-2"><div className="mb-1 text-sm text-slate-600">Collected by</div>
            {d.sales.byMode.length ? <ul className="flex flex-wrap gap-x-8 gap-y-1 text-sm">{d.sales.byMode.map((m) => <li key={m.mode}><span className="capitalize text-slate-500">{m.mode}</span> <b>{money(m.amount)}</b></li>)}</ul> : <div className="text-sm text-slate-500">Nothing yet today.</div>}</div>
        </>)}
        {d?.stock && <div className="card p-4 md:col-span-3"><div className="mb-2 text-sm text-slate-600">Stock by status</div>
          <div className="flex flex-wrap gap-3">{Object.entries(d.stock.byStatus).map(([k, n]) => <Link key={k} to={`/inventory?status=${k}`} className="flex items-center gap-2 text-sm"><Badge status={k} /><b>{n}</b></Link>)}</div></div>}
      </div>
      {d?.stock?.rows.length > 0 && (
        <div className="space-y-2"><h2 className="font-extrabold text-ink">Available stock</h2>
          <Table head={['Metal', 'Pieces', 'Gross g', 'Net g', 'Metal value today', ...(d.stock.rows[0].cost !== undefined ? ['Cost'] : [])]}>
            {d.stock.rows.map((r) => <tr key={r.metal + r.purity} className="border-b border-paper-line"><td className="p-3 font-semibold capitalize">{r.metal} {r.purity}</td><td className="p-3">{r.count}</td><td className="p-3">{r.grossWeight}</td><td className="p-3">{r.netWeight}</td><td className="p-3">{r.marketValue === null ? 'Rate not set' : money(r.marketValue)}</td>{r.cost !== undefined && <td className="p-3">{money(r.cost)}</td>}</tr>)}
          </Table></div>
      )}
    </div>
  );
}
