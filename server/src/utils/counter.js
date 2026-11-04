import Counter from '../models/Counter.js';

// Per-retailer running numbers (INV-000001). Inside a transaction a failed save also rolls the number back, so there are no gaps.
export async function nextNumber(key, prefix, session) {
  const c = await Counter.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, { new: true, upsert: true, session });
  return `${prefix}-${String(c.seq).padStart(6, '0')}`;
}
