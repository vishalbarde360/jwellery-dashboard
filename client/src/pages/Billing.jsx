import { useEffect, useRef, useState } from 'react';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { money, newKey } from '../status';
import { Notice } from '../components/Bits';
import InvoiceView from '../components/InvoiceView';
import FormatToggle from '../components/FormatToggle';
import { waLink } from '../whatsapp';

const MAROON = '#4a1424';
const GOLD = '#b8892f';
const card = 'rounded-xl border border-[#ece2d0] bg-white shadow-sm';
const input = 'w-full rounded-lg border border-[#e2d5bc] bg-white px-3 py-2 text-sm outline-none focus:border-[#b8892f] focus:ring-2 focus:ring-[#b8892f]/30';
const lab = 'mb-1 block text-[11px] font-semibold text-stone-500';
const btnGhost = 'rounded-lg border border-[#e2d5bc] bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-[#f6ead0] disabled:opacity-40';
const btnMain = 'rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-40';
const kbd = 'rounded border border-[#e2d5bc] bg-white px-1.5 py-0.5 text-[10px] font-bold text-stone-500';

// Payment modes: same keys the server already accepts.
const MODES = [['cash', 'Cash'], ['upi', 'UPI / QR'], ['card', 'POS Card'], ['bank', 'NEFT / RTGS']];
const r2 = (n) => Math.round(n * 100) / 100;
const timeNow = () => new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });

// WhatsApp always opens in the same named tab, so a second bill reuses the WhatsApp Web tab that is already open.
const WA_TAB = 'wa_tab';
// Closes a tab only if it is a blank one we just opened. An existing WhatsApp Web tab is on another site, so the
// check throws and the tab is left alone.
const closeIfBlank = (w) => { try { if (w && w.location.href === 'about:blank') w.close(); } catch { /* existing WhatsApp tab: leave it open */ } };

const Pencil = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></svg>;
const Trash = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>;

// Builds the WhatsApp link for a saved invoice and a customer.
const waFor = (cust, inv) => (cust?.phone ? waLink(cust.phone, {
  customerName: cust.name,
  number: inv?.number || inv?.invoiceNo || '',
  total: inv?.grandTotal ?? inv?.total ?? '',
  publicUrl: inv?.publicUrl,
}) : null);

function Tile({ label, value }) {
  return (
    <div className={`${card} px-4 py-3`}>
      <div className="text-[11px] font-semibold text-stone-500">{label}</div>
      <div className="text-lg font-extrabold" style={{ color: MAROON }}>{value}</div>
    </div>
  );
}

export default function Billing() {
  const { can, user } = useAuth();
  const scanRef = useRef(null);
  const keyRef = useRef({ sig: '', key: '' }); // one key per distinct request, reused on retry
  const [codes, setCodes] = useState([]);
  const [code, setCode] = useState('');
  const [discount, setDiscount] = useState('');
  const [discMode, setDiscMode] = useState('inr'); // inr | pct
  const [pos, setPos] = useState(''); // buyer's GST state code; empty = same state as the shop (CGST + SGST)
  const [overrides, setOverrides] = useState({}); // barcode -> { price, reason }
  const [editing, setEditing] = useState(null);   // barcode whose price is being changed
  const [ov, setOv] = useState({ price: '', reason: '' });
  const [customer, setCustomer] = useState(null); // { _id, name, phone }
  const [cq, setCq] = useState('');
  const [found, setFound] = useState([]);
  const [newC, setNewC] = useState(null);
  const [quote, setQuote] = useState(null);
  const [quoteAt, setQuoteAt] = useState('');
  const [pays, setPays] = useState([{ mode: 'cash', amount: '' }]);
  const [msg, setMsg] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const [format, setFormat] = useState('a4');

  const overrideList = Object.entries(overrides).map(([barcode, o]) => ({ barcode, price: Number(o.price), reason: o.reason }));

  // The discount sent to the server is always in rupees. In % mode it is worked out from the line totals.
  const linesTotal = quote?.lines?.reduce((s, l) => s + Number(l.price.total || 0), 0) || 0;
  const effDiscount = discMode === 'pct' ? r2((linesTotal * (Number(discount) || 0)) / 100) : Number(discount) || 0;

  // Show the price whenever the tags, discount or a manager's price change moves.
  useEffect(() => {
    if (!codes.length) { setQuote(null); return; }
    let live = true;
    api.post('/invoices/preview', { barcodes: codes, discount: effDiscount, overrides: overrideList, placeOfSupply: pos || undefined })
      .then((r) => { if (live) { setQuote(r.data); setQuoteAt(timeNow()); setMsg(null); } })
      .catch((e) => { if (live) { setQuote(null); setMsg({ type: 'err', text: errMsg(e) }); } });
    return () => { live = false; };
  }, [codes, effDiscount, overrides, pos]); // eslint-disable-line

  useEffect(() => { if (quote && pays.length === 1) setPays([{ ...pays[0], amount: String(quote.grandTotal) }]); }, [quote?.grandTotal]); // eslint-disable-line
  useEffect(() => { setConfirming(false); }, [codes, discount, discMode, overrides, pays, customer]);

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
  const left = r2(total - paid);
  const valid = quote && left === 0 && pays.every((p) => Number(p.amount) > 0) && !saving;

  // Figures for the summary tiles and breakdown, all worked out from the server's quote.
  const lines = quote?.lines || [];
  const sum = (f) => lines.reduce((s, l) => s + Number(f(l) || 0), 0);
  const metalTotal = sum((l) => l.price.metalValue);
  const makingTotal = sum((l) => Number(l.price.making || 0) + Number(l.price.wastage || 0));
  const taxable = quote ? r2(Number(quote.subtotal) - Number(quote.discount || 0)) : 0;
  const tax = quote ? Number(quote.cgst || 0) + Number(quote.sgst || 0) + Number(quote.igst || 0) : 0;
  const roundOff = quote ? r2(total - (taxable + tax)) : 0;

  const save = async () => {
    const body = { barcodes: codes, discount: effDiscount, overrides: overrideList, placeOfSupply: pos || undefined, customerId: customer?._id, payments: pays.map((p) => ({ mode: p.mode, amount: Number(p.amount) })) };
    const sig = JSON.stringify(body);
    if (keyRef.current.sig !== sig) keyRef.current = { sig, key: newKey() };

    // Grab the WhatsApp tab right now, inside the click, so the browser does not block it.
    // If a tab named wa_tab is already open (WhatsApp Web), it is reused. Walk-in bills skip this.
    const wa = customer?.phone ? window.open('', WA_TAB) : null;

    setSaving(true); setMsg(null);
    try {
      const { data } = await api.post('/invoices', body, { headers: { 'Idempotency-Key': keyRef.current.key } });
      setDone(data); // "Paid" is only ever shown after the server confirms the save
      const link = waFor(customer, data);
      if (wa) {
        if (link) { wa.location.href = link; wa.focus(); } else closeIfBlank(wa);
      }
    } catch (x) {
      closeIfBlank(wa);
      setConfirming(false);
      setMsg({ type: 'err', text: x.response ? `Bill not saved. ${errMsg(x)}. Nothing was recorded and the pieces are still unsold.` : "We couldn't confirm whether the bill was saved. Press Save again. It will not create a second bill." });
    } finally { setSaving(false); }
  };

  // Manual resend from the "Paid" screen, in case the tab was blocked or closed.
  const sendWhatsApp = () => {
    const link = waFor(customer, done);
    if (!link) return;
    const w = window.open(link, WA_TAB);
    w?.focus();
  };

  const reset = () => { setCodes([]); setDiscount(''); setDiscMode('inr'); setPos(''); setOverrides({}); setCustomer(null); setPays([{ mode: 'cash', amount: '' }]); setDone(null); setMsg(null); setConfirming(false); keyRef.current = { sig: '', key: '' }; };
  const setPay = (i, patch) => setPays(pays.map((x, j) => (j === i ? { ...x, ...patch } : x)));

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
      <div className="space-y-4 bg-[#fbf6ee] p-4 md:p-6">
        <div className={`${card} flex flex-wrap items-center gap-3 p-4 print:hidden`}>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-800">Paid</span>
          <FormatToggle value={format} onChange={setFormat} />
          <button className={btnMain} style={{ background: MAROON }} onClick={() => window.print()}>Print invoice</button>
          {customer?.phone && <button className={btnMain} style={{ background: '#1f9d55' }} onClick={sendWhatsApp}>Send on WhatsApp</button>}
          <button className={btnGhost} onClick={reset}>New bill</button>
        </div>
        <InvoiceView invoice={done} format={format} />
      </div>
    );
  }

  return (
    <div className="grid gap-5 bg-[#fbf6ee] p-4 md:p-6 lg:grid-cols-[minmax(0,1fr)_23rem]">
      {/* ───────── Left column ───────── */}
      <div className="space-y-4">
        <div className={`${card} flex flex-wrap items-center justify-between gap-3 p-4`}>
          <div>
            <h1 className="text-xl font-extrabold" style={{ color: MAROON }}>Active Register{user?.name ? `: ${user.name}` : ''}</h1>
            <p className="text-xs font-semibold text-[#7a5a12]">{quote ? `Rates applied @ ${quoteAt}` : 'Rates are applied when the first piece is added'}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-stone-500">
            <span><span className={kbd}>F2</span> Focus scanner</span>
            <span><span className={kbd}>F9</span> Pay & print</span>
            <span><span className={kbd}>Esc</span> Back</span>
          </div>
        </div>

        <form onSubmit={scan} className="flex gap-2">
          <label htmlFor="scan" className="sr-only">Scan tag</label>
          <input id="scan" ref={scanRef} autoFocus className={`${input} !rounded-xl !py-3 text-base`} placeholder="Scan HUID / RFID, or type the barcode and press Enter" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className={`${btnMain} !rounded-xl px-6`} style={{ background: MAROON }}>Add Piece</button>
        </form>
        <Notice msg={msg} />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Total pieces" value={`${codes.length} item${codes.length === 1 ? '' : 's'}`} />
          <Tile label="Gross weight" value={`${sum((l) => l.grossWeight).toFixed(3)} g`} />
          <Tile label="Net gold weight" value={`${sum((l) => l.netWeight).toFixed(3)} g`} />
          <Tile label="Making & wastage" value={money(makingTotal)} />
        </div>

        <div className={`${card} overflow-hidden`}>
          <div className="flex flex-wrap items-center gap-3 border-b border-[#f0e6d4] p-4">
            <h2 className="font-extrabold" style={{ color: MAROON }}>Billed Ornaments & Articles</h2>
            <span className="rounded-full bg-[#f6ead0] px-3 py-0.5 text-xs font-bold text-[#7a5a12]">{codes.length} piece{codes.length === 1 ? '' : 's'} in tray</span>
            {codes.length > 0 && <button className={`${btnGhost} ml-auto`} onClick={() => { setCodes([]); setOverrides({}); }}>Clear Tray</button>}
          </div>

          {!codes.length ? (
            <div className="p-8 text-center text-sm text-stone-500">No pieces yet. Scan the first tag to start the bill.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead><tr className="border-b border-[#ece2d0] text-[11px] text-stone-500">
                  {['Item', 'Stone / Enamel', 'Net wt (g)', 'Rate & making', 'Total taxable (₹)', 'Action'].map((h) => <th key={h} className="p-3 font-semibold">{h}</th>)}
                </tr></thead>
                <tbody>
                  {codes.map((c) => {
                    const l = lines.find((x) => x.barcode === c);
                    return (
                      <FragmentRow key={c}>
                        <tr className="border-b border-[#f3ebdc] align-top">
                          <td className="p-3"><div className="font-bold" style={{ color: MAROON }}>{l?.name || c}</div><div className="text-xs text-stone-500">{c}{l && ` · ${l.metal} ${l.purity}`}</div>
                            {l?.price.overridden && <div className="mt-1 text-[11px] font-semibold text-[#7a5a12]">Price changed from {money(l.price.originalSubtotal)} to {money(l.price.subtotal)}: {l.price.overrideReason}</div>}</td>
                          <td className="p-3">{l ? <><div className="font-semibold">{Math.max(Number(l.grossWeight) - Number(l.netWeight), 0).toFixed(3)} g</div><div className="text-xs text-stone-500">Stones {money(l.price.stones)}</div></> : '…'}</td>
                          <td className="p-3">{l ? <><div className="font-bold">{Number(l.netWeight).toFixed(3)} g</div><div className="text-xs text-[#7a5a12]">Metal: {money(l.price.metalValue)}</div></> : '…'}</td>
                          <td className="p-3">{l ? <><div className="font-bold">{money(Number(l.price.making || 0) + Number(l.price.wastage || 0))}</div><div className="text-xs text-stone-500">{l.ratePerGram ? `@ ${money(l.ratePerGram)}/g` : 'Fixed price'}{l.price.fixedPrice > 0 && ` + fixed ${money(l.price.fixedPrice)}`}</div></> : '…'}</td>
                          <td className="p-3 text-base font-extrabold" style={{ color: MAROON }}>{l ? money(l.price.total) : '…'}</td>
                          <td className="p-3"><div className="flex items-center gap-3 text-stone-500">
                            {can('price.override') && (overrides[c]
                              ? <button className="text-xs font-semibold underline" onClick={() => { const n = { ...overrides }; delete n[c]; setOverrides(n); }}>Undo price</button>
                              : <button aria-label="Change price" title="Change price" className="hover:text-[#4a1424]" onClick={() => { setEditing(c); setOv({ price: String(l?.price.subtotal ?? ''), reason: '' }); }}><Pencil /></button>)}
                            <button aria-label="Remove piece" title="Remove" className="hover:text-red-700" onClick={() => { setCodes(codes.filter((x) => x !== c)); const n = { ...overrides }; delete n[c]; setOverrides(n); }}><Trash /></button>
                          </div></td>
                        </tr>
                        {editing === c && (
                          <tr className="border-b border-[#f3ebdc] bg-[#fbf1d8]/60"><td colSpan={6} className="p-3">
                            <div className="flex flex-wrap items-end gap-2">
                              <div><label className={lab} htmlFor="op">New price before tax (₹)</label><input id="op" className={`${input} !w-40`} inputMode="decimal" value={ov.price} onChange={(e) => setOv({ ...ov, price: e.target.value })} /></div>
                              <div className="min-w-[12rem] flex-1"><label className={lab} htmlFor="or">Reason (kept in the audit log)</label><input id="or" className={input} value={ov.reason} onChange={(e) => setOv({ ...ov, reason: e.target.value })} /></div>
                              <button className={btnMain} style={{ background: MAROON }} disabled={!ov.reason.trim() || !(Number(ov.price) >= 0) || ov.price === ''} onClick={() => { setOverrides({ ...overrides, [c]: ov }); setEditing(null); }}>Apply</button>
                              <button className={btnGhost} onClick={() => setEditing(null)}>Cancel</button>
                            </div>
                          </td></tr>
                        )}
                      </FragmentRow>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ───────── Right column ───────── */}
      <aside className="space-y-4">
        {can('customers.read') && (
          <div className={`${card} space-y-3 p-4`}>
            <h2 className="font-extrabold" style={{ color: MAROON }}>Customer Details</h2>
            {customer ? (
              <div className="flex items-center gap-3 rounded-lg bg-[#faf4e8] p-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-extrabold text-white" style={{ background: GOLD }}>{(customer.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</div>
                <div className="min-w-0 flex-1"><div className="truncate font-bold" style={{ color: MAROON }}>{customer.name}</div><div className="text-xs text-stone-500">{customer.phone}</div></div>
                <button className="text-xs font-semibold text-red-700 underline" onClick={() => setCustomer(null)}>Remove</button>
              </div>
            ) : newC ? (
              <form onSubmit={addCustomer} className="space-y-2">
                <input aria-label="Customer name" className={input} placeholder="Name" required value={newC.name} onChange={(e) => setNewC({ ...newC, name: e.target.value })} />
                <input aria-label="Customer phone" className={input} placeholder="Phone" inputMode="tel" required value={newC.phone} onChange={(e) => setNewC({ ...newC, phone: e.target.value })} />
                <div className="flex gap-2"><button className={btnMain} style={{ background: MAROON }}>Save customer</button><button type="button" className={btnGhost} onClick={() => setNewC(null)}>Cancel</button></div>
              </form>
            ) : (
              <>
                <input aria-label="Find customer" className={input} placeholder="Find by name or phone" value={cq} onChange={(e) => setCq(e.target.value)} />
                {found.map((c) => <button key={c._id} className="block w-full rounded-lg border border-[#f0e6d4] p-2 text-left text-sm hover:bg-[#faf4e8]" onClick={() => { setCustomer(c); setCq(''); setFound([]); }}>{c.name} · {c.phone}</button>)}
                <div className="flex items-center justify-between text-xs">
                  <label className="flex items-center gap-2 text-stone-600"><input type="checkbox" checked readOnly /> Walk-in (anonymous)</label>
                  {can('customers.write') && <button className="font-semibold underline" style={{ color: MAROON }} onClick={() => setNewC({ name: '', phone: cq.replace(/\D/g, '') })}>+ New customer</button>}
                </div>
              </>
            )}
          </div>
        )}

        <div className={`${card} space-y-2 p-4 text-sm`}>
          <div className="flex items-center justify-between"><h2 className="font-extrabold" style={{ color: MAROON }}>Billing Breakdown</h2><span className="text-[11px] text-stone-500">State code: {pos || 'shop state'}</span></div>
          <div className="flex justify-between"><span className="text-stone-600">Gross metal value</span><b>{money(metalTotal)}</b></div>
          <div className="flex justify-between"><span className="text-stone-600">Making & wastage charges</span><b>{money(makingTotal)}</b></div>
          <div className="flex justify-between"><span className="text-stone-600">Value</span><b>{money(quote?.subtotal)}</b></div>

          {can('billing.discount') && (
            <div className="rounded-lg bg-[#fbf1d8] p-3">
              <div className="mb-1 flex items-center justify-between text-xs font-semibold text-[#7a5a12]"><label htmlFor="ds">Discount</label>{quote?.discount > 0 && <span>− {money(quote.discount)}</span>}</div>
              <div className="flex items-stretch gap-2">
                <input id="ds" className={`${input} min-w-0 flex-1`} inputMode="decimal" placeholder={discMode === 'pct' ? '0 %' : '0 ₹'} value={discount} onChange={(e) => setDiscount(e.target.value)} />
                <div className="flex shrink-0 gap-1 rounded-lg border border-[#e2d5bc] bg-white p-1" role="radiogroup" aria-label="Discount type">
                  {[['inr', '₹'], ['pct', '%']].map(([k, l]) => (
                    <button key={k} type="button" role="radio" aria-checked={discMode === k} onClick={() => setDiscMode(k)}
                      className={`grid w-9 place-items-center rounded-md text-sm font-bold transition ${discMode === k ? 'text-white shadow-sm' : 'text-stone-500 hover:bg-[#faf4e8]'}`}
                      style={discMode === k ? { background: MAROON } : {}}>{l}</button>
                  ))}
                </div>
              </div>
              <label className={`${lab} mt-2`} htmlFor="pos">Place of supply (state code, optional)</label>
              <input id="pos" className={input} inputMode="numeric" maxLength={2} placeholder="e.g. 27" value={pos} onChange={(e) => setPos(e.target.value.replace(/\D/g, ''))} />
            </div>
          )}

          <div className="flex justify-between border-t border-[#f0e6d4] pt-2"><span className="font-semibold">Taxable amount</span><b>{money(taxable)}</b></div>
          {quote?.igst > 0
            ? <div className="flex justify-between"><span className="text-stone-600">IGST</span><b>{money(quote.igst)}</b></div>
            : <>
                <div className="flex justify-between"><span className="text-stone-600">CGST</span><b>{money(quote?.cgst)}</b></div>
                <div className="flex justify-between"><span className="text-stone-600">SGST</span><b>{money(quote?.sgst)}</b></div>
              </>}
          {quote && roundOff !== 0 && <div className="flex justify-between text-stone-500"><span>Round off</span><span>{roundOff > 0 ? '+' : '−'}{money(Math.abs(roundOff))}</span></div>}

          <div className="mt-2 rounded-xl p-4 text-white" style={{ background: `linear-gradient(120deg, ${MAROON}, #6b2236)` }}>
            <div className="text-[11px] font-semibold opacity-80">Total net payable</div>
            <div className="text-3xl font-extrabold">{money(total)}</div>
          </div>
        </div>

        <div className={`${card} space-y-3 p-4`}>
          <div className="flex items-center justify-between"><h2 className="font-extrabold" style={{ color: MAROON }}>Payment Tender</h2>
            <button className="text-xs font-semibold underline" style={{ color: GOLD }} onClick={() => setPays([...pays, { mode: 'upi', amount: left > 0 ? String(left) : '' }])}>Split tender</button></div>
          {pays.map((p, i) => {
            const others = pays.reduce((t, x, j) => (j === i ? t : t + (Number(x.amount) || 0)), 0);
            return (
              <div key={i} className="space-y-2">
                <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Payment mode">
                  {MODES.map(([k, l]) => (
                    <button key={k} type="button" role="radio" aria-checked={p.mode === k} onClick={() => setPay(i, { mode: k })}
                      className={`rounded-lg border px-1 py-2.5 text-center text-[11px] font-bold ${p.mode === k ? 'text-white' : 'border-[#e2d5bc] bg-white text-stone-600 hover:bg-[#faf4e8]'}`} style={p.mode === k ? { background: MAROON, borderColor: MAROON } : {}}>{l}</button>
                  ))}
                </div>
                <div className="flex items-stretch gap-2">
                  <input aria-label="Amount" className={`${input} min-w-0 flex-1 text-lg font-extrabold`} inputMode="decimal" value={p.amount} onChange={(e) => setPay(i, { amount: e.target.value })} />
                  <button type="button" className={`${btnGhost} shrink-0 whitespace-nowrap`} disabled={!quote} onClick={() => setPay(i, { amount: String(Math.max(r2(total - others), 0)) })}>Exact ₹</button>
                  {pays.length > 1 && <button type="button" className="shrink-0 whitespace-nowrap text-xs font-semibold text-red-700" onClick={() => setPays(pays.filter((_, j) => j !== i))}>Remove</button>}
                </div>
              </div>
            );
          })}
          {quote && left !== 0 && <div className="text-sm font-semibold text-red-700">{left > 0 ? `${money(left)} still to pay` : `${money(-left)} too much`}</div>}
        </div>

        {/* Checkout stays disabled until everything is valid, then asks for one confirmation. */}
        {!confirming ? (
          <button className="w-full rounded-xl py-4 text-base font-extrabold text-white disabled:opacity-40" style={{ background: `linear-gradient(120deg, ${MAROON}, #6b2236)` }} disabled={!valid} onClick={() => setConfirming(true)}>
            Review & Generate Invoice <span className="ml-2 rounded bg-white/20 px-1.5 text-xs">F9</span>
          </button>
        ) : (
          <div className="space-y-2 rounded-xl border border-[#b8892f] bg-[#fbf1d8] p-4 text-sm">
            <div className="font-bold" style={{ color: MAROON }}>Save this bill?</div>
            <div>{codes.length} piece{codes.length > 1 ? 's' : ''}, total {money(total)}{customer ? `, for ${customer.name}` : ''}. Paid: {pays.map((p) => `${p.mode} ${money(p.amount)}`).join(', ')}.</div>
            {customer?.phone && <div className="text-xs font-semibold text-emerald-800">After saving, WhatsApp will open for {customer.phone}.</div>}
            <div className="flex gap-2"><button className={`${btnMain} flex-1`} style={{ background: MAROON }} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Confirm and save'}</button><button className={btnGhost} disabled={saving} onClick={() => setConfirming(false)}>Back</button></div>
          </div>
        )}
        <button className={`${btnGhost} w-full !py-2.5 !text-red-700`} onClick={reset}>Cancel bill</button>
      </aside>
    </div>
  );
}

// A table row pair (row + optional editor row) needs a keyed wrapper.
function FragmentRow({ children }) { return <>{children}</>; }
