import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export function Barcode({ value }) {
  const ref = useRef(null);
  useEffect(() => { try { JsBarcode(ref.current, value || '0', { format: 'CODE128', height: 26, width: 1.3, displayValue: true, fontSize: 9, margin: 0 }); } catch { /* ignore */ } }, [value]);
  return <svg ref={ref} className="max-w-full" />;
}

// "Ring size 14 · For Women": only the fields that have a short word are printed on the small label.
export function attrLine(categories, category, attrs = {}) {
  const cat = categories?.find((c) => c.key === category);
  if (!cat) return '';
  return cat.fields.filter((f) => f.short && attrs[f.key] !== undefined && attrs[f.key] !== '').slice(0, 2).map((f) => `${f.short} ${attrs[f.key]}`).join(' · ');
}

// The small 50 x 25 mm label. Used for printing AND for the preview while registering a product.
export default function LabelCard({ shop, name, purity, netWeight, sku, barcode, category, attrs, categories }) {
  const extra = attrLine(categories, category, attrs);
  return (
    <div className="label flex h-[25mm] w-[50mm] flex-col justify-center overflow-hidden bg-white px-[2mm] text-[8px] leading-tight text-black">
      <div className="truncate font-bold">{shop}</div>
      <div className="truncate">{name}</div>
      <div className="truncate">{purity} · {netWeight} g{sku ? ` · ${sku}` : ''}{extra ? ` · ${extra}` : ''}</div>
      <Barcode value={barcode} />
    </div>
  );
}
