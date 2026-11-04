import mongoose from 'mongoose';
import { permanent } from '../config/mongooseSetup.js';

// Permanent record that stock changed. Add only; never edited or deleted.
const s = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true, index: true },
    type: { type: String, enum: ['purchase', 'sale', 'return', 'transfer', 'adjustment', 'inspection'], required: true },
    toStatus: String, // the piece's status after this movement; lets us prove balances reconcile
    ref: String,
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: String,
  },
  { timestamps: true }
);
s.plugin(permanent);
export default mongoose.model('StockMovement', s);
