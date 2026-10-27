import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { Loading } from './State.jsx';

export default function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== 'ADMIN') {
    return <div className="text-center py-5"><h1 className="h3">Admins only</h1><p className="text-secondary">You do not have permission to view this page.</p><Link to="/" className="btn btn-accent btn-sm">Back to movies</Link></div>;
  }
  return children;
}
