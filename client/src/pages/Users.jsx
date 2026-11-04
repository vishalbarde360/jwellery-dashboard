import { useEffect, useState } from 'react';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';

const blank = { name: '', username: '', password: '', role: 'cashier' };

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState({});
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState({ type: '', text: '' });

  const load = () => api.get('/users').then((r) => setUsers(r.data));
  useEffect(() => { load(); api.get('/roles').then((r) => setRoles(r.data.info)); }, []);

  const add = async (e) => {
    e.preventDefault();
    try { await api.post('/users', f); setF(blank); setMsg({ type: 'ok', text: 'User added' }); load(); }
    catch (x) { setMsg({ type: 'err', text: errMsg(x) }); }
  };
  const patch = async (id, body) => {
    try { await api.patch(`/users/${id}`, body); setMsg({ type: 'ok', text: 'Saved' }); load(); }
    catch (x) { setMsg({ type: 'err', text: errMsg(x) }); }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold text-ink">Users</h1>
      {msg.text && (
        <div role="status" className={`rounded-md px-3 py-2 text-sm ${msg.type === 'ok' ? 'bg-leaf-soft text-leaf' : 'bg-ruby-soft text-ruby'}`}>{msg.text}</div>
      )}

      <form onSubmit={add} className="card grid gap-3 p-4 md:grid-cols-5 md:items-end">
        <div><label className="label" htmlFor="n">Name</label><input id="n" className="input" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div><label className="label" htmlFor="un">Username</label><input id="un" className="input" required value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></div>
        <div><label className="label" htmlFor="pw">Password</label><input id="pw" type="password" minLength={8} className="input" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
        <div>
          <label className="label" htmlFor="rl">Role</label>
          <select id="rl" className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {Object.entries(roles).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
          </select>
        </div>
        <button className="btn-primary">Add user</button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-sm">
          <thead className="border-b border-paper-line bg-paper text-slate-600">
            <tr><th className="p-3">Name</th><th className="p-3">Username</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const self = u._id === me.id;
              return (
                <tr key={u._id} className="border-b border-paper-line">
                  <td className="p-3 font-semibold">{u.name}</td>
                  <td className="p-3">{u.username}</td>
                  <td className="p-3">
                    <select aria-label={`Role of ${u.name}`} className="input !w-auto" disabled={self} value={u.role} onChange={(e) => patch(u._id, { role: e.target.value })}>
                      {Object.entries(roles).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
                    </select>
                  </td>
                  <td className="p-3">{u.active ? <span className="text-leaf">Active</span> : <span className="text-ruby">Disabled</span>}</td>
                  <td className="p-3 text-right">
                    {!self && <button className="btn-ghost" onClick={() => patch(u._id, { active: !u.active })}>{u.active ? 'Disable' : 'Enable'}</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
