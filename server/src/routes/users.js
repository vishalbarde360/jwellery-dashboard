import { Router } from 'express';
import User from '../models/User.js';
import { protect, need } from '../middleware/auth.js';
import { ROLES } from '../config/permissions.js';

const router = Router();
router.use(protect, need('users.manage'));

router.get('/', async (req, res) => res.json(await User.find({ tenant: req.user.tenant }).sort({ createdAt: 1 }).lean()));

router.post('/', async (req, res, next) => {
  try {
    const { name, username, password, role } = req.body;
    if (!ROLES.includes(role)) return res.status(400).json({ message: 'Choose a valid role' });
    if (!password || password.length < 8) return res.status(400).json({ message: 'Password needs at least 8 characters' });
    const u = await User.create({ tenant: req.user.tenant, name, username, password, role, branch: req.user.branch });
    res.status(201).json({ _id: u._id, name: u.name, username: u.username, role: u.role, active: u.active });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ message: 'That username is taken' });
    next(e);
  }
});

router.patch('/:id', async (req, res) => {
  const { role, active } = req.body;
  if (String(req.params.id) === String(req.user._id)) return res.status(400).json({ message: "You can't change your own role or status" });
  const patch = {};
  if (role !== undefined) { if (!ROLES.includes(role)) return res.status(400).json({ message: 'Choose a valid role' }); patch.role = role; }
  if (active !== undefined) patch.active = !!active;
  const u = await User.findOneAndUpdate({ _id: req.params.id, tenant: req.user.tenant }, patch, { new: true }).lean();
  if (!u) return res.status(404).json({ message: 'User not found' });
  res.json(u);
});

export default router;
