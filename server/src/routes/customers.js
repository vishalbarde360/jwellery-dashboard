import { Router } from 'express';
import Customer from '../models/Customer.js';
import Invoice from '../models/Invoice.js';
import { protect, need } from '../middleware/auth.js';
import { HttpError } from '../utils/errors.js';
import { audit, diff } from '../utils/audit.js';
import { escapeRegex } from '../utils/text.js';

const router = Router();
router.use(protect);

const PHONE = /^\+?\d{10,15}$/;
const cleanPhone = (p) => String(p || '').replace(/[\s-]/g, '');

router.get('/', need('customers.read'), async (req, res) => {
  const filter = {};
  if (req.query.q) { const r = new RegExp(escapeRegex(req.query.q), 'i'); filter.$or = [{ name: r }, { phone: r }]; }
  res.json(await Customer.find(filter).sort({ name: 1 }).limit(50).lean());
});

router.post('/', need('customers.write'), async (req, res, next) => {
  try {
    const { name, email, note } = req.body;
    const phone = cleanPhone(req.body.phone);
    if (!String(name || '').trim()) throw new HttpError(400, 'Customer name is required');
    if (!PHONE.test(phone)) throw new HttpError(400, 'Enter a phone number of 10 to 15 digits');
    res.status(201).json(await Customer.create({ name, phone, email, note }));
  } catch (e) {
    if (e.code === 11000) {
      const existing = await Customer.findOne({ phone: cleanPhone(req.body.phone) }).lean();
      return res.status(409).json({ message: 'A customer with this phone already exists', customer: existing });
    }
    next(e);
  }
});

// Profile + purchase history
router.get('/:id', need('customers.read'), async (req, res) => {
  const customer = await Customer.findById(req.params.id).lean();
  if (!customer) throw new HttpError(404, 'Customer not found');
  const invoices = await Invoice.find({ customerId: customer._id }).sort({ createdAt: -1 }).limit(50)
    .select('invoiceNo createdAt grandTotal status lines.name lines.barcode').lean();
  res.json({ customer, invoices, totalSpent: invoices.filter((i) => i.status === 'paid').reduce((t, i) => t + i.grandTotal, 0) });
});

router.patch('/:id', need('customers.write'), async (req, res, next) => {
  try {
    const before = await Customer.findById(req.params.id).lean();
    if (!before) throw new HttpError(404, 'Customer not found');
    const patch = {};
    if (req.body.name !== undefined) patch.name = req.body.name;
    if (req.body.email !== undefined) patch.email = req.body.email;
    if (req.body.note !== undefined) patch.note = req.body.note;
    if (req.body.phone !== undefined) { patch.phone = cleanPhone(req.body.phone); if (!PHONE.test(patch.phone)) throw new HttpError(400, 'Enter a phone number of 10 to 15 digits'); }
    const c = await Customer.findOneAndUpdate({ _id: req.params.id }, patch, { new: true }).lean();
    const changes = diff(before, patch, Object.keys(patch));
    if (Object.keys(changes).length) audit(req, 'customer.edit', 'Customer', String(c._id), { changes });
    res.json(c);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: 'Another customer already has this phone' });
    next(e);
  }
});

export default router;
