import { Router } from 'express';
import Product from '../models/Product.js';
import { protect, need } from '../middleware/auth.js';
import { audit, diff } from '../utils/audit.js';
import { escapeRegex } from '../utils/text.js';
import Item from '../models/Item.js';
import StockMovement from '../models/StockMovement.js';
import { can } from '../config/permissions.js';
import { CATEGORIES, validateAttrs } from '../config/categories.js';
import { runInTransaction } from '../utils/tx.js';
import { HttpError } from '../utils/errors.js';

const router = Router();
router.use(protect);

router.get('/', need('stock.read'), async (req, res) => {
  const filter = { active: true };
  if (req.query.q) { const r = new RegExp(escapeRegex(req.query.q), 'i'); filter.$or = [{ name: r }, { sku: r }]; }
  res.json(await Product.find(filter).sort({ name: 1 }).lean());
});

router.post('/', need('products.write'), async (req, res, next) => {
  try {
    const { name, sku, category, metal, purity, hsn, defaultPriceMethod, defaultWastagePercent, defaultMakingType, defaultMakingValue } = req.body;
    res.status(201).json(await Product.create({ name, sku: sku || undefined, category, metal, purity, hsn, defaultPriceMethod, defaultWastagePercent, defaultMakingType, defaultMakingValue }));
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: 'That SKU is already used' });
    next(e);
  }
});

router.patch('/:id', need('products.write'), async (req, res) => {
  const allowed = ['name', 'sku', 'category', 'defaultPriceMethod', 'hsn', 'defaultWastagePercent', 'defaultMakingType', 'defaultMakingValue', 'active'];
  const patch = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  const before = await Product.findById(req.params.id).lean();
  if (!before) return res.status(404).json({ message: 'Product not found' });
  const p = await Product.findOneAndUpdate({ _id: req.params.id }, patch, { new: true }).lean();
  const changes = diff(before, patch, Object.keys(patch));
  if (Object.keys(changes).length) audit(req, 'product.edit', 'Product', String(p._id), { changes });
  res.json(p);
});

// Product registration in one step: the product type (category, metal, purity, price rules)
// and, optionally, the first real piece with its barcode and weights. Saved together, or not at all.
// Registering a piece directly is for opening stock and own-made pieces. It is logged like any other change.
router.post('/register', need('products.write'), async (req, res, next) => {
  try {
    const { productId, product: p = {}, piece } = req.body;
    if (piece && !can(req.user.role, 'stock.receive')) throw new HttpError(403, "You don't have permission: stock.receive");

    const out = await runInTransaction(async (session) => {
      let product;
      if (productId) {
        product = await Product.findById(productId).session(session).lean();
        if (!product) throw new HttpError(400, 'Product not found');
      } else {
        if (!String(p.name || '').trim()) throw new HttpError(400, 'Give the product a name');
        if (!CATEGORIES[p.category]) throw new HttpError(400, 'Choose a category');
        if (!p.metal || !String(p.purity || '').trim()) throw new HttpError(400, 'Choose the metal and purity');
        const [created] = await Product.create([{
          name: p.name, sku: p.sku || undefined, category: p.category, metal: p.metal, purity: String(p.purity).trim(),
          defaultPriceMethod: p.defaultPriceMethod, defaultWastagePercent: p.defaultWastagePercent,
          defaultMakingType: p.defaultMakingType, defaultMakingValue: p.defaultMakingValue,
        }], { session });
        product = created.toObject();
      }

      let item = null;
      if (piece) {
        const barcode = String(piece.barcode || '').trim();
        if (!barcode) throw new HttpError(400, 'Give the piece a barcode');
        const gross = Number(piece.grossWeight);
        const stone = Number(piece.stoneWeight) || 0;
        if (!(gross > 0)) throw new HttpError(400, 'Enter the gross weight');
        if (stone < 0 || stone > gross) throw new HttpError(400, 'Stone weight cannot be more than gross weight');
        const attrs = product.category && CATEGORIES[product.category] ? validateAttrs(product.category, piece.attrs) : {};
        [item] = await Item.create([{
          product: product._id, barcode, name: piece.name || product.name, sku: piece.sku || product.sku || undefined,
          category: product.category, attrs, metal: product.metal, purity: product.purity, hsn: product.hsn,
          grossWeight: gross, stoneWeight: stone, netWeight: gross - stone, stoneValue: Number(piece.stoneValue) || 0,
          costPrice: can(req.user.role, 'cost.read') ? Number(piece.costPrice) || 0 : 0,
          priceMethod: piece.priceMethod ?? product.defaultPriceMethod, fixedPrice: Number(piece.fixedPrice) || 0,
          wastagePercent: piece.wastagePercent ?? product.defaultWastagePercent,
          makingType: piece.makingType ?? product.defaultMakingType, makingValue: piece.makingValue ?? product.defaultMakingValue,
          branch: req.user.branch, status: 'available',
        }], { session });
        await StockMovement.create([{ item: item._id, type: 'purchase', toStatus: 'available', by: req.user._id, note: 'Opening stock (registered directly)' }], { session });
      }
      return { product, item: item && item.toObject() };
    });
    audit(req, 'product.register', 'Product', String(out.product._id), { barcode: out.item?.barcode });
    res.status(201).json(out);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: 'That SKU or barcode is already used' });
    next(e);
  }
});

export default router;
