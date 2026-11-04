import mongoose from 'mongoose';

// PRODUCT = a type of item, e.g. "22K gold chain". Holds the defaults.
// Each physical piece is an Item (inventory item) that points here.
const s = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, trim: true, uppercase: true },
    category: String,
    metal: { type: String, enum: ['gold', 'silver', 'platinum', 'diamond', 'other'], required: true },
    purity: { type: String, required: true },
    hsn: { type: String, default: '7113' },
    defaultPriceMethod: { type: String, enum: ['weight', 'gross_weight', 'fixed'], default: 'weight' },
    defaultWastagePercent: { type: Number, default: 0 },
    defaultMakingType: { type: String, enum: ['percent', 'per_gram', 'fixed'], default: 'percent' },
    defaultMakingValue: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
s.index({ tenant: 1, name: 1 });
s.index({ tenant: 1, sku: 1 }, { unique: true, partialFilterExpression: { sku: { $type: 'string' } } });
export default mongoose.model('Product', s);
