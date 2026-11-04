import { Router } from 'express';
import Item from '../models/Item.js';
import Rate from '../models/Rate.js';
import Setting from '../models/Setting.js';
import Product from '../models/Product.js';
import StockMovement from '../models/StockMovement.js';
import { INSPECT, STATUS_LABEL } from '../config/lifecycle.js';
import { runInTransaction } from '../utils/tx.js';
import { HttpError } from '../utils/errors.js';
import { audit, diff } from '../utils/audit.js';
import { CATEGORIES, validateAttrs } from '../config/categories.js';
import { protect, need } from '../middleware/auth.js';
import { can } from '../config/permissions.js';
import { priceItem } from '../utils/pricing.js';

const router = Router();
router.use(protect);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Cashiers must never see cost prices.
const clean = (role) => (doc) => {
  if (!can(role, 'cost.read')) delete doc.costPrice;
  return doc;
};

router.get('/scan/:barcode', need('billing.create'), async (req, res) => {
  const item = await Item.findOne({ barcode: req.params.barcode }).lean();
  if (!item) return res.status(404).json({ message: 'Tag not found' });
  if (item.status !== 'available') return res.status(409).json({ message: `This piece cannot be sold: ${STATUS_LABEL[item.status]}` });

  const rate = await Rate.findOne({ metal: item.metal, purity: item.purity }).sort({ createdAt: -1 }).lean();
  if (!rate) return res.status(422).json({ message: `Set today's ${item.metal} ${item.purity} rate first` });
  const settings = (await Setting.findOne().lean()) || {};

  res.json({ item: clean(req.user.role)(item), ratePerGram: rate.perGram, price: priceItem(item, rate.perGram, settings) });
});

router.get('/', need('stock.read'), async (req, res) => {
  const { q, status, metal, purity, category } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (metal) filter.metal = metal;
  if (purity) filter.purity = purity;
  if (category) filter.category = category;
  const size = Math.min(parseInt(req.query.limit) || 50, 200);
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  if (q) filter.$or = [{ barcode: new RegExp(esc(q), 'i') }, { name: new RegExp(esc(q), 'i') }, { sku: new RegExp(esc(q), 'i') }];
  const [items, total] = await Promise.all([
    Item.find(filter).sort({ createdAt: -1 }).skip((page - 1) * size).limit(size).lean(),
    Item.countDocuments(filter),
  ]);
  res.set('X-Total-Count', String(total));
  res.json(items.map(clean(req.user.role)));
});

// Receive one physical piece into stock. It gets its own barcode and is based on a Product.
router.post('/', need('stock.receive'), async (req, res, next) => {
  try {
    const b = req.body;
    const product = await Product.findById(b.productId).lean();
    if (!product) return res.status(400).json({ message: 'Choose a product first' });
    if (!(b.grossWeight > 0)) return res.status(400).json({ message: 'Enter the gross weight' });
    const stoneWeight = b.stoneWeight || 0;
    const netWeight = b.netWeight ?? b.grossWeight - stoneWeight;
    if (netWeight < 0 || stoneWeight > b.grossWeight) return res.status(400).json({ message: 'Stone weight cannot be more than gross weight' });

    const item = await Item.create({
      product: product._id,
      barcode: b.barcode,
      name: b.name || product.name,
      sku: b.sku || undefined,
      category: product.category,
      attrs: product.category && CATEGORIES[product.category] ? validateAttrs(product.category, b.attrs) : {},
      metal: product.metal,
      purity: product.purity,
      hsn: product.hsn,
      grossWeight: b.grossWeight,
      stoneWeight,
      netWeight,
      stoneValue: b.stoneValue || 0,
      costPrice: b.costPrice || 0,
      priceMethod: b.priceMethod ?? product.defaultPriceMethod,
      fixedPrice: b.fixedPrice || 0,
      wastagePercent: b.wastagePercent ?? product.defaultWastagePercent,
      makingType: b.makingType ?? product.defaultMakingType,
      makingValue: b.makingValue ?? product.defaultMakingValue,
      branch: req.user.branch,
      status: 'available',
    });
    await StockMovement.create({ item: item._id, type: 'purchase', toStatus: 'available', by: req.user._id, note: 'Received into stock' });
    res.status(201).json(clean(req.user.role)(item.toObject()));
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: 'This barcode is already used by another piece' });
    next(e);
  }
});

// Audited edit of a piece. A sold piece cannot be edited. The log keeps before and after.
const EDITABLE = ['name', 'sku', 'grossWeight', 'stoneWeight', 'stoneValue', 'wastagePercent', 'makingType', 'makingValue', 'priceMethod', 'fixedPrice', 'costPrice'];
router.patch('/:id', need('products.write'), async (req, res, next) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) throw new HttpError(404, 'Piece not found');
    if (item.status === 'sold') throw new HttpError(409, 'A sold piece cannot be edited');
    const patch = Object.fromEntries(Object.entries(req.body).filter(([k]) => EDITABLE.includes(k)));
    if (patch.costPrice !== undefined && !can(req.user.role, 'cost.read')) delete patch.costPrice;
    const gross = Number(patch.grossWeight ?? item.grossWeight);
    const stone = Number(patch.stoneWeight ?? item.stoneWeight);
    if (!(gross > 0) || stone < 0 || stone > gross) throw new HttpError(400, 'Check the weights: stones cannot weigh more than the piece');
    if (req.body.attrs !== undefined && item.category && CATEGORIES[item.category]) patch.attrs = validateAttrs(item.category, req.body.attrs);
    const changes = diff(item.toObject(), patch, Object.keys(patch).filter((k) => k !== 'attrs'));
    if (patch.attrs && JSON.stringify(patch.attrs) !== JSON.stringify(item.attrs || {})) changes.attrs = { from: item.attrs || {}, to: patch.attrs };
    Object.assign(item, patch, { netWeight: gross - stone });
    if (patch.attrs) item.markModified('attrs');
    await item.save();
    if (Object.keys(changes).length) audit(req, 'item.edit', 'Item', item.barcode, { changes });
    res.json(clean(req.user.role)(item.toObject()));
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: 'That SKU is already used' });
    next(e);
  }
});

// Full movement history of one piece.
router.get('/:barcode/history', need('stock.read'), async (req, res) => {
  const item = await Item.findOne({ barcode: req.params.barcode }).lean();
  if (!item) throw new HttpError(404, 'Tag not found');
  const moves = await StockMovement.find({ item: item._id }).sort({ createdAt: -1 }).populate('by', 'name').lean();
  res.json({ barcode: item.barcode, name: item.name, status: item.status, moves });
});

// Inspect a returned or repaired piece. Only after this can it become Available again.
router.post('/:barcode/inspect', need('stock.inspect'), async (req, res) => {
  const { result, note } = req.body;
  const from = INSPECT[result];
  if (!from) throw new HttpError(400, 'Choose: available, repair or damaged');
  const out = await runInTransaction(async (session) => {
    const before = await Item.findOneAndUpdate({ barcode: req.params.barcode, status: { $in: from } }, { status: result }, { session });
    if (!before) throw new HttpError(409, 'This piece is not waiting for inspection or repair');
    await StockMovement.create(
      [{ item: before._id, type: 'inspection', toStatus: result, by: req.user._id, note: `${STATUS_LABEL[before.status]} -> ${STATUS_LABEL[result]}${note ? ': ' + note : ''}` }],
      { session }
    );
    return { barcode: before.barcode, status: result };
  });
  res.json(out);
});

export default router;
