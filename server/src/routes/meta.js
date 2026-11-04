import { Router } from 'express';
import AuditLog from '../models/AuditLog.js';
import { protect, need } from '../middleware/auth.js';
import { PERMISSIONS, ROLE_INFO } from '../config/permissions.js';
import { SCOPE } from '../config/scope.js';
import { categoryList } from '../config/categories.js';

const router = Router();
router.use(protect);

router.get('/roles', (_req, res) => res.json({ info: ROLE_INFO, permissions: PERMISSIONS }));

router.get('/categories', (_req, res) => res.json(categoryList()));

router.get('/scope', (_req, res) => res.json(SCOPE));

router.get('/audit', need('audit.read'), async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = 50;
  const [rows, total] = await Promise.all([
    AuditLog.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('user', 'name role').lean(),
    AuditLog.countDocuments(),
  ]);
  res.json({ rows, total, page, pages: Math.ceil(total / limit) });
});

export default router;
