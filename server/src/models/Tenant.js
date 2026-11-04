import mongoose from 'mongoose';

// Tenant = one retailer. Everything else belongs to exactly one tenant.
export default mongoose.model(
  'Tenant',
  new mongoose.Schema(
    { name: { type: String, required: true }, code: { type: String, required: true, unique: true }, active: { type: Boolean, default: true } },
    { timestamps: true, tenantScoped: false }
  )
);
