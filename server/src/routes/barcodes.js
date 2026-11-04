import { Router } from 'express';
import Item from '../models/Item.js';
import Counter from '../models/Counter.js';
import Setting from '../models/Setting.js';
import { protect, needAny } from '../middleware/auth.js';
import { HttpError } from '../utils/errors.js';

const router = Router();
router.use(protect);

// Generate unique barcodes. Numbers come from a running counter and are double-checked against existing pieces.
router.post('/generate', needAny('stock.receive', 'products.write', 'tags.print'), async (req, res) => {
  const count = Number(req.body.count) || 1;
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new HttpError(400, 'Ask for 1 to 100 barcodes');
  const prefix = (await Setting.findOne().lean())?.barcodePrefix || 'WN';
  const out = [];
  while (out.length < count) {
    const need = count - out.length;
    const c = await Counter.findOneAndUpdate({ key: 'barcode' }, { $inc: { seq: need } }, { new: true, upsert: true });
    const cand = Array.from({ length: need }, (_, i) => `${prefix}${String(c.seq - need + 1 + i).padStart(6, '0')}`);
    const taken = new Set((await Item.find({ barcode: { $in: cand } }).select('barcode').lean()).map((x) => x.barcode));
    out.push(...cand.filter((x) => !taken.has(x)));
  }
  res.json({ barcodes: out });
});

export default router;
