import { Router } from 'express';
import { protect, need } from '../middleware/auth.js';
import { stockSummary, reconcile } from '../utils/stockSummary.js';
import StockMovement from '../models/StockMovement.js';
import Item from '../models/Item.js';
import Setting from '../models/Setting.js';
import { dayRange, isDateStr } from '../utils/dates.js';
import { escapeRegex } from '../utils/text.js';
import { HttpError } from '../utils/errors.js';
import StockCount from '../models/StockCount.js';
import { nextNumber } from '../utils/counter.js';
import { audit } from '../utils/audit.js';

const router = Router();
router.use(protect);

router.get('/summary', need('stock.read'), async (req, res) => res.json(await stockSummary(req.user.role)));
router.get('/reconcile', need('reports.read'), async (_req, res) => res.json(await reconcile()));

const TYPES = ['purchase', 'sale', 'return', 'transfer', 'adjustment', 'inspection'];

// Every stock movement in the shop, newest first. `ref` is the source transaction (bill, return, purchase).
router.get('/movements', need('stock.read'), async (req, res) => {
  const { type, from, to, q } = req.query;
  const filter = {};
  if (type) { if (!TYPES.includes(type)) throw new HttpError(400, 'Unknown movement type'); filter.type = type; }
  if ((from && !isDateStr(from)) || (to && !isDateStr(to))) throw new HttpError(400, 'Dates must look like 2026-11-02');
  if (from || to) filter.createdAt = dayRange(from, to, (await Setting.findOne().lean())?.timezone);
  if (q) {
    const ids = (await Item.find({ barcode: new RegExp(escapeRegex(q), 'i') }).select('_id').limit(200).lean()).map((i) => i._id);
    filter.$or = [{ item: { $in: ids } }, { ref: new RegExp(escapeRegex(q), 'i') }];
  }
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const [rows, total] = await Promise.all([
    StockMovement.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * 50).limit(50).populate('item', 'barcode name').populate('by', 'name').lean(),
    StockMovement.countDocuments(filter),
  ]);
  res.set('X-Total-Count', String(total));
  res.json(rows);
});

// STOCK COUNT: scan what is physically on the shelf. The result lists what is missing and what is unexpected.
// It never edits stock. Differences go through the two-person adjustment flow (/api/adjustments).
router.post('/counts', need('stock.count'), async (req, res) => {
  const list = Array.isArray(req.body.barcodes) ? req.body.barcodes.map((b) => String(b).trim()).filter(Boolean) : [];
  if (!list.length) throw new HttpError(400, 'Scan at least one tag');
  if (list.length > 20000) throw new HttpError(400, 'A count can hold up to 20,000 tags');
  const scanned = [...new Set(list)];
  const scope = {};
  if (req.body.metal) scope.metal = String(req.body.metal);
  if (req.body.purity) scope.purity = String(req.body.purity);

  const [expectedItems, seen] = await Promise.all([
    Item.find({ status: 'available', ...scope }).select('barcode name').lean(),
    Item.find({ barcode: { $in: scanned } }).select('barcode name status metal purity').lean(),
  ]);
  const seenBy = new Map(seen.map((i) => [i.barcode, i]));
  const set = new Set(scanned);
  const inScope = (i) => (!scope.metal || i.metal === scope.metal) && (!scope.purity || i.purity === scope.purity);
  const missing = expectedItems.filter((i) => !set.has(i.barcode)).map((i) => ({ barcode: i.barcode, name: i.name }));
  const unexpected = scanned
    .filter((b) => { const i = seenBy.get(b); return !i || i.status !== 'available' || !inScope(i); })
    .map((b) => ({ barcode: b, name: seenBy.get(b)?.name || '(unknown tag)', status: seenBy.get(b)?.status || 'unknown' }));
  const matched = scanned.length - unexpected.length;

  const countNo = await nextNumber('stockcount', 'SC');
  const rec = await StockCount.create({ countNo, scope, expected: expectedItems.length, scanned: scanned.length, matched, missing: missing.slice(0, 2000), unexpected: unexpected.slice(0, 2000), by: req.user._id });
  audit(req, 'stock.count', 'StockCount', countNo, { expected: expectedItems.length, scanned: scanned.length, missing: missing.length, unexpected: unexpected.length });
  res.status(201).json({ ...rec.toObject(), missingTotal: missing.length, unexpectedTotal: unexpected.length, ok: !missing.length && !unexpected.length });
});

router.get('/counts', need('stock.read'), async (_req, res) => {
  res.json(await StockCount.find().select('-missing -unexpected').sort({ createdAt: -1 }).limit(50).lean());
});

export default router;
