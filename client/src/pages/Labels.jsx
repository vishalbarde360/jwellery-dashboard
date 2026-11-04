import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { Notice } from '../components/Bits';
import LabelCard from '../components/LabelCard';

// Small labels, 50 x 25 mm, one per page when printed.
export default function Labels() {
  const { settings } = useAuth();
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') || '');
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [picked, setPicked] = useState({});
  const [msg, setMsg] = useState(null);
  useEffect(() => { api.get('/categories').then((r) => setCats(r.data)); }, []);
  useEffect(() => { api.get('/items', { params: { q, status: 'available', limit: 200 } }).then((r) => { setItems(r.data); if (sp.get('q') && r.data.length === 1) setPicked({ [r.data[0]._id]: true }); }).catch((e) => setMsg({ type: 'err', text: errMsg(e) })); }, [q]); // eslint-disable-line

  const chosen = items.filter((i) => picked[i._id]);
  return (
    <div className="space-y-4">
      <div className="print:hidden space-y-4">
        <h1 className="text-2xl font-extrabold text-ink">Labels</h1>
        <Notice msg={msg} />
        <div className="flex flex-wrap items-center gap-3">
          <input aria-label="Search" className="input !w-72" placeholder="Search barcode, name or SKU" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-ghost" onClick={() => setPicked(Object.fromEntries(items.map((i) => [i._id, true])))}>Select all shown</button>
          <button className="btn-primary" disabled={!chosen.length} onClick={() => window.print()}>Print {chosen.length || ''} label{chosen.length === 1 ? '' : 's'}</button>
        </div>
        <ul className="card divide-y divide-paper-line text-sm">
          {items.map((i) => <li key={i._id}><label className="flex cursor-pointer items-center gap-3 p-3"><input type="checkbox" checked={!!picked[i._id]} onChange={() => setPicked({ ...picked, [i._id]: !picked[i._id] })} /><b>{i.barcode}</b><span>{i.name}</span><span className="text-slate-500">{i.purity} · {i.netWeight} g</span></label></li>)}
          {!items.length && <li className="p-4 text-slate-500">No available pieces found.</li>}
        </ul>
      </div>
      <div id="labels" className="hidden print:block">
        <style>{'@media print { @page { size: 50mm 25mm; margin: 0; } }'}</style>
        {chosen.map((i) => <LabelCard key={i._id} shop={settings.shopName} name={i.name} purity={i.purity} netWeight={i.netWeight} sku={i.sku} barcode={i.barcode} category={i.category} attrs={i.attrs} categories={cats} />)}
      </div>
    </div>
  );
}
