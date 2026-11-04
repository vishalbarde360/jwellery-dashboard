import { money } from '../status';
import { fmtDateTime } from '../format';
import { useAuth } from '../context/AuthContext';

// Invoice and print. A4 or thermal (80 mm). Uses the shop details frozen on the bill, so old bills never change.
export default function InvoiceView({ invoice, format = 'a4', copy = false }) {
  const { settings } = useAuth();
  const shop = invoice.shop?.name ? invoice.shop : { name: settings.shopName };
  const thermal = format === 'thermal';
  const pay = invoice.payments.map((p) => `${p.mode === 'bank' ? 'BANK' : p.mode.toUpperCase()} ${money(p.amount)}`).join(', ');

  return (
    <div id="invoice" className={`card relative mx-auto p-6 text-sm ${thermal ? 'max-w-[80mm] !p-3 text-xs' : 'max-w-3xl'}`}>
      <style>{`@media print { @page { size: ${thermal ? '80mm auto' : 'A4'}; margin: ${thermal ? '3mm' : '12mm'}; } }`}</style>
      {copy && <div className="mb-2 rounded border border-dashed border-slate-400 py-1 text-center text-xs font-bold tracking-widest text-slate-500">DUPLICATE COPY</div>}

      <div className={`flex border-b border-paper-line pb-3 ${thermal ? 'flex-col items-center text-center' : 'items-start justify-between'}`}>
        <div className="flex items-center gap-3">
          {settings.logo && <img src={settings.logo} alt="" className={thermal ? 'h-10' : 'h-14'} />}
          <div>
            <div className="text-lg font-extrabold text-ink">{shop.name || 'Jewellery shop'}</div>
            {shop.address && <div className="text-slate-500">{shop.address}</div>}
            {shop.phone && <div className="text-slate-500">Ph {shop.phone}</div>}
            {shop.gstin && <div className="text-slate-500">GSTIN {shop.gstin}</div>}
          </div>
        </div>
        <div className={thermal ? 'mt-2' : 'text-right'}>
          <div className="font-bold">Tax invoice {invoice.invoiceNo}</div>
          <div className="text-slate-500">{fmtDateTime(invoice.createdAt, settings.timezone)}</div>
        </div>
      </div>

      {(invoice.customer?.name || invoice.customer?.phone) && <div className="py-2 text-slate-600">Customer: {invoice.customer.name} {invoice.customer.phone}</div>}

      {thermal ? (
        <div className="divide-y divide-paper-line">
          {invoice.lines.map((l) => (
            <div key={l.barcode} className="py-1.5">
              <div className="flex justify-between font-semibold"><span>{l.name}</span><span>{money(l.total)}</span></div>
              <div className="text-slate-500">{l.barcode} · {l.purity} · gross {l.grossWeight} g · net {l.netWeight} g</div>
            </div>
          ))}
        </div>
      ) : (
        <table className="mt-2 w-full text-left">
          <thead className="border-b border-paper-line text-slate-600">
            <tr><th className="py-2">Piece</th><th>Purity</th><th className="text-right">Gross g</th><th className="text-right">Net g</th><th className="text-right">Rate/g</th><th className="text-right">Amount</th></tr>
          </thead>
          <tbody>
            {invoice.lines.map((l) => (
              <tr key={l.barcode} className="border-b border-paper-line">
                <td className="py-2"><div className="font-semibold">{l.name}</div><div className="text-xs text-slate-500">{l.barcode}</div></td>
                <td>{l.purity}</td><td className="text-right">{l.grossWeight}</td><td className="text-right">{l.netWeight}</td>
                <td className="text-right">{l.ratePerGram ? money(l.ratePerGram) : 'Fixed'}</td><td className="text-right font-semibold">{money(l.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <dl className={`mt-3 space-y-1 ${thermal ? '' : 'ml-auto w-64'}`}>
        <div className="flex justify-between"><dt>Value</dt><dd>{money(invoice.subtotal)}</dd></div>
        {invoice.discount > 0 && <div className="flex justify-between"><dt>Discount</dt><dd>-{money(invoice.discount)}</dd></div>}
        {invoice.igst > 0
          ? <div className="flex justify-between"><dt>IGST</dt><dd>{money(invoice.igst)}</dd></div>
          : <>
              <div className="flex justify-between"><dt>CGST</dt><dd>{money(invoice.cgst ?? invoice.gst / 2)}</dd></div>
              <div className="flex justify-between"><dt>SGST</dt><dd>{money(invoice.sgst ?? invoice.gst - invoice.gst / 2)}</dd></div>
            </>}
        <div className="flex justify-between border-t border-paper-line pt-1 text-base font-extrabold text-ink"><dt>Total</dt><dd>{money(invoice.grandTotal)}</dd></div>
      </dl>
      <div className="mt-3 text-slate-600">Paid by: {pay}</div>
    </div>
  );
}
