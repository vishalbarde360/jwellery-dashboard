import mongoose from 'mongoose';
import { permanent } from '../config/mongooseSetup.js';

const s = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    entity: String,
    entityId: String,
    meta: Object,
    ip: String,
  },
  { timestamps: true }
);
s.plugin(permanent);
export default mongoose.model('AuditLog', s);
