import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api';
import InvoiceView from '../components/InvoiceView';
import FormatToggle from '../components/FormatToggle';

const MAROON = '#4a1424';

// Customer's bill page. Opened from the WhatsApp link, no login needed.
export default function PublicBill() {
  const { token } = useParams();
  const [inv, setInv] = useState(null);
  const [err, setErr] = useState('');
  const [format, setFormat] = useState('a4');

  useEffect(() => {
    api.get(`/public/invoice/${encodeURIComponent(token)}`)
      .then((r) => setInv(r.data))
      .catch(() => setErr('Bill sapadla nahi.'));
  }, [token]);

  if (err) return <div className="p-8 text-center text-stone-600">{err}</div>;
  if (!inv) return <div className="p-8 text-center text-stone-400">Loading...</div>;

  return (
    <div className="min-h-screen space-y-4 bg-[#fbf6ee] p-3 md:p-6">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#ece2d0] bg-white p-3 shadow-sm print:hidden">
        <span className="text-sm font-extrabold" style={{ color: MAROON }}>{inv.shop?.name || 'Invoice'} · {inv.invoiceNo}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <FormatToggle value={format} onChange={setFormat} />
          <button className="rounded-lg px-4 py-2 text-sm font-bold text-white" style={{ background: MAROON }} onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
      </div>
      <div className="overflow-x-auto">
       <InvoiceView invoice={inv} format={format} detailed />
      </div>
    </div>
  );
}
