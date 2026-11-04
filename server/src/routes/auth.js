import { Router } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Tenant from '../models/Tenant.js';
import { protect } from '../middleware/auth.js';
import { PERMISSIONS, ROLE_INFO } from '../config/permissions.js';

const router = Router();
const shape = async (u) => ({ shop: (await Tenant.findById(u.tenant).lean())?.name, id: u._id, name: u.name, role: u.role, roleLabel: ROLE_INFO[u.role].label, permissions: PERMISSIONS[u.role] });

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username: (username || '').toLowerCase() }).select('+password');
  if (!user || !user.active || !(await user.matchPassword(password || ''))) {
    return res.status(401).json({ message: 'Wrong username or password' });
  }
  req.user = user; // so the audit log knows who signed in
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '12h' });
  res.json({ token, user: await shape(user) });
});

router.get('/me', protect, async (req, res) => res.json(await shape(req.user)));

export default router;
