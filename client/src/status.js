// Life of a piece (PDF page 06). Only "available" pieces can be sold.
export const STATUS = {
  available: { label: 'Available', cls: 'bg-leaf-soft text-leaf' },
  sold: { label: 'Sold', cls: 'border border-paper-line bg-paper text-slate-600' },
  returned_check: { label: 'Returned, under check', cls: 'bg-gold-soft text-gold-deep' },
  repair: { label: 'Repair', cls: 'bg-gold-soft text-gold-deep' },
  reserved: { label: 'Reserved', cls: 'bg-ink-100 text-ink' },
  in_transit: { label: 'In transit', cls: 'bg-ink-100 text-ink' },
  damaged: { label: 'Damaged', cls: 'bg-ruby-soft text-ruby' },
  lost: { label: 'Lost', cls: 'bg-ruby-soft text-ruby' },
};

export const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
