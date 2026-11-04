import mongoose from 'mongoose';

// Minimal data only: name, phone, optional email and note.
const s = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    note: String,
  },
  { timestamps: true }
);
s.index({ tenant: 1, phone: 1 }, { unique: true });
export default mongoose.model('Customer', s);
