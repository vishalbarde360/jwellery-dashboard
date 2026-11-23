import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { Notice } from '../components/Bits';
import LabelCard from '../components/LabelCard';

// Labels are 50 x 25 mm, printed many per A4 page in a grid.
const LABEL_W = 50; // mm
const LABEL_H = 25; // mm
const GAP = 2;      // mm between labels
const PAGE_MARGIN = 8; // mm around the A4 page
const MAX_COLS = 5; // 1 to 5 labels in a row. Up to 3 fit on a portrait A4; 4 or 5 switch the page to landscape.
const PORTRAIT_MAX = 3;

export default function Labels() {
  const { settings } = useAuth();
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') || '');
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [picked, setPicked] = useState({});
  const [msg, setMsg] = useState(null);
  const [cols, setCols] = useState(3);

  useEffect(() => { api.get('/categories').then((r) => setCats(r.data)); }, []);
  useEffect(() => { api.get('/items', { params: { q, status: 'available', limit: 200 } }).then((r) => { setItems(r.data); if (sp.get('q') && r.data.length === 1) setPicked({ [r.data[0]._id]: true }); }).catch((e) => setMsg({ type: 'err', text: errMsg(e) })); }, [q]); // eslint-disable-line

  const chosen = items.filter((i) => picked[i._id]);

  // Page setup and grid layout for printing only.
  const printCss = `@media print {
    @page { size: A4 ${cols > PORTRAIT_MAX ? 'landscape' : 'portrait'}; margin: ${PAGE_MARGIN}mm; }
    #labels { display: grid !important; grid-template-columns: repeat(${cols}, ${LABEL_W}mm); gap: ${GAP}mm; justify-content: start; }
    #labels .lbl { width: ${LABEL_W}mm; height: ${LABEL_H}mm; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
    #labels .lbl * { break-after: auto !important; page-break-after: auto !important; }
  }`;

  return (
    <div className="space-y-4">
      <div className="print:hidden space-y-4">
        <h1 className="text-2xl font-extrabold text-ink">Labels</h1>
        <Notice msg={msg} />
        <div className="flex flex-wrap items-center gap-3">
          <input aria-label="Search" className="input !w-72" placeholder="Search barcode, name or SKU" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-ghost" onClick={() => setPicked(Object.fromEntries(items.map((i) => [i._id, true])))}>Select all shown</button>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Labels across
            <select aria-label="Labels across" className="input !w-20" value={cols} onChange={(e) => setCols(Number(e.target.value))}>
              {Array.from({ length: MAX_COLS }, (_, n) => n + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button className="btn-primary" disabled={!chosen.length} onClick={() => window.print()}>Print {chosen.length || ''} label{chosen.length === 1 ? '' : 's'}</button>
        </div>
        <p className="text-xs text-slate-500">Each label is {LABEL_W} × {LABEL_H} mm, printed many to an A4 page. {cols > PORTRAIT_MAX ? 'With 4 or 5 in a row the page prints in landscape. ' : ''}In the print window choose A4, Margins: Default, Scale: 100%.</p>

        <ul className="card divide-y divide-paper-line text-sm">
          {items.map((i) => <li key={i._id}><label className="flex cursor-pointer items-center gap-3 p-3"><input type="checkbox" checked={!!picked[i._id]} onChange={() => setPicked({ ...picked, [i._id]: !picked[i._id] })} /><b>{i.barcode}</b><span>{i.name}</span><span className="text-slate-500">{i.purity} · {i.netWeight} g</span></label></li>)}
          {!items.length && <li className="p-4 text-slate-500">No available pieces found.</li>}
        </ul>
      </div>

      <div id="labels" className="hidden">
        <style>{printCss}</style>
        {chosen.map((i) => (
          <div key={i._id} className="lbl">
            <LabelCard shop={settings.shopName} name={i.name} purity={i.purity} netWeight={i.netWeight} sku={i.sku} barcode={i.barcode} category={i.category} attrs={i.attrs} categories={cats} />
          </div>
        ))}
      </div>
    </div>
  );
}
