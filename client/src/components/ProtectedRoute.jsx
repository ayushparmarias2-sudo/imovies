import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { Loading } from './State.jsx';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
