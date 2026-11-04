import { Router } from 'express';
import Rate from '../models/Rate.js';
import Setting from '../models/Setting.js';
import { protect, need } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';

const router = Router();
router.use(protect);

router.get('/latest', need('rates.read'), async (_req, res) => {
  res.json(
    await Rate.aggregate([
      { $sort: { createdAt: -1 } },
      { $group: { _id: { metal: '$metal', purity: '$purity' }, perGram: { $first: '$perGram' }, at: { $first: '$createdAt' } } },
    ])
  );
});

router.get('/history', need('rates.read'), async (_req, res) => {
  res.json(await Rate.find().sort({ createdAt: -1 }).limit(100).populate('setBy', 'name').lean());
});

// CONTROLLED RATE UPDATE: every change is audited (old rate, new rate, who). A move bigger than the shop's limit
// (default 10%) is refused with 409 until the sender confirms it, which catches a typo like 7200 -> 720 or 72000.
router.post('/', need('rates.write'), async (req, res) => {
  const { metal, purity } = req.body;
  const perGram = Number(req.body.perGram);
  if (!metal || !purity || !(perGram > 0)) return res.status(400).json({ message: 'Metal, purity and a rate above 0 are required' });

  const prev = await Rate.findOne({ metal, purity }).sort({ createdAt: -1 }).lean();
  const limit = (await Setting.findOne().lean())?.maxRateChangePercent ?? 10;
  if (prev && prev.perGram > 0) {
    const change = ((perGram - prev.perGram) / prev.perGram) * 100;
    if (Math.abs(change) > limit && req.body.confirm !== true) {
      return res.status(409).json({
        message: `This changes the ${metal} ${purity} rate by ${change.toFixed(1)}% (from ${prev.perGram} to ${perGram}). Check it, then confirm to apply.`,
        needsConfirm: true, previous: prev.perGram, changePercent: Math.round(change * 10) / 10,
      });
    }
  }
  const rate = await Rate.create({ metal, purity, perGram, setBy: req.user._id });
  audit(req, 'rate.set', 'Rate', String(rate._id), { metal, purity, from: prev?.perGram ?? null, to: perGram, confirmed: req.body.confirm === true });
  res.status(201).json(rate);
});

export default router;
