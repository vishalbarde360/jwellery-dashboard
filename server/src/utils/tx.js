import mongoose from 'mongoose';
import { HttpError } from './errors.js';

// "Save together": everything inside succeeds, or nothing is saved at all.
// Needs MongoDB running as a replica set (Atlas always is; see README for local setup).
export async function runInTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let out;
    await session.withTransaction(async () => { out = await fn(session); });
    return out;
  } catch (e) {
    if (/replica set|Transaction numbers/i.test(e.message || '')) {
      throw new HttpError(500, 'Saving needs MongoDB running as a replica set. See the README.');
    }
    throw e;
  } finally {
    await session.endSession();
  }
}
