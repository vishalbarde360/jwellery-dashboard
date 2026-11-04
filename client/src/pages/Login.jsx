import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errMsg } from '../api';

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await login(f.username, f.password); nav('/'); }
    catch (x) { setErr(errMsg(x)); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-ink p-12 text-white md:flex">
        <div className="text-xl font-extrabold">Aviraj </div>
        <div>
          <h1 className="max-w-sm text-4xl font-extrabold leading-tight">Scan the tag. Bill in seconds.</h1>
          <p className="mt-4 max-w-sm text-ink-100">Weight, purity, making and tax are worked out for every piece, every time.</p>
        </div>
        <div className="text-xs text-ink-100">Jewellery billing and inventory</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <h2 className="text-2xl font-extrabold text-ink">Sign in</h2>
          {err && <div role="alert" className="rounded-md bg-ruby-soft px-3 py-2 text-sm text-ruby">{err}</div>}
          <div>
            <label className="label" htmlFor="u">Username</label>
            <input id="u" className="input" autoFocus value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="p">Password</label>
            <input id="p" type="password" className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}
