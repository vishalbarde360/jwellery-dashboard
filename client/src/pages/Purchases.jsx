import { useEffect, useState } from 'react';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { money } from '../status';
import { Notice, Table } from '../components/Bits';

const blankLine = { productId: '', grossWeight: '', stoneWeight: '', stoneValue: '', costPrice: '' };

export default function Purchases() {
  const { can } = useAuth();
  const [list, setList] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [newSup, setNewSup] = useState('');
  const [lines, setLines] = useState([{ ...blankLine }]);
  const [checking, setChecking] = useState(null); // purchase being received
  const [pieces, setPieces] = useState({});
  const [msg, setMsg] = useState(null);

  const load = () => {
    api.get('/purchases').then((r) => setList(r.data)).catch((e) => setMsg({ type: 'err', text: errMsg(e) }));
    api.get('/suppliers').then((r) => setSuppliers(r.data)).catch(() => {});
  };
  useEffect(() => { load(); api.get('/products').then((r) => setProducts(r.data)).catch(() => {}); }, []);

  const addSupplier = async () => {
    if (!newSup.trim()) return;
    try { const r = await api.post('/suppliers', { name: newSup }); setSuppliers([...suppliers, r.data]); setSupplierId(r.data._id); setNewSup(''); }
    catch (e) { setMsg({ type: 'err', text: errMsg(e) }); }
  };
  const setLine = (i, k, v) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const saveDraft = async (e) => {
    e.preventDefault();
    try {
      await api.post('/purchases', { supplierId, lines });
      setLines([{ ...blankLine }]); setMsg({ type: 'ok', text: 'Draft saved. It does not add stock until the goods are checked and confirmed.' }); load();
    } catch (x) { setMsg({ type: 'err', text: errMsg(x) }); }
  };
  const cancel = async (id) => { try { await api.post(`/purchases/${id}/cancel`); load(); } catch (x) { setMsg({ type: 'err', text: errMsg(x) }); } };

  const startCheck = (p) => {
    setChecking(p);
    setPieces(Object.fromEntries(p.lines.map((l) => [l._id, { barcode: '', grossWeight: l.grossWeight, stoneWeight: l.stoneWeight, stoneValue: l.stoneValue, costPrice: l.costPrice }])));
  };
  const setPiece = (id, k, v) => setPieces({ ...pieces, [id]: { ...pieces[id], [k]: v } });
  const genCodes = async () => {
    try {
      const { data } = await api.post('/barcodes/generate', { count: checking.lines.length });
      const ids = checking.lines.map((l) => l._id);
      setPieces((cur) => Object.fromEntries(ids.map((id, i) => [id, { ...cur[id], barcode: data.barcodes[i] }])));
    } catch (x) { setMsg({ type: 'err', text: errMsg(x) }); }
  };
  const confirm = async () => {
    try {
      await api.post(`/purchases/${checking._id}/confirm`, { pieces: Object.entries(pieces).map(([lineId, x]) => ({ lineId, ...x })) });
      setChecking(null); setMsg({ type: 'ok', text: 'Receipt confirmed. Stock has increased.' }); load();
    } catch (x) { setMsg({ type: 'err', text: `Not confirmed. ${errMsg(x)}. No stock was added.` }); }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-ink">Purchases</h1>
      <Notice msg={msg} />

      {checking && (
        <section className="card space-y-3 p-4">
          <h2 className="font-extrabold text-ink">Check goods for {checking.purchaseNo}</h2>
          <p className="text-sm text-slate-600">Weigh each piece, give it its own barcode, then confirm. All pieces enter stock together.</p>
          {checking.lines.map((l) => (
            <div key={l._id} className="grid gap-2 md:grid-cols-5 md:items-end">
              <div className="font-semibold">{l.name}</div>
              {[['barcode', 'Barcode'], ['grossWeight', 'Gross g'], ['stoneWeight', 'Stone g'], ['costPrice', 'Cost ₹']].map(([k, label]) => (
                <div key={k}><label className="label">{label}</label>
                  <input className="input" value={pieces[l._id]?.[k] ?? ''} onChange={(e) => setPiece(l._id, k, e.target.value)} /></div>
              ))}
            </div>
          ))}
          <div className="flex gap-2"><button className="btn-ghost" onClick={genCodes}>Generate barcodes</button><button className="btn-gold" onClick={confirm}>Confirm receipt</button><button className="btn-ghost" onClick={() => setChecking(null)}>Back</button></div>
        </section>
      )}

      {can('purchases.draft') && (
        <form onSubmit={saveDraft} className="card space-y-3 p-4">
          <h2 className="font-extrabold text-ink">New draft purchase</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div><label className="label" htmlFor="sp">Supplier</label>
              <select id="sp" required className="input !w-64" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Choose supplier</option>{suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select></div>
            <div className="flex items-end gap-2"><div><label className="label" htmlFor="ns">Or add a supplier</label><input id="ns" className="input" value={newSup} onChange={(e) => setNewSup(e.target.value)} /></div>
              <button type="button" className="btn-ghost" onClick={addSupplier}>Add</button></div>
          </div>
          {lines.map((l, i) => (
            <div key={i} className="grid gap-2 md:grid-cols-5 md:items-end">
              <div><label className="label">Product</label>
                <select required className="input" value={l.productId} onChange={(e) => setLine(i, 'productId', e.target.value)}>
                  <option value="">Choose</option>{products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                </select></div>
              {[['grossWeight', 'Expected gross g'], ['stoneWeight', 'Stone g'], ['stoneValue', 'Stone value ₹'], ['costPrice', 'Cost ₹']].map(([k, label]) => (
                <div key={k}><label className="label">{label}</label><input className="input" inputMode="decimal" value={l[k]} onChange={(e) => setLine(i, k, e.target.value)} /></div>
              ))}
            </div>
          ))}
          <div className="flex gap-2"><button type="button" className="btn-ghost" onClick={() => setLines([...lines, { ...blankLine }])}>Add another piece</button><button className="btn-primary">Save draft</button></div>
        </form>
      )}

      <Table head={['Purchase', 'Supplier', 'Pieces', 'Cost', 'Status', '']}>
        {list.map((p) => (
          <tr key={p._id} className="border-b border-paper-line">
            <td className="p-3 font-semibold">{p.purchaseNo}</td>
            <td className="p-3">{p.supplier?.name}</td>
            <td className="p-3">{p.lines.length}</td>
            <td className="p-3">{money(p.totalCost)}</td>
            <td className="p-3 capitalize">{p.status}</td>
            <td className="p-3 text-right">
              {p.status === 'draft' && can('stock.receive') && <button className="btn-primary !px-3 !py-1" onClick={() => startCheck(p)}>Check and receive</button>}
              {p.status === 'draft' && can('purchases.draft') && <button className="ml-2 text-xs font-semibold text-ruby underline" onClick={() => cancel(p._id)}>Cancel</button>}
            </td>
          </tr>
        ))}
        {!list.length && <tr><td className="p-4 text-slate-500" colSpan={6}>No purchases yet.</td></tr>}
      </Table>
    </div>
  );
}
