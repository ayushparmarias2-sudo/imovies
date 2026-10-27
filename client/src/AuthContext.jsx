import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/auth/me').then((r) => setUser(r.data.user)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api('/auth/login', { method: 'POST', body: { email, password } });
    setUser(r.data.user);
  }, []);
  const register = useCallback(async (name, email, password) => {
    const r = await api('/auth/register', { method: 'POST', body: { name, email, password } });
    setUser(r.data.user);
  }, []);
  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }); } finally { setUser(null); }
  }, []);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
