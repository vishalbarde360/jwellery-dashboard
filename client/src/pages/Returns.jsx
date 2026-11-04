import { useEffect, useState } from 'react';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { money } from '../status';
import { Notice, Table } from '../components/Bits';

export default function Returns() {
  const { can } = useAuth();
  const [no, setNo] = useState('');
  const [inv, setInv] = useState(null);
  const [pick, setPick] = useState({}); // barcode -> refund value string (present = selected)
  const [reason, setReason] = useState('');
  const [settlement, setSettlement] = useState('refund');
  const [refundMode, setRefundMode] = useState('cash');
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState(null);

  const load = () => api.get('/returns').then((r) => setList(r.data)).catch((e) => setMsg({ type: 'err', text: errMsg(e) }));
  useEffect(() => { load(); }, []);

  // Step 1: open the original bill
  const open = async (e) => {
    e.preventDefault();
    setInv(null); setPick({});
    try { setInv((await api.get(`/invoices/by-no/${encodeURIComponent(no.trim())}`)).data); setMsg(null); }
    catch (x) { setMsg({ type: 'err', text: errMsg(x) }); }
  };
  const toggle = (l) => {
    const next = { ...pick };
    next[l.barcode] === undefined ? (next[l.barcode] = String(l.total)) : delete next[l.barcode];
    setPick(next);
  };

  // Steps 2-4: select items, reason and refund value, refund or credit note
  const submit = async () => {
    try {
      await api.post('/returns', {
        invoiceNo: inv.invoiceNo, reason, settlement, refundMode,
        items: Object.entries(pick).map(([barcode, v]) => ({ barcode, refundValue: Number(v) })),
      });
      setInv(null); setPick({}); setReason(''); setNo('');
      setMsg({ type: 'ok', text: 'Return sent for approval. Stock changes when a manager approves it.' }); load();
    } catch (x) { setMsg({ type: 'err', text: errMsg(x) }); }
  };

  const decide = async (id, what) => {
    try { await api.post(`/returns/${id}/${what}`); setMsg({ type: 'ok', text: what === 'approve' ? 'Approved. The pieces are now "returned, under check".' : 'Rejected' }); load(); }
    catch (x) { setMsg({ type: 'err', text: errMsg(x) }); }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-ink">Returns</h1>
      <Notice msg={msg} />

      {can('returns.create') && (
        <section className="card space-y-4 p-4">
          <form onSubmit={open} className="flex items-end gap-2">
            <div><label className="label" htmlFor="bn">Original bill number</label><input id="bn" className="input !w-56" placeholder="INV-000001" value={no} onChange={(e) => setNo(e.target.value)} /></div>
            <button className="btn-primary">Open bill</button>
          </form>

          {inv && (
            <>
              <div className="divide-y divide-paper-line rounded-md border border-paper-line">
                {inv.lines.map((l) => (
                  <label key={l.barcode} className="flex cursor-pointer items-center gap-3 p-3 text-sm">
                    <input type="checkbox" checked={pick[l.barcode] !== undefined} onChange={() => toggle(l)} />
                    <span className="flex-1"><span className="font-semibold">{l.name}</span> <span className="text-slate-500">{l.barcode}</span></span>
                    <span>{money(l.total)}</span>
                    {pick[l.barcode] !== undefined && (
                      <input aria-label={`Refund for ${l.barcode}`} className="input !w-28" inputMode="decimal" value={pick[l.barcode]} onClick={(e) => e.preventDefault()} onChange={(e) => setPick({ ...pick, [l.barcode]: e.target.value })} />
                    )}
                  </label>
                ))}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="md:col-span-3"><label className="label" htmlFor="rs">Reason</label><input id="rs" className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
                <div><label className="label" htmlFor="st">Give back as</label>
                  <select id="st" className="input" value={settlement} onChange={(e) => setSettlement(e.target.value)}><option value="refund">Refund</option><option value="credit_note">Credit note</option></select></div>
                {settlement === 'refund' && (
                  <div><label className="label" htmlFor="rm">Refund paid by</label>
                    <select id="rm" className="input" value={refundMode} onChange={(e) => setRefundMode(e.target.value)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank transfer</option></select></div>
                )}
              </div>
              <button className="btn-gold" disabled={!Object.keys(pick).length || !reason.trim()} onClick={submit}>Send for approval</button>
            </>
          )}
        </section>
      )}

      <Table head={['Return', 'Bill', 'Pieces', 'Value', 'Type', 'Status', '']}>
        {list.map((r) => (
          <tr key={r._id} className="border-b border-paper-line">
            <td className="p-3 font-semibold">{r.returnNo}</td>
            <td className="p-3">{r.invoiceNo}</td>
            <td className="p-3">{r.lines.map((l) => l.barcode).join(', ')}</td>
            <td className="p-3">{money(r.total)}</td>
            <td className="p-3">{r.settlement === 'credit_note' ? `Credit note ${r.creditNoteNo || ''}` : `Refund (${r.refundMode})`}</td>
            <td className="p-3 capitalize">{r.status === 'pending' ? 'Waiting for approval' : r.status}</td>
            <td className="p-3 text-right">
              {r.status === 'pending' && can('returns.approve') && (
                <div className="flex justify-end gap-2"><button className="btn-primary !px-3 !py-1" onClick={() => decide(r._id, 'approve')}>Approve</button><button className="btn-ghost !px-3 !py-1" onClick={() => decide(r._id, 'reject')}>Reject</button></div>
              )}
            </td>
          </tr>
        ))}
        {!list.length && <tr><td className="p-4 text-slate-500" colSpan={7}>No returns yet.</td></tr>}
      </Table>
    </div>
  );
}
