import mongoose from 'mongoose';

const s = new mongoose.Schema(
  { name: { type: String, required: true }, code: { type: String, required: true }, address: String, gstin: String, phone: String },
  { timestamps: true }
);
s.index({ tenant: 1, code: 1 }, { unique: true });
export default mongoose.model('Branch', s);
