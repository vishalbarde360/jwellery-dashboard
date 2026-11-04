import mongoose from 'mongoose';

const s = new mongoose.Schema(
  {
    key: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    method: String,
    path: String,
    status: { type: String, enum: ['pending', 'done'], default: 'pending' },
    responseStatus: Number,
    responseBody: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);
s.index({ tenant: 1, key: 1 }, { unique: true });
s.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 48 }); // keys expire after 48 h
export default mongoose.model('IdempotencyKey', s);
