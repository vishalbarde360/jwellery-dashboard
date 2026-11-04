import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { Notice } from '../components/Bits';
import LabelCard from '../components/LabelCard';
import PriceBreakup from '../components/PriceBreakup';

const PURITY = { gold: ['24K', '22K', '18K', '14K'], silver: ['999', '925', '800'], platinum: ['950', '900'], diamond: [], other: [] };
const METHODS = [['weight', 'Net weight x rate + wastage + making'], ['gross_weight', 'Gross weight x rate + making'], ['fixed', 'Fixed price']];
const blank = { category: 'ring', productId: '', name: '', sku: '', metal: 'gold', purity: '22K', defaultPriceMethod: 'weight', defaultWastagePercent: '', defaultMakingType: 'percent', defaultMakingValue: '' };
const blankPiece = { barcode: '', name: '', grossWeight: '', stoneWeight: '', stoneValue: '', costPrice: '', fixedPrice: '', attrs: {} };

export default function RegisterProduct() {
  const { can, settings } = useAuth();
  const [cats, setCats] = useState([]);
  const [products, setProducts] = useState([]);
  const [f, setF] = useState(blank);
  const [withPiece, setWithPiece] = useState(true);
  const [piece, setPiece] = useState(blankPiece);
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);

  useEffect(() => { api.get('/categories').then((r) => setCats(r.data)); api.get('/products').then((r) => setProducts(r.data)).catch(() => {}); }, []);
  const cat = cats.find((c) => c.key === f.category);
  const locked = !!f.productId;
  const mine = products.filter((p) => p.category === f.category);

  const chooseCategory = (key) => { setF({ ...blank, category: key }); setPiece({ ...piece, attrs: {} }); };
  const chooseProduct = (id) => {
    const p = products.find((x) => x._id === id);
    setF(p ? { ...f, productId: id, name: p.name, sku: p.sku || '', metal: p.metal, purity: p.purity, defaultPriceMethod: p.defaultPriceMethod || 'weight', defaultWastagePercent: p.defaultWastagePercent ?? '', defaultMakingType: p.defaultMakingType, defaultMakingValue: p.defaultMakingValue ?? '' } : { ...blank, category: f.category });
  };

  const gross = Number(piece.grossWeight) || 0;
  const stone = Number(piece.stoneWeight) || 0;
  const net = Math.max(gross - stone, 0);

  // Price preview with today's rate, using the same engine as billing.
  const sig = JSON.stringify([f.metal, f.purity, f.defaultPriceMethod, f.defaultWastagePercent, f.defaultMakingType, f.defaultMakingValue, piece.grossWeight, piece.stoneWeight, piece.stoneValue, piece.fixedPrice]);
  useEffect(() => {
    if (!withPiece || (!gross && f.defaultPriceMethod !== 'fixed')) { setPreview(null); return; }
    const t = setTimeout(() => {
      api.post('/pricing/preview', { metal: f.metal, purity: f.purity, priceMethod: f.defaultPriceMethod, grossWeight: gross, stoneWeight: stone, stoneValue: piece.stoneValue, fixedPrice: piece.fixedPrice, wastagePercent: f.defaultWastagePercent, makingType: f.defaultMakingType, makingValue: f.defaultMakingValue })
        .then((r) => setPreview(r.data)).catch((e) => setPreview({ message: errMsg(e) }));
    }, 300);
    return () => clearTimeout(t);
  }, [sig, withPiece]); // eslint-disable-line

  const genCode = async () => { try { const { data } = await api.post('/barcodes/generate', { count: 1 }); setPiece((p) => ({ ...p, barcode: data.barcodes[0] })); } catch (x) { setMsg({ type: 'err', text: errMsg(x) }); } };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true); setMsg(null);
    const num = (v) => (v === '' ? 0 : Number(v));
    try {
      const { data } = await api.post('/products/register', {
        productId: f.productId || undefined,
        product: f.productId ? undefined : { name: f.name, sku: f.sku, category: f.category, metal: f.metal, purity: f.purity, defaultPriceMethod: f.defaultPriceMethod, defaultWastagePercent: num(f.defaultWastagePercent), defaultMakingType: f.defaultMakingType, defaultMakingValue: num(f.defaultMakingValue) },
        piece: withPiece ? { barcode: piece.barcode, name: piece.name || undefined, grossWeight: gross, stoneWeight: stone, stoneValue: num(piece.stoneValue), costPrice: num(piece.costPrice), fixedPrice: num(piece.fixedPrice), attrs: piece.attrs } : undefined,
      });
      setSaved(data);
      setProducts((ps) => (ps.some((p) => p._id === data.product._id) ? ps : [...ps, data.product]));
      setF((cur) => ({ ...cur, productId: data.product._id }));
      setPiece(blankPiece);
      setMsg({ type: 'ok', text: data.item ? `Registered ${data.item.barcode}. You can register the next piece of the same product, or print its label.` : 'Product saved.' });
    } catch (x) { setMsg({ type: 'err', text: errMsg(x) }); } finally { setSaving(false); }
  };

  const fld = (label, id, el) => <div key={id}><label className="label" htmlFor={id}>{label}</label>{el}</div>;
  const attrInput = (a) => a.type === 'select'
    ? <select id={`a-${a.key}`} className="input" value={piece.attrs[a.key] ?? ''} onChange={(e) => setPiece({ ...piece, attrs: { ...piece.attrs, [a.key]: e.target.value } })}><option value="">Choose</option>{a.options.map((o) => <option key={o}>{o}</option>)}</select>
    : <input id={`a-${a.key}`} className="input" type={a.type === 'number' ? 'number' : 'text'} step="any" value={piece.attrs[a.key] ?? ''} onChange={(e) => setPiece({ ...piece, attrs: { ...piece.attrs, [a.key]: e.target.value } })} />;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_26rem]">
      <form onSubmit={submit} className="space-y-5">
        <h1 className="text-2xl font-extrabold text-ink">Register product</h1>
        <Notice msg={msg} />

        <section className="card p-4">
          <div className="label">Category</div>
          <div role="radiogroup" aria-label="Category" className="flex flex-wrap gap-2">
            {cats.map((c) => <button type="button" role="radio" aria-checked={f.category === c.key} key={c.key} onClick={() => chooseCategory(c.key)} className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${f.category === c.key ? 'border-ink bg-ink text-white' : 'border-paper-line bg-white text-slate-700'}`}>{c.label}</button>)}
          </div>
        </section>

        <section className="card grid gap-4 p-4 md:grid-cols-2">
          <h2 className="font-extrabold text-ink md:col-span-2">Product type</h2>
          <div className="md:col-span-2">{fld('Use an existing product', 'pp', <select id="pp" className="input" value={f.productId} onChange={(e) => chooseProduct(e.target.value)}><option value="">New product</option>{mine.map((p) => <option key={p._id} value={p._id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>)}</select>)}</div>
          {fld('Name', 'pn', <input id="pn" required disabled={locked} className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />)}
          {fld('SKU', 'ps', <input id="ps" disabled={locked} className="input uppercase" value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} />)}
          {fld('Metal', 'pm', <select id="pm" disabled={locked} className="input" value={f.metal} onChange={(e) => setF({ ...f, metal: e.target.value, purity: PURITY[e.target.value][0] || '' })}>{Object.keys(PURITY).map((m) => <option key={m}>{m}</option>)}</select>)}
          {fld('Purity', 'pu', <><input id="pu" required disabled={locked} list="purities" className="input" value={f.purity} onChange={(e) => setF({ ...f, purity: e.target.value })} /><datalist id="purities">{PURITY[f.metal].map((p) => <option key={p} value={p} />)}</datalist></>)}
          <div className="md:col-span-2">{fld('Price method', 'pq', <select id="pq" disabled={locked} className="input" value={f.defaultPriceMethod} onChange={(e) => setF({ ...f, defaultPriceMethod: e.target.value })}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>)}</div>
          {f.defaultPriceMethod === 'weight' && fld('Wastage % (of metal value)', 'pw', <input id="pw" type="number" step="0.01" disabled={locked} className="input" value={f.defaultWastagePercent} onChange={(e) => setF({ ...f, defaultWastagePercent: e.target.value })} />)}
          {f.defaultPriceMethod !== 'fixed' && fld('Making charge', 'pk', <div className="flex gap-1"><select aria-label="Making type" disabled={locked} className="input !w-28" value={f.defaultMakingType} onChange={(e) => setF({ ...f, defaultMakingType: e.target.value })}><option value="percent">percent</option><option value="per_gram">per gram</option><option value="fixed">fixed ₹</option></select><input id="pk" type="number" step="0.01" disabled={locked} className="input" value={f.defaultMakingValue} onChange={(e) => setF({ ...f, defaultMakingValue: e.target.value })} /></div>)}
        </section>

        <section className="card space-y-4 p-4">
          <label className="flex cursor-pointer items-center gap-2 font-extrabold text-ink"><input type="checkbox" checked={withPiece} onChange={(e) => setWithPiece(e.target.checked)} disabled={!can('stock.receive')} /> Register a piece now (opening stock or own-made)</label>
          {!can('stock.receive') && <p className="text-xs text-slate-500">Your role can register product types only. Pieces come in through a purchase.</p>}
          {withPiece && (
            <div className="grid gap-4 md:grid-cols-2">
              <div>{fld('Barcode', 'bc', <div className="flex gap-2"><input id="bc" required className="input" value={piece.barcode} onChange={(e) => setPiece({ ...piece, barcode: e.target.value })} /><button type="button" className="btn-ghost" onClick={genCode}>Generate</button></div>)}</div>
              {fld('Piece name (optional)', 'pnm', <input id="pnm" className="input" placeholder={f.name} value={piece.name} onChange={(e) => setPiece({ ...piece, name: e.target.value })} />)}
              {fld('Gross weight (g)', 'gw', <input id="gw" required type="number" step="0.001" className="input" value={piece.grossWeight} onChange={(e) => setPiece({ ...piece, grossWeight: e.target.value })} />)}
              {fld('Stone weight (g)', 'sw', <input id="sw" type="number" step="0.001" className="input" value={piece.stoneWeight} onChange={(e) => setPiece({ ...piece, stoneWeight: e.target.value })} />)}
              <div className="text-sm text-slate-600">Net weight (metal only): <b>{net.toFixed(3)} g</b></div>
              {fld('Stone value (₹)', 'sv', <input id="sv" type="number" step="0.01" className="input" value={piece.stoneValue} onChange={(e) => setPiece({ ...piece, stoneValue: e.target.value })} />)}
              {f.defaultPriceMethod === 'fixed' && fld('Fixed price (₹)', 'fp', <input id="fp" type="number" step="0.01" className="input" value={piece.fixedPrice} onChange={(e) => setPiece({ ...piece, fixedPrice: e.target.value })} />)}
              {can('cost.read') && fld('Cost price (₹)', 'cp', <input id="cp" type="number" step="0.01" className="input" value={piece.costPrice} onChange={(e) => setPiece({ ...piece, costPrice: e.target.value })} />)}
              {cat && <h3 className="font-extrabold text-ink md:col-span-2">{cat.label} details</h3>}
              {cat?.fields.map((a) => fld(`${a.label}${a.required ? ' *' : ''}`, `a-${a.key}`, attrInput(a)))}
            </div>
          )}
        </section>
        <button className="btn-primary !py-3" disabled={saving}>{saving ? 'Saving…' : withPiece ? 'Register product and piece' : 'Save product'}</button>
        {saved?.item && <Link className="ml-3 text-sm font-semibold text-ink-500 underline" to={`/labels?q=${encodeURIComponent(saved.item.barcode)}`}>Print label for {saved.item.barcode}</Link>}
      </form>

      <aside className="space-y-4 xl:sticky xl:top-4 xl:h-fit">
        <section className="card p-4">
          <h2 className="mb-2 font-extrabold text-ink">Label preview</h2>
          <div className="overflow-hidden rounded-md border border-dashed border-slate-300 bg-white" style={{ width: '100mm', height: '50mm', maxWidth: '100%' }}>
            <div style={{ transform: 'scale(2)', transformOrigin: 'top left', width: '50mm', height: '25mm' }}>
              <LabelCard shop={settings.shopName || 'Your shop'} name={piece.name || f.name || 'Product name'} purity={f.purity} netWeight={net.toFixed(3)} sku={f.sku} barcode={piece.barcode || 'WN000000'} category={f.category} attrs={piece.attrs} categories={cats} />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Printed size is 50 × 25 mm. This preview is enlarged.</p>
        </section>

        <section className="card p-4">
          <h2 className="mb-2 font-extrabold text-ink">Price today</h2>
          {preview?.price ? (<>
            <PriceBreakup price={preview.price} rate={preview.rate} netWeight={net} grossWeight={gross} gstPercent={preview.gstPercent} charges={{ priceMethod: f.defaultPriceMethod, makingType: f.defaultMakingType, makingValue: f.defaultMakingValue, wastagePercent: f.defaultWastagePercent }} />
            <p className="mt-2 text-xs text-slate-500">Worked out with today's rate. The rate is saved on each bill, so later changes never alter an old bill.</p>
          </>) : <p className="text-sm text-slate-500">{preview?.message || 'Enter the weight to see the price.'}</p>}
        </section>
      </aside>
    </div>
  );
}
