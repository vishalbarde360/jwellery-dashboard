import Item from '../models/Item.js';
import Rate from '../models/Rate.js';
import StockMovement from '../models/StockMovement.js';
import { can } from '../config/permissions.js';

const r3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export async function latestRates() {
  const rows = await Rate.aggregate([
    { $sort: { createdAt: -1 } },
    { $group: { _id: { metal: '$metal', purity: '$purity' }, perGram: { $first: '$perGram' }, at: { $first: '$createdAt' } } },
  ]);
  return new Map(rows.map((r) => [`${r._id.metal}|${r._id.purity}`, r]));
}

// Counts by status + valuation of what is available to sell. Cost is shown only to roles with cost.read.
export async function stockSummary(role) {
  const [byStatus, avail, rates] = await Promise.all([
    Item.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Item.aggregate([
      { $match: { status: 'available' } },
      { $group: { _id: { metal: '$metal', purity: '$purity' }, count: { $sum: 1 }, grossWeight: { $sum: '$grossWeight' }, netWeight: { $sum: '$netWeight' }, cost: { $sum: '$costPrice' } } },
      { $sort: { '_id.metal': 1, '_id.purity': 1 } },
    ]),
    latestRates(),
  ]);
  const showCost = can(role, 'cost.read');
  const rows = avail.map((r) => {
    const rate = rates.get(`${r._id.metal}|${r._id.purity}`);
    return {
      metal: r._id.metal, purity: r._id.purity, count: r.count,
      grossWeight: r3(r.grossWeight), netWeight: r3(r.netWeight),
      marketValue: rate ? r2(r.netWeight * rate.perGram) : null, // metal only, at today's rate
      ...(showCost ? { cost: r2(r.cost) } : {}),
    };
  });
  return { byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])), rows, totalPieces: rows.reduce((t, r) => t + r.count, 0) };
}

// "Balances always reconcile": every piece's status must equal the result of its latest stock movement.
export async function reconcile() {
  const [items, last] = await Promise.all([
    Item.find().select('barcode status').lean(),
    StockMovement.aggregate([{ $sort: { createdAt: 1, _id: 1 } }, { $group: { _id: '$item', toStatus: { $last: '$toStatus' }, moves: { $sum: 1 } } }]),
  ]);
  const byItem = new Map(last.map((l) => [String(l._id), l]));
  const mismatches = [];
  let noHistory = 0;
  for (const i of items) {
    const m = byItem.get(String(i._id));
    if (!m) { noHistory++; continue; }
    if (m.toStatus && m.toStatus !== i.status) mismatches.push({ barcode: i.barcode, status: i.status, expected: m.toStatus });
  }
  return { checked: items.length, noHistory, mismatches, ok: !mismatches.length && !noHistory };
}
