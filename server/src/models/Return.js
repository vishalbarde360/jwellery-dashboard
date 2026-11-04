import mongoose from 'mongoose';

const s = new mongoose.Schema(
  {
    returnNo: { type: String, required: true },
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
    invoiceNo: { type: String, required: true },
    lines: [{ _id: false, item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' }, barcode: String, name: String, refundValue: Number }],
    reason: { type: String, required: true },
    settlement: { type: String, enum: ['refund', 'credit_note'], required: true },
    refundMode: { type: String, enum: ['cash', 'card', 'upi', 'bank'] },
    creditNoteNo: String,
    total: Number,
    status: { type: String, enum: ['pending', 'completed', 'rejected'], default: 'pending' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt: Date,
  },
  { timestamps: true }
);
s.index({ tenant: 1, returnNo: 1 }, { unique: true });
export default mongoose.model('Return', s);
