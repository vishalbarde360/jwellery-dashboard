import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { can } from '../config/permissions.js';
import { tenantStore } from '../config/tenantContext.js';

export const protect = async (req, res, next) => {
  let user;
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ message: 'Please sign in' });
    const { id } = jwt.verify(token, process.env.JWT_SECRET);
    user = await User.findById(id);
    if (!user || !user.active) return res.status(401).json({ message: 'Account not available' });
  } catch {
    return res.status(401).json({ message: 'Session expired, please sign in again' });
  }
  req.user = user;
  // Everything after this point can only see this user's retailer.
  tenantStore.run({ tenantId: user.tenant }, () => next());
};

export const need = (perm) => (req, res, next) =>
  can(req.user.role, perm) ? next() : res.status(403).json({ message: `You don't have permission: ${perm}` });

export const needAny = (...perms) => (req, res, next) =>
  perms.some((p) => can(req.user.role, p)) ? next() : res.status(403).json({ message: "You don't have permission for this" });
