import Decimal from 'decimal.js';
import { priceItem } from './pricing.js';

const D = (n) => new Decimal(n ?? 0);
const sum = (arr, f) => arr.reduce((t, x) => t.plus(D(f(x))), D(0));

// Prices every piece on the server. The client never sends a price (except a logged manager override).
// An invoice-level discount is shared across pieces in proportion to value, to the paisa, and shares add up to EXACTLY the discount.
export function buildLines(items, rateOf, settings = {}, discount = 0, overrides = {}, interState = false) {
  const opts = { gstPercent: settings.gstPercent, roundTo: settings.roundTo, interState };
  const base = items.map((it) => {
    const rate = (it.priceMethod || 'weight') === 'fixed' ? 0 : rateOf(it);
    const ov = overrides[it.barcode];
    return { it, rate, ov, p: priceItem(it, rate, { ...opts, overrideSubtotal: ov?.price }) };
  });

  const subtotal = sum(base, (b) => b.p.subtotal);
  const disc = D(discount);
  let given = D(0);
  const lines = base.map((b, i) => {
    let share;
    if (i === base.length - 1) share = disc.minus(given); // last line takes the remainder
    else share = subtotal.gt(0) ? disc.times(b.p.subtotal).div(subtotal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP) : D(0);
    given = given.plus(share);
    const price = priceItem(b.it, b.rate, { ...opts, discount: share, overrideSubtotal: b.ov?.price });
    if (b.ov) price.overrideReason = b.ov.reason;
    return { item: b.it, rate: b.rate, price };
  });

  return {
    subtotal: subtotal.toNumber(),
    lines,
    taxable: sum(lines, (l) => l.price.taxable).toNumber(),
    gst: sum(lines, (l) => l.price.gst).toNumber(),
    cgst: sum(lines, (l) => l.price.cgst).toNumber(),
    sgst: sum(lines, (l) => l.price.sgst).toNumber(),
    igst: sum(lines, (l) => l.price.igst).toNumber(),
    grandTotal: sum(lines, (l) => l.price.total).toNumber(),
  };
}
