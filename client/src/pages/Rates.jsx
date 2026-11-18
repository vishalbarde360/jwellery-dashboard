import { useEffect, useState } from 'react';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { money } from '../status';
import { fmtDateTime } from '../format';
import { Notice } from '../components/Bits';

const MAROON = '#4a1424';
const GOLD = '#b8892f';
const card = 'rounded-xl border border-[#ece2d0] bg-white shadow-sm';
const input = 'w-full rounded-lg border border-[#e2d5bc] bg-white px-3 py-2 text-sm outline-none focus:border-[#b8892f] focus:ring-2 focus:ring-[#b8892f]/30';
const TOLA_G = 11.664;

// Purity shortcuts. They only fill the purity box, so use the same purity
// strings your inventory uses (the old form defaulted to "22K").
const METALS = [
  { key: 'gold', label: 'Gold (Au)', purities: [['24K', 'Pure (999)'], ['22K', 'Standard (916)'], ['18K', 'Gold (750)'], ['14K', 'Modern (585)']] },
  { key: 'silver', label: 'Silver (Ag)', purities: [['999', 'Fine (999)'], ['925', 'Sterling (925)'], ['800', 'Coin (800)']] },
  { key: 'platinum', label: 'Platinum (Pt)', purities: [['950', 'Pt 950'], ['900', 'Pt 900']] },
  { key: 'other', label: 'Other', purities: [] },
];

const inr = (n) => `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const sameKey = (a, b) => a.metal === b.metal && a.purity === b.purity;

export default function Rates() {
  const { can, settings } = useAuth();
  const [latest, setLatest] = useState([]);
  const [hist, setHist] = useState([]);
  const [f, setF] = useState({ metal: 'gold', purity: '22K', perGram: '' });
  const [msg, setMsg] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const load = () => {
    api.get('/rates/latest').then((r) => setLatest(r.data)).catch((e) => setMsg({ type: 'err', text: errMsg(e) }));
    api.get('/rates/history').then((r) => setHist(r.data)).catch((e) => setMsg({ type: 'err', text: errMsg(e) }));
  };
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    const send = async (confirm) => {
      await api.post('/rates', { ...f, perGram: Number(f.perGram), ...(confirm ? { confirm: true } : {}) });
      setF({ ...f, perGram: '' });
      setMsg({ type: 'ok', text: 'Rate saved. New bills use it straight away. Old bills do not change.' });
      load();
    };
    try { await send(false); }
    catch (x) {
      // A big jump (possible typing mistake) must be confirmed on purpose.
      if (x.response?.status === 409 && x.response.data?.needsConfirm && window.confirm(x.response.data.message + '\n\nApply this rate?')) {
        try { await send(true); } catch (y) { setMsg({ type: 'err', text: errMsg(y) }); }
      } else setMsg({ type: 'err', text: errMsg(x) });
    }
  };

  const current = latest.find((r) => sameKey(r._id, f));
  const draft = Number(f.perGram) || 0;
  const basis = draft || current?.perGram || 0;
  const diff = draft && current ? draft - current.perGram : null;
  const diffPct = diff !== null && current.perGram ? (diff / current.perGram) * 100 : null;
  const metalDef = METALS.find((m) => m.key === f.metal) || METALS[3];
  // Purities that really exist in your rate data for a metal; the standard list is only used when there is no data yet.
  const puritiesFor = (key) => {
    const seen = [...latest.map((r) => r._id), ...hist].filter((x) => x.metal === key).map((x) => x.purity);
    const real = [...new Set(seen)];
    return real.length ? real.map((p) => [p, '']) : (METALS.find((m) => m.key === key)?.purities || []);
  };
  const purities = puritiesFor(f.metal);

  // Change versus the previous rate of the same metal + purity (history is newest first).
  const trend = (i) => {
    const prev = hist.slice(i + 1).find((h) => sameKey(h, hist[i]));
    return prev ? hist[i].perGram - prev.perGram : null;
  };
  const rows = showAll ? hist : hist.slice(0, 7);
  const last = hist[0];

  const exportCsv = () => {
    const lines = [['When', 'Metal', 'Purity', 'Rate per g', 'Set by'], ...hist.map((h) => [fmtDateTime(h.createdAt, settings.timezone), h.metal, h.purity, h.perGram, h.setBy?.name || ''])];
    const csv = lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'rate-history.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-5 bg-[#fbf6ee] p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-extrabold" style={{ color: MAROON }}>Daily Rates</h1>
        <p className="text-xs text-stone-500">{last ? `Last updated: ${fmtDateTime(last.createdAt, settings.timezone)}${last.setBy?.name ? ` by ${last.setBy.name}` : ''}` : 'No rates set yet.'}</p>
      </div>

      <Notice msg={msg} />

      {/* Formula banner */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-[#ecd9a8] bg-[#fbf1d8] px-4 py-3 text-sm">
        <b style={{ color: MAROON }}>Jewellery retail pricing formula</b>
        <code className="rounded bg-white/70 px-2 py-1 text-xs text-stone-700">Final item price = (Net weight × Daily rate) + Making + Stone + GST</code>
      </div>

      {/* Current rates (click one to edit it) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {latest.map((r) => {
          const active = sameKey(r._id, f);
          return (
            <button key={r._id.metal + r._id.purity} type="button" onClick={() => setF({ ...f, metal: r._id.metal, purity: r._id.purity })}
              className={`${card} p-4 text-left ${active ? 'ring-2 ring-[#b8892f]' : ''}`}>
              <div className="text-xs font-semibold capitalize text-stone-500">{r._id.metal} {r._id.purity}</div>
              <div className="mt-1 text-2xl font-extrabold" style={{ color: MAROON }}>{money(r.perGram)}<span className="text-xs font-semibold text-stone-500"> per g</span></div>
              <div className="text-[11px] text-stone-400">Set {fmtDateTime(r.at, settings.timezone)}</div>
            </button>
          );
        })}
        {!latest.length && <div className="text-sm text-stone-400">No rates set yet.</div>}
      </div>

      {/* Benchmark setter */}
      {can('rates.write') && (
        <form onSubmit={save} className={`${card} space-y-4 p-4 md:p-5`}>
          <h2 className="font-extrabold" style={{ color: MAROON }}>Daily Bullion Benchmark Setter</h2>

          <div>
            <div className="mb-1 text-xs font-semibold text-stone-500">Select bullion metal</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {METALS.map((m) => {
                const on = f.metal === m.key;
                return (
                  <button key={m.key} type="button" onClick={() => setF({ ...f, metal: m.key, purity: puritiesFor(m.key)[0]?.[0] || '' })}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-bold ${on ? 'text-white' : 'border-[#e2d5bc] bg-white text-stone-600 hover:bg-[#f6ead0]'}`}
                    style={on ? { background: MAROON, borderColor: MAROON } : {}}>{m.label}</button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-semibold text-stone-500">Standard purity</div>
            <div className="flex flex-wrap gap-2">
              {purities.map(([p, label]) => {
                const on = f.purity === p;
                return (
                  <button key={p} type="button" onClick={() => setF({ ...f, purity: p })}
                    className={`rounded-lg border px-3 py-2 text-left text-xs ${on ? 'border-[#b8892f] bg-[#fbf1d8]' : 'border-[#e2d5bc] bg-white hover:bg-[#faf4e8]'}`}>
                    <div className="font-extrabold" style={{ color: MAROON }}>{p}</div>{label && <div className="text-stone-500">{label}</div>}
                  </button>
                );
              })}
              <div className="min-w-[8rem]">
                <label className="text-[11px] font-semibold text-stone-500" htmlFor="rp">{purities.length ? 'Other purity' : 'Purity'}</label>
                <input id="rp" required className={input} value={f.purity} onChange={(e) => setF({ ...f, purity: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] md:items-end">
            <div>
              <label className="text-xs font-semibold text-stone-500" htmlFor="rg">Today's rate per gram (₹)</label>
              <input id="rg" required inputMode="decimal" className={`${input} text-xl font-extrabold`} style={{ color: MAROON }} value={f.perGram} onChange={(e) => setF({ ...f, perGram: e.target.value })} placeholder={current ? String(current.perGram) : ''} />
              <div className={`mt-1 text-xs font-semibold ${diff === null ? 'text-stone-400' : diff >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {diff === null ? (current ? `Current rate ${money(current.perGram)}` : 'No rate set for this purity yet') : `${diff >= 0 ? '+' : '−'}${inr(diff)} (${Math.abs(diffPct).toFixed(2)}%) vs current rate`}
              </div>
            </div>
            <div className="rounded-lg bg-[#faf4e8] p-3"><div className="text-[11px] text-stone-500">Per 10 grams</div><div className="text-lg font-extrabold" style={{ color: MAROON }}>{basis ? inr(basis * 10) : '—'}</div></div>
            <div className="rounded-lg bg-[#faf4e8] p-3"><div className="text-[11px] text-stone-500">Per tola ({TOLA_G} g)</div><div className="text-lg font-extrabold" style={{ color: MAROON }}>{basis ? inr(basis * TOLA_G) : '—'}</div></div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f0e6d4] pt-3">
            <p className="text-xs text-stone-500">A big jump from the current rate will ask you to confirm before it is saved.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setF({ ...f, perGram: '' })} className="rounded-lg border border-[#e2d5bc] px-4 py-2 text-sm font-semibold hover:bg-[#f6ead0]">Discard draft</button>
              <button className="rounded-lg px-4 py-2 text-sm font-bold text-white" style={{ background: MAROON }}>Set today's rate</button>
            </div>
          </div>
        </form>
      )}

      {/* History */}
      <div className={`${card} overflow-x-auto p-4`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-extrabold" style={{ color: MAROON }}>Bullion Rate History</h2>
          <div className="flex gap-3 text-xs font-semibold">
            {hist.length > 7 && <button type="button" className="text-stone-500 underline" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show last 7' : 'Show all'}</button>}
            {hist.length > 0 && <button type="button" className="underline" style={{ color: GOLD }} onClick={exportCsv}>Export full ledger (CSV)</button>}
          </div>
        </div>
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead><tr className="border-b border-[#ece2d0] text-xs text-stone-500">{['Timestamp', 'Metal & purity', 'Rate per gram', 'Change', 'Set by'].map((h) => <th key={h} className="p-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((h, i) => {
              const t = trend(i);
              return (
                <tr key={h._id} className="border-b border-[#f3ebdc]">
                  <td className="p-3">{i === 0 && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-600" title="Latest" />}{fmtDateTime(h.createdAt, settings.timezone)}</td>
                  <td className="p-3 font-semibold capitalize">{h.metal} {h.purity}</td>
                  <td className="p-3 font-bold" style={{ color: MAROON }}>{money(h.perGram)}</td>
                  <td className={`p-3 font-semibold ${t === null ? 'text-stone-400' : t >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{t === null ? '—' : `${t >= 0 ? '+' : '−'}${inr(t)}`}</td>
                  <td className="p-3">{h.setBy?.name || '—'}</td>
                </tr>
              );
            })}
            {!hist.length && <tr><td className="p-3 text-stone-400" colSpan={5}>No rate history yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}