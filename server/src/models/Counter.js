import mongoose from 'mongoose';

const s = new mongoose.Schema({ key: { type: String, required: true }, seq: { type: Number, default: 0 } });
s.index({ tenant: 1, key: 1 }, { unique: true });
export default mongoose.model('Counter', s);
