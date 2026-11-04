import { useEffect, useState } from 'react';
import api from '../api';

export default function AuditLog() {
  const [d, setD] = useState({ rows: [], page: 1, pages: 1, total: 0 });
  const [page, setPage] = useState(1);
  useEffect(() => { api.get('/audit', { params: { page } }).then((r) => setD(r.data)); }, [page]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Audit log</h1>
        <p className="mt-1 text-sm text-slate-600">{d.total} records. Changes and blocked attempts are both kept.</p>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead className="border-b border-paper-line bg-paper text-slate-600">
            <tr><th className="p-3">When</th><th className="p-3">Who</th><th className="p-3">What</th><th className="p-3">Result</th></tr>
          </thead>
          <tbody>
            {d.rows.map((r) => (
              <tr key={r._id} className="border-b border-paper-line">
                <td className="whitespace-nowrap p-3">{new Date(r.createdAt).toLocaleString('en-IN')}</td>
                <td className="p-3">{r.user?.name || '—'}</td>
                <td className="p-3">{r.action}</td>
                <td className="p-3">
                  {r.action === 'access.denied' ? <span className="rounded bg-ruby-soft px-2 py-0.5 text-xs font-semibold text-ruby">Blocked</span> : <span className="text-slate-500">Done</span>}
                </td>
              </tr>
            ))}
            {!d.rows.length && <tr><td className="p-4 text-slate-500" colSpan={4}>Nothing recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span className="text-sm text-slate-600">Page {d.page} of {d.pages || 1}</span>
        <button className="btn-ghost" disabled={page >= d.pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}
