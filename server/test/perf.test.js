// Section 13 performance targets. Run:  npm run test:perf
// Numbers depend on the machine and dataset: the spec says targets are verified in an AGREED test
// environment with an AGREED dataset, so tune these three knobs to match that agreement.
//   PERF_ITEMS (default 5000)  PERF_INVOICES (default 3000)  PERF_USERS (default 20)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, pct } from './helpers.js';

const ITEMS = Number(process.env.PERF_ITEMS || 5000);
const INVOICES = Number(process.env.PERF_INVOICES || 3000);
const USERS = Number(process.env.PERF_USERS || 20);
const T = { pos: 200, scan: 300, report: 2000 }; // ms, from the spec table
let app, cashier, manager, owner, accountant, barcodes = [], rows = [];
const TOTAL = 74160;
const row = (name, samples, target, stat = 'p95') => {
  const v = stat === 'max' ? Math.max(...samples) : pct(samples, 95);
  rows.push({ check: name, n: samples.length, [stat + ' ms']: Math.round(v), target: `<= ${target} ms`, result: v <= target ? 'PASS' : 'FAIL' });
  return v;
};

before(async () => {
  app = await startApp({ dbName: 'Aviraj _test_perf', port: 5102 });
  [cashier, manager, owner, accountant] = await Promise.all(['cashier', 'manager', 'owner', 'accountant'].map((r) => app.as(r)));
  const t = app.tenants.demo, now = Date.now(), db = app.db;
  const product = (await db.collection('products').findOne({ tenant: t }))._id;
  const items = Array.from({ length: ITEMS }, (_, i) => ({
    tenant: t, product, barcode: `PF${String(i).padStart(6, '0')}`, name: `Perf piece ${i}`, metal: 'gold', purity: '22K', grossWeight: 10, stoneWeight: 0, netWeight: 10,
    stoneValue: 0, costPrice: 1000, priceMethod: 'weight', fixedPrice: 0, wastagePercent: 0, makingType: 'percent', makingValue: 0, hsn: '7113', status: 'available', attrs: {},
    createdAt: new Date(now - i * 1000), updatedAt: new Date(now),
  }));
  const ins = await db.collection('items').insertMany(items);
  await db.collection('stockmovements').insertMany(Object.values(ins.insertedIds).map((id) => ({ tenant: t, item: id, type: 'purchase', toStatus: 'available', createdAt: new Date(now), updatedAt: new Date(now) })));
  barcodes = items.map((i) => i.barcode);
  // Historic invoices spread over the last 90 days so report date ranges have real work to do.
  const inv = Array.from({ length: INVOICES }, (_, i) => {
    const at = new Date(now - Math.random() * 90 * 864e5);
    return { tenant: t, invoiceNo: `OLD-${String(i).padStart(6, '0')}`, lines: [{ barcode: 'x', name: 'x', total: TOTAL }], subtotal: 72000, discount: 0, taxable: 72000, gst: 2160, grandTotal: TOTAL, amountPaid: TOTAL, payments: [{ mode: i % 2 ? 'upi' : 'cash', amount: TOTAL }], status: 'paid', customer: { name: 'Old customer ' + i }, createdAt: at, updatedAt: at };
  });
  if (inv.length) await db.collection('invoices').insertMany(inv);
});
after(async () => {
  console.log(`\nDataset: ${ITEMS} pieces, ${INVOICES} invoices, ${USERS} concurrent users`);
  console.table(rows);
  await app?.stop();
});

describe('Barcode lookup: under 300 ms (95th percentile)', () => {
  it('300 scans of random pieces', async () => {
    await cashier('GET', `/api/items/scan/${barcodes[0]}`); // warm-up
    const ms = [];
    for (let i = 0; i < 300; i++) {
      const r = await cashier('GET', `/api/items/scan/${barcodes[Math.floor(Math.random() * barcodes.length)]}`);
      assert.equal(r.status, 200); ms.push(r.ms);
    }
    assert.ok(row('Barcode lookup (sequential)', ms, T.scan) <= T.scan);
  });
});

describe('POS interactions: 200 ms or less (95th percentile)', () => {
  let cursor = 1000;
  it('price preview', async (t) => {
    const probe = await cashier('POST', '/api/invoices/preview', { barcodes: [barcodes[cursor]] });
    if (probe.status !== 200) {
      rows.push({ check: 'Price preview', n: 0, 'p95 ms': '-', target: `<= ${T.pos} ms`, result: `BROKEN (HTTP ${probe.status}: ${probe.body.message})` });
      return assert.fail(`POST /api/invoices/preview returned ${probe.status}: ${probe.body.message}`);
    }
    const ms = [];
    for (let i = 0; i < 200; i++) ms.push((await cashier('POST', '/api/invoices/preview', { barcodes: [barcodes[cursor + (i % 50)]] })).ms);
    assert.ok(row('Price preview', ms, T.pos) <= T.pos);
  });
  it('save a one-item bill (the heaviest POS action: transaction + invoice + stock movement)', async () => {
    const ms = [];
    for (let i = 0; i < 150; i++) {
      const r = await cashier('POST', '/api/invoices', { barcodes: [barcodes[cursor++]], payments: [{ mode: 'cash', amount: TOTAL }] }, { 'Idempotency-Key': app.key() });
      assert.equal(r.status, 201, JSON.stringify(r.body)); ms.push(r.ms);
    }
    assert.ok(row('Save one-item bill (sequential)', ms, T.pos) <= T.pos);
  });
  it('invoice search / customer lookup', async () => {
    const ms = [];
    for (let i = 0; i < 50; i++) ms.push((await cashier('GET', '/api/invoices?q=INV-0000')).ms);
    assert.ok(row('Invoice search', ms, T.pos) <= T.pos);
  });
});

describe(`Concurrent users: at least ${USERS}`, () => {
  let next = 2000;
  // Each virtual cashier scans, then saves a one-item bill. `think` is the pause between bills (ms).
  const runUsers = async (bills, think) => {
    const scanMs = [], saveMs = [], bad = [];
    const worker = async (w) => {
      const api = w % 2 ? cashier : manager;
      await new Promise((r) => setTimeout(r, Math.random() * think)); // stagger the start
      for (let i = 0; i < bills; i++) {
        const code = barcodes[next++];
        const s = await api('GET', `/api/items/scan/${code}`); scanMs.push(s.ms);
        if (s.status !== 200) bad.push(['scan', s.status, s.body]);
        const r = await api('POST', '/api/invoices', { barcodes: [code], payments: [{ mode: 'upi', amount: TOTAL }] }, { 'Idempotency-Key': app.key() });
        saveMs.push(r.ms);
        if (r.status !== 201) bad.push(['save', r.status, r.body]);
        if (think) await new Promise((r2) => setTimeout(r2, think * (0.5 + Math.random())));
      }
    };
    await Promise.all(Array.from({ length: USERS }, (_, w) => worker(w)));
    return { scanMs, saveMs, bad };
  };

  it(`${USERS} cashiers billing at a realistic pace: no errors, scan and save targets met`, async () => {
    const { scanMs, saveMs, bad } = await runUsers(5, 8000); // ~2.5 bills/s in total: several times busier than 20 real cashiers (~0.3 bills/s at the spec's 60 s median)
    assert.deepEqual(bad.slice(0, 3), [], `${bad.length} failed requests under load`);
    row(`Barcode lookup (${USERS} users, paced)`, scanMs, T.scan);
    row(`Save bill (${USERS} users, paced)`, saveMs, T.pos);
    assert.ok(pct(scanMs, 95) <= T.scan, `scan p95 ${Math.round(pct(scanMs, 95))} ms`);
    assert.ok(pct(saveMs, 95) <= T.pos, `save p95 ${Math.round(pct(saveMs, 95))} ms`);
  });

  it(`BURST: ${USERS} users billing back-to-back with no pauses stay correct (latency is reported, not asserted)`, async () => {
    const { scanMs, saveMs, bad } = await runUsers(10, 0);
    assert.deepEqual(bad.slice(0, 3), [], `${bad.length} failed requests under burst`);
    rows.push({ check: `Save bill (${USERS} users, BURST)`, n: saveMs.length, 'p95 ms': Math.round(pct(saveMs, 95)), target: 'info only', result: 'INFO' });
    rows.push({ check: `Barcode lookup (${USERS} users, BURST)`, n: scanMs.length, 'p95 ms': Math.round(pct(scanMs, 95)), target: 'info only', result: 'INFO' });
    const rec = await owner('GET', '/api/inventory/reconcile');
    assert.equal(rec.body.ok, true, 'stock still reconciles after the burst');
    assert.equal(await app.db.collection('invoices').countDocuments({ tenant: app.tenants.demo, invoiceNo: /^INV-/ }), 150 + USERS * 5 + USERS * 10, 'every bill saved exactly once');
  });
});

describe('Reports and stock screens: 2 seconds or less', () => {
  const screens = [
    ['Dashboard', () => owner('GET', '/api/reports/dashboard')],
    ['Sales report (30 days)', () => owner('GET', '/api/reports/sales')],
    ['Sales report (90 days)', () => owner('GET', `/api/reports/sales?from=${new Date(Date.now() - 89 * 864e5).toISOString().slice(0, 10)}`)],
    ['Tax report (30 days)', () => accountant('GET', '/api/reports/tax')],
    ['Tax report CSV', () => accountant('GET', '/api/reports/tax?format=csv')],
    ['Stock report + reconcile', () => owner('GET', '/api/reports/stock')],
    ['Stock summary', () => owner('GET', '/api/inventory/summary')],
    ['Stock movements', () => owner('GET', '/api/inventory/movements')],
    ['Inventory list (page 1)', () => owner('GET', '/api/items')],
    ['Inventory search', () => owner('GET', '/api/items?q=Perf piece 42')],
  ];
  for (const [name, fn] of screens) {
    it(name, async () => {
      await fn();
      const ms = []; let last;
      for (let i = 0; i < 5; i++) { last = await fn(); ms.push(last.ms); }
      assert.equal(last.status, 200, `${name}: ${last.status}`);
      assert.ok(row(name, ms, T.report, 'max') <= T.report);
    });
  }
});
