import { Router } from 'express';
import mongoose from 'mongoose';
import { protect, need } from '../middleware/auth.js';
import { backupAndVerify, listBackups, readStatus } from '../backup/backup.js';

const router = Router();
router.use(protect, need('system.config'));

router.get('/backups', (_req, res) => res.json({ last: readStatus(), files: listBackups().map(({ file, createdAt, bytes, counts }) => ({ file, createdAt, bytes, counts })) }));

// Back up now, then prove it restores.
router.post('/backup-now', async (_req, res) => res.json(await backupAndVerify(mongoose)));

export default router;
