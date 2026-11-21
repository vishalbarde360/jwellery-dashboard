import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { Notice } from '../components/Bits';
import LabelCard from '../components/LabelCard';
import PriceBreakup from '../components/PriceBreakup';

// [value saved / used for rate lookup, label shown]
const PURITY_OPTS = {
  gold: [['24K', '24K'], ['22K', '22K'], ['18K', '18K'], ['14K', '14K']],
  silver: [['60', 'S 60 Stamp'], ['70', 'S 70 Stamp'], ['91', 'S 91 Stamp'], ['925', 'S 92.5 Sterling Silver'], ['999', 'S 99.99 Silver']],
};
const DEFAULT_PURITY = { gold: '22K', silver: '925' };
const METHODS = [['weight', 'Net weight x rate + wastage + making'], ['gross_weight', 'Gross weight x rate + making'], ['fixed', 'Fixed price']];

// Category buttons (fixed list, no backend dependency)
const COLLECTIONS = [['gold', 'Gold'], ['silver', 'Silver'], ['special_design', 'Artificial Design']];
// Jewellery types per metal. `subs` = optional sub-types shown in a second dropdown.
const SILVER_TYPES = [
  { key: 'payal', label: 'Payal', subs: ['Khushboo Payal', 'Patta Payal', 'Paijep', 'Chain Payal', 'S Payal', 'SR Payal', 'Kolhapuri Payal', 'B Payal', 'Antique Payal'] },
  { key: 'bichhi', label: 'Bichii' },
  { key: 'jodawa', label: 'Jodawa' },
  { key: 'ring', label: 'Ring', subs: ['Gents', 'Ladies', 'B Ring'] },
  { key: 'kardan', label: 'Kardan', subs: ['Double Kunda', '3 Kunda', 'Full Kamar'] },
  { key: 'aakada', label: 'Aakada' },
  { key: 'necklace', label: 'Necklace' },
  { key: 'kangan_chuddi', label: 'Kangan / Chuddi' },
  { key: 'chain', label: 'Chain', subs: ['Gents', 'Ladies'] },
  { key: 'bracelet', label: 'Bracelet', subs: ['Gents', 'Ladies'] },
  { key: 'kadda', label: 'Kadda' },
  { key: 'kadhali', label: 'Kadhali' },
];
const GOLD_TYPES = [
  { key: 'ring', label: 'Ring', subs: ['Gents', 'Ladies'] },
  { key: 'necklace', label: 'Necklace' },
  { key: 'pendant', label: 'Pendant', subs: ['Chain Pendant'] },
  { key: 'earring', label: 'Earring', subs: ['Jhumka', 'Tops', 'Sui Dhaga', 'Kaan Chain', 'Zhale'] },
  { key: 'mang_tikka', label: 'Mang Tikka' },
  { key: 'bangle', label: 'Bangle' },
  { key: 'long_mangalsutra', label: 'Long Mangalsutra' },
  { key: 'short_mangalsutra', label: 'Short Mangalsutra' },
  { key: 'ms_patta', label: 'MS Patta' },
  { key: 'mani', label: 'Mani', subs: ['C Cut', 'S Mani', 'Football Mani', 'Piteu Mani (20)', 'Piteu (16)', 'Piteu (30)', 'Piteu (24)', 'Dor Mani', 'Pipe Mani'] },
  { key: 'chain', label: 'Chain', subs: ['Gents', 'Ladies'] },
  { key: 'choker', label: 'Choker' },
  { key: 'rani_haar', label: 'Rani Haar' },
  { key: 'nose_pin', label: 'Nose Pin' },
  { key: 'kada', label: 'Kaada' },
  { key: 'bracelet', label: 'Bracelet' },
  { key: 'nose_ring', label: 'Nose Ring (Nath)' },
  { key: 'antique', label: 'Antique Jewelry' },
  { key: 'template', label: 'Template Jewelry' },
];
// Auto SKU: <category>-<type>-<running number>, e.g. GLD-RING-001, SLV-PAYA-004, ART-NECK-002
const CAT_CODE = { gold: 'GLD', silver: 'SLV', special_design: 'ART' };
const typeCode = (key) => {
  const w = String(key || '').split('_').filter(Boolean);
  return (w.length > 1 ? w.map((x) => x[0]).join('') : (w[0] || 'GEN').slice(0, 4)).toUpperCase();
};
const makeSku = (list, category, type) => {
  const prefix = `${CAT_CODE[category] || 'GEN'}-${typeCode(type)}-`;
  const max = list.reduce((m, p) => {
    const s = String(p.sku || '').trim().toUpperCase();
    if (!s.startsWith(prefix)) return m;
    const n = parseInt(s.slice(prefix.length), 10);
    return Number.isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
};
const typesFor = (category, metal) => (category === 'silver' || (category === 'special_design' && metal === 'silver') ? SILVER_TYPES : GOLD_TYPES);
// Metal is decided by category (special_design lets you choose gold or silver)
const METAL_BY_CATEGORY = { gold: 'gold', silver: 'silver' };

const blank = { category: 'gold', type: 'ring', subType: '', productId: '', name: '', sku: '', metal: 'gold', purity: '22K', defaultPriceMethod: 'weight', defaultWastagePercent: '', defaultMakingType: 'percent', defaultMakingValue: '' };
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
  const cat = cats.find((c) => c.key === f.type);
  const baseTypes = typesFor(f.category, f.metal);
  const artificial = f.category === 'special_design';
  const methods = artificial ? METHODS.filter(([k]) => k === 'fixed') : METHODS;
  const typeList = baseTypes.some((t) => t.key === f.type) || !f.type ? baseTypes : [...baseTypes, { key: f.type, label: f.type }];
  const subs = typeList.find((t) => t.key === f.type)?.subs || [];
  const purityOpts = (() => { const o = PURITY_OPTS[f.metal] || []; return !f.purity || o.some(([v]) => v === f.purity) ? o : [...o, [f.purity, f.purity]]; })();
  const locked = !!f.productId;
  // Existing product keeps its own SKU; a new product gets the next running number.
  const nextSku = locked ? f.sku : makeSku(products, f.category, f.type);
  // Existing products shown for the selected category only
  const visible = products.filter((p) => (f.category === 'special_design' ? p.collection === 'special_design' : p.metal === f.category && p.collection !== 'special_design'));
  const prodOpt = (p) => <option key={p._id} value={p._id}>{p.name}{p.sku ? ` (${p.sku})` : ''}{p.purity ? ` - ${p.purity}` : ''}</option>;

  const chooseCategory = (key) => { const m = METAL_BY_CATEGORY[key] || 'gold'; setF({ ...blank, category: key, metal: m, purity: DEFAULT_PURITY[m], type: typesFor(key, m)[0].key, defaultPriceMethod: key === 'special_design' ? 'fixed' : 'weight' }); setPiece({ ...piece, attrs: {} }); };
  const chooseProduct = (id) => {
    const p = products.find((x) => x._id === id);
    setF(p
      ? {
        ...f,
        productId: id,
        type: p.category,
        subType: p.subType || '',
        category: p.collection || (p.metal === 'silver' ? 'silver' : 'gold'),
        name: p.name,
        // old products without a SKU still show one (preview only; the saved product is not changed)
        sku: p.sku || makeSku(products, p.collection || (p.metal === 'silver' ? 'silver' : 'gold'), p.category),
        metal: p.metal,
        purity: p.purity,
        defaultPriceMethod: p.defaultPriceMethod || 'weight',
        defaultWastagePercent: p.defaultWastagePercent ?? '',
        defaultMakingType: p.defaultMakingType,
        defaultMakingValue: p.defaultMakingValue ?? '',
      }
      : { ...blank, defaultPriceMethod: f.category === 'special_design' ? 'fixed' : 'weight', category: f.category, metal: f.metal === 'silver' ? 'silver' : 'gold', purity: DEFAULT_PURITY[f.metal === 'silver' ? 'silver' : 'gold'], type: typesFor(f.category, f.metal)[0].key });
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
      // Get the latest product list so the new SKU number is based on what is really saved.
      let list = products;
      if (!f.productId) {
        try { list = (await api.get('/products')).data; setProducts(list); } catch { /* use the list already loaded */ }
      }
      // If the server says the SKU is already taken, go to the next number and try again.
      const taken = [];
      let sku = f.sku;
      let data = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        if (!f.productId) sku = makeSku([...list, ...taken.map((s) => ({ sku: s }))], f.category, f.type);
        try {
          ({ data } = await api.post('/products/register', {
            productId: f.productId || undefined,
            product: f.productId ? undefined : { name: f.name, sku, category: f.type, subType: f.subType || undefined, collection: f.category, metal: f.metal, purity: f.purity, defaultPriceMethod: f.defaultPriceMethod, defaultWastagePercent: num(f.defaultWastagePercent), defaultMakingType: f.defaultMakingType, defaultMakingValue: num(f.defaultMakingValue) },
            piece: withPiece ? { barcode: piece.barcode, name: piece.name || undefined, grossWeight: gross, stoneWeight: stone, stoneValue: num(piece.stoneValue), costPrice: num(piece.costPrice), fixedPrice: num(piece.fixedPrice), attrs: piece.attrs } : undefined,
          }));
          break;
        } catch (x) {
          if (!f.productId && attempt < 9 && /sku/i.test(errMsg(x))) { taken.push(sku); continue; }
          throw x;
        }
      }
      setSaved(data);
      setProducts((ps) => (ps.some((p) => p._id === data.product._id) ? ps : [...ps, data.product]));
      setF((cur) => ({ ...cur, productId: data.product._id, sku: data.product.sku || sku }));
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

        <section className="card flex items-center gap-4 overflow-x-auto px-4 py-3">
          <div id="cat-label" className="label !mb-0 shrink-0 whitespace-nowrap font-extrabold text-ink">Category</div>
          <div role="radiogroup" aria-labelledby="cat-label" className="inline-flex shrink-0 gap-1 rounded-lg border border-paper-line bg-slate-50 p-1">
            {COLLECTIONS.map(([k, l]) => (
              <button type="button" role="radio" aria-checked={f.category === k} key={k} onClick={() => chooseCategory(k)}
                className={`whitespace-nowrap rounded-md px-5 py-1.5 text-sm font-semibold transition ${f.category === k ? 'bg-ink text-white shadow-sm' : 'text-slate-700 hover:bg-white'}`}>{l}</button>
            ))}
          </div>
        </section>

        <section className="card grid gap-4 p-4 md:grid-cols-2">
          <h2 className="font-extrabold text-ink md:col-span-2">Product type</h2>
          <div className="md:col-span-2">{fld('Use an existing product', 'pp', <select id="pp" className="input" value={f.productId} onChange={(e) => chooseProduct(e.target.value)}><option value="">New product</option>{visible.map(prodOpt)}</select>)}</div>
          <div className="md:col-span-2">{fld('Name', 'pn', <input id="pn" required disabled={locked} className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />)}</div>
          <div className="md:col-span-2">{fld('SKU (auto)', 'psku', <input id="psku" readOnly className="input bg-slate-50" value={nextSku} />)}</div>
          {fld('Type', 'pt', <select id="pt" disabled={locked} className="input" value={f.type} onChange={(e) => { setF({ ...f, type: e.target.value, subType: '' }); setPiece({ ...piece, attrs: {} }); }}>{typeList.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>)}
          {subs.length > 0 && fld('Sub type', 'pst', <select id="pst" disabled={locked} className="input" value={f.subType} onChange={(e) => setF({ ...f, subType: e.target.value })}><option value="">Choose</option>{subs.map((x) => <option key={x} value={x}>{x}</option>)}</select>)}
          {f.category === 'special_design' && fld('Metal', 'pm', <select id="pm" disabled={locked} className="input" value={f.metal} onChange={(e) => { const m = e.target.value; setF({ ...f, metal: m, purity: DEFAULT_PURITY[m], type: typesFor(f.category, m)[0].key, subType: '' }); }}><option value="gold">Gold</option><option value="silver">Silver</option></select>)}
          {fld('Purity', 'pu', <select id="pu" required disabled={locked} className="input" value={f.purity} onChange={(e) => setF({ ...f, purity: e.target.value })}>{purityOpts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>)}
          <div className="md:col-span-2">{fld('Price method', 'pq', <select id="pq" disabled={locked || artificial} className="input" value={f.defaultPriceMethod} onChange={(e) => setF({ ...f, defaultPriceMethod: e.target.value })}>{methods.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>)}</div>
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
              <LabelCard shop={settings.shopName || 'Your shop'} name={piece.name || f.name || 'Product name'} purity={f.purity} netWeight={net.toFixed(3)} sku={nextSku} barcode={piece.barcode || 'WN000000'} category={f.type} attrs={piece.attrs} categories={cats} />
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
