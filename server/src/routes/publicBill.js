import express from 'express';
import Invoice from '../models/Invoice.js';

const router = express.Router();

// Login nasnara route. Customer la bill dakhavto.
router.get('/public/invoice/:token', async (req, res) => {
  const inv = await Invoice.findOne({ publicToken: req.params.token, status: 'paid' }).lean();
  if (!inv) return res.status(404).json({ message: 'Not found' });
  // Fakt customer la lagnari mahiti. Cost, margin, breakup, charges kadhihi nako.
  res.json({
    number: inv.invoiceNo,
    date: inv.createdAt,
    customerName: inv.customer?.name,
    items: (inv.lines || []).map((l) => ({ name: l.name, netWeight: l.netWeight, amount: l.total })),
    total: inv.grandTotal,
  });
});

export default router;
