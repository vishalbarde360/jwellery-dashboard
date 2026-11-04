import { Router } from 'express';
import Item from '../models/Item.js';
import StockAdjustment from '../models/StockAdjustment.js';
import StockMovement from '../models/StockMovement.js';
import { protect, need } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/', need('stock.read'), async (_req, res) => {
  res.json(await StockAdjustment.find().sort({ createdAt: -1 }).limit(100).populate('item', 'barcode name').populate('requestedBy decidedBy', 'name').lean());
});

router.post('/', need('stock.adjust.request'), async (req, res) => {
  const { barcode, newStatus, reason } = req.body;
  const item = await Item.findOne({ barcode });
  if (!item) return res.status(404).json({ message: 'Tag not found' });
  if (!reason?.trim()) return res.status(400).json({ message: 'Give a reason for the correction' });
  res.status(201).json(await StockAdjustment.create({ item: item._id, newStatus, reason, requestedBy: req.user._id }));
});

router.post('/:id/:decision', need('stock.adjust.approve'), async (req, res) => {
  const { id, decision } = req.params;
  if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ message: 'Unknown decision' });
  const adj = await StockAdjustment.findById(id);
  if (!adj || adj.status !== 'pending') return res.status(404).json({ message: 'No pending request found' });
  // Separation of duties: nobody approves their own request.
  if (String(adj.requestedBy) === String(req.user._id)) return res.status(403).json({ message: "You can't approve your own request" });

  adj.status = decision === 'approve' ? 'approved' : 'rejected';
  adj.decidedBy = req.user._id;
  await adj.save();
  if (decision === 'approve') {
    await Item.findByIdAndUpdate(adj.item, { status: adj.newStatus });
    await StockMovement.create({ item: adj.item, type: 'adjustment', toStatus: adj.newStatus, ref: String(adj._id), by: req.user._id, note: adj.reason });
  }
  res.json(adj);
});

export default router;
