import { useTitle } from '../../useTitle.js';
import { useRef, useState } from 'react';
import { useApi } from '../../useApi.js';
import { ErrorState, Loading } from '../../components/State.jsx';
import { money } from '../../format.js';
import AdminMovies from './AdminMovies.jsx';
import AdminTheaters from './AdminTheaters.jsx';
import AdminShows from './AdminShows.jsx';
import AdminBookings from './AdminBookings.jsx';

const TABS = [['dashboard', 'Dashboard'], ['movies', 'Movies'], ['theaters', 'Theaters'], ['shows', 'Shows'], ['bookings', 'Bookings']];

function Dashboard() {
  const { data: s, loading, error, reload } = useApi('/admin/stats');
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const cards = [
    ['Active movies', s.movies, '🎬', '#f5b301'],
    ['Theaters', s.theaters, '🏛️', '#38bdf8'],
    ['Upcoming shows', s.upcomingShows, '🕒', '#a855f7'],
    ['Customers', s.customers, '👥', '#10b981'],
    ['Confirmed bookings', s.bookingsByStatus.CONFIRMED || 0, '🎟️', '#f43f5e'],
    ['Confirmed revenue (simulated)', money(s.confirmedRevenue), '💰', '#f5b301']
  ];
  return (
    <div>
      <h2 className="h5 fw-bold mb-3 text-light">Dashboard overview</h2>
      <div className="row g-3 mb-4">
        {cards.map(([t, v, icon, color]) => (
          <div className="col-6 col-md-4" key={t}>
            <div className="card im-card h-100 shadow-sm position-relative overflow-hidden" style={{ borderTop: `3px solid ${color}` }}>
              <div className="card-body p-3 p-md-4">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <div className="small text-secondary fw-semibold text-truncate">{t}</div>
                  <span className="fs-5" aria-hidden="true">{icon}</span>
                </div>
                <div className="h3 fw-bold mb-0 text-light">{v}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="card im-card p-3 p-md-4">
        <div className="small text-secondary fw-medium">
          <strong className="text-light">Bookings by status:</strong>{' '}
          {Object.entries(s.bookingsByStatus).map(([k, v]) => (
            <span key={k} className="badge rounded-pill me-2" style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#cbd5e1' }}>
              {k}: {v}
            </span>
          )) || 'none yet'}
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  useTitle('Admin');
  const [tab, setTab] = useState('dashboard');
  const refs = useRef({});
  const onKey = (e, i) => { // roving tabindex + arrow keys (WAI-ARIA tabs pattern)
    const target = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (target === undefined) return;
    e.preventDefault();
    const next = TABS[(target + TABS.length) % TABS.length][0];
    setTab(next);
    refs.current[next]?.focus();
  };
  return (
    <>
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div>
          <h1 className="h3 fw-bold mb-1">Admin Dashboard</h1>
          <p className="text-secondary small mb-0">Manage cinema operations, shows, theaters, and bookings</p>
        </div>
      </div>
      <div role="tablist" aria-label="Admin sections" className="nav nav-pills mb-4 flex-wrap gap-1 shadow-sm">
        {TABS.map(([k, t], i) => (
          <button key={k} ref={(el) => { refs.current[k] = el; }} id={`tab-${k}`} role="tab" type="button" aria-selected={tab === k} aria-controls={`panel-${k}`}
            tabIndex={tab === k ? 0 : -1} className={`nav-link px-3 py-2 ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)} onKeyDown={(e) => onKey(e, i)}>{t}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'movies' && <AdminMovies />}
        {tab === 'theaters' && <AdminTheaters />}
        {tab === 'shows' && <AdminShows />}
        {tab === 'bookings' && <AdminBookings />}
      </div>
    </>
  );
}
