import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { Notice } from '../components/Bits';
import LabelCard from '../components/LabelCard';

// Labels are 50 x 25 mm.
// "Roll" = one label per page (thermal label printer).
// "Sheet" = many labels on one A4 page, in a grid with the chosen number of columns.
const LABEL_W = 50; // mm
const LABEL_H = 25; // mm
const GAP = 2;      // mm between labels on a sheet
const PAGE_MARGIN = 8; // mm around an A4 sheet

export default function Labels() {
  const { settings } = useAuth();
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') || '');
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [picked, setPicked] = useState({});
  const [msg, setMsg] = useState(null);
  const [layout, setLayout] = useState('sheet'); // 'sheet' | 'roll'
  const [cols, setCols] = useState(3);

  useEffect(() => { api.get('/categories').then((r) => setCats(r.data)); }, []);
  useEffect(() => { api.get('/items', { params: { q, status: 'available', limit: 200 } }).then((r) => { setItems(r.data); if (sp.get('q') && r.data.length === 1) setPicked({ [r.data[0]._id]: true }); }).catch((e) => setMsg({ type: 'err', text: errMsg(e) })); }, [q]); // eslint-disable-line

  const chosen = items.filter((i) => picked[i._id]);
  const sheet = layout === 'sheet';
  const perPage = sheet ? Math.max(1, Math.floor((210 - 2 * PAGE_MARGIN + GAP) / (LABEL_W + GAP))) : 1;

  // Page setup and layout for printing only.
  const printCss = sheet
    ? `@media print {
        @page { size: A4; margin: ${PAGE_MARGIN}mm; }
        #labels { display: grid !important; grid-template-columns: repeat(${cols}, ${LABEL_W}mm); gap: ${GAP}mm; justify-content: start; }
        #labels .lbl { width: ${LABEL_W}mm; height: ${LABEL_H}mm; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
        #labels .lbl * { break-after: auto !important; page-break-after: auto !important; }
      }`
    : `@media print {
        @page { size: ${LABEL_W}mm ${LABEL_H}mm; margin: 0; }
        #labels { display: block !important; }
        #labels .lbl { width: ${LABEL_W}mm; height: ${LABEL_H}mm; overflow: hidden; break-after: page; page-break-after: always; }
        #labels .lbl:last-child { break-after: auto; page-break-after: auto; }
      }`;

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

        {/* Print layout */}
        <div className="card flex flex-wrap items-center gap-4 p-3 text-sm">
          <span className="font-extrabold text-ink">Print layout</span>
          <div role="radiogroup" aria-label="Print layout" className="inline-flex gap-1 rounded-lg border border-paper-line bg-slate-50 p-1">
            {[['sheet', 'Many per page (A4)'], ['roll', 'One per page (label roll)']].map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={layout === k} onClick={() => setLayout(k)}
                className={`whitespace-nowrap rounded-md px-4 py-1.5 text-sm font-semibold transition ${layout === k ? 'bg-ink text-white shadow-sm' : 'text-slate-700 hover:bg-white'}`}>{l}</button>
            ))}
          </div>
          {sheet && (
            <label className="flex items-center gap-2 text-slate-600">
              Labels across
              <select aria-label="Labels across" className="input !w-20" value={cols} onChange={(e) => setCols(Number(e.target.value))}>
                {Array.from({ length: perPage }, (_, n) => n + 1).map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
          <span className="text-xs text-slate-500">{sheet ? `Each label is ${LABEL_W} × ${LABEL_H} mm. Choose "A4" and "Margins: Default" in the print window.` : `One ${LABEL_W} × ${LABEL_H} mm label per page.`}</span>
        </div>

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
