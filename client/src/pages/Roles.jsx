import { useEffect, useState } from 'react';
import api from '../api';
import { useAuth } from '../context/AuthContext';

export default function Roles() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/roles').then((r) => setData(r.data)); }, []);
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Roles and access</h1>
        <p className="mt-1 text-sm text-slate-600">Every limit below is enforced by the server, not just hidden in the screen.</p>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-paper-line bg-paper text-slate-600">
            <tr><th className="p-3">Role</th><th className="p-3">Responsibilities</th><th className="p-3">Cannot</th></tr>
          </thead>
          <tbody>
            {Object.entries(data.info).map(([key, r]) => (
              <tr key={key} className={`border-b border-paper-line align-top ${user.role === key ? 'bg-gold-soft/50' : ''}`}>
                <td className="p-3 font-bold text-ink">{r.label}{user.role === key && <span className="ml-2 text-xs font-semibold text-gold-deep">You</span>}</td>
                <td className="p-3">{r.does}</td>
                <td className="p-3 text-ruby">{r.cannot}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
