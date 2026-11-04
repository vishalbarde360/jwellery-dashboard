import mongoose from 'mongoose';

export default mongoose.model('Supplier', new mongoose.Schema({ name: { type: String, required: true, trim: true }, phone: String, gstin: String, address: String }, { timestamps: true }));
