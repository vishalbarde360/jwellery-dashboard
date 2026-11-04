import { Router } from 'express';
import Item from '../models/Item.js';
import Invoice from '../models/Invoice.js';
import Customer from '../models/Customer.js';
import Setting from '../models/Setting.js';
import StockMovement from '../models/StockMovement.js';
import Return from '../models/Return.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { protect, need, needAny } from '../middleware/auth.js';
import { idempotent } from '../middleware/idempotent.js';
import { can } from '../config/permissions.js';
import { parseCodes, parseDiscount, parseOverrides, parsePlaceOfSupply, quote } from '../utils/billing.js';
import { nextNumber } from '../utils/counter.js';
import { runInTransaction } from '../utils/tx.js';
import { HttpError } from '../utils/errors.js';
import { audit } from '../utils/audit.js';
import { dayRange, isDateStr } from '../utils/dates.js';
import { escapeRegex } from '../utils/text.js';

const router = Router();
router.use(protect);
const MODES = ['cash', 'card', 'upi', 'bank'];

function parsePayments(payments) {
  const pays = (Array.isArray(payments) ? payments : []).map((p) => ({ mode: p.mode, amount: Number(p.amount), ref: p.ref }));
  if (!pays.length || pays.some((p) => !MODES.includes(p.mode) || !(p.amount > 0))) {
    throw new HttpError(400, 'Add at least one payment (cash, UPI, card or bank transfer) with an amount');
  }
  return pays;
}

// Show the price before anything is saved. Writes nothing.
router.post('/preview', need('billing.create'), async (req, res) => {
  const codes = parseCodes(req.body.barcodes);
  const discount = parseDiscount(req.body.discount);
  const overrides = parseOverrides(req.body.overrides, codes);
  const placeOfSupply = parsePlaceOfSupply(req.body.placeOfSupply);
  const { calc, settings, interState } = await quote({ codes, discount, overrides, role: req.user.role, placeOfSupply });
  res.json({
    subtotal: calc.subtotal, discount, gstPercent: settings.gstPercent ?? 3, taxable: calc.taxable, gst: calc.gst,
    cgst: calc.cgst, sgst: calc.sgst, igst: calc.igst, interState, grandTotal: calc.grandTotal,
    lines: calc.lines.map((l) => ({
      barcode: l.item.barcode, name: l.item.name, metal: l.item.metal, purity: l.item.purity,
      grossWeight: l.item.grossWeight, netWeight: l.item.netWeight, ratePerGram: l.rate, price: l.price,
    })),
  });
});

// SAVE TOGETHER: invoice, payments, stock status and stock movements are saved in ONE transaction, or none are.
router.post('/', need('billing.create'), idempotent, async (req, res, next) => {
  try {
    const codes = parseCodes(req.body.barcodes);
    const discount = parseDiscount(req.body.discount);
    const overrides = parseOverrides(req.body.overrides, codes);
    const pays = parsePayments(req.body.payments);
    const placeOfSupply = parsePlaceOfSupply(req.body.placeOfSupply);

    const invoice = await runInTransaction(async (session) => {
      const { ordered, calc, settings, interState, shopState } = await quote({ codes, discount, overrides, role: req.user.role, session, placeOfSupply });

      const paid = pays.reduce((t, p) => t + p.amount, 0);
      if (Math.abs(paid - calc.grandTotal) > 0.005) {
        throw new HttpError(400, `Payments (₹${paid}) must add up to the bill total (₹${calc.grandTotal})`);
      }

      let customerId;
      let customer = { name: req.body.customer?.name, phone: req.body.customer?.phone };
      if (req.body.customerId) {
        const c = await Customer.findById(req.body.customerId).session(session).lean();
        if (!c) throw new HttpError(400, 'Customer not found');
        customerId = c._id;
        customer = { name: c.name, phone: c.phone };
      }

      for (const it of ordered) {
        const ok = await Item.findOneAndUpdate({ _id: it._id, status: 'available' }, { status: 'sold' }, { session });
        if (!ok) throw new HttpError(409, `${it.barcode} was just sold at another counter`);
      }

      const invoiceNo = await nextNumber('invoice', settings.invoicePrefix || 'INV', session);
      const [inv] = await Invoice.create(
        [{
          invoiceNo, idempotencyKey: req.idempotencyKey, branch: req.user.branch, customerId, customer,
          shop: { name: settings.shopName, gstin: settings.gstin, address: settings.address, phone: settings.phone, stateCode: shopState },
          placeOfSupply: placeOfSupply || shopState, interState,
          lines: calc.lines.map(({ item, rate, price }) => ({
            item: item._id, barcode: item.barcode, name: item.name, metal: item.metal, purity: item.purity,
            grossWeight: item.grossWeight, netWeight: item.netWeight, ratePerGram: rate, breakup: price, total: price.total,
            charges: { priceMethod: item.priceMethod || 'weight', wastagePercent: item.wastagePercent, makingType: item.makingType, makingValue: item.makingValue, stoneValue: item.stoneValue, fixedPrice: item.fixedPrice, gstPercent: settings.gstPercent ?? 3, roundTo: settings.roundTo ?? 1 },
          })),
          subtotal: calc.subtotal, discount, gstPercent: settings.gstPercent ?? 3, taxable: calc.taxable, gst: calc.gst, cgst: calc.cgst, sgst: calc.sgst, igst: calc.igst, grandTotal: calc.grandTotal,
          amountPaid: paid, payments: pays, status: 'paid', createdBy: req.user._id,
        }],
        { session }
      );
      await StockMovement.insertMany(
        ordered.map((it) => ({ tenant: req.user.tenant, item: it._id, type: 'sale', toStatus: 'sold', ref: invoiceNo, by: req.user._id })),
        { session }
      );
      return inv;
    });

    // Every price change is logged with the original price and the reason.
    for (const l of invoice.lines) {
      if (l.breakup?.overridden) {
        audit(req, 'price.override', 'Invoice', invoice.invoiceNo, { barcode: l.barcode, from: l.breakup.originalSubtotal, to: l.breakup.subtotal, reason: l.breakup.overrideReason });
      }
    }
    res.status(201).json(invoice);
  } catch (e) {
    if (e.code === 11000 && String(e.message).includes('idempotencyKey')) {
      const existing = await Invoice.findOne({ idempotencyKey: req.idempotencyKey }).lean();
      if (existing) return res.status(200).json(existing);
    }
    next(e);
  }
});

// Search: bill number, customer name or phone, and a date range (in the shop's time zone).
router.get('/', needAny('billing.create', 'sales.read'), async (req, res) => {
  const { q, from, to, mode } = req.query;
  const filter = can(req.user.role, 'sales.read') ? {} : { createdBy: req.user._id };
  if (q) {
    const r = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ invoiceNo: r }, { 'customer.name': r }, { 'customer.phone': r }];
  }
  if (mode) { if (!MODES.includes(mode)) throw new HttpError(400, 'Unknown payment mode'); filter['payments.mode'] = mode; }
  if ((from && !isDateStr(from)) || (to && !isDateStr(to))) throw new HttpError(400, 'Dates must look like 2026-11-02');
  if (from || to) {
    const tz = (await Setting.findOne().lean())?.timezone;
    filter.createdAt = dayRange(from, to, tz);
  }
  res.json(await Invoice.find(filter).sort({ createdAt: -1 }).limit(100).lean());
});

router.get('/by-no/:no', needAny('returns.create', 'sales.read'), async (req, res) => {
  const inv = await Invoice.findOne({ invoiceNo: req.params.no.toUpperCase() }).lean();
  inv ? res.json(inv) : res.status(404).json({ message: 'No bill with that number' });
});

const mayView = (req, inv) => inv && (can(req.user.role, 'sales.read') || String(inv.createdBy) === String(req.user._id));

router.get('/:id', needAny('billing.create', 'sales.read'), async (req, res) => {
  const inv = await Invoice.findById(req.params.id).lean();
  mayView(req, inv) ? res.json(inv) : res.status(404).json({ message: 'Invoice not found' });
});

// Everything behind one bill: price breakup, who made it, price changes with reasons, returns, stock movements.
router.get('/:id/detail', needAny('billing.create', 'sales.read'), async (req, res) => {
  const inv = await Invoice.findById(req.params.id).lean();
  if (!mayView(req, inv)) return res.status(404).json({ message: 'Invoice not found' });
  const wide = can(req.user.role, 'sales.read');
  const [returns, createdBy, overrides, movements] = await Promise.all([
    Return.find({ invoiceNo: inv.invoiceNo }).sort({ createdAt: 1 }).lean(),
    User.findById(inv.createdBy).select('name role').lean(),
    wide ? AuditLog.find({ action: 'price.override', entityId: inv.invoiceNo }).populate('user', 'name').lean() : [],
    wide ? StockMovement.find({ ref: inv.invoiceNo }).populate('item', 'barcode name').lean() : [],
  ]);
  res.json({ invoice: inv, returns, createdBy, overrides, movements });
});

// Reprinting changes nothing. It only leaves a line in the audit log.
router.post('/:id/reprint', needAny('billing.create', 'sales.read'), async (req, res) => {
  const inv = await Invoice.findById(req.params.id).lean();
  mayView(req, inv) ? res.json(inv) : res.status(404).json({ message: 'Invoice not found' });
});

export default router;
