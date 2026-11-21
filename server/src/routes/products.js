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

// ---- SKU: <category>-<type>-<running number>, e.g. GLD-RING-001, SLV-PAYA-004, ART-NECK-002 ----
const CAT_CODE = { gold: 'GLD', silver: 'SLV', special_design: 'ART' };
const typeCode = (key) => {
  const w = String(key || '').split('_').filter(Boolean);
  return (w.length > 1 ? w.map((x) => x[0]).join('') : (w[0] || 'GEN').slice(0, 4)).toUpperCase();
};
// Looks at ALL products (also inactive ones) and all pieces, so a number that is already used is never handed out again.
async function nextSku(collection, type, session) {
  const prefix = `${CAT_CODE[collection] || 'GEN'}-${typeCode(type)}-`;
  const rx = new RegExp(`^${escapeRegex(prefix)}(\\d+)$`, 'i');
  const [ps, is] = await Promise.all([
    Product.find({ sku: rx }).select('sku').session(session).lean(),
    Item.find({ sku: rx }).select('sku').session(session).lean(),
  ]);
  const max = [...ps, ...is].reduce((m, r) => Math.max(m, parseInt(String(r.sku).match(rx)[1], 10) || 0), 0);
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

// Tells exactly WHICH field is duplicated, so the message is not a guess.
function dupField(e) {
  const keys = Object.keys(e.keyValue || e.keyPattern || {});
  const field = keys[0] || (/index:\s*([A-Za-z0-9]+?)_/.exec(e.message || '') || [])[1] || '';
  return { field, value: e.keyValue?.[field] };
}
function dupMessage(e) {
  const { field, value } = dupField(e);
  if (field === 'barcode') return `Barcode ${value ?? ''} is already used by another piece`.replace('  ', ' ');
  if (field === 'sku') return `SKU ${value ?? ''} is already used`.replace('  ', ' ');
  return `Duplicate value${field ? ` for ${field}` : ''}${value ? `: ${value}` : ''}`;
}

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
    if (e.code === 11000) return res.status(409).json({ message: dupMessage(e) });
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
// A new product gets its SKU from the server (category-type-number). If two people register at the same moment and
// the number clashes, the whole save is tried again with the next free number.
router.post('/register', need('products.write'), async (req, res, next) => {
  try {
    const { productId, product: p = {}, piece } = req.body;
    // One piece (`piece`) or many identical-type pieces (`pieces`), all saved together or not at all.
    const list = Array.isArray(req.body.pieces) ? req.body.pieces : piece ? [piece] : [];
    if (list.length > 500) throw new HttpError(400, 'Register at most 500 pieces at a time');
    if (list.length && !can(req.user.role, 'stock.receive')) throw new HttpError(403, "You don't have permission: stock.receive");

    const save = () => runInTransaction(async (session) => {
      let product;
      if (productId) {
        product = await Product.findById(productId).session(session).lean();
        if (!product) throw new HttpError(400, 'Product not found');
      } else {
        if (!String(p.name || '').trim()) throw new HttpError(400, 'Give the product a name');
        if (!String(p.category || '').trim()) throw new HttpError(400, 'Choose a type');
        if (!p.metal || !String(p.purity || '').trim()) throw new HttpError(400, 'Choose the metal and purity');
        const collection = p.collection || (p.metal === 'silver' ? 'silver' : 'gold');
        const sku = String(p.sku || '').trim() || await nextSku(collection, p.category, session);
        const [created] = await Product.create([{
          name: p.name, sku, category: p.category, subType: p.subType || undefined, collection,
          metal: p.metal, purity: String(p.purity).trim(),
          defaultPriceMethod: p.defaultPriceMethod, defaultWastagePercent: p.defaultWastagePercent,
          defaultMakingType: p.defaultMakingType, defaultMakingValue: p.defaultMakingValue,
        }], { session });
        product = created.toObject();
      }

      let made = [];
      if (list.length) {
        const barcodes = list.map((x) => String(x.barcode || '').trim());
        if (barcodes.some((b) => !b)) throw new HttpError(400, 'Give every piece a barcode');
        if (new Set(barcodes).size !== barcodes.length) throw new HttpError(400, 'Two pieces have the same barcode. Every piece needs its own barcode');
        const docs = list.map((pc, idx) => {
          const gross = Number(pc.grossWeight);
          const stone = Number(pc.stoneWeight) || 0;
          if (!(gross > 0)) throw new HttpError(400, 'Enter the gross weight');
          if (stone < 0 || stone > gross) throw new HttpError(400, 'Stone weight cannot be more than gross weight');
          const attrs = product.category && CATEGORIES[product.category] ? validateAttrs(product.category, pc.attrs) : {};
          return {
            product: product._id, barcode: barcodes[idx], name: pc.name || product.name, sku: pc.sku || product.sku || undefined,
            category: product.category, attrs, metal: product.metal, purity: product.purity, hsn: product.hsn,
            grossWeight: gross, stoneWeight: stone, netWeight: gross - stone, stoneValue: Number(pc.stoneValue) || 0,
            costPrice: can(req.user.role, 'cost.read') ? Number(pc.costPrice) || 0 : 0,
            priceMethod: pc.priceMethod ?? product.defaultPriceMethod, fixedPrice: Number(pc.fixedPrice) || 0,
            wastagePercent: pc.wastagePercent ?? product.defaultWastagePercent,
            makingType: pc.makingType ?? product.defaultMakingType, makingValue: pc.makingValue ?? product.defaultMakingValue,
            branch: req.user.branch, status: 'available',
          };
        });
        made = await Item.create(docs, { session, ordered: true });
        await StockMovement.create(made.map((it) => ({ item: it._id, type: 'purchase', toStatus: 'available', by: req.user._id, note: 'Opening stock (registered directly)' })), { session, ordered: true });
      }
      const items = made.map((it) => it.toObject());
      return { product, item: items[0] || null, items };
    });

    let out;
    for (let attempt = 0; ; attempt++) {
      try { out = await save(); break; } catch (e) {
        // Only a clash on an auto-made SKU is worth another try. A barcode clash needs a different barcode.
        const retry = e.code === 11000 && !productId && !String(p.sku || '').trim() && dupField(e).field === 'sku' && attempt < 4;
        if (!retry) throw e;
      }
    }
    audit(req, 'product.register', 'Product', String(out.product._id), { barcode: out.item?.barcode, pieces: out.items?.length || 0 });
    res.status(201).json(out);
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: dupMessage(e) });
    next(e);
  }
});

export default router;
