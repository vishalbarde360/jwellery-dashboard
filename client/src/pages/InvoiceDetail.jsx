import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { money } from '../status';
import { fmtDateTime } from '../format';
import { Badge, Notice, Table } from '../components/Bits';
import InvoiceView from '../components/InvoiceView';
import FormatToggle from '../components/FormatToggle';
import PriceBreakup from '../components/PriceBreakup';

// Drill-down target: everything behind one bill.
export default function InvoiceDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { settings } = useAuth();
  const [d, setD] = useState(null);
  const [tab, setTab] = useState('details');
  const [format, setFormat] = useState('a4');
  const [msg, setMsg] = useState(null);
  useEffect(() => { api.get(`/invoices/${id}/detail`).then((r) => setD(r.data)).catch((e) => setMsg({ type: 'err', text: errMsg(e) })); }, [id]);

  const reprint = async () => { try { await api.post(`/invoices/${id}/reprint`); window.print(); } catch (x) { setMsg({ type: 'err', text: errMsg(x) }); } };
  if (!d) return <div className="space-y-3"><button className="btn-ghost" onClick={() => nav(-1)}>Back</button><Notice msg={msg} /></div>;
  const { invoice: inv, returns, createdBy, overrides, movements } = d;
  const tz = settings.timezone;
  const piece = (b) => <Link className="font-semibold text-ink-500 underline" to={`/inventory?history=${encodeURIComponent(b)}`}>{b}</Link>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <button className="btn-ghost" onClick={() => nav(-1)}>Back</button>
        <h1 className="text-2xl font-extrabold text-ink">{inv.invoiceNo}</h1>
        <span className={`rounded px-2 py-0.5 text-xs font-bold ${inv.status === 'paid' ? 'bg-leaf-soft text-leaf' : 'bg-ruby-soft text-ruby'}`}>{inv.status === 'paid' ? 'Paid' : 'Void'}</span>
        <div role="tablist" className="ml-auto flex gap-2">
          {[['details', 'Details'], ['print', 'Print copy']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 text-sm font-semibold ${tab === k ? 'bg-ink text-white' : 'border border-paper-line bg-white'}`}>{l}</button>)}
        </div>
      </div>
      <Notice msg={msg} />

      {tab === 'print' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 print:hidden"><FormatToggle value={format} onChange={setFormat} /><button className="btn-primary" onClick={reprint}>Reprint (marked as copy)</button></div>
          <InvoiceView invoice={inv} format={format} copy />
        </div>
      ) : (<>
        <section className="card grid gap-4 p-4 text-sm md:grid-cols-4">
          <div><div className="text-slate-500">Date</div><b>{fmtDateTime(inv.createdAt, tz)}</b></div>
          <div><div className="text-slate-500">Customer</div><b>{inv.customer?.name || 'Walk-in'}</b> {inv.customer?.phone}</div>
          <div><div className="text-slate-500">Billed by</div><b>{createdBy?.name || '—'}</b></div>
          <div><div className="text-slate-500">Total</div><b className="text-lg">{money(inv.grandTotal)}</b></div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-extrabold text-ink">Pieces and how each price was worked out</h2>
          {inv.lines.map((l) => (
            <div key={l.barcode} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3 text-sm">
                <div><div className="font-bold text-ink">{l.name}</div><div className="text-slate-500">{piece(l.barcode)} · {l.metal} {l.purity} · gross {l.grossWeight} g · net {l.netWeight} g · rate used {l.ratePerGram ? `${money(l.ratePerGram)} per g` : 'fixed price'}</div></div>
                <div className="text-lg font-extrabold">{money(l.total)}</div>
              </div>
              <div className="mt-3"><PriceBreakup price={l.breakup} charges={l.charges} rate={l.ratePerGram} netWeight={l.netWeight} grossWeight={l.grossWeight} gstPercent={l.charges?.gstPercent ?? inv.gstPercent} /></div>
              {l.breakup?.overridden && <div className="mt-2 rounded-md bg-gold-soft/60 p-2 text-xs font-semibold text-gold-deep">Price changed from {money(l.breakup.originalSubtotal)} to {money(l.breakup.subtotal)}. Reason: {l.breakup.overrideReason}</div>}
            </div>
          ))}
        </section>

        <div className="grid gap-5 md:grid-cols-2">
          <section className="card p-4 text-sm">
            <h2 className="mb-2 font-extrabold text-ink">Bill totals</h2>
            <dl className="space-y-1">
              <div className="flex justify-between"><dt>Value</dt><dd>{money(inv.subtotal)}</dd></div>
              {inv.discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>-{money(inv.discount)}</dd></div>}
              {inv.igst > 0
                ? <div className="flex justify-between"><dt>IGST ({inv.gstPercent ?? 3}%)</dt><dd>{money(inv.igst)}</dd></div>
                : <>
                    <div className="flex justify-between"><dt>CGST ({(inv.gstPercent ?? 3) / 2}%)</dt><dd>{money(inv.cgst ?? inv.gst / 2)}</dd></div>
                    <div className="flex justify-between"><dt>SGST ({(inv.gstPercent ?? 3) / 2}%)</dt><dd>{money(inv.sgst ?? inv.gst - inv.gst / 2)}</dd></div>
                  </>}
              <div className="flex justify-between border-t border-paper-line pt-1 font-extrabold"><dt>Total</dt><dd>{money(inv.grandTotal)}</dd></div>
            </dl>
            <h3 className="mb-1 mt-4 font-bold">Payments</h3>
            <ul>{inv.payments.map((p, i) => <li key={i} className="flex justify-between"><span className="capitalize">{p.mode === 'bank' ? 'Bank transfer' : p.mode}</span><span>{money(p.amount)}</span></li>)}</ul>
          </section>
          <section className="card p-4 text-sm">
            <h2 className="mb-2 font-extrabold text-ink">Price changes</h2>
            {overrides.length ? <ul className="space-y-2">{overrides.map((o) => <li key={o._id}><b>{o.user?.name}</b> changed {o.meta?.barcode} from {money(o.meta?.from)} to {money(o.meta?.to)}. <span className="text-slate-600">Reason: {o.meta?.reason}</span></li>)}</ul> : <p className="text-slate-500">No manual price changes on this bill.</p>}
          </section>
        </div>

        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-ink">Returns against this bill</h2>
          <Table head={['Return', 'Pieces', 'Value', 'Type', 'Status']} min={560}>
            {returns.map((r) => <tr key={r._id} className="border-b border-paper-line"><td className="p-3 font-semibold"><Link className="text-ink-500 underline" to="/returns">{r.returnNo}</Link></td><td className="p-3">{r.lines.map((l) => l.barcode).join(', ')}</td><td className="p-3">{money(r.total)}</td><td className="p-3">{r.settlement === 'credit_note' ? `Credit note ${r.creditNoteNo || ''}` : `Refund (${r.refundMode})`}</td><td className="p-3 capitalize">{r.status}</td></tr>)}
            {!returns.length && <tr><td className="p-4 text-slate-500" colSpan={5}>No returns.</td></tr>}
          </Table>
        </section>

        {movements.length > 0 && (
          <section className="card p-4 text-sm"><h2 className="mb-2 font-extrabold text-ink">Stock movements caused by this bill</h2>
            <ul className="divide-y divide-paper-line">{movements.map((m) => <li key={m._id} className="flex flex-wrap items-center gap-3 py-1.5"><b className="capitalize">{m.type}</b>{m.item && piece(m.item.barcode)}<span className="text-slate-500">{m.item?.name}</span>{m.toStatus && <Badge status={m.toStatus} />}</li>)}</ul></section>
        )}
      </>)}
    </div>
  );
}
