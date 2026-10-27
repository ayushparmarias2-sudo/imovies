import { useTitle } from '../useTitle.js';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { watchShow } from '../realtime.js';
import { useApi } from '../useApi.js';
import { useAuth } from '../AuthContext.jsx';
import SeatMap, { SeatLegend } from '../components/SeatMap.jsx';
import Poster from '../components/Poster.jsx';
import { ErrorState, Loading } from '../components/State.jsx';
import { errorText, fmtDateTime, money } from '../format.js';

const MAX_SEATS = 8; // mirrors the server default (MAX_SEATS_PER_BOOKING); the server enforces it
const POLL_MS = 15000; // fallback only; Socket.IO pushes updates instantly

export default function SeatSelection() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const show = useApi(`/shows/${id}`);
  useTitle(show.data ? `Seats – ${show.data.movie.title}` : 'Select seats');
  const [map, setMap] = useState(null);
  const [mapError, setMapError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState(null); // { text, bookingId }
  const [busy, setBusy] = useState(false);

  const loadSeats = useCallback(() => api(`/shows/${id}/seats`).then((r) => {
    setMap(r.data); setMapError(null);
    // drop selected seats that someone else just took
    setSelected((prev) => {
      const ok = new Set(r.data.seats.filter((s) => s.status === 'AVAILABLE').map((s) => s.label));
      const next = new Set([...prev].filter((l) => ok.has(l)));
      if (next.size !== prev.size) setNotice('Some seats you selected were just taken and were removed from your selection.');
      return next;
    });
  }).catch((e) => setMapError(e)), [id]);

  useEffect(() => { loadSeats(); }, [loadSeats, user]);
  useEffect(() => watchShow(id, loadSeats), [id, loadSeats]);
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) loadSeats(); }, POLL_MS);
    return () => clearInterval(t);
  }, [loadSeats]);

  const toggle = (seat) => {
    setNotice(''); setProblem(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(seat.label)) next.delete(seat.label);
      else if (next.size >= MAX_SEATS) setNotice(`You can select up to ${MAX_SEATS} seats.`);
      else next.add(seat.label);
      return next;
    });
  };

  const chosen = (map?.seats || []).filter((s) => selected.has(s.label));
  const total = chosen.reduce((sum, s) => sum + s.price, 0); // display only - the server recomputes the total

  const reserve = async () => {
    setBusy(true); setProblem(null); setNotice('');
    try {
      const r = await api('/bookings/reserve', { method: 'POST', body: { showId: id, seats: [...selected] } });
      navigate(`/bookings/${r.data.id}`);
    } catch (e) {
      setProblem({ text: e.status === 409 && e.details?.unavailableSeats ? `${e.message}: ${e.details.unavailableSeats.join(', ')}` : errorText(e), bookingId: e.details?.bookingId });
      await loadSeats();
      setBusy(false);
    }
  };

  if (show.loading) return <Loading label="Loading show…" />;
  if (show.error) return <ErrorState error={show.error} onRetry={show.reload} />;
  const s = show.data;

  return (
    <>
      <nav aria-label="Breadcrumb" className="small mb-3">
        <Link to={`/movies/${s.movie.id}`} className="text-secondary text-decoration-none d-inline-flex align-items-center gap-1">
          <span>←</span> <span>Back to {s.movie.title}</span>
        </Link>
      </nav>

      <div className="card im-card p-3 p-md-4 mb-4">
        <div className="d-flex gap-3 align-items-center">
          <Poster title={s.movie.title} url={s.movie.posterUrl} className="poster-thumb" decorative />
          <div>
            <h1 className="h4 fw-bold mb-1 text-light">{s.movie.title}</h1>
            <p className="text-secondary mb-0 small">
              <span className="text-light fw-medium">{s.theater.name}</span> · <span>{s.screenName}</span> · <span className="text-accent">{fmtDateTime(s.startsAt)}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-12 col-lg-8">
          <div className="card im-card p-3 p-md-4 mb-3">
            {!map && !mapError && <Loading label="Loading seats…" />}
            {mapError && <ErrorState error={mapError} onRetry={loadSeats} />}
            {map && (
              <>
                <SeatLegend />
                <SeatMap seats={map.seats} selected={selected} onToggle={toggle} />
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 pt-3 mt-3 border-top" style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}>
                  <span className="small text-secondary" aria-live="polite">
                    <span className="badge rounded-pill bg-success-subtle text-success border border-success-subtle me-1">Live</span>
                    {map.summary.AVAILABLE} seats available · live updates, with a backup refresh every {POLL_MS / 1000}s
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
        <aside className="col-12 col-lg-4" aria-label="Booking summary">
          <div className="card im-card sticky-lg-top summary-card shadow">
            <div className="card-body p-4">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h2 className="h5 fw-bold mb-0">Your selection</h2>
                <span className="badge rounded-pill" style={{ background: 'rgba(245, 179, 1, 0.12)', color: '#f5b301', border: '1px solid rgba(245, 179, 1, 0.25)' }}>
                  {chosen.length}/{MAX_SEATS} max
                </span>
              </div>
              {chosen.length === 0 ? (
                <div className="p-3 my-3 rounded-3 text-center" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px dashed rgba(255, 255, 255, 0.1)' }}>
                  <p className="text-secondary small mb-0">Select up to {MAX_SEATS} seats on the map.</p>
                </div>
              ) : (
                <ul className="list-unstyled small mb-3">
                  {chosen.map((c) => (
                    <li key={c.label} className="d-flex justify-content-between align-items-center py-2 border-bottom" style={{ borderColor: 'rgba(255, 255, 255, 0.06)' }}>
                      <div>
                        <span className="fw-bold me-1 text-light">{c.label}</span>
                        <span className="badge rounded-pill" style={{ background: c.category === 'PREMIUM' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(16, 185, 129, 0.15)', color: c.category === 'PREMIUM' ? '#c4b5fd' : '#6ee7b7' }}>
                          {c.category.toLowerCase()}
                        </span>
                      </div>
                      <span className="fw-semibold text-light">{money(c.price)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="d-flex justify-content-between fw-bold fs-5 border-top pt-3 mb-3" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                <span>Total</span>
                <span className="text-accent">{money(total)}</span>
              </div>
              {notice && <div className="alert alert-warning py-2 small" role="status">{notice}</div>}
              {problem && (
                <div className="alert alert-danger py-2 small" role="alert">
                  {problem.text}{problem.bookingId && <> <Link to={`/bookings/${problem.bookingId}`} className="alert-link">View pending reservation</Link></>}
                </div>
              )}
              {user ? (
                <button className="btn btn-accent w-100 py-2 fs-6 shadow-sm" disabled={chosen.length === 0 || busy} onClick={reserve}>
                  {busy ? 'Reserving…' : `Reserve ${chosen.length || ''} seat${chosen.length === 1 ? '' : 's'}`}
                </button>
              ) : (
                <Link className="btn btn-accent w-100 py-2 fs-6 shadow-sm" to="/login" state={{ from: `/shows/${id}/seats` }}>
                  Log in to reserve
                </Link>
              )}
              <p className="small text-secondary mt-3 mb-0 text-center" style={{ fontSize: '0.78rem' }}>
                Seats are held for a few minutes after you reserve. Final price is confirmed by the server.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
