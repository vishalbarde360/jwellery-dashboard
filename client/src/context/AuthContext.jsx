import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(!!localStorage.getItem('wn_token'));

  useEffect(() => {
    if (!localStorage.getItem('wn_token')) return;
    api.get('/auth/me').then((r) => setUser(r.data)).catch(() => localStorage.removeItem('wn_token')).finally(() => setLoading(false));
  }, []);

  const refreshSettings = () => api.get('/settings').then((r) => setSettings(r.data)).catch(() => {});
  useEffect(() => { if (user) refreshSettings(); }, [user?.id]); // eslint-disable-line

  const login = async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('wn_token', data.token);
    setUser(data.user);
  };
  const logout = () => { localStorage.removeItem('wn_token'); setUser(null); };
  const can = (perm) => !!user && (user.permissions.includes('*') || user.permissions.includes(perm));

  return <AuthCtx.Provider value={{ user, loading, login, logout, can, settings, refreshSettings }}>{children}</AuthCtx.Provider>;
}
