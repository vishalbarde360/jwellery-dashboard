import Item from '../models/Item.js';
import Rate from '../models/Rate.js';
import Setting from '../models/Setting.js';
import { can } from '../config/permissions.js';
import { STATUS_LABEL } from '../config/lifecycle.js';
import { buildLines } from './invoiceCalc.js';
import { HttpError } from './errors.js';

export function parseCodes(barcodes) {
  if (!Array.isArray(barcodes) || !barcodes.length) throw new HttpError(400, 'Scan at least one tag');
  const codes = barcodes.map(String);
  if (new Set(codes).size !== codes.length) throw new HttpError(400, 'The same tag is on the bill twice');
  if (codes.length > 50) throw new HttpError(400, 'A bill can hold up to 50 pieces');
  return codes;
}

// A manager's logged price change for a piece: { barcode, price (before tax), reason }.
export function parseOverrides(list, codes) {
  const out = {};
  for (const o of Array.isArray(list) ? list : []) {
    const price = Number(o.price);
    if (!codes.includes(o.barcode)) throw new HttpError(400, `Price change is for ${o.barcode}, which is not on the bill`);
    if (!(price >= 0)) throw new HttpError(400, 'A changed price must be 0 or more');
    if (!String(o.reason || '').trim()) throw new HttpError(400, 'Give a reason for changing the price');
    out[o.barcode] = { price, reason: String(o.reason).trim() };
  }
  return out;
}

export function parseDiscount(d) {
  const n = Number(d) || 0;
  if (n < 0) throw new HttpError(400, 'Discount cannot be negative');
  return n;
}

// Step 2 of "Selling a piece": check stock and work out the price. Used for the preview AND for the final save.
// Place of supply: a 2-digit GST state code. Missing, or the same as the shop's state = same-state sale (CGST + SGST).
export function parsePlaceOfSupply(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const s = String(v).trim();
  if (!/^(0[1-9]|[1-3]\d|9[7-9])$/.test(s)) throw new HttpError(400, 'Place of supply must be a 2-digit GST state code, e.g. 27');
  return s;
}

export async function quote({ codes, discount, overrides = {}, role, session, placeOfSupply }) {
  const opt = (q) => (session ? q.session(session) : q);

  const found = new Map((await opt(Item.find({ barcode: { $in: codes } }).lean())).map((i) => [i.barcode, i]));
  const bad = codes.filter((c) => found.get(c)?.status !== 'available');
  if (bad.length) {
    const why = bad.map((c) => `${c} (${found.has(c) ? STATUS_LABEL[found.get(c).status] : 'not found'})`);
    throw new HttpError(409, `Not available for sale: ${why.join(', ')}`);
  }
  const ordered = codes.map((c) => found.get(c));

  if (Object.keys(overrides).length && !can(role, 'price.override')) throw new HttpError(403, 'Changing a price needs manager approval');

  const settings = (await opt(Setting.findOne().lean())) || {};
  const rateMap = {};
  for (const key of new Set(ordered.filter((i) => (i.priceMethod || 'weight') !== 'fixed').map((i) => `${i.metal}|${i.purity}`))) {
    const [metal, purity] = key.split('|');
    const r = await opt(Rate.findOne({ metal, purity }).sort({ createdAt: -1 }).lean());
    if (!r) throw new HttpError(422, `Set today's ${metal} ${purity} rate first`);
    rateMap[key] = r.perGram;
  }
  const shopState = settings.stateCode || String(settings.gstin || '').slice(0, 2) || undefined;
  const interState = Boolean(placeOfSupply && shopState && placeOfSupply !== shopState);
  const calc = buildLines(ordered, (i) => rateMap[`${i.metal}|${i.purity}`], settings, discount, overrides, interState);

  if (discount > 0) {
    if (discount >= calc.subtotal) throw new HttpError(400, 'Discount must be less than the bill value');
    if (!can(role, 'billing.discount')) throw new HttpError(403, 'A discount needs manager approval');
    const maxPct = settings.maxDiscountPercent ?? 5;
    if (discount > (calc.subtotal * maxPct) / 100 && !can(role, 'discount.large')) {
      throw new HttpError(403, `Discounts above ${maxPct}% need the owner`);
    }
  }
  return { ordered, calc, settings, interState, shopState };
}
