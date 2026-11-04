import { useEffect, useState } from 'react';
import api, { errMsg } from '../api';
import { fmtDateTime } from '../format';
import { useAuth } from '../context/AuthContext';
import { Notice, Table } from '../components/Bits';

export default function System() {
  const { settings } = useAuth();
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const load = () => api.get('/system/backups').then((r) => setD(r.data)).catch((e) => setMsg({ type: 'err', text: errMsg(e) }));
  useEffect(() => { load(); }, []);

  const run = async () => {
    setBusy(true); setMsg(null);
    try {
      const { data } = await api.post('/system/backup-now');
      setMsg(data.ok ? { type: 'ok', text: 'Backup finished and the restore test passed.' } : { type: 'err', text: `Backup problem: ${data.error || data.restoreTest?.problems?.join('; ')}` });
      load();
    } catch (x) { setMsg({ type: 'err', text: errMsg(x) }); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">Backups</h1>
      <p className="max-w-2xl text-sm text-slate-600">Every backup is restored into a scratch database and checked record by record. A backup that cannot be restored is reported as failed.</p>
      <Notice msg={msg} />
      <button className="btn-primary" disabled={busy} onClick={run}>{busy ? 'Working…' : 'Back up now and test restore'}</button>
      {d?.last && <div className={`rounded-md px-3 py-2 text-sm ${d.last.ok ? 'bg-leaf-soft text-leaf' : 'bg-ruby-soft text-ruby'}`}>Last run {fmtDateTime(d.last.at, settings.timezone)}: {d.last.ok ? 'backup saved and restore test passed' : `failed. ${d.last.error || ''}`}</div>}
      <Table head={['File', 'Created', 'Size', 'Records']} min={560}>
        {d?.files.map((f) => <tr key={f.file} className="border-b border-paper-line"><td className="p-3">{f.file}</td><td className="p-3">{fmtDateTime(f.createdAt, settings.timezone)}</td><td className="p-3">{Math.round(f.bytes / 1024)} KB</td><td className="p-3">{Object.values(f.counts).reduce((a, b) => a + b, 0)}</td></tr>)}
        {d && !d.files.length && <tr><td className="p-4 text-slate-500" colSpan={4}>No backups yet.</td></tr>}
      </Table>
    </div>
  );
}
