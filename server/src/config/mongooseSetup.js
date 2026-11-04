// MUST be imported before any model. Makes every model tenant-safe by default:
// one tenant (retailer) can never read or write another tenant's data.
import mongoose from 'mongoose';
import { currentTenant } from './tenantContext.js';

const QUERY_OPS = [
  'find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
  'countDocuments', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany',
];

function tenantPlugin(schema) {
  // Tenant root itself opts out; User declares its own `tenant` (needed for login before any context exists).
  if (schema.options.tenantScoped === false || schema.path('tenant')) return;

  schema.add({ tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true } });

  schema.pre(QUERY_OPS, function (next) {
    const ctx = currentTenant();
    if (!ctx) return next(new Error('Tenant context missing: refusing to query'));
    if (!ctx.bypass) this.where({ tenant: ctx.tenantId });
    next();
  });

  schema.pre('aggregate', function (next) {
    const ctx = currentTenant();
    if (!ctx) return next(new Error('Tenant context missing: refusing to aggregate'));
    if (!ctx.bypass) this.pipeline().unshift({ $match: { tenant: ctx.tenantId } });
    next();
  });

  schema.pre('validate', function (next) {
    if (!this.tenant) {
      const ctx = currentTenant();
      if (ctx && !ctx.bypass) this.tenant = ctx.tenantId;
    }
    next();
  });
}

mongoose.plugin(tenantPlugin);

// "Permanent record": stock movements and audit entries can be added, never edited or deleted.
export function permanent(schema) {
  const block = (next) => (currentTenant()?.bypass ? next() : next(new Error('This record is permanent and cannot be changed')));
  schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace', 'deleteOne', 'deleteMany'], function (next) { block(next); });
  schema.pre('save', function (next) { if (this.isNew) return next(); block(next); });
}
