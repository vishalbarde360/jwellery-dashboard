import { useEffect, useState } from 'react';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { Notice } from '../components/Bits';

export default function Settings() {
  const { settings, refreshSettings } = useAuth();
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { setF({ ...settings }); }, [settings]);
  if (!f) return null;

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const logo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 200 * 1024) return setMsg({ type: 'err', text: 'Logo must be under 200 KB' });
    const r = new FileReader();
    r.onload = () => setF({ ...f, logo: r.result });
    r.readAsDataURL(file);
  };
  const save = async (e) => {
    e.preventDefault();
    try {
      const body = { ...f };
      for (const k of ['gstPercent', 'roundTo', 'maxDiscountPercent', 'maxManagerRefund', 'maxRateChangePercent']) { if (body[k] === undefined || body[k] === '' || body[k] === null) delete body[k]; else body[k] = Number(body[k]); }
      for (const k of ['_id', '__v', 'createdAt', 'updatedAt', 'tenant', 'branch']) delete body[k];
      await api.put('/settings', body); await refreshSettings(); setMsg({ type: 'ok', text: 'Saved. Bills already made keep the details they were made with.' });
    } catch (x) { setMsg({ type: 'err', text: errMsg(x) }); }
  };

  return (
    <form onSubmit={save} className="max-w-3xl space-y-5">
      <h1 className="text-2xl font-extrabold text-ink">Shop setup</h1>
      <Notice msg={msg} />
      <section className="card grid gap-4 p-4 md:grid-cols-2">
        <div className="md:col-span-2"><label className="label" htmlFor="s1">Shop name</label><input id="s1" required className="input" value={f.shopName || ''} onChange={set('shopName')} /></div>
        <div><label className="label" htmlFor="s2">GSTIN</label><input id="s2" className="input uppercase" value={f.gstin || ''} onChange={set('gstin')} placeholder="27ABCDE1234F1Z5" /></div>
        <div><label className="label" htmlFor="s3">Phone</label><input id="s3" className="input" value={f.phone || ''} onChange={set('phone')} /></div>
        <div className="md:col-span-2"><label className="label" htmlFor="s4">Address</label><input id="s4" className="input" value={f.address || ''} onChange={set('address')} /></div>
        <div><label className="label" htmlFor="s5">Time zone</label><input id="s5" className="input" value={f.timezone || ''} onChange={set('timezone')} /><p className="mt-1 text-xs text-slate-500">For example Asia/Kolkata. Dates on bills and reports follow this.</p></div>
        <div><label className="label" htmlFor="s6">Logo (PNG, JPG or WebP, under 200 KB)</label><input id="s6" type="file" accept="image/png,image/jpeg,image/webp" onChange={logo} className="text-sm" />
          {f.logo && <div className="mt-2 flex items-center gap-3"><img src={f.logo} alt="Logo preview" className="h-12" /><button type="button" className="text-xs font-semibold text-ruby underline" onClick={() => setF({ ...f, logo: '' })}>Remove</button></div>}</div>
      </section>
      <section className="card grid gap-4 p-4 md:grid-cols-3">
        <h2 className="font-extrabold text-ink md:col-span-3">Numbering and rules</h2>
        <div><label className="label" htmlFor="n1">Invoice prefix</label><input id="n1" className="input" value={f.invoicePrefix || ''} onChange={set('invoicePrefix')} /><p className="mt-1 text-xs text-slate-500">Bills read INV-000001, INV-000002 and so on.</p></div>
        <div><label className="label" htmlFor="n2">Barcode prefix</label><input id="n2" className="input" value={f.barcodePrefix || ''} onChange={set('barcodePrefix')} /></div>
        <div><label className="label" htmlFor="n3">GST %</label><input id="n3" type="number" step="0.01" className="input" value={f.gstPercent ?? ''} onChange={set('gstPercent')} /></div>
        <div><label className="label" htmlFor="n4">Largest discount a manager can give (%)</label><input id="n4" type="number" step="0.1" className="input" value={f.maxDiscountPercent ?? ''} onChange={set('maxDiscountPercent')} /></div>
        <div><label className="label" htmlFor="n5">Largest return a manager can approve (₹)</label><input id="n5" type="number" className="input" value={f.maxManagerRefund ?? ''} onChange={set('maxManagerRefund')} /></div>
        <div><label className="label" htmlFor="n6">Round each bill line to (₹)</label><input id="n6" type="number" className="input" value={f.roundTo ?? ''} onChange={set('roundTo')} /></div>
        <div><label className="label" htmlFor="n7">Ask to confirm a metal rate change bigger than (%)</label><input id="n7" type="number" className="input" value={f.maxRateChangePercent ?? 10} onChange={set('maxRateChangePercent')} /></div>
        <div><label className="label" htmlFor="n8">Stock valuation for the margin report</label><select id="n8" className="input" value={f.stockValuation || 'purchase_cost'} onChange={set('stockValuation')}><option value="purchase_cost">Purchase cost of each piece</option><option value="weighted_average">Weighted average cost per gram</option></select></div>
      </section>
      <button className="btn-primary">Save</button>
    </form>
  );
}
