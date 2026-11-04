import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api, { errMsg } from '../api';
import { Notice } from '../components/Bits';

// Opens a bill from its number (used by report and stock movement links).
export default function InvoiceByNo() {
  const { no } = useParams();
  const nav = useNavigate();
  const [msg, setMsg] = useState(null);
  useEffect(() => { api.get(`/invoices/by-no/${encodeURIComponent(no)}`).then((r) => nav(`/invoices/${r.data._id}`, { replace: true })).catch((e) => setMsg({ type: 'err', text: errMsg(e) })); }, [no]); // eslint-disable-line
  return msg ? <Notice msg={msg} /> : <p className="text-sm text-slate-500">Opening {no}…</p>;
}
