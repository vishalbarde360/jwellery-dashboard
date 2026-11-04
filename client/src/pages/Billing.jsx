import { useEffect, useRef, useState } from 'react';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { money, newKey } from '../status';
import { Notice } from '../components/Bits';
import InvoiceView from '../components/InvoiceView';
import FormatToggle from '../components/FormatToggle';

const MODES = [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card'], ['bank', 'Bank transfer']];

export default function Billing() {
  const { can } = useAuth();
  const scanRef = useRef(null);
  const keyRef = useRef({ sig: '', key: '' }); // one key per distinct request, reused on retry
  const [codes, setCodes] = useState([]);
  const [code, setCode] = useState('');
  const [discount, setDiscount] = useState('');
  const [pos, setPos] = useState(''); // buyer's GST state code; empty = same state as the shop (CGST + SGST)
  const [overrides, setOverrides] = useState({}); // barcode -> { price, reason }
  const [editing, setEditing] = useState(null);   // barcode whose price is being changed
  const [ov, setOv] = useState({ price: '', reason: '' });
  const [customer, setCustomer] = useState(null); // { _id, name, phone }
  const [cq, setCq] = useState('');
  const [found, setFound] = useState([]);
  const [newC, setNewC] = useState(null);
  const [quote, setQuote] = useState(null);
  const [pays, setPays] = useState([{ mode: 'cash', amount: '' }]);
  const [msg, setMsg] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const [format, setFormat] = useState('a4');

  const overrideList = Object.entries(overrides).map(([barcode, o]) => ({ barcode, price: Number(o.price), reason: o.reason }));

  // Show the price whenever the tags, discount or a manager's price change moves.
  useEffect(() => {
    if (!codes.length) { setQuote(null); return; }
    let live = true;
    api.post('/invoices/preview', { barcodes: codes, discount: Number(discount) || 0, overrides: overrideList, placeOfSupply: pos || undefined })
      .then((r) => { if (live) { setQuote(r.data); setMsg(null); } })
      .catch((e) => { if (live) { setQuote(null); setMsg({ type: 'err', text: errMsg(e) }); } });
    return () => { live = false; };
  }, [codes, discount, overrides, pos]); // eslint-disable-line

  useEffect(() => { if (quote && pays.length === 1) setPays([{ ...pays[0], amount: String(quote.grandTotal) }]); }, [quote?.grandTotal]); // eslint-disable-line
  useEffect(() => { setConfirming(false); }, [codes, discount, overrides, pays, customer]);

  useEffect(() => {
    if (!can('customers.read') || cq.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(() => api.get('/customers', { params: { q: cq.trim() } }).then((r) => setFound(r.data.slice(0, 5))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [cq]); // eslint-disable-line

  const scan = async (e) => {
    e.preventDefault();
    const c = code.trim();
    if (!c) return;
    setCode('');
    if (codes.includes(c)) return setMsg({ type: 'err', text: `${c} is already on this bill` });
    try { await api.get(`/items/scan/${encodeURIComponent(c)}`); setCodes([...codes, c]); setMsg(null); }
    catch (x) { setMsg({ type: 'err', text: errMsg(x) }); }
    scanRef.current?.focus();
  };

  const addCustomer = async (e) => {
    e.preventDefault();
    try { const { data } = await api.post('/customers', newC); setCustomer(data); setNewC(null); }
    catch (x) { if (x.response?.data?.customer) { setCustomer(x.response.data.customer); setNewC(null); } else setMsg({ type: 'err', text: errMsg(x) }); }
  };

  const total = quote?.grandTotal ?? 0;
  const paid = pays.reduce((t, p) => t + (Number(p.amount) || 0), 0);
  const left = Math.round((total - paid) * 100) / 100;
  const valid = quote && left === 0 && pays.every((p) => Number(p.amount) > 0) && !saving;

  const save = async () => {
    const body = { barcodes: codes, discount: Number(discount) || 0, overrides: overrideList, placeOfSupply: pos || undefined, customerId: customer?._id, payments: pays.map((p) => ({ mode: p.mode, amount: Number(p.amount) })) };
    const sig = JSON.stringify(body);
    if (keyRef.current.sig !== sig) keyRef.current = { sig, key: newKey() };
    setSaving(true); setMsg(null);
    try {
      const { data } = await api.post('/invoices', body, { headers: { 'Idempotency-Key': keyRef.current.key } });
      setDone(data); // "Paid" is only ever shown after the server confirms the save
    } catch (x) {
      setConfirming(false);
      setMsg({ type: 'err', text: x.response ? `Bill not saved. ${errMsg(x)}. Nothing was recorded and the pieces are still unsold.` : "We couldn't confirm whether the bill was saved. Press Save again. It will not create a second bill." });
    } finally { setSaving(false); }
  };

  const reset = () => { setCodes([]); setDiscount(''); setPos(''); setOverrides({}); setCustomer(null); setPays([{ mode: 'cash', amount: '' }]); setDone(null); setMsg(null); setConfirming(false); keyRef.current = { sig: '', key: '' }; };

  // Keyboard friendly: F2 = scan field, F9 = review and save, Esc = back out of the confirmation.
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'F2') { e.preventDefault(); scanRef.current?.focus(); }
      else if (e.key === 'F9' && valid && !confirming) { e.preventDefault(); setConfirming(true); }
      else if (e.key === 'Escape') setConfirming(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  if (done) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          <span className="rounded bg-leaf-soft px-3 py-1 text-sm font-bold text-leaf">Paid</span>
          <FormatToggle value={format} onChange={setFormat} />
          <button className="btn-primary" onClick={() => window.print()}>Print invoice</button>
          <button className="btn-ghost" onClick={reset}>New bill</button>
        </div>
        <InvoiceView invoice={done} format={format} />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_23rem]">
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold text-ink">Billing</h1>
        <form onSubmit={scan} className="flex gap-2">
          <label htmlFor="scan" className="sr-only">Scan tag</label>
          <input id="scan" ref={scanRef} autoFocus className="input !py-3 text-base" placeholder="Scan the tag, or type the barcode and press Enter" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn-primary">Add</button>
        </form>
        <p className="text-xs text-slate-500">Keys: F2 scan field · F9 review and save · Esc go back</p>
        <Notice msg={msg} />

        {!codes.length ? (
          <div className="card p-8 text-center text-sm text-slate-500">No pieces yet. Scan the first tag to start the bill.</div>
        ) : (
          <div className="card divide-y divide-paper-line">
            {codes.map((c) => {
              const l = quote?.lines.find((x) => x.barcode === c);
              return (
                <div key={c} className="p-4 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-bold text-ink">{l?.name || c}</div>
                      <div className="text-slate-500">{c}{l && ` · ${l.metal} ${l.purity} · gross ${l.grossWeight} g · net ${l.netWeight} g${l.ratePerGram ? ` · ${money(l.ratePerGram)}/g` : ' · fixed price'}`}</div>
                      {l && <div className="mt-1 text-xs text-slate-500">Metal {money(l.price.metalValue)} + wastage {money(l.price.wastage)} + making {money(l.price.making)} + stones {money(l.price.stones)}{l.price.fixedPrice > 0 && ` + fixed ${money(l.price.fixedPrice)}`}</div>}
                      {l?.price.overridden && <div className="mt-1 text-xs font-semibold text-gold-deep">Price changed from {money(l.price.originalSubtotal)} to {money(l.price.subtotal)}: {l.price.overrideReason}</div>}
                    </div>
                    <div className="text-right">
                      <div className="font-extrabold">{l ? money(l.price.total) : '…'}</div>
                      <div className="flex justify-end gap-3 text-xs font-semibold">
                        {can('price.override') && (overrides[c]
                          ? <button className="text-ink-500 underline" onClick={() => { const n = { ...overrides }; delete n[c]; setOverrides(n); }}>Undo price change</button>
                          : <button className="text-ink-500 underline" onClick={() => { setEditing(c); setOv({ price: String(l?.price.subtotal ?? ''), reason: '' }); }}>Change price</button>)}
                        <button className="text-ruby underline" onClick={() => { setCodes(codes.filter((x) => x !== c)); const n = { ...overrides }; delete n[c]; setOverrides(n); }}>Remove</button>
                      </div>
                    </div>
                  </div>
                  {editing === c && (
                    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md bg-gold-soft/50 p-3">
                      <div><label className="label" htmlFor="op">New price before tax (₹)</label><input id="op" className="input !w-40" inputMode="decimal" value={ov.price} onChange={(e) => setOv({ ...ov, price: e.target.value })} /></div>
                      <div className="flex-1"><label className="label" htmlFor="or">Reason (kept in the audit log)</label><input id="or" className="input" value={ov.reason} onChange={(e) => setOv({ ...ov, reason: e.target.value })} /></div>
                      <button className="btn-primary" disabled={!ov.reason.trim() || !(Number(ov.price) >= 0) || ov.price === ''} onClick={() => { setOverrides({ ...overrides, [c]: ov }); setEditing(null); }}>Apply</button>
                      <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <aside className="card h-fit space-y-4 p-4">
        {can('customers.read') && (
          <div>
            <div className="label">Customer</div>
            {customer ? (
              <div className="flex items-center justify-between rounded-md bg-paper p-2 text-sm"><span><b>{customer.name}</b> {customer.phone}</span><button className="text-xs font-semibold text-ruby underline" onClick={() => setCustomer(null)}>Remove</button></div>
            ) : newC ? (
              <form onSubmit={addCustomer} className="space-y-2">
                <input aria-label="Customer name" className="input" placeholder="Name" required value={newC.name} onChange={(e) => setNewC({ ...newC, name: e.target.value })} />
                <input aria-label="Customer phone" className="input" placeholder="Phone" inputMode="tel" required value={newC.phone} onChange={(e) => setNewC({ ...newC, phone: e.target.value })} />
                <div className="flex gap-2"><button className="btn-primary">Save customer</button><button type="button" className="btn-ghost" onClick={() => setNewC(null)}>Cancel</button></div>
              </form>
            ) : (
              <>
                <input aria-label="Find customer" className="input" placeholder="Find by name or phone (or skip for walk-in)" value={cq} onChange={(e) => setCq(e.target.value)} />
                {found.map((c) => <button key={c._id} className="mt-1 block w-full rounded-md border border-paper-line p-2 text-left text-sm hover:bg-paper" onClick={() => { setCustomer(c); setCq(''); setFound([]); }}>{c.name} · {c.phone}</button>)}
                {can('customers.write') && <button className="mt-2 text-sm font-semibold text-ink-500 underline" onClick={() => setNewC({ name: '', phone: cq.replace(/\D/g, '') })}>Add new customer</button>}
              </>
            )}
          </div>
        )}
        {can('billing.discount') && (
          <>
            <div>
              <label className="label" htmlFor="ds">Discount (₹)</label>
              <input
                id="ds"
                className="input"
                inputMode="decimal"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="pos">
                Place of supply (state code, optional)
              </label>
              <input
                id="pos"
                className="input"
                inputMode="numeric"
                maxLength={2}
                placeholder="e.g. 27"
                value={pos}
                onChange={(e) => setPos(e.target.value.replace(/\D/g, ''))}
              />
            </div>
          </>
        )}

        <dl className="space-y-1 border-t border-paper-line pt-3 text-sm">
          <div className="flex justify-between"><dt>Value</dt><dd>{money(quote?.subtotal)}</dd></div>
          {quote?.discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>-{money(quote.discount)}</dd></div>}
          {quote?.igst > 0
            ? <div className="flex justify-between"><dt>IGST</dt><dd>{money(quote.igst)}</dd></div>
            : <>
                <div className="flex justify-between"><dt>CGST</dt><dd>{money(quote?.cgst)}</dd></div>
                <div className="flex justify-between"><dt>SGST</dt><dd>{money(quote?.sgst)}</dd></div>
              </>}
          <div className="flex justify-between text-lg font-extrabold text-ink"><dt>Total</dt><dd>{money(total)}</dd></div>
        </dl>

        <div className="space-y-2 border-t border-paper-line pt-3">
          <div className="text-sm font-semibold">Payment</div>
          {pays.map((p, i) => (
            <div key={i} className="flex gap-2">
              <select aria-label="Payment mode" className="input !w-32" value={p.mode} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, mode: e.target.value } : x)))}>{MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <input aria-label="Amount" className="input" inputMode="decimal" value={p.amount} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              {pays.length > 1 && <button className="text-xs font-semibold text-ruby" onClick={() => setPays(pays.filter((_, j) => j !== i))}>Remove</button>}
            </div>
          ))}
          <button className="text-sm font-semibold text-ink-500 underline" onClick={() => setPays([...pays, { mode: 'upi', amount: left > 0 ? String(left) : '' }])}>Split payment</button>
          {quote && left !== 0 && <div className="text-sm font-semibold text-ruby">{left > 0 ? `${money(left)} still to pay` : `${money(-left)} too much`}</div>}
        </div>

        {/* Checkout stays disabled until everything is valid, then asks for one confirmation. */}
        {!confirming ? (
          <button className="btn-gold w-full !py-3 text-base" disabled={!valid} onClick={() => setConfirming(true)}>Review and save</button>
        ) : (
          <div className="space-y-2 rounded-md border border-gold bg-gold-soft/40 p-3 text-sm">
            <div className="font-bold text-ink">Save this bill?</div>
            <div>{codes.length} piece{codes.length > 1 ? 's' : ''}, total {money(total)}{customer ? `, for ${customer.name}` : ''}. Paid: {pays.map((p) => `${p.mode} ${money(p.amount)}`).join(', ')}.</div>
            <div className="flex gap-2"><button className="btn-gold flex-1" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Confirm and save'}</button><button className="btn-ghost" disabled={saving} onClick={() => setConfirming(false)}>Back</button></div>
          </div>
        )}
      </aside>
    </div>
  );
}
