// Pure unit tests (no database): CGST + SGST / IGST split. Run: npm run test:unit
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { priceItem } from '../src/utils/pricing.js';
import { buildLines } from '../src/utils/invoiceCalc.js';

const fixed = (fixedPrice, barcode = 'A') => ({ barcode, priceMethod: 'fixed', fixedPrice });

describe('GST split', () => {
  it('same-state sale: CGST + SGST add up to EXACTLY the GST (odd paisa goes to SGST)', () => {
    const p = priceItem(fixed(1001), 0, { gstPercent: 3, roundTo: 1 }); // GST 30.03
    assert.equal(p.gst, 30.03);
    assert.equal(p.cgst, 15.02);
    assert.equal(p.sgst, 15.01);
    assert.equal(p.igst, 0);
    assert.equal(Math.round((p.cgst + p.sgst) * 100), Math.round(p.gst * 100));
  });
  it('inter-state sale: all IGST, no CGST/SGST', () => {
    const p = priceItem(fixed(1001), 0, { gstPercent: 3, roundTo: 1, interState: true });
    assert.deepEqual([p.cgst, p.sgst, p.igst], [0, 0, 30.03]);
  });
  it('the split never changes the total', () => {
    const a = priceItem(fixed(1001), 0, { gstPercent: 3, roundTo: 1 });
    const b = priceItem(fixed(1001), 0, { gstPercent: 3, roundTo: 1, interState: true });
    assert.equal(a.total, b.total);
    assert.equal(a.gst, b.gst);
  });
  it('invoice totals: CGST + SGST + IGST always equal the invoice GST', () => {
    for (const interState of [false, true]) {
      const items = [fixed(1001, 'A'), fixed(2503, 'B'), fixed(999, 'C')];
      const c = buildLines(items, () => 0, { gstPercent: 3, roundTo: 1 }, 10.01, {}, interState);
      assert.equal(Math.round((c.cgst + c.sgst + c.igst) * 100), Math.round(c.gst * 100));
      assert.equal(c.igst > 0, interState);
    }
  });
});
