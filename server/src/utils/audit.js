import AuditLog from '../models/AuditLog.js';

export const audit = (req, action, entity, entityId, meta = {}) =>
  AuditLog.create({ tenant: req.user?.tenant, user: req.user?._id, action, entity, entityId, meta, ip: req.ip }).catch(() => {});

// Before/after for edits, so "who changed what from what to what" is always answerable.
export function diff(before, after, fields) {
  const out = {};
  for (const f of fields) {
    if (after[f] !== undefined && String(before[f] ?? '') !== String(after[f] ?? '')) out[f] = { from: before[f] ?? null, to: after[f] };
  }
  return out;
}
