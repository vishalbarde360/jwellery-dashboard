import mongoose from 'mongoose';
import { STATUSES } from '../config/lifecycle.js';

// INVENTORY ITEM = one physical piece with its own ID and barcode.
// metal / purity / name are copied from the Product so a scan is one fast lookup.
// Weights are what was measured. Wastage is a price charge only and NEVER changes these weights.
const s = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    barcode: { type: String, required: true },
    name: { type: String, required: true },
    sku: { type: String, trim: true, uppercase: true },
    category: String,
    attrs: { type: mongoose.Schema.Types.Mixed, default: {} }, // category-specific details: ring size, chain length, ...
    metal: { type: String, enum: ['gold', 'silver', 'platinum', 'diamond', 'other'], required: true },
    purity: { type: String, required: true },
    grossWeight: { type: Number, required: true, min: 0 }, // total weight (g)
    stoneWeight: { type: Number, default: 0, min: 0 },
    netWeight: { type: Number, required: true, min: 0 }, // metal only = gross - stones
    stoneValue: { type: Number, default: 0 },
    costPrice: { type: Number, default: 0 }, // only roles with cost.read may see this
    // Price method: weight = net weight x rate + wastage + making + stones. gross_weight = gross weight x rate + making + stones. fixed = one fixed price.
    priceMethod: { type: String, enum: ['weight', 'gross_weight', 'fixed'], default: 'weight' },
    fixedPrice: { type: Number, default: 0 },
    wastagePercent: { type: Number, default: 0 },
    makingType: { type: String, enum: ['percent', 'per_gram', 'fixed'], default: 'percent' },
    makingValue: { type: Number, default: 0 },
    hsn: { type: String, default: '7113' },
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    status: { type: String, enum: STATUSES, default: 'available', index: true },
  },
  { timestamps: true }
);
s.index({ tenant: 1, barcode: 1 }, { unique: true }); // barcode is unique per retailer
export default mongoose.model('Item', s);
