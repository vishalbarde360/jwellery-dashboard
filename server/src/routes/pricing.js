import { Router } from 'express';
import Rate from '../models/Rate.js';
import Setting from '../models/Setting.js';
import { protect, needAny } from '../middleware/auth.js';
import { priceItem } from '../utils/pricing.js';
import { HttpError } from '../utils/errors.js';

const router = Router();
router.use(protect);

// "What would this piece cost today?" Used while registering a product. Same engine as billing. Writes nothing.
router.post('/preview', needAny('products.write', 'rates.read'), async (req, res) => {
  const b = req.body;
  const method = ['weight', 'gross_weight', 'fixed'].includes(b.priceMethod) ? b.priceMethod : 'weight';
  const gross = Number(b.grossWeight) || 0;
  const stone = Number(b.stoneWeight) || 0;
  if (stone > gross) throw new HttpError(400, 'Stone weight cannot be more than gross weight');
  const item = {
    priceMethod: method, grossWeight: gross, netWeight: gross - stone, stoneValue: Number(b.stoneValue) || 0,
    wastagePercent: Number(b.wastagePercent) || 0, makingType: ['percent', 'per_gram', 'fixed'].includes(b.makingType) ? b.makingType : 'percent',
    makingValue: Number(b.makingValue) || 0, fixedPrice: Number(b.fixedPrice) || 0,
  };
  const settings = (await Setting.findOne().lean()) || {};
  let rate = 0;
  if (method !== 'fixed') {
    const r = await Rate.findOne({ metal: b.metal, purity: b.purity }).sort({ createdAt: -1 }).lean();
    if (!r) return res.json({ rate: null, price: null, message: `Set today's ${b.metal || 'metal'} ${b.purity || ''} rate to see a price` });
    rate = r.perGram;
  }
  res.json({ rate, item, gstPercent: settings.gstPercent ?? 3, price: priceItem(item, rate, { gstPercent: settings.gstPercent, roundTo: settings.roundTo }) });
});

export default router;
