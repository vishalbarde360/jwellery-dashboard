import Decimal from 'decimal.js';

// ALL money maths uses exact decimals (never JavaScript floats).
// Every component is rounded to 2 places first, so the printed parts always add up to the printed total.
const D = (n) => new Decimal(n ?? 0);
const r2 = (d) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
export const round2 = (n) => r2(D(n)).toNumber();

/**
 * Price methods
 *  weight       net weight x rate + wastage + making + stones   (default)
 *  gross_weight gross weight x rate + making + stones           (no wastage)
 *  fixed        one fixed price for the piece
 * Wastage is a PRICE charge only. It never changes the recorded gross or net weight.
 * overrideSubtotal (optional): a manager's logged price change for this piece (before tax).
 */
export function priceItem(item, ratePerGram, { gstPercent = 3, discount = 0, roundTo = 1, overrideSubtotal, interState = false } = {}) {
  const method = item.priceMethod || 'weight';
  let metal = D(0), wastage = D(0), making = D(0), stones = D(0), fixed = D(0);

  if (method === 'fixed') {
    fixed = r2(D(item.fixedPrice));
  } else {
    const w = D(method === 'gross_weight' ? item.grossWeight : item.netWeight);
    metal = r2(w.times(D(ratePerGram)));
    if (method === 'weight') wastage = r2(metal.times(D(item.wastagePercent)).div(100));
    if (item.makingType === 'percent') making = r2(metal.times(D(item.makingValue)).div(100));
    else if (item.makingType === 'per_gram') making = r2(w.times(D(item.makingValue)));
    else making = r2(D(item.makingValue));
    stones = r2(D(item.stoneValue));
  }

  const calculated = metal.plus(wastage).plus(making).plus(stones).plus(fixed);
  const overridden = overrideSubtotal !== undefined && overrideSubtotal !== null;
  const subtotal = overridden ? r2(D(overrideSubtotal)) : calculated;
  const disc = r2(D(discount));
  const taxable = Decimal.max(subtotal.minus(disc), 0);
  const gst = r2(taxable.times(D(gstPercent)).div(100));
  // Same-state sale: GST is split into CGST + SGST (halves that add up to EXACTLY the GST). Other-state sale: all IGST.
  const igst = interState ? gst : D(0);
  const cgst = interState ? D(0) : r2(gst.div(2));
  const sgst = interState ? D(0) : gst.minus(cgst);
  const raw = taxable.plus(gst);
  const step = D(roundTo > 1 ? roundTo : 1);
  const total = raw.div(step).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).times(step);

  return {
    method,
    metalValue: metal.toNumber(), wastage: wastage.toNumber(), making: making.toNumber(),
    stones: stones.toNumber(), fixedPrice: fixed.toNumber(),
    subtotal: subtotal.toNumber(), discount: disc.toNumber(), taxable: taxable.toNumber(),
    gst: gst.toNumber(), cgst: cgst.toNumber(), sgst: sgst.toNumber(), igst: igst.toNumber(), roundOff: r2(total.minus(raw)).toNumber(), total: total.toNumber(),
    overridden, originalSubtotal: calculated.toNumber(),
  };
}
