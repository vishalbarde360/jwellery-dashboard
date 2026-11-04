import { money } from '../status';

// Final price = metal value + making + wastage + stones, minus discount, plus tax (PDF page 08).
export default function PriceBreakup({ price, charges = {}, rate, netWeight, grossWeight, gstPercent }) {
  const w = charges.priceMethod === 'gross_weight' ? grossWeight : netWeight;
  const rows = [];
  if (price.method === 'fixed') rows.push(['Fixed price', price.fixedPrice]);
  else {
    rows.push([w !== undefined && rate ? `Metal value (${w} g × ${money(rate)} per gram)` : 'Metal value', price.metalValue]);
    const mt = charges.makingType;
    rows.push([mt === 'percent' ? `Making charge, ${charges.makingValue}%` : mt === 'per_gram' ? `Making charge, ${money(charges.makingValue)} per g` : 'Making charge', price.making]);
    if (price.method === 'weight') rows.push([`Wastage${charges.wastagePercent !== undefined ? `, ${charges.wastagePercent}% of metal value` : ''}`, price.wastage]);
    rows.push(['Stones', price.stones]);
  }
  const gst = gstPercent ?? charges.gstPercent;
  return (
    <dl className="w-full max-w-md text-sm">
      {rows.map(([l, v]) => <div key={l} className="flex justify-between gap-4 py-0.5"><dt className="text-slate-600">{l}</dt><dd>{money(v)}</dd></div>)}
      <div className="flex justify-between gap-4 border-t border-paper-line py-0.5 font-bold"><dt>Subtotal{price.overridden ? ' (price changed)' : ''}</dt><dd>{money(price.subtotal)}</dd></div>
      {price.discount > 0 && <div className="flex justify-between gap-4 py-0.5"><dt className="text-slate-600">Discount</dt><dd>-{money(price.discount)}</dd></div>}
      <div className="flex justify-between gap-4 py-0.5"><dt className="text-slate-600">GST{gst !== undefined ? ` (${gst}%)` : ''}</dt><dd>{money(price.gst)}</dd></div>
      {price.roundOff !== 0 && <div className="flex justify-between gap-4 py-0.5"><dt className="text-slate-600">Round off</dt><dd>{money(price.roundOff)}</dd></div>}
      <div className="flex justify-between gap-4 border-t border-paper-line py-1 text-base font-extrabold text-ink"><dt>Total payable</dt><dd>{money(price.total)}</dd></div>
    </dl>
  );
}
