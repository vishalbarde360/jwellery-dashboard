import { useEffect, useState } from 'react';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { money } from '../status';
import { fmtDateTime } from '../format';
import { Notice, Table } from '../components/Bits';

export default function Rates() {
  const { can, settings } = useAuth();
  const [latest, setLatest] = useState([]);
  const [hist, setHist] = useState([]);
  const [f, setF] = useState({ metal: 'gold', purity: '22K', perGram: '' });
  const [msg, setMsg] = useState(null);
  const load = () => { api.get('/rates/latest').then((r) => setLatest(r.data)); api.get('/rates/history').then((r) => setHist(r.data)); };
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    const send = async (confirm) => { await api.post('/rates', { ...f, perGram: Number(f.perGram), ...(confirm ? { confirm: true } : {}) }); setF({ ...f, perGram: '' }); setMsg({ type: 'ok', text: 'Rate saved. New bills use it straight away. Old bills do not change.' }); load(); };
    try { await send(false); }
    catch (x) {
      // A big jump (possible typing mistake) must be confirmed on purpose.
      if (x.response?.status === 409 && x.response.data?.needsConfirm && window.confirm(x.response.data.message + '\n\nApply this rate?')) {
        try { await send(true); } catch (y) { setMsg({ type: 'err', text: errMsg(y) }); }
      } else setMsg({ type: 'err', text: errMsg(x) });
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-ink">Daily rates</h1>
      <Notice msg={msg} />
      <div className="grid gap-3 md:grid-cols-4">
        {latest.map((r) => <div key={r._id.metal + r._id.purity} className="card p-4"><div className="text-sm capitalize text-slate-600">{r._id.metal} {r._id.purity}</div><div className="text-2xl font-extrabold text-gold-deep">{money(r.perGram)}<span className="text-sm font-semibold text-slate-500"> per g</span></div><div className="text-xs text-slate-500">Set {fmtDateTime(r.at, settings.timezone)}</div></div>)}
      </div>
      {can('rates.write') && (
        <form onSubmit={save} className="card grid gap-3 p-4 md:grid-cols-4 md:items-end">
          <div><label className="label" htmlFor="rm">Metal</label><select id="rm" className="input" value={f.metal} onChange={(e) => setF({ ...f, metal: e.target.value })}>{['gold', 'silver', 'platinum', 'other'].map((m) => <option key={m}>{m}</option>)}</select></div>
          <div><label className="label" htmlFor="rp">Purity</label><input id="rp" required className="input" value={f.purity} onChange={(e) => setF({ ...f, purity: e.target.value })} /></div>
          <div><label className="label" htmlFor="rg">Rate per gram (₹)</label><input id="rg" required inputMode="decimal" className="input" value={f.perGram} onChange={(e) => setF({ ...f, perGram: e.target.value })} /></div>
          <button className="btn-primary">Set today's rate</button>
        </form>
      )}
      <Table head={['When', 'Metal', 'Rate per g', 'Set by']} min={520}>
        {hist.map((h) => <tr key={h._id} className="border-b border-paper-line"><td className="p-3">{fmtDateTime(h.createdAt, settings.timezone)}</td><td className="p-3 capitalize">{h.metal} {h.purity}</td><td className="p-3">{money(h.perGram)}</td><td className="p-3">{h.setBy?.name || '—'}</td></tr>)}
      </Table>
    </div>
  );
}
