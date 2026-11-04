import { Router } from 'express';
import Item from '../models/Item.js';
import Product from '../models/Product.js';
import Supplier from '../models/Supplier.js';
import Purchase from '../models/Purchase.js';
import StockMovement from '../models/StockMovement.js';
import { protect, need, needAny } from '../middleware/auth.js';
import { nextNumber } from '../utils/counter.js';
import { runInTransaction } from '../utils/tx.js';
import { HttpError } from '../utils/errors.js';

const router = Router();
router.use(protect);

router.get('/', needAny('purchases.draft', 'purchases.read'), async (_req, res) => {
  res.json(await Purchase.find().sort({ createdAt: -1 }).limit(100).populate('supplier', 'name').lean());
});

// Steps 1-2: choose supplier, draft the purchase. A draft never adds stock.
router.post('/', need('purchases.draft'), async (req, res) => {
  const { supplierId, lines, note } = req.body;
  const supplier = await Supplier.findById(supplierId).lean();
  if (!supplier) throw new HttpError(400, 'Choose a supplier first');
  if (!Array.isArray(lines) || !lines.length) throw new HttpError(400, 'Add at least one piece to the purchase');

  const products = new Map((await Product.find({ _id: { $in: lines.map((l) => l.productId) } }).lean()).map((p) => [String(p._id), p]));
  const built = lines.map((l) => {
    const p = products.get(String(l.productId));
    if (!p) throw new HttpError(400, 'A line has an unknown product');
    if (!(Number(l.grossWeight) > 0)) throw new HttpError(400, `Enter the expected gross weight for ${p.name}`);
    return { product: p._id, name: p.name, grossWeight: Number(l.grossWeight), stoneWeight: Number(l.stoneWeight) || 0, stoneValue: Number(l.stoneValue) || 0, costPrice: Number(l.costPrice) || 0 };
  });
  const purchaseNo = await nextNumber('purchase', 'PUR');
  res.status(201).json(await Purchase.create({
    purchaseNo, supplier: supplier._id, lines: built, note, status: 'draft',
    totalCost: built.reduce((t, l) => t + l.costPrice, 0), createdBy: req.user._id,
  }));
});

router.post('/:id/cancel', need('purchases.draft'), async (req, res) => {
  const p = await Purchase.findOneAndUpdate({ _id: req.params.id, status: 'draft' }, { status: 'cancelled' }, { new: true }).lean();
  p ? res.json(p) : res.status(409).json({ message: 'Only a draft can be cancelled' });
});

// Steps 3-5: goods arrive and are checked, then CONFIRM receipt. All pieces enter stock together, or none do.
router.post('/:id/confirm', need('stock.receive'), async (req, res, next) => {
  try {
    const pieces = req.body.pieces;
    const out = await runInTransaction(async (session) => {
      const p = await Purchase.findById(req.params.id).session(session);
      if (!p) throw new HttpError(404, 'Purchase not found');
      if (p.status !== 'draft') throw new HttpError(409, 'This purchase is already confirmed or cancelled');
      if (!Array.isArray(pieces) || pieces.length !== p.lines.length) throw new HttpError(400, 'Enter the checked details for every line');

      const byLine = new Map(pieces.map((x) => [String(x.lineId), x]));
      const barcodes = pieces.map((x) => String(x.barcode || '').trim());
      if (barcodes.some((b) => !b) || new Set(barcodes).size !== barcodes.length) throw new HttpError(400, 'Every piece needs its own barcode');
      const taken = await Item.find({ barcode: { $in: barcodes } }).session(session).lean();
      if (taken.length) throw new HttpError(409, `Barcode already used: ${taken.map((t) => t.barcode).join(', ')}`);

      let total = 0;
      for (const line of p.lines) {
        const x = byLine.get(String(line._id));
        if (!x) throw new HttpError(400, 'A line is missing its checked details');
        const gross = Number(x.grossWeight ?? line.grossWeight);
        const stone = Number(x.stoneWeight ?? line.stoneWeight ?? 0);
        if (!(gross > 0) || stone < 0 || stone > gross) throw new HttpError(400, `Check the weights for ${line.name}`);
        const cost = Number(x.costPrice ?? line.costPrice) || 0;
        const product = await Product.findById(line.product).session(session).lean();

        const [item] = await Item.create(
          [{
            product: product._id, barcode: String(x.barcode).trim(), name: product.name, category: product.category,
            metal: product.metal, purity: product.purity, hsn: product.hsn,
            grossWeight: gross, stoneWeight: stone, netWeight: gross - stone,
            stoneValue: Number(x.stoneValue ?? line.stoneValue) || 0, costPrice: cost,
            wastagePercent: product.defaultWastagePercent, makingType: product.defaultMakingType, makingValue: product.defaultMakingValue,
            branch: req.user.branch, status: 'available',
          }],
          { session }
        );
        await StockMovement.create([{ item: item._id, type: 'purchase', toStatus: 'available', ref: p.purchaseNo, by: req.user._id, note: 'Goods receipt confirmed' }], { session });
        line.barcode = item.barcode;
        line.item = item._id;
        total += cost;
      }
      p.status = 'confirmed';
      p.confirmedBy = req.user._id;
      p.confirmedAt = new Date();
      p.totalCost = total;
      await p.save({ session });
      return p;
    });
    res.json(out);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: 'A barcode is already used by another piece' });
    next(e);
  }
});

export default router;
