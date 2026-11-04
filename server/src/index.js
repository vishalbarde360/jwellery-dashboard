import 'dotenv/config';
import 'express-async-errors'; // async route errors go to the error handler instead of crashing
import './config/mongooseSetup.js'; // must stay first: makes every model tenant-safe
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import itemRoutes from './routes/items.js';
import rateRoutes from './routes/rates.js';
import adjustmentRoutes from './routes/adjustments.js';
import userRoutes from './routes/users.js';
import metaRoutes from './routes/meta.js';
import productRoutes from './routes/products.js';
import invoiceRoutes from './routes/invoices.js';
import supplierRoutes from './routes/suppliers.js';
import purchaseRoutes from './routes/purchases.js';
import returnRoutes from './routes/returns.js';
import settingsRoutes from './routes/settings.js';
import barcodeRoutes from './routes/barcodes.js';
import customerRoutes from './routes/customers.js';
import inventoryRoutes from './routes/inventory.js';
import reportRoutes from './routes/reports.js';
import systemRoutes from './routes/system.js';
import pricingRoutes from './routes/pricing.js';
import { backupAndVerify } from './backup/backup.js';
import { audit } from './utils/audit.js';

const prod = process.env.NODE_ENV === 'production';
if (prod && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-this-secret')) {
  console.error('Refusing to start: set a strong JWT_SECRET in production.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
// Secure transport: in production every request must arrive over HTTPS (HTTPS is ended at your proxy or host).
if (prod) {
  app.use((req, res, next) => (req.secure ? next() : res.status(426).json({ message: 'Use HTTPS' })));
  app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));
}
app.use(cors({ origin: process.env.CLIENT_URL, exposedHeaders: ['X-Total-Count'] }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Audit trail: every successful change AND every blocked attempt is recorded.
app.use((req, res, next) => {
  res.on('finish', () => {
    if (!req.user) return;
    const denied = res.statusCode === 403;
    if ((req.method !== 'GET' && res.statusCode < 400) || denied) {
      const { password, ...body } = req.body || {};
      audit(req, denied ? 'access.denied' : `${req.method} ${req.baseUrl}${req.path}`, 'api', '', { status: res.statusCode, body });
    }
  });
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many sign-in attempts. Try again in 15 minutes.' } }));
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/barcodes', barcodeRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/rates', rateRoutes);
app.use('/api/adjustments', adjustmentRoutes);
app.use('/api/users', userRoutes);
app.use('/api', metaRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  const bad = err.name === 'ValidationError' || err.name === 'CastError';
  res.status(bad ? 400 : err.status || 500).json({ message: err.message || 'Something went wrong' });
});

connectDB()
  .then(() => {
    // Automated backups (set BACKUP_ENABLED=true). Each run also proves the backup can be restored.
    if (process.env.BACKUP_ENABLED === 'true') {
      cron.schedule(process.env.BACKUP_CRON || '0 2 * * *', () => backupAndVerify(mongoose).then((s) => console.log('Backup', s.ok ? 'OK' : 'FAILED', s.error || s.restoreTest?.problems || '')));
      console.log('Automated backups on:', process.env.BACKUP_CRON || '0 2 * * *');
    }
    app.listen(process.env.PORT || 5000, () => console.log('API on :' + (process.env.PORT || 5000)));
  })
  .catch((e) => { console.error('DB connection failed', e.message); process.exit(1); });
