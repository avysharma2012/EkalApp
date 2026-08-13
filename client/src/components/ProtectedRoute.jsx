import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children, adminOnly = false, superAdminOnly = false }) {
  const { user, isAdmin, isSuperAdmin, loading } = useAuth();
  if (loading) return <div className="page-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (superAdminOnly && !isSuperAdmin) return <Navigate to="/" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

export function GuestOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading">Loading…</div>;
  if (user) return <Navigate to="/" replace />;
  return children;
}
