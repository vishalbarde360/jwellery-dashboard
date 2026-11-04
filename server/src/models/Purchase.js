import mongoose from 'mongoose';

// A draft purchase NEVER adds stock. Only a confirmed goods receipt does.
const line = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: String,
  grossWeight: { type: Number, required: true },
  stoneWeight: { type: Number, default: 0 },
  stoneValue: { type: Number, default: 0 },
  costPrice: { type: Number, default: 0 },
  barcode: String, // filled when the goods are checked and received
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
});

const s = new mongoose.Schema(
  {
    purchaseNo: { type: String, required: true },
    supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
    status: { type: String, enum: ['draft', 'confirmed', 'cancelled'], default: 'draft' },
    lines: [line],
    totalCost: Number,
    note: String,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    confirmedAt: Date,
  },
  { timestamps: true }
);
s.index({ tenant: 1, purchaseNo: 1 }, { unique: true });
export default mongoose.model('Purchase', s);
