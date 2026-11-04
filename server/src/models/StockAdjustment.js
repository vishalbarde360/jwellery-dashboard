import mongoose from 'mongoose';

// Stock corrections are two-person: one requests, a DIFFERENT person approves.
export default mongoose.model(
  'StockAdjustment',
  new mongoose.Schema(
    {
      item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
      newStatus: { type: String, enum: ['available', 'reserved', 'in_transit', 'damaged', 'lost'], required: true },
      reason: { type: String, required: true },
      status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
      requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
  )
);
