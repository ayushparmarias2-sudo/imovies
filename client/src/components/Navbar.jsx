import { useState } from 'react';
import { useCallback, useEffect } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [unreadRaw, setUnread] = useState(0);
  const unread = user ? unreadRaw : 0; // logged-out users never show a badge
  const refreshUnread = useCallback(() => {
    if (!user) return;
    api('/notifications?limit=1').then((r) => setUnread(r.meta?.unread || 0)).catch(() => {});
  }, [user]);
  useEffect(() => { refreshUnread(); }, [refreshUnread, pathname]);
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) refreshUnread(); };
    window.addEventListener('notifications:changed', refreshUnread); // fired by the Notifications page after mark-read
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('notifications:changed', refreshUnread); document.removeEventListener('visibilitychange', onVisible); };
  }, [refreshUnread]);
  const close = () => setOpen(false);
  const onLogout = async () => { close(); await logout(); navigate('/'); };

  return (
    <nav className="navbar navbar-expand-md im-nav" aria-label="Main">
      <div className="container">
        <Link className="navbar-brand fw-bold" to="/" onClick={close}>
          <span className="me-1" aria-hidden="true">🎬</span>
          <span>i<span className="text-accent">Movies</span></span>
        </Link>
        <button className="navbar-toggler" type="button" aria-expanded={open} aria-controls="nav-menu" aria-label="Toggle navigation" onClick={() => setOpen((o) => !o)}>
          <span className="navbar-toggler-icon" />
        </button>
        <div id="nav-menu" className={`collapse navbar-collapse ${open ? 'show' : ''}`}>
          <ul className="navbar-nav me-auto ps-md-3">
            <li className="nav-item"><NavLink className="nav-link" to="/" end onClick={close}>Movies</NavLink></li>
            {user && <li className="nav-item"><NavLink className="nav-link" to="/bookings" onClick={close}>My bookings</NavLink></li>}
            {user && (
              <li className="nav-item"><NavLink className="nav-link d-inline-flex align-items-center" to="/notifications" onClick={close}>
                <span>Notifications</span>{unread > 0 && <span className="badge rounded-pill bg-danger ms-2 px-2" aria-label={`${unread} unread`}>{unread}</span>}
              </NavLink></li>
            )}
            {user?.role === 'ADMIN' && <li className="nav-item"><NavLink className="nav-link" to="/admin" onClick={close}>Admin</NavLink></li>}
          </ul>
          <ul className="navbar-nav align-items-md-center gap-md-2 mt-3 mt-md-0">
            {user ? (
              <>
                <li className="nav-item navbar-text px-2 py-1 rounded-pill" style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                  <span className="text-secondary me-1" aria-hidden="true">👤</span>
                  <span>Hi, {user.name.split(' ')[0]}</span>
                </li>
                <li className="nav-item"><button className="btn btn-outline-light btn-sm px-3" onClick={onLogout}>Log out</button></li>
              </>
            ) : (
              <>
                <li className="nav-item"><NavLink className="nav-link px-3" to="/login" onClick={close}>Log in</NavLink></li>
                <li className="nav-item"><Link className="btn btn-accent btn-sm px-3 shadow-sm" to="/register" onClick={close}>Sign up</Link></li>
              </>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}
