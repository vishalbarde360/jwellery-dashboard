// Risk controls from sections 12, 16 and 17: GST split, controlled rate updates, stock counts, margin report.
// Run: node --test --test-concurrency=1 test/controls.test.js   (MongoDB replica set needed, same as the other tests)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp } from './helpers.js';

let app, owner, cashier, accountant, inventory;
before(async () => {
  app = await startApp({ dbName: 'Aviraj _test_controls', port: 5103 });
  [owner, cashier, accountant, inventory] = await Promise.all(['owner', 'cashier', 'accountant', 'inventory'].map((r) => app.as(r)));
});
after(async () => { await app?.stop(); });

describe('GST split on the bill', () => {
  it('same state = CGST + SGST, other state = IGST, total identical, saved on the invoice', async () => {
    assert.equal((await owner('PUT', '/api/settings', { gstin: '27ABCDE1234F1Z5' })).status, 200);
    const it1 = await app.addItem();
    const same = await owner('POST', '/api/invoices/preview', { barcodes: [it1.barcode] });
    const other = await owner('POST', '/api/invoices/preview', { barcodes: [it1.barcode], placeOfSupply: '29' });
    assert.equal(same.status, 200);
    assert.ok(same.body.cgst > 0 && same.body.sgst > 0 && same.body.igst === 0);
    assert.ok(other.body.igst > 0 && other.body.cgst === 0 && other.body.sgst === 0);
    assert.equal(same.body.grandTotal, other.body.grandTotal);
    assert.equal(Math.round((same.body.cgst + same.body.sgst) * 100), Math.round(same.body.gst * 100));
    const sold = await owner('POST', '/api/invoices', { barcodes: [it1.barcode], placeOfSupply: '29', payments: [{ mode: 'cash', amount: other.body.grandTotal }] }, { 'Idempotency-Key': app.key() });
    assert.equal(sold.status, 201);
    assert.equal(sold.body.interState, true);
    assert.ok(sold.body.igst > 0);
  });
  it('a bad state code is refused', async () => {
    const it2 = await app.addItem();
    assert.equal((await owner('POST', '/api/invoices/preview', { barcodes: [it2.barcode], placeOfSupply: 'XX' })).status, 400);
  });
  it('the tax report carries CGST / SGST / IGST columns', async () => {
    const r = await owner('GET', '/api/reports/tax');
    assert.equal(r.status, 200);
    assert.ok('cgst' in r.body.totals && 'sgst' in r.body.totals && 'igst' in r.body.totals);
  });
});

describe('Controlled rate updates', () => {
  it('a huge jump (typing mistake) needs confirmation; a normal change does not; both are audited', async () => {
    const typo = await owner('POST', '/api/rates', { metal: 'gold', purity: '18K', perGram: 590 }); // 5900 -> 590
    assert.equal(typo.status, 409);
    assert.equal(typo.body.needsConfirm, true);
    const ok = await owner('POST', '/api/rates', { metal: 'gold', purity: '18K', perGram: 6000 }); // +1.7%
    assert.equal(ok.status, 201);
    const confirmed = await owner('POST', '/api/rates', { metal: 'gold', purity: '18K', perGram: 3000, confirm: true });
    assert.equal(confirmed.status, 201);
    const logged = await app.db.collection('auditlogs').countDocuments({ tenant: app.tenants.demo, action: 'rate.set' });
    assert.equal(logged, 2, 'the refused attempt is not a change, the two saved changes are logged');
  });
});

describe('Stock count', () => {
  it('lists missing and unexpected tags, and never changes stock', async () => {
    const a = await app.addItem({ metal: 'silver', purity: '925' });
    const b = await app.addItem({ metal: 'silver', purity: '925' });
    const c = await app.addItem({ metal: 'silver', purity: '925' });
    const r = await inventory('POST', '/api/inventory/counts', { metal: 'silver', purity: '925', barcodes: [a.barcode, b.barcode, 'NO-SUCH-TAG'] });
    assert.equal(r.status, 201);
    assert.ok(r.body.missing.some((m) => m.barcode === c.barcode), 'the unscanned piece is reported missing');
    assert.ok(r.body.unexpected.some((u) => u.barcode === 'NO-SUCH-TAG'));
    assert.equal(r.body.ok, false);
    const still = await app.db.collection('items').findOne({ tenant: app.tenants.demo, barcode: c.barcode });
    assert.equal(still.status, 'available', 'a count does not edit stock');
  });
  it('a cashier cannot run a count', async () => {
    assert.equal((await cashier('POST', '/api/inventory/counts', { barcodes: ['X'] })).status, 403);
  });
});

describe('Margin report keeps price, metal value, cost and margin separate', () => {
  it('shows each figure on its own and the margin is revenue minus cost', async () => {
    const it = await app.addItem({ costPrice: 1000 }); // 10 g 22K at 7,200 = 72,000 before GST
    const prev = await owner('POST', '/api/invoices/preview', { barcodes: [it.barcode] });
    assert.equal((await owner('POST', '/api/invoices', { barcodes: [it.barcode], payments: [{ mode: 'cash', amount: prev.body.grandTotal }] }, { 'Idempotency-Key': app.key() })).status, 201);
    const r = await accountant('GET', '/api/reports/margin');
    assert.equal(r.status, 200);
    const row = r.body.rows.find((x) => x.metal === 'gold' && x.purity === '22K');
    assert.ok(row && row.pieces >= 1);
    assert.equal(Math.round((row.revenue - row.cost) * 100), Math.round(row.margin * 100));
    assert.ok(row.metalValue > 0 && row.cost > 0 && row.revenue > 0);
  });
  it('a cashier cannot see it (cost is private)', async () => {
    assert.equal((await cashier('GET', '/api/reports/margin')).status, 403);
  });
});
