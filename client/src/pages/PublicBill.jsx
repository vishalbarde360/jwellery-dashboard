import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api';
import { money } from '../status';

const MAROON = '#4a1424';

export default function PublicBill() {
  const { token } = useParams();
  const [inv, setInv] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get(`/public/invoice/${encodeURIComponent(token)}`)
      .then((r) => setInv(r.data))
      .catch(() => setErr('Bill sapadla nahi.'));
  }, [token]);

  if (err) return <div className="p-8 text-center text-stone-600">{err}</div>;
  if (!inv) return <div className="p-8 text-center text-stone-400">Loading...</div>;

  return (
    <div className="min-h-screen bg-[#fbf6ee] p-4">
      <div className="mx-auto max-w-2xl rounded-xl border border-[#ece2d0] bg-white p-6 shadow-sm">
        <h1 className="text-xl font-extrabold" style={{ color: MAROON }}>Aviraj Jewellers</h1>
        <p className="text-xs text-stone-500">Invoice {inv.number} · {new Date(inv.date).toLocaleDateString('en-IN')}</p>
        <p className="mt-3 text-sm">Customer: <b>{inv.customerName || '—'}</b></p>

        <table className="mt-4 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[#ece2d0] text-[11px] text-stone-500">
              <th className="p-2">Item</th><th className="p-2">Wt</th><th className="p-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(inv.items || []).map((it, i) => (
              <tr key={i} className="border-b border-[#f3ebdc]">
                <td className="p-2">{it.name}</td>
                <td className="p-2">{it.netWeight ? `${it.netWeight} g` : ''}</td>
                <td className="p-2 text-right">{money(it.amount ?? it.total ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-between border-t border-[#ece2d0] pt-3 text-base font-extrabold" style={{ color: MAROON }}>
          <span>Total</span><span>{money(inv.total)}</span>
        </div>

        <button onClick={() => window.print()} className="mt-5 rounded-lg px-4 py-2 text-sm font-bold text-white print:hidden" style={{ background: MAROON }}>
          Print / Save as PDF
        </button>
      </div>
    </div>
  );
}
