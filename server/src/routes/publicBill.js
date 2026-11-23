import express from 'express';
import Invoice from '../models/Invoice.js';

const router = express.Router();

// Login nasnara route. Customer la purn bill dakhavto.
router.get('/public/invoice/:token', async (req, res) => {
  const inv = await Invoice.findOne({ publicToken: req.params.token, status: 'paid' }).setOptions({ publicLookup: true }).lean();
  if (!inv) return res.status(404).json({ message: 'Not found' });
  // Purn invoice, fakt internal fields kadhun (tenant, user, branch, keys).
  const { tenant, idempotencyKey, createdBy, branch, customerId, publicToken, __v, ...safe } = inv;
  res.json(safe);
});

export default router;
