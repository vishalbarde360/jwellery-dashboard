// MUST be imported before any model. Makes every model tenant-safe by default:
// one tenant (retailer) can never read or write another tenant's data.
import mongoose from 'mongoose';
import { currentTenant } from './tenantContext.js';

const QUERY_OPS = [
  'find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
  'countDocuments', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany',
];

// The ONLY tenant-free read: a customer opening their bill link (no login, so no tenant context).
// It is allowed only when ALL of these are true, so it cannot be used to read anything else:
//   - the query asks for it with .setOptions({ publicLookup: true })
//   - it is a findOne on the Invoice model
//   - it looks up by publicToken, and the token is a 16 character string (random, not guessable)
// The token itself is the key: it points to exactly one invoice, which already belongs to one tenant.
const isPublicInvoiceLookup = (q) => {
  if (q.op !== 'findOne' || q.model?.modelName !== 'Invoice') return false;
  if (q.getOptions?.().publicLookup !== true) return false;
  const t = q.getFilter?.().publicToken;
  return typeof t === 'string' && t.length === 16;
};

function tenantPlugin(schema) {
  // Tenant root itself opts out; User declares its own `tenant` (needed for login before any context exists).
  if (schema.options.tenantScoped === false || schema.path('tenant')) return;

  schema.add({ tenant: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true } });

  schema.pre(QUERY_OPS, function (next) {
    if (isPublicInvoiceLookup(this)) return next();
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
