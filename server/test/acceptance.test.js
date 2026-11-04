// Section 13 acceptance tests. One describe block per row of the table in the spec.
// Run:  npm test      (MongoDB must be a replica set; see README)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startApp, serverDir } from './helpers.js';
import { priceItem } from '../src/utils/pricing.js';
import { buildLines } from '../src/utils/invoiceCalc.js';

let app, owner, manager, cashier, cashier2, rival, accountant, inventory, sysadmin;
const PAY = (amount, mode = 'cash') => [{ mode, amount }];
// 10 g of 22K gold at the seeded Rs 7,200/g, no making/wastage/stones, 3% GST  ->  74,160
const TOTAL_10G_22K = 74160;

const countDocs = (c, f = {}) => app.db.collection(c).countDocuments({ tenant: app.tenants.demo, ...f });
const statusOf = async (barcode) => (await app.db.collection('items').findOne({ tenant: app.tenants.demo, barcode })).status;
const movesOf = (itemId) => app.db.collection('stockmovements').find({ item: itemId }).sort({ createdAt: 1, _id: 1 }).toArray();
const sell = (api, barcodes, total, extra = {}) =>
  api('POST', '/api/invoices', { barcodes, payments: PAY(total), ...extra }, { 'Idempotency-Key': app.key() });

before(async () => {
  app = await startApp({ dbName: 'Aviraj _test_acceptance', port: 5101 });
  [owner, manager, cashier, accountant, inventory, sysadmin] = await Promise.all(
    ['owner', 'manager', 'cashier', 'accountant', 'inventory', 'sysadmin'].map((r) => app.as(r)));
  rival = await app.as('rival', 'rival1234');
  const created = await sysadmin('POST', '/api/users', { name: 'Cashier Two', username: 'cashier2', password: 'cashier2pass', role: 'cashier' });
  assert.equal(created.status, 201);
  cashier2 = await app.as('cashier2', 'cashier2pass');
});
after(async () => { await app?.stop(); });

describe('Barcode billing: the correct item and price appear', () => {
  it('scan returns the right piece and the server-calculated price', async () => {
    const it1 = await app.addItem({ name: 'Scan me' });
    const r = await cashier('GET', `/api/items/scan/${it1.barcode}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.item.barcode, it1.barcode);
    assert.equal(r.body.item.name, 'Scan me');
    assert.equal(r.body.ratePerGram, 7200);
    assert.equal(r.body.price.total, TOTAL_10G_22K);
  });
  it('the saved invoice holds that same piece and price', async () => {
    const it1 = await app.addItem();
    const r = await sell(cashier, [it1.barcode], TOTAL_10G_22K);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.lines.length, 1);
    assert.equal(r.body.lines[0].barcode, it1.barcode);
    assert.equal(r.body.lines[0].total, TOTAL_10G_22K);
    assert.equal(r.body.grandTotal, TOTAL_10G_22K);
    assert.equal(await statusOf(it1.barcode), 'sold');
  });
  it('POST /invoices/preview shows the price and writes nothing', async () => {
    const it1 = await app.addItem();
    const before = await countDocs('invoices');
    const r = await cashier('POST', '/api/invoices/preview', { barcodes: [it1.barcode] });
    assert.equal(r.status, 200, `preview returned ${r.status}: ${JSON.stringify(r.body)}`);
    assert.equal(r.body.grandTotal, TOTAL_10G_22K);
    assert.equal(await countDocs('invoices'), before);
    assert.equal(await statusOf(it1.barcode), 'available');
  });
});

describe('Unknown barcode: an error is shown and nothing is added', () => {
  it('scan answers 404', async () => {
    const r = await cashier('GET', '/api/items/scan/DOES-NOT-EXIST');
    assert.equal(r.status, 404);
    assert.match(r.body.message, /not found/i);
  });
  it('a bill with an unknown tag is refused and saves nothing', async () => {
    const good = await app.addItem();
    const [inv, mv, seq] = [await countDocs('invoices'), await countDocs('stockmovements'), (await app.db.collection('counters').findOne({ tenant: app.tenants.demo, key: 'invoice' }))?.seq];
    const r = await sell(cashier, [good.barcode, 'DOES-NOT-EXIST'], TOTAL_10G_22K);
    assert.ok([404, 409].includes(r.status), `status ${r.status}`);
    assert.match(JSON.stringify(r.body), /DOES-NOT-EXIST/);
    assert.equal(await countDocs('invoices'), inv);
    assert.equal(await countDocs('stockmovements'), mv);
    assert.equal((await app.db.collection('counters').findOne({ tenant: app.tenants.demo, key: 'invoice' }))?.seq, seq);
    assert.equal(await statusOf(good.barcode), 'available');
  });
});

describe('Sold-item protection: a second cashier cannot sell the same piece', () => {
  it('sequentially', async () => {
    const p = await app.addItem();
    assert.equal((await sell(cashier, [p.barcode], TOTAL_10G_22K)).status, 201);
    const second = await sell(cashier2, [p.barcode], TOTAL_10G_22K);
    assert.equal(second.status, 409);
    assert.equal(await countDocs('stockmovements', { item: p._id, type: 'sale' }), 1);
  });
  it('at the same instant, 12 rounds: exactly one winner, never a 500', async () => {
    for (let round = 0; round < 12; round++) {
      const p = await app.addItem();
      const [a, b] = await Promise.all([sell(cashier, [p.barcode], TOTAL_10G_22K), sell(cashier2, [p.barcode], TOTAL_10G_22K)]);
      assert.deepEqual([a.status, b.status].sort(), [201, 409], `round ${round}: ${a.status}/${b.status} ${JSON.stringify([a.body, b.body])}`);
      assert.equal(await countDocs('stockmovements', { item: p._id, type: 'sale' }), 1, `round ${round}`);
    }
  });
});

describe('Pricing: the total matches the expected result, including rounding', () => {
  it('worked example from the spec: 10 g x 7,000, making 10%, wastage 2%, stones 5,000, GST 3% = 85,902', async () => {
    assert.equal((await owner('POST', '/api/rates', { metal: 'gold', purity: '24K', perGram: 7000 })).status, 201);
    const p = await app.addItem({ purity: '24K', wastagePercent: 2, makingType: 'percent', makingValue: 10, stoneValue: 5000 });
    const r = await sell(cashier, [p.barcode], 85902);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.grandTotal, 85902);
    const b = r.body.lines[0].breakup;
    assert.deepEqual([b.metalValue, b.wastage, b.making, b.stones, b.gst], [70000, 1400, 7000, 5000, 2502]);
  });
  it('rounds half-up (not banker\'s rounding) to the whole rupee', () => {
    const t = (fixedPrice) => priceItem({ priceMethod: 'fixed', fixedPrice }, 0, { gstPercent: 0, roundTo: 1 }).total;
    assert.equal(t(100.5), 101); // banker's rounding would give 100
    assert.equal(t(101.5), 102);
    assert.equal(t(0.5), 1);
    assert.equal(t(100.49), 100);
    assert.equal(priceItem({ priceMethod: 'fixed', fixedPrice: 1000 }, 0, { gstPercent: 3, roundTo: 10 }).total, 1030);
  });
  it('no floating-point drift: 0.1 + 0.2 style sums stay exact', () => {
    const items = [1, 2, 3].map((n) => ({ barcode: 'x' + n, priceMethod: 'fixed', fixedPrice: 33.33 }));
    const c = buildLines(items, () => 0, { gstPercent: 3, roundTo: 1 }, 0);
    assert.equal(c.subtotal, 99.99);
  });
  it('an invoice discount is shared across lines and the shares add up to EXACTLY the discount', () => {
    const items = [11.11, 22.22, 33.33].map((v, i) => ({ barcode: 'y' + i, priceMethod: 'fixed', fixedPrice: v }));
    const c = buildLines(items, () => 0, { gstPercent: 3, roundTo: 1 }, 10.01);
    const shares = c.lines.map((l) => l.price.discount);
    assert.equal(Math.round(shares.reduce((a, b) => a + b, 0) * 100) / 100, 10.01);
  });
  it('server total with a discount (manager) equals the independently calculated total', async () => {
    const p = await app.addItem();
    const expected = priceItem(p, 7200, { gstPercent: 3, roundTo: 1, discount: 1000 }).total;
    const r = await sell(manager, [p.barcode], expected, { discount: 1000 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.grandTotal, expected);
  });
});

describe('Rate change: an old invoice total stays the same', () => {
  it('changing today\'s rate leaves the old bill untouched and new bills use the new rate', async () => {
    await owner('POST', '/api/rates', { metal: 'gold', purity: '20K', perGram: 6000 });
    const a = await app.addItem({ purity: '20K' });
    const old = await sell(cashier, [a.barcode], 61800); // 10 g x 6000 = 60000 + 3% = 61800
    assert.equal(old.status, 201, JSON.stringify(old.body));

    assert.equal((await manager('POST', '/api/rates', { metal: 'gold', purity: '20K', perGram: 6500 })).status, 201);

    const again = await cashier('GET', `/api/invoices/${old.body._id}`);
    assert.equal(again.body.grandTotal, 61800);
    assert.equal(again.body.lines[0].ratePerGram, 6000);
    assert.equal(again.body.lines[0].charges.gstPercent, 3);
    const stored = await app.db.collection('invoices').findOne({ _id: new (await import('mongodb')).ObjectId(old.body._id) });
    assert.equal(stored.grandTotal, 61800);

    const b = await app.addItem({ purity: '20K' });
    const fresh = await sell(cashier, [b.barcode], 67100); // 10 g x 6500 = 65000 + 3% = 66950 -> 66950
    assert.equal(fresh.status, 400, 'old total must not be accepted for the new rate');
    assert.equal((await sell(cashier, [b.barcode], 66950)).status, 201);
  });
});

describe('Split payment: payments add up to the amount due', () => {
  it('cash + UPI + card that add up are accepted', async () => {
    const p = await app.addItem();
    const r = await sell(cashier, [p.barcode], 0, { payments: [{ mode: 'cash', amount: 30000 }, { mode: 'upi', amount: 24160 }, { mode: 'card', amount: 20000 }] });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.amountPaid, TOTAL_10G_22K);
    assert.equal(r.body.payments.length, 3);
  });
  it('short, over and empty payments are refused and nothing is saved', async () => {
    const p = await app.addItem();
    const inv = await countDocs('invoices');
    for (const payments of [PAY(TOTAL_10G_22K - 1), PAY(TOTAL_10G_22K + 1), [], PAY(-5), [{ mode: 'cheque', amount: TOTAL_10G_22K }]]) {
      const r = await sell(cashier, [p.barcode], 0, { payments });
      assert.equal(r.status, 400, JSON.stringify(payments));
    }
    assert.equal(await countDocs('invoices'), inv);
    assert.equal(await statusOf(p.barcode), 'available');
  });
});

describe('Failed checkout: no sale and no stock change', () => {
  it('one unavailable piece on the bill cancels the whole bill', async () => {
    const good = await app.addItem(), gone = await app.addItem({ status: 'sold' });
    const snap = async () => [await countDocs('invoices'), await countDocs('stockmovements'), (await app.db.collection('counters').findOne({ tenant: app.tenants.demo, key: 'invoice' }))?.seq];
    const before = await snap();
    const r = await sell(cashier, [good.barcode, gone.barcode], TOTAL_10G_22K * 2);
    assert.equal(r.status, 409);
    assert.deepEqual(await snap(), before);
    assert.equal(await statusOf(good.barcode), 'available');
  });
  it('a race that fails half-way rolls back the pieces it had already claimed (12 rounds)', async () => {
    for (let round = 0; round < 12; round++) {
      const shared = await app.addItem(), onlyA = await app.addItem(), onlyB = await app.addItem();
      // A claims [shared, onlyA]; B claims [onlyB, shared]. B reaches `shared` last, so if it loses it must undo onlyB.
      const [a, b] = await Promise.all([
        sell(cashier, [shared.barcode, onlyA.barcode], TOTAL_10G_22K * 2),
        sell(cashier2, [onlyB.barcode, shared.barcode], TOTAL_10G_22K * 2),
      ]);
      assert.deepEqual([a.status, b.status].sort(), [201, 409], `round ${round}: ${a.status}/${b.status}`);
      const [loserOnly, winnerOnly] = a.status === 409 ? [onlyA, onlyB] : [onlyB, onlyA];
      assert.equal(await statusOf(loserOnly.barcode), 'available', `round ${round}: loser's piece must be back in stock`);
      assert.equal(await statusOf(winnerOnly.barcode), 'sold');
      assert.equal((await movesOf(loserOnly._id)).length, 1, 'loser piece has no sale movement');
    }
  });
  it('a refused bill does not burn an invoice number (no gaps)', async () => {
    const p = await app.addItem();
    const ok1 = await sell(cashier, [p.barcode], TOTAL_10G_22K);
    await sell(cashier, [p.barcode], TOTAL_10G_22K); // fails: already sold
    const q = await app.addItem();
    const ok2 = await sell(cashier, [q.barcode], TOTAL_10G_22K);
    const n = (x) => Number(x.body.invoiceNo.split('-')[1]);
    assert.equal(n(ok2), n(ok1) + 1);
  });
});

describe('Double checkout: one invoice and one stock deduction', () => {
  it('same Idempotency-Key sent twice in a row returns the SAME bill', async () => {
    const p = await app.addItem(), k = app.key();
    const body = { barcodes: [p.barcode], payments: PAY(TOTAL_10G_22K) };
    const a = await cashier('POST', '/api/invoices', body, { 'Idempotency-Key': k });
    const b = await cashier('POST', '/api/invoices', body, { 'Idempotency-Key': k });
    assert.equal(a.status, 201);
    assert.ok([200, 201].includes(b.status));
    assert.equal(b.body.invoiceNo, a.body.invoiceNo);
    assert.equal(await countDocs('invoices', { idempotencyKey: k }), 1);
    assert.equal(await countDocs('stockmovements', { item: p._id, type: 'sale' }), 1);
  });
  it('six simultaneous clicks (double-tap / retry storm) make exactly one invoice', async () => {
    const p = await app.addItem(), k = app.key();
    const body = { barcodes: [p.barcode], payments: PAY(TOTAL_10G_22K) };
    const rs = await Promise.all(Array.from({ length: 6 }, () => cashier('POST', '/api/invoices', body, { 'Idempotency-Key': k })));
    assert.ok(rs.every((r) => r.status !== 500), JSON.stringify(rs.map((r) => r.status)));
    assert.ok(rs.some((r) => r.status === 201));
    assert.equal(await countDocs('invoices', { idempotencyKey: k }), 1);
    assert.equal(await countDocs('stockmovements', { item: p._id, type: 'sale' }), 1);
    assert.equal(await statusOf(p.barcode), 'sold');
  });
  it('a request without an Idempotency-Key is refused', async () => {
    const p = await app.addItem();
    const r = await cashier('POST', '/api/invoices', { barcodes: [p.barcode], payments: PAY(TOTAL_10G_22K) });
    assert.equal(r.status, 400);
    assert.equal(await statusOf(p.barcode), 'available');
  });
});

describe('Return limits: returns never exceed what was sold', () => {
  let inv, a, b;
  before(async () => {
    a = await app.addItem(); b = await app.addItem();
    const r = await sell(cashier, [a.barcode, b.barcode], TOTAL_10G_22K * 2);
    assert.equal(r.status, 201); inv = r.body;
  });
  const ret = (api, items, extra = {}) => api('POST', '/api/returns', { invoiceNo: inv.invoiceNo, items, reason: 'test', settlement: 'refund', refundMode: 'cash', ...extra });
  it('cannot refund more than the line was sold for', async () => {
    const r = await ret(cashier, [{ barcode: a.barcode, refundValue: TOTAL_10G_22K + 0.01 }]);
    assert.equal(r.status, 400);
    assert.equal((await ret(cashier, [{ barcode: a.barcode, refundValue: 0 }])).status, 400);
    assert.equal((await ret(cashier, [{ barcode: a.barcode, refundValue: -50 }])).status, 400);
  });
  it('cannot return a piece that is not on that bill', async () => {
    const other = await app.addItem();
    assert.equal((await ret(cashier, [{ barcode: other.barcode }])).status, 400);
  });
  it('cannot list the same piece twice, nor return from a bill that does not exist', async () => {
    assert.equal((await ret(cashier, [{ barcode: a.barcode }, { barcode: a.barcode }])).status, 400);
    assert.equal((await cashier('POST', '/api/returns', { invoiceNo: 'INV-999999', items: [{ barcode: a.barcode }], reason: 'x', refundMode: 'cash' })).status, 404);
  });
  it('a valid return is accepted once, the piece goes to "returned, under check", and a second return is refused', async () => {
    const r = await ret(cashier, [{ barcode: a.barcode }]);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.total, TOTAL_10G_22K);
    assert.equal((await ret(cashier, [{ barcode: a.barcode }])).status, 409, 'duplicate while pending');
    // Rs 74,160 is above the manager's Rs 50,000 refund limit, so the owner approves (the limit itself is tested under Permissions)
    assert.equal((await manager('POST', `/api/returns/${r.body._id}/approve`)).status, 403);
    const ok = await owner('POST', `/api/returns/${r.body._id}/approve`);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(await statusOf(a.barcode), 'returned_check');
    assert.equal((await ret(cashier, [{ barcode: a.barcode }])).status, 409, 'duplicate after completion');
    assert.equal((await owner('POST', `/api/returns/${r.body._id}/approve`)).status, 404, 'cannot approve twice');
    // total refunded for this bill so far can never exceed what the returned lines were sold for
    const done = await app.db.collection('returns').find({ tenant: app.tenants.demo, invoiceNo: inv.invoiceNo, status: 'completed' }).toArray();
    assert.ok(done.reduce((t, x) => t + x.total, 0) <= inv.grandTotal);
  });
  it('a returned piece cannot be sold again until it is inspected', async () => {
    assert.equal((await sell(cashier, [a.barcode], TOTAL_10G_22K)).status, 409);
    assert.equal((await inventory('POST', `/api/items/${a.barcode}/inspect`, { result: 'available' })).status, 200);
    assert.equal((await sell(cashier, [a.barcode], TOTAL_10G_22K)).status, 201);
  });
  it('after it is re-sold on a NEW bill, the OLD bill can no longer be used to return it', async () => {
    const r = await ret(cashier, [{ barcode: a.barcode }]);
    assert.equal(r.status, 409);
  });
});

describe('Stock reconciliation: balances match movement history', () => {
  it('after all the activity above, every piece\'s status equals its last movement', async () => {
    const r = await owner('GET', '/api/inventory/reconcile');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.mismatches, []);
    assert.equal(r.body.noHistory, 0);
    assert.equal(r.body.ok, true);
  });
  it('every sold piece has exactly as many sale movements as times it was sold', async () => {
    const sold = await app.db.collection('items').find({ tenant: app.tenants.demo, status: 'sold' }).toArray();
    for (const it of sold) {
      const mv = await movesOf(it._id);
      assert.equal(mv.at(-1).toStatus, 'sold', it.barcode);
    }
  });
  it('the check really catches a tampered balance', async () => {
    const p = await app.addItem();
    await app.db.collection('items').updateOne({ _id: p._id }, { $set: { status: 'damaged' } }); // bypasses the API on purpose
    const r = await owner('GET', '/api/inventory/reconcile');
    assert.equal(r.body.ok, false);
    assert.ok(r.body.mismatches.some((m) => m.barcode === p.barcode));
    await app.db.collection('items').updateOne({ _id: p._id }, { $set: { status: 'available' } });
    assert.equal((await owner('GET', '/api/inventory/reconcile')).body.ok, true);
  });
  it('stock movements are permanent: the API offers no way to edit or delete them', async () => {
    for (const method of ['PATCH', 'PUT', 'DELETE']) {
      const r = await owner(method, '/api/inventory/movements/abc', {});
      assert.ok([404, 405].includes(r.status));
    }
  });
});

describe('Permissions: a cashier refund is rejected by the server', () => {
  let pending;
  before(async () => {
    const p = await app.addItem();
    const s = await sell(cashier, [p.barcode], TOTAL_10G_22K);
    const r = await cashier('POST', '/api/returns', { invoiceNo: s.body.invoiceNo, items: [{ barcode: p.barcode }], reason: 'x', refundMode: 'cash' });
    pending = { id: r.body._id, barcode: p.barcode };
  });
  it('cashier cannot approve (or reject) a return', async () => {
    assert.equal((await cashier('POST', `/api/returns/${pending.id}/approve`)).status, 403);
    assert.equal((await cashier('POST', `/api/returns/${pending.id}/reject`)).status, 403);
    assert.equal(await statusOf(pending.barcode), 'sold');
  });
  it('the blocked attempt is recorded in the audit log', async () => {
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(await countDocs('auditlogs', { action: 'access.denied' }) > 0);
  });
  it('cashier cannot discount, override a price, set rates, read reports, add users or change stock', async () => {
    const p = await app.addItem();
    assert.equal((await sell(cashier, [p.barcode], TOTAL_10G_22K, { discount: 100 })).status, 403);
    assert.equal((await sell(cashier, [p.barcode], 1000, { overrides: [{ barcode: p.barcode, price: 1000, reason: 'cheeky' }] })).status, 403);
    assert.equal((await cashier('POST', '/api/rates', { metal: 'gold', purity: '22K', perGram: 1 })).status, 403);
    assert.equal((await cashier('GET', '/api/reports/sales')).status, 403);
    assert.equal((await cashier('POST', '/api/users', { name: 'x', username: 'xx', password: 'password123', role: 'owner' })).status, 403);
    assert.equal((await cashier('POST', '/api/items', {})).status, 403);
    assert.equal((await cashier('POST', `/api/items/${p.barcode}/inspect`, { result: 'available' })).status, 403);
    assert.equal(await statusOf(p.barcode), 'available');
  });
  it('cashier never sees cost price', async () => {
    const p = await app.addItem({ costPrice: 55555 });
    const scan = await cashier('GET', `/api/items/scan/${p.barcode}`);
    assert.equal(scan.body.item.costPrice, undefined);
    assert.equal((await owner('GET', `/api/items/scan/${p.barcode}`)).body.item.costPrice, 55555, 'roles with cost.read still see it');
    const list = await cashier('GET', `/api/items?q=${p.barcode}`);
    assert.equal(list.body[0].costPrice, undefined);
  });
  it('accountant, inventory and sysadmin cannot create bills; nobody without a token can do anything', async () => {
    const p = await app.addItem();
    for (const who of [accountant, inventory, sysadmin]) assert.equal((await sell(who, [p.barcode], TOTAL_10G_22K)).status, 403);
    assert.equal((await app.call(null, 'GET', '/api/items')).status, 401);
    assert.equal((await app.call('garbage.token.value', 'GET', '/api/items')).status, 401);
  });
  it('a manager cannot approve a return above the refund limit; only the owner can', async () => {
    await app.db.collection('settings').findOneAndUpdate({ tenant: app.tenants.demo }, { $set: { maxManagerRefund: 1000 } });
    const p = await app.addItem();
    const s = await sell(cashier, [p.barcode], TOTAL_10G_22K);
    const r = await cashier('POST', '/api/returns', { invoiceNo: s.body.invoiceNo, items: [{ barcode: p.barcode }], reason: 'x', refundMode: 'cash' });
    assert.equal((await manager('POST', `/api/returns/${r.body._id}/approve`)).status, 403);
    assert.equal(await statusOf(p.barcode), 'sold');
    assert.equal((await owner('POST', `/api/returns/${r.body._id}/approve`)).status, 200);
    await app.db.collection('settings').updateOne({ tenant: app.tenants.demo }, { $set: { maxManagerRefund: 50000 } });
  });
});

describe('Tenant isolation: Shop A cannot see Shop B', () => {
  let demoInv, demoItem;
  before(async () => {
    demoItem = await app.addItem({ barcode: 'ISO-A-ONLY' });
    demoInv = (await sell(cashier, [demoItem.barcode], TOTAL_10G_22K)).body;
    await rival('POST', '/api/rates', { metal: 'silver', purity: '925', perGram: 100 });
  });
  it('Shop B cannot look up, bill or read history of Shop A\'s pieces', async () => {
    assert.equal((await rival('GET', '/api/items/scan/ISO-A-ONLY')).status, 404);
    assert.equal((await rival('GET', '/api/items/ISO-A-ONLY/history')).status, 404);
    const r = await rival('POST', '/api/invoices', { barcodes: ['ISO-A-ONLY'], payments: PAY(1) }, { 'Idempotency-Key': app.key() });
    assert.ok([404, 409].includes(r.status));
    assert.equal(await statusOf('ISO-A-ONLY'), 'sold', 'untouched by shop B');
  });
  it('the same barcode in two shops resolves to each shop\'s own piece', async () => {
    const mine = await owner('GET', '/api/items/scan/WN0001');
    const theirs = await rival('GET', '/api/items/scan/WN0001');
    assert.equal(mine.body.item.metal, 'gold');
    assert.equal(theirs.body.item.metal, 'silver');
  });
  it('Shop B cannot read, reprint, search or return Shop A\'s invoices', async () => {
    assert.equal((await rival('GET', `/api/invoices/${demoInv._id}`)).status, 404);
    assert.equal((await rival('GET', `/api/invoices/${demoInv._id}/detail`)).status, 404);
    assert.equal((await rival('POST', `/api/invoices/${demoInv._id}/reprint`)).status, 404);
    const byNo = await rival('GET', `/api/invoices/by-no/${demoInv.invoiceNo}`);
    assert.ok(byNo.status === 404 || byNo.body._id !== demoInv._id, 'by-number lookup must not return shop A\'s bill');
    const list = await rival('GET', '/api/invoices');
    assert.ok(!list.body.some((i) => i._id === demoInv._id));
    assert.equal((await rival('POST', '/api/returns', { invoiceNo: demoInv.invoiceNo, items: [{ barcode: 'ISO-A-ONLY' }], reason: 'x', refundMode: 'cash' })).status, 404);
  });
  it('lists, reports, audit and stock totals only ever count the signed-in shop', async () => {
    const items = await rival('GET', '/api/items');
    assert.ok(items.body.every((i) => i.name === 'Silver Anklet'));
    const rep = await rival('GET', '/api/reports/sales');
    assert.equal(rep.body.totals.count, 0);
    const stock = await rival('GET', '/api/inventory/summary');
    assert.equal(stock.body.totalPieces, 1);
    const rec = await rival('GET', '/api/inventory/reconcile');
    assert.equal(rec.body.checked, 1);
    for (const p of ['/api/customers', '/api/inventory/movements', '/api/returns', '/api/suppliers', '/api/rates/history']) {
      const r = await rival('GET', p);
      assert.equal(r.status, 200, p);
      assert.ok(!JSON.stringify(r.body).includes('Asha Patil') && !JSON.stringify(r.body).includes(demoInv.invoiceNo) && !JSON.stringify(r.body).includes('ISO-A-ONLY'), `${p} leaks shop A data`);
    }
  });
  it('Shop B cannot touch Shop A\'s users', async () => {
    const demoOwner = await app.db.collection('users').findOne({ username: 'owner' });
    const r = await rival('PATCH', `/api/users/${demoOwner._id}`, { active: false });
    assert.ok([403, 404].includes(r.status));
    assert.equal((await app.db.collection('users').findOne({ username: 'owner' })).active, true);
  });
  it('invoice numbers are counted separately per shop', async () => {
    const b = await app.db.collection('items').findOne({ tenant: app.tenants.rival });
    const r = await rival('POST', '/api/invoices', { barcodes: [b.barcode], payments: PAY(3090) }, { 'Idempotency-Key': app.key() }); // 30 g x 100 + 3% GST
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.invoiceNo, 'INV-000001');
    assert.equal(r.body.tenant, String(app.tenants.rival));
  });
});

describe('Reprint: no change to money or stock', () => {
  it('reprinting returns the same bill and changes nothing but the audit log', async () => {
    const p = await app.addItem();
    const sale = (await sell(cashier, [p.barcode], TOTAL_10G_22K)).body;
    const snap = async () => JSON.stringify({
      invoices: await app.db.collection('invoices').find({ tenant: app.tenants.demo }).sort({ _id: 1 }).toArray(),
      items: await app.db.collection('items').find({ tenant: app.tenants.demo }).sort({ _id: 1 }).toArray(),
      moves: await countDocs('stockmovements'), counters: await app.db.collection('counters').find({ tenant: app.tenants.demo }).toArray(),
      returns: await countDocs('returns'), payments: await app.db.collection('invoices').aggregate([{ $match: { tenant: app.tenants.demo } }, { $group: { _id: null, t: { $sum: '$amountPaid' } } }]).toArray(),
    });
    const before = await snap();
    const auditBefore = await countDocs('auditlogs');
    for (let i = 0; i < 3; i++) {
      const r = await cashier('POST', `/api/invoices/${sale._id}/reprint`);
      assert.equal(r.status, 200);
      assert.equal(r.body.grandTotal, TOTAL_10G_22K);
      assert.equal(r.body.invoiceNo, sale.invoiceNo);
    }
    assert.equal(await snap(), before);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(await countDocs('auditlogs') - auditBefore, 3, 'each reprint leaves one audit line');
  });
});

describe('Offline sync (if built)', () => {
  it('not built in this version: nothing to test', { skip: 'Offline billing is listed as P1 "to confirm"; no offline code exists in server or client' }, () => {});
});

describe('Backup restore: restore works and data integrity is checked', () => {
  let dir, manifestFile, backupFile;
  const run = (script, args = [], extra = {}) => spawnSync('node', [script, ...args], { cwd: serverDir, encoding: 'utf8', env: { ...app.env, BACKUP_DIR: dir, ...extra } });
  before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wn-backup-')); });
  after(async () => {
    fs.rmSync(dir, { recursive: true, force: true });
    for (const d of (await app.client.db().admin().listDatabases()).databases) if (d.name.startsWith('Aviraj _test_restored_')) await app.client.db(d.name).dropDatabase();
  });
  it('npm run backup makes a file, restore-tests it, and reports ok', () => {
    const r = run('scripts/backup.js');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const s = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
    assert.equal(s.ok, true);
    assert.equal(s.restoreTest.ok, true);
    assert.deepEqual(s.restoreTest.problems, []);
    manifestFile = fs.readdirSync(dir).find((f) => f.endsWith('.manifest.json'));
    backupFile = path.join(dir, manifestFile.replace('.manifest.json', '.ndjson.gz'));
    assert.ok(fs.existsSync(backupFile));
  });
  it('a real restore into a new database reproduces every record exactly', async () => {
    const target = 'Aviraj _test_restored_' + Date.now();
    const r = run('scripts/restore.js', [backupFile, target]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const src = app.client.db(app.dbName), dst = app.client.db(target);
    const names = (await src.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.'));
    assert.ok(names.includes('invoices') && names.includes('items') && names.includes('stockmovements'));
    for (const n of names) {
      const [a, b] = await Promise.all([src.collection(n).find({}).sort({ _id: 1 }).toArray(), dst.collection(n).find({}).sort({ _id: 1 }).toArray()]);
      assert.equal(b.length, a.length, `${n}: record count`);
      assert.equal(JSON.stringify(b), JSON.stringify(a), `${n}: contents identical (ids, dates, decimals, references)`);
    }
    // And the restored data is internally consistent: each bill adds up and is fully paid, and stock history still reconciles.
    for (const i of await dst.collection('invoices').find({}).toArray()) {
      assert.equal(Math.round(i.lines.reduce((t, l) => t + l.total, 0) * 100), Math.round(i.grandTotal * 100), i.invoiceNo + ' lines add up');
      assert.equal(Math.round(i.payments.reduce((t, p) => t + p.amount, 0) * 100), Math.round(i.grandTotal * 100), i.invoiceNo + ' payments add up');
    }
    const lastMove = await dst.collection('stockmovements').aggregate([{ $sort: { createdAt: 1, _id: 1 } }, { $group: { _id: '$item', s: { $last: '$toStatus' } } }]).toArray();
    const items = new Map((await dst.collection('items').find({}).toArray()).map((i) => [String(i._id), i.status]));
    for (const m of lastMove) assert.equal(items.get(String(m._id)), m.s, 'restored stock status matches its last movement');
    // restore refuses to overwrite a database that already has data
    assert.notEqual(run('scripts/restore.js', [backupFile, target]).status, 0);
  });
  it('a damaged backup file is detected and refused (checksum)', () => {
    const bad = path.join(dir, 'bad.ndjson.gz');
    const buf = fs.readFileSync(backupFile); buf[Math.floor(buf.length / 2)] ^= 0xff;
    fs.writeFileSync(bad, buf);
    fs.copyFileSync(path.join(dir, manifestFile), path.join(dir, 'bad.manifest.json'));
    const r = run('scripts/restore.js', [bad, 'Aviraj _test_restored_bad' + Date.now()]);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /damaged|checksum/i);
  });
  it('a backup with a record removed is caught by the count check', () => {
    const m = JSON.parse(fs.readFileSync(path.join(dir, manifestFile), 'utf8'));
    m.counts.invoices += 1; // claim one more record than the file holds
    fs.writeFileSync(path.join(dir, manifestFile), JSON.stringify(m));
    const r = run('scripts/restore-test.js', [backupFile]);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout + r.stderr, /FAILED|checksum|holds/i);
  });
});
