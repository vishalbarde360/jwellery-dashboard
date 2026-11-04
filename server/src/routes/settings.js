import { Router } from 'express';
import Setting from '../models/Setting.js';
import { protect, need } from '../middleware/auth.js';
import { HttpError } from '../utils/errors.js';
import { validTimezone } from '../utils/dates.js';
import { audit, diff } from '../utils/audit.js';

const router = Router();
router.use(protect);

const FIELDS = ['shopName', 'gstin', 'address', 'phone', 'logo', 'timezone', 'invoicePrefix', 'barcodePrefix', 'gstPercent', 'roundTo', 'maxDiscountPercent', 'maxManagerRefund', 'stockValuation', 'maxRateChangePercent'];
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// Everyone signed in can read (invoices and labels need the shop name and logo).
router.get('/', async (_req, res) => res.json((await Setting.findOne().lean()) || {}));

// Only the owner changes business setup.
router.put('/', need('settings.write'), async (req, res) => {
  const b = req.body;
  const patch = Object.fromEntries(Object.entries(b).filter(([k]) => FIELDS.includes(k)));
  if (patch.shopName !== undefined && !String(patch.shopName).trim()) throw new HttpError(400, 'Shop name is required');
  if (patch.gstin) { patch.gstin = String(patch.gstin).trim().toUpperCase(); if (!GSTIN.test(patch.gstin)) throw new HttpError(400, 'That GSTIN does not look right (15 characters, e.g. 27ABCDE1234F1Z5)'); }
  if (patch.gstin !== undefined) patch.stateCode = patch.gstin ? patch.gstin.slice(0, 2) : '';
  if (patch.timezone && !validTimezone(patch.timezone)) throw new HttpError(400, 'Unknown time zone (use a name like Asia/Kolkata)');
  if (patch.invoicePrefix !== undefined && !/^[A-Za-z0-9]{1,6}$/.test(patch.invoicePrefix)) throw new HttpError(400, 'Invoice prefix: up to 6 letters or digits');
  if (patch.barcodePrefix !== undefined && !/^[A-Za-z0-9]{1,6}$/.test(patch.barcodePrefix)) throw new HttpError(400, 'Barcode prefix: up to 6 letters or digits');
  if (patch.logo && (!/^data:image\/(png|jpeg|webp);base64,/.test(patch.logo) || patch.logo.length > 300000)) throw new HttpError(400, 'Logo must be a PNG, JPG or WebP under about 200 KB');
  if (patch.stockValuation !== undefined && !['purchase_cost', 'weighted_average'].includes(patch.stockValuation)) throw new HttpError(400, 'Stock valuation must be purchase_cost or weighted_average');
  for (const k of ['gstPercent', 'maxDiscountPercent', 'maxRateChangePercent']) if (patch[k] !== undefined && !(patch[k] >= 0 && patch[k] <= 100)) throw new HttpError(400, `${k} must be between 0 and 100`);

  const before = (await Setting.findOne().lean()) || {};
  const saved = await Setting.findOneAndUpdate({}, patch, { new: true, upsert: true }).lean();
  const changes = diff(before, patch, Object.keys(patch).filter((k) => k !== 'logo'));
  if (patch.logo !== undefined && patch.logo !== before.logo) changes.logo = { from: '(image)', to: '(image)' };
  if (Object.keys(changes).length) audit(req, 'settings.change', 'Setting', String(saved._id), { changes });
  res.json(saved);
});

export default router;
