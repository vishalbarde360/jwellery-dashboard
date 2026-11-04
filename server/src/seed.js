import 'dotenv/config';
import './config/mongooseSetup.js';
import mongoose from 'mongoose';
import { tenantStore } from './config/tenantContext.js';
import Tenant from './models/Tenant.js';
import User from './models/User.js';
import Branch from './models/Branch.js';
import Product from './models/Product.js';
import Item from './models/Item.js';
import Rate from './models/Rate.js';
import Setting from './models/Setting.js';
import StockCount from './models/StockCount.js';
import Invoice from './models/Invoice.js';
import StockMovement from './models/StockMovement.js';
import AuditLog from './models/AuditLog.js';
import Counter from './models/Counter.js';
import IdempotencyKey from './models/IdempotencyKey.js';
import StockAdjustment from './models/StockAdjustment.js';
import Supplier from './models/Supplier.js';
import Purchase from './models/Purchase.js';
import Return from './models/Return.js';
import Customer from './models/Customer.js';

await mongoose.connect(process.env.MONGO_URI);

await tenantStore.run({ bypass: true }, async () => {
  for (const m of [Tenant, User, Branch, Product, Item, Rate, Setting, Invoice, StockMovement, AuditLog, Counter, IdempotencyKey, StockAdjustment, Supplier, Purchase, Return, Customer, StockCount]) {
    await m.deleteMany({});
  }

  // ---- Retailer A: the demo shop ----
  const a = await Tenant.create({ name: 'Demo Jewellers', code: 'DEMO' });
  const branch = await Branch.create({ tenant: a._id, name: 'Main Shop', code: 'MAIN', address: 'Pune' });
  await User.create(
    [['Owner', 'owner'], ['Store Manager', 'manager'], ['Cashier', 'cashier'], ['Inventory Manager', 'inventory'], ['Accountant', 'accountant'], ['System Admin', 'sysadmin']]
      .map(([name, role]) => ({ tenant: a._id, name, username: role, password: role + '123', role, branch: branch._id }))
  );
  await Rate.create([
    { tenant: a._id, metal: 'gold', purity: '22K', perGram: 7200 },
    { tenant: a._id, metal: 'gold', purity: '18K', perGram: 5900 },
    { tenant: a._id, metal: 'silver', purity: '925', perGram: 95 },
  ]);
  await Setting.create({ tenant: a._id, branch: branch._id, shopName: 'Demo Jewellers', gstin: '27ABCDE1234F1Z5', address: 'Main Road, Pune', phone: '9800000001', timezone: 'Asia/Kolkata' });
  await Customer.create({ tenant: a._id, name: 'Asha Patil', phone: '9890000000' });
  const [ring, chain] = await Product.create([
    { tenant: a._id, name: 'Gold Ring 22K', category: 'ring', metal: 'gold', purity: '22K', defaultWastagePercent: 6, defaultMakingType: 'percent', defaultMakingValue: 10 },
    { tenant: a._id, name: 'Gold Chain 22K', category: 'chain', metal: 'gold', purity: '22K', defaultWastagePercent: 5, defaultMakingType: 'per_gram', defaultMakingValue: 450 },
  ]);
  const silver = await Product.create({ tenant: a._id, name: 'Silver Anklet', sku: 'SIL-ANK', category: 'anklet', metal: 'silver', purity: '925', defaultPriceMethod: 'gross_weight', defaultMakingType: 'per_gram', defaultMakingValue: 8 });
  const items = await Item.create([
    { tenant: a._id, product: silver._id, barcode: 'WN0003', name: silver.name, sku: 'SIL-ANK', category: 'anklet', metal: 'silver', purity: '925', priceMethod: 'gross_weight', grossWeight: 40, netWeight: 40, costPrice: 3000, makingType: 'per_gram', makingValue: 8, branch: branch._id },
    { tenant: a._id, product: ring._id, barcode: 'WN0001', name: ring.name, category: 'ring', metal: 'gold', purity: '22K', grossWeight: 5.2, stoneWeight: 0.2, netWeight: 5.0, stoneValue: 1500, costPrice: 32000, wastagePercent: 6, makingType: 'percent', makingValue: 10, branch: branch._id },
    { tenant: a._id, product: chain._id, barcode: 'WN0002', name: chain.name, category: 'chain', metal: 'gold', purity: '22K', grossWeight: 12.4, netWeight: 12.4, costPrice: 79000, wastagePercent: 5, makingType: 'per_gram', makingValue: 450, branch: branch._id },
  ]);
  await StockMovement.create(items.map((i) => ({ tenant: a._id, item: i._id, type: 'purchase', toStatus: 'available', note: 'Opening stock' })));

  await Supplier.create({ tenant: a._id, name: 'Shree Gold Suppliers', phone: '9800000000' });

  // ---- Retailer B: proves one tenant never sees another's data (same barcode is fine) ----
  const b = await Tenant.create({ name: 'Rival Jewellers', code: 'RIVAL' });
  const bb = await Branch.create({ tenant: b._id, name: 'Rival Shop', code: 'MAIN' });
  await User.create({ tenant: b._id, name: 'Rival Owner', username: 'rival', password: 'rival1234', role: 'owner', branch: bb._id });
  const bp = await Product.create({ tenant: b._id, name: 'Silver Anklet', metal: 'silver', purity: '925' });
  await Item.create({ tenant: b._id, product: bp._id, barcode: 'WN0001', name: bp.name, metal: 'silver', purity: '925', grossWeight: 30, netWeight: 30 });
});

console.log('Seeded. Demo shop logins: <role>/<role>123 (owner, manager, cashier, inventory, accountant, sysadmin)');
console.log('Second shop (isolation test): rival / rival1234');
await mongoose.disconnect();
