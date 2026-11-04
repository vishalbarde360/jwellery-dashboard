import { Router } from 'express';
import Invoice from '../models/Invoice.js';
import Item from '../models/Item.js';
import Return from '../models/Return.js';
import Setting from '../models/Setting.js';
import StockMovement from '../models/StockMovement.js';
import { protect, need, needAny } from '../middleware/auth.js';
import { can } from '../config/permissions.js';
import { nextNumber } from '../utils/counter.js';
import { runInTransaction } from '../utils/tx.js';
import { HttpError } from '../utils/errors.js';

const router = Router();
router.use(protect);

// A piece can only be returned against the bill that LAST sold it.
async function soldOnThisBill(itemId, invoiceNo, session) {
  let q = StockMovement.findOne({ item: itemId, type: 'sale' }).sort({ createdAt: -1 }).lean();
  if (session) q = q.session(session);
  const m = await q;
  return m?.ref === invoiceNo;
}

router.get('/', needAny('returns.create', 'returns.approve', 'sales.read'), async (req, res) => {
  const filter = req.query.status ? { status: req.query.status } : {};
  res.json(await Return.find(filter).sort({ createdAt: -1 }).limit(100).lean());
});

// Steps 1-4: open the original bill, pick items, give reason and refund value, choose refund or credit note.
// This only REQUESTS the return. Stock does not change until a manager approves.
router.post('/', need('returns.create'), async (req, res) => {
  const { invoiceNo, items, reason, settlement = 'refund', refundMode } = req.body;
  if (!reason?.trim()) throw new HttpError(400, 'Give a reason for the return');
  if (!['refund', 'credit_note'].includes(settlement)) throw new HttpError(400, 'Choose refund or credit note');
  if (settlement === 'refund' && !['cash', 'card', 'upi', 'bank'].includes(refundMode)) throw new HttpError(400, 'Choose how the refund is paid');

  const inv = await Invoice.findOne({ invoiceNo: String(invoiceNo || '').toUpperCase() }).lean();
  if (!inv || inv.status !== 'paid') throw new HttpError(404, 'No paid bill with that number');
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'Select the pieces being returned');

  const codes = items.map((x) => x.barcode);
  if (new Set(codes).size !== codes.length) throw new HttpError(400, 'A piece is selected twice');

  const lines = [];
  for (const x of items) {
    const line = inv.lines.find((l) => l.barcode === x.barcode);
    if (!line) throw new HttpError(400, `${x.barcode} is not on this bill`);
    const refundValue = Number(x.refundValue ?? line.total);
    // Returns can never exceed what was sold.
    if (!(refundValue > 0) || refundValue > line.total) throw new HttpError(400, `Refund for ${x.barcode} must be above 0 and at most ₹${line.total}`);
    if (!(await soldOnThisBill(line.item, inv.invoiceNo))) throw new HttpError(409, `${x.barcode} has been sold again since this bill`);
    lines.push({ item: line.item, barcode: line.barcode, name: line.name, refundValue });
  }

  const prior = await Return.findOne({ invoiceNo: inv.invoiceNo, status: { $in: ['pending', 'completed'] }, 'lines.barcode': { $in: codes } }).lean();
  if (prior) throw new HttpError(409, `Already returned or waiting for approval (${prior.returnNo})`);

  const returnNo = await nextNumber('return', 'RET');
  res.status(201).json(await Return.create({
    returnNo, invoice: inv._id, invoiceNo: inv.invoiceNo, lines, reason, settlement,
    refundMode: settlement === 'refund' ? refundMode : undefined,
    total: lines.reduce((t, l) => t + l.refundValue, 0), createdBy: req.user._id,
  }));
});

// Step 5: approve -> refund or credit note is recorded and stock status changes to "returned, under check".
// The piece cannot be sold again until it is inspected.
router.post('/:id/approve', need('returns.approve'), async (req, res) => {
  const out = await runInTransaction(async (session) => {
    const r = await Return.findById(req.params.id).session(session);
    if (!r || r.status !== 'pending') throw new HttpError(404, 'No pending return found');

    const settings = (await Setting.findOne().session(session).lean()) || {};
    const limit = settings.maxManagerRefund ?? 50000;
    if (r.total > limit && !can(req.user.role, 'refund.large')) throw new HttpError(403, `Returns above ₹${limit} need the owner`);

    for (const l of r.lines) {
      if (!(await soldOnThisBill(l.item, r.invoiceNo, session))) throw new HttpError(409, `${l.barcode} has been sold again since this bill`);
      const ok = await Item.findOneAndUpdate({ _id: l.item, status: 'sold' }, { status: 'returned_check' }, { session });
      if (!ok) throw new HttpError(409, `${l.barcode} is not marked as sold`);
      await StockMovement.create([{ item: l.item, type: 'return', toStatus: 'returned_check', ref: r.returnNo, by: req.user._id, note: r.reason }], { session });
    }
    if (r.settlement === 'credit_note') r.creditNoteNo = await nextNumber('creditnote', 'CN', session);
    r.status = 'completed';
    r.decidedBy = req.user._id;
    r.decidedAt = new Date();
    await r.save({ session });
    return r;
  });
  res.json(out);
});

router.post('/:id/reject', need('returns.approve'), async (req, res) => {
  const r = await Return.findOneAndUpdate({ _id: req.params.id, status: 'pending' }, { status: 'rejected', decidedBy: req.user._id, decidedAt: new Date() }, { new: true }).lean();
  r ? res.json(r) : res.status(404).json({ message: 'No pending return found' });
});

export default router;
