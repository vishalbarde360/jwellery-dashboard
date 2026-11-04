import { useEffect, useState } from 'react';
import api from '../api';

// Today's metal rates, always visible at the top of every screen.
export default function RateStrip() {
  const [rates, setRates] = useState([]);
  useEffect(() => { api.get('/rates/latest').then((r) => setRates(r.data)).catch(() => {}); }, []);

  if (!rates.length) return <span className="text-sm text-slate-500">Today's rates not set</span>;
  return (
    <ul className="flex flex-wrap items-center gap-x-6 gap-y-1">
      {rates.map((r) => (
        <li key={`${r._id.metal}-${r._id.purity}`} className="flex items-baseline gap-2">
          <span className="text-sm font-semibold capitalize text-slate-600">{r._id.metal} {r._id.purity}</span>
          <span className="text-base font-extrabold text-gold-deep">₹{r.perGram.toLocaleString('en-IN')}</span>
          <span className="text-xs text-slate-500">per g</span>
        </li>
      ))}
    </ul>
  );
}
