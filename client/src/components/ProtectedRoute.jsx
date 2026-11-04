import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, perm }) {
  const { user, loading, can } = useAuth();
  if (loading) return <div className="p-8 text-sm text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (perm && !can(perm)) return <div className="p-8 text-sm text-ruby">You don't have access to this page.</div>;
  return children;
}
