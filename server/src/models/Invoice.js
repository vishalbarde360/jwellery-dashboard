import mongoose from 'mongoose';

const lineSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    barcode: String, name: String, metal: String, purity: String,
    grossWeight: Number, netWeight: Number, ratePerGram: Number,
    breakup: Object, // full price breakup, frozen at the moment of sale
    charges: Object, // the rate and charge settings used (making, wastage, stones, GST), frozen too
    total: Number,
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  { mode: { type: String, enum: ['cash', 'card', 'upi', 'bank'], required: true }, amount: { type: Number, required: true }, ref: String },
  { _id: false }
);

const s = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true },
    idempotencyKey: String, // second safety net: the same key can never create two invoices
    branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customer: { name: String, phone: String },
    // Shop details frozen at the moment of sale, so old bills never change when settings change.
    shop: { name: String, gstin: String, address: String, phone: String, stateCode: String },
    placeOfSupply: String, // GST state code of the buyer; differs from shop.stateCode = IGST sale
    lines: [lineSchema],
    subtotal: Number,
    discount: { type: Number, default: 0 },
    gstPercent: Number,
    taxable: Number,
    gst: Number,
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    interState: { type: Boolean, default: false },
    grandTotal: Number,
    amountPaid: Number,
    payments: [paymentSchema],
    status: { type: String, enum: ['paid', 'void'], default: 'paid' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
s.index({ tenant: 1, invoiceNo: 1 }, { unique: true });
s.index({ tenant: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
export default mongoose.model('Invoice', s);
