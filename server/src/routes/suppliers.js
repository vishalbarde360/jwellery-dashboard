import { Router } from 'express';
import Supplier from '../models/Supplier.js';
import { protect, need, needAny } from '../middleware/auth.js';

const router = Router();
router.use(protect);

router.get('/', needAny('purchases.draft', 'purchases.read'), async (_req, res) => res.json(await Supplier.find().sort({ name: 1 }).lean()));

router.post('/', need('purchases.draft'), async (req, res) => {
  const { name, phone, gstin, address } = req.body;
  res.status(201).json(await Supplier.create({ name, phone, gstin, address }));
});

export default router;
