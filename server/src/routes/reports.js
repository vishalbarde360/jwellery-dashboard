import { Router } from 'express';
import Invoice from '../models/Invoice.js';
import Return from '../models/Return.js';
import StockAdjustment from '../models/StockAdjustment.js';
import Setting from '../models/Setting.js';
import Item from '../models/Item.js';
import { protect, need } from '../middleware/auth.js';
import { can } from '../config/permissions.js';
import { HttpError } from '../utils/errors.js';
import { addDays, dayRange, isDateStr, todayStr } from '../utils/dates.js';
import { toCsv } from '../utils/text.js';
import { latestRates, reconcile, stockSummary } from '../utils/stockSummary.js';

const router = Router();
router.use(protect);
const r2 = (n) => Math.round(((n || 0) + Number.EPSILON) * 100) / 100;
const tzOf = async () => (await Setting.findOne().lean())?.timezone || 'Asia/Kolkata';

function range(req, tz) {
  const to = req.query.to || todayStr(tz);
  const from = req.query.from || addDays(to, -29);
  if (!isDateStr(from) || !isDateStr(to)) throw new HttpError(400, 'Dates must look like 2026-11-02');
  if (from > to) throw new HttpError(400, 'The start date is after the end date');
  return { from, to, createdAt: dayRange(from, to, tz) };
}

// Dashboard: today's sales, stock summary and alerts. Each part is shown only to roles allowed to see it.
router.get('/dashboard', async (req, res) => {
  const tz = await tzOf();
  const today = todayStr(tz);
  const out = { today, alerts: [] };
  const role = req.user.role;

  if (can(role, 'sales.read')) {
    const match = { status: 'paid', createdAt: dayRange(today, today, tz) };
    const [[t], byMode] = await Promise.all([
      Invoice.aggregate([{ $match: match }, { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$grandTotal' } } }]),
      Invoice.aggregate([{ $match: match }, { $unwind: '$payments' }, { $group: { _id: '$payments.mode', amount: { $sum: '$payments.amount' } } }]),
    ]);
    out.sales = { count: t?.count || 0, total: r2(t?.total), byMode: byMode.map((m) => ({ mode: m._id, amount: r2(m.amount) })) };
  }
  if (can(role, 'stock.read')) out.stock = await stockSummary(role);

  if (can(role, 'rates.read')) {
    const rates = await latestRates();
    const start = dayRange(today, today, tz).$gte;
    const pairs = await Item.aggregate([{ $match: { status: 'available' } }, { $group: { _id: { metal: '$metal', purity: '$purity' } } }]);
    for (const p of pairs) {
      const r = rates.get(`${p._id.metal}|${p._id.purity}`);
      if (!r || r.at < start) out.alerts.push({ level: 'warn', text: `Today's ${p._id.metal} ${p._id.purity} rate is not set`, href: '/rates' });
    }
  }
  if (can(role, 'returns.approve')) {
    const n = await Return.countDocuments({ status: 'pending' });
    if (n) out.alerts.push({ level: 'info', text: `${n} return${n > 1 ? 's' : ''} waiting for approval`, href: '/returns' });
  }
  if (can(role, 'stock.adjust.approve')) {
    const n = await StockAdjustment.countDocuments({ status: 'pending' });
    if (n) out.alerts.push({ level: 'info', text: `${n} stock correction${n > 1 ? 's' : ''} waiting for approval`, href: '/inventory' });
  }
  if (can(role, 'stock.inspect')) {
    const n = await Item.countDocuments({ status: { $in: ['returned_check', 'repair'] } });
    if (n) out.alerts.push({ level: 'info', text: `${n} piece${n > 1 ? 's' : ''} waiting for inspection or repair`, href: '/inventory?status=returned_check' });
  }
  if (can(role, 'reports.read')) {
    const rec = await reconcile();
    if (rec.mismatches.length) out.alerts.push({ level: 'error', text: `${rec.mismatches.length} piece(s) do not match their stock history. Open Reports > Stock.`, href: '/reports' });
  }
  res.json(out);
});

router.get('/sales', need('reports.read'), async (req, res) => {
  const tz = await tzOf();
  const { from, to, createdAt } = range(req, tz);
  const match = { status: 'paid', createdAt };
  const [[t], byDay, byMode] = await Promise.all([
    Invoice.aggregate([{ $match: match }, { $group: { _id: null, count: { $sum: 1 }, subtotal: { $sum: '$subtotal' }, discount: { $sum: '$discount' }, taxable: { $sum: '$taxable' }, gst: { $sum: '$gst' }, total: { $sum: '$grandTotal' } } }]),
    Invoice.aggregate([{ $match: match }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: tz } }, count: { $sum: 1 }, total: { $sum: '$grandTotal' } } }, { $sort: { _id: 1 } }]),
    Invoice.aggregate([{ $match: match }, { $unwind: '$payments' }, { $group: { _id: '$payments.mode', amount: { $sum: '$payments.amount' } } }, { $sort: { _id: 1 } }]),
  ]);
  res.json({
    from, to,
    totals: { count: t?.count || 0, subtotal: r2(t?.subtotal), discount: r2(t?.discount), taxable: r2(t?.taxable), gst: r2(t?.gst), total: r2(t?.total) },
    byDay: byDay.map((d) => ({ date: d._id, count: d.count, total: r2(d.total) })),
    byMode: byMode.map((m) => ({ mode: m._id, amount: r2(m.amount) })),
  });
});

router.get('/stock', need('reports.read'), async (req, res) => {
  res.json({ summary: await stockSummary(req.user.role), reconcile: await reconcile() });
});

// MARGIN report. Price, metal value, cost and margin are kept as SEPARATE columns and never blended into one "profit" number.
//   revenue    = taxable value of the sale (after discount, before GST)
//   metalValue = net weight x the rate used on the bill
//   makingEtc  = making + wastage + stones + fixed price (what the shop adds on top of metal)
//   cost       = purchase cost of the piece, or (setting stockValuation = weighted_average) net weight x the shop's average
//                cost per gram for that metal and purity over all pieces ever received
//   margin     = revenue - cost.   Returned pieces are left out (the sale was reversed).
router.get('/margin', need('reports.read'), async (req, res) => {
  if (!can(req.user.role, 'cost.read')) throw new HttpError(403, "You don't have permission: cost.read");
  const tz = await tzOf();
  const { from, to, createdAt } = range(req, tz);
  const settings = (await Setting.findOne().lean()) || {};
  const method = settings.stockValuation || 'purchase_cost';

  const invs = await Invoice.find({ status: 'paid', createdAt }).select('invoiceNo lines').lean();
  const returned = await Return.find({ status: 'completed', invoiceNo: { $in: invs.map((i) => i.invoiceNo) } }).select('invoiceNo lines.item').lean();
  const back = new Set(returned.flatMap((r) => r.lines.map((l) => `${r.invoiceNo}|${l.item}`)));

  const ids = invs.flatMap((i) => i.lines.map((l) => l.item));
  const items = new Map((await Item.find({ _id: { $in: ids } }).select('costPrice netWeight metal purity').lean()).map((i) => [String(i._id), i]));
  let avg = new Map();
  if (method === 'weighted_average') {
    const groups = await Item.aggregate([{ $group: { _id: { metal: '$metal', purity: '$purity' }, cost: { $sum: '$costPrice' }, weight: { $sum: '$netWeight' } } }]);
    avg = new Map(groups.map((g) => [`${g._id.metal}|${g._id.purity}`, g.weight > 0 ? g.cost / g.weight : null]));
  }

  const byMetal = new Map();
  const totals = { pieces: 0, revenue: 0, metalValue: 0, makingEtc: 0, cost: 0, margin: 0 };
  let returnedLeftOut = 0;
  for (const inv of invs) {
    for (const l of inv.lines) {
      if (back.has(`${inv.invoiceNo}|${l.item}`)) { returnedLeftOut++; continue; }
      const it = items.get(String(l.item));
      const b = l.breakup || {};
      const perGram = method === 'weighted_average' ? avg.get(`${it?.metal}|${it?.purity}`) : null;
      const cost = r2(perGram != null ? perGram * (it?.netWeight || 0) : it?.costPrice || 0);
      const row = {
        pieces: 1, revenue: b.taxable || 0, metalValue: b.metalValue || 0,
        makingEtc: r2((b.making || 0) + (b.wastage || 0) + (b.stones || 0) + (b.fixedPrice || 0)), cost,
      };
      row.margin = r2(row.revenue - row.cost);
      const key = `${l.metal}|${l.purity}`;
      const g = byMetal.get(key) || { metal: l.metal, purity: l.purity, pieces: 0, revenue: 0, metalValue: 0, makingEtc: 0, cost: 0, margin: 0 };
      for (const k of Object.keys(totals)) { g[k] = r2(g[k] + row[k]); totals[k] = r2(totals[k] + row[k]); }
      byMetal.set(key, g);
    }
  }
  const pct = (m, rev) => (rev > 0 ? Math.round((m / rev) * 1000) / 10 : null);
  const rows = [...byMetal.values()].map((g) => ({ ...g, marginPercent: pct(g.margin, g.revenue) }));
  res.json({
    from, to, valuation: method, rows, totals: { ...totals, marginPercent: pct(totals.margin, totals.revenue) }, returnedLeftOut,
    note: 'Revenue is before GST. Cost is ' + (method === 'weighted_average' ? 'the weighted average cost per gram' : 'the purchase cost of each piece') + '. Metal value uses the rate on the bill. These are separate figures, not one profit number.',
  });
});

// Tax report. JSON for roles with reports.read; CSV download needs export.data.
// Sales rows come from invoices. Completed returns that created a credit note come in as NEGATIVE rows, with the tax
// taken in proportion to the value returned from that bill's line. A qualified tax professional must verify this.
const TAXKEYS = ['value', 'discount', 'taxable', 'cgst', 'sgst', 'igst', 'gst', 'total'];
router.get('/tax', need('reports.read'), async (req, res) => {
  const tz = await tzOf();
  const { from, to, createdAt } = range(req, tz);
  const invs = await Invoice.find({ status: 'paid', createdAt }).sort({ createdAt: 1 }).select('invoiceNo createdAt customer shop placeOfSupply interState subtotal discount taxable cgst sgst igst gst grandTotal').lean();
  const when = new Intl.DateTimeFormat('en-CA', { timeZone: tz, dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' });
  const rows = invs.map((i) => ({
    type: 'Invoice', invoiceNo: i.invoiceNo, date: when.format(i.createdAt), customer: i.customer?.name || '',
    placeOfSupply: i.placeOfSupply || i.shop?.stateCode || '', supply: i.interState ? 'Inter-state' : 'Same state',
    value: i.subtotal, discount: i.discount, taxable: i.taxable,
    // Old bills saved before the split existed: show their GST as CGST + SGST halves.
    cgst: i.cgst ?? r2((i.gst || 0) / 2), sgst: i.sgst ?? r2((i.gst || 0) - r2((i.gst || 0) / 2)), igst: i.igst || 0,
    gst: i.gst, total: i.grandTotal,
  }));

  const cns = await Return.find({ status: 'completed', creditNoteNo: { $exists: true, $ne: null }, decidedAt: createdAt }).sort({ decidedAt: 1 }).lean();
  const bills = new Map((await Invoice.find({ _id: { $in: cns.map((c) => c.invoice) } }).lean()).map((b) => [String(b._id), b]));
  for (const c of cns) {
    const inv = bills.get(String(c.invoice));
    const t = Object.fromEntries(TAXKEYS.map((k) => [k, 0]));
    for (const l of c.lines) {
      const line = inv?.lines?.find((x) => String(x.item) === String(l.item));
      const share = line?.total ? Math.min(1, l.refundValue / line.total) : 0; // part of the line that came back
      const bk = line?.breakup || {};
      t.total += l.refundValue;
      t.value += (bk.subtotal || 0) * share; t.discount += (bk.discount || 0) * share; t.taxable += (bk.taxable || 0) * share;
      t.gst += (bk.gst || 0) * share;
      t.cgst += (bk.cgst ?? r2((bk.gst || 0) / 2)) * share; t.sgst += (bk.sgst ?? ((bk.gst || 0) - r2((bk.gst || 0) / 2))) * share; t.igst += (bk.igst || 0) * share;
    }
    rows.push({
      type: 'Credit note', invoiceNo: c.creditNoteNo, againstInvoice: c.invoiceNo, date: when.format(c.decidedAt), customer: inv?.customer?.name || '',
      placeOfSupply: inv?.placeOfSupply || inv?.shop?.stateCode || '', supply: inv?.interState ? 'Inter-state' : 'Same state',
      ...Object.fromEntries(TAXKEYS.map((k) => [k, -r2(t[k])])),
    });
  }

  const totals = Object.fromEntries(TAXKEYS.map((k) => [k, 0]));
  for (const r of rows) for (const k of TAXKEYS) totals[k] = r2(totals[k] + (r[k] || 0));
  const settings = (await Setting.findOne().lean()) || {};

  if (req.query.format === 'csv') {
    if (!can(req.user.role, 'export.data')) throw new HttpError(403, "You don't have permission: export.data");
    const cols = [['type', 'Type'], ['invoiceNo', 'Number'], ['againstInvoice', 'Against invoice'], ['date', 'Date'], ['customer', 'Customer'], ['placeOfSupply', 'Place of supply'], ['supply', 'Supply'], ['value', 'Value'], ['discount', 'Discount'], ['taxable', 'Taxable value'], ['cgst', 'CGST'], ['sgst', 'SGST'], ['igst', 'IGST'], ['gst', 'Total GST'], ['total', 'Total']].map(([key, label]) => ({ key, label }));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="tax-${from}-to-${to}.csv"` });
    return res.send(toCsv(cols, [...rows, { type: 'TOTAL', ...totals }]));
  }
  res.json({ from, to, gstin: settings.gstin || '', rows, totals, note: 'Credit notes are shown as negative rows. Tax rules must be verified by a qualified tax professional.' });
});

export default router;
