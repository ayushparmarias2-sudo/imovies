import { useTitle } from '../useTitle.js';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApi } from '../useApi.js';
import Countdown from '../components/Countdown.jsx';
import Poster from '../components/Poster.jsx';
import { ErrorState, Loading } from '../components/State.jsx';
import { StatusBadge } from './MyBookings.jsx';
import { errorText, fmtDateTime, money } from '../format.js';

export default function BookingDetail() {
  const { id } = useParams();
  const justPaid = useLocation().state?.paid;
  const { data: b, loading, error, reload } = useApi(`/bookings/${id}`);
  useTitle(b ? `Booking ${b.reference}` : 'Booking');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading && !b) return <Loading label="Loading booking…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const act = async (path, confirmText) => {
    if (!window.confirm(confirmText)) return;
    setBusy(true); setMsg('');
    try { await api(`/bookings/${id}/${path}`, { method: 'POST' }); } catch (e) { setMsg(errorText(e)); }
    setBusy(false); reload();
  };
  const show = b.show;
  const refunded = b.payments?.some((p) => p.status === 'REFUNDED');

  return (
    <div className="mx-auto" style={{ maxWidth: 660 }}>
      <nav aria-label="Breadcrumb" className="small mb-3">
        <Link to="/bookings" className="text-secondary text-decoration-none d-inline-flex align-items-center gap-1">
          <span>←</span> <span>My bookings</span>
        </Link>
      </nav>

      {b.status === 'CONFIRMED' && justPaid === 'SUCCEEDED' && (
        <div className="alert alert-success d-flex align-items-center gap-2 p-3 mb-4 shadow-sm" role="status">
          <span className="fs-5" aria-hidden="true">🎉</span>
          <div>
            <strong>Payment successful — your booking is confirmed!</strong> Show this reference at the cinema.
          </div>
        </div>
      )}
      {b.status === 'FAILED' && (
        <div className="alert alert-danger p-3 mb-4 shadow-sm" role="alert">
          <strong>Payment failed.</strong> Your simulated payment was declined, so no booking was made and your seats were released.{' '}
          <Link to={`/shows/${show.id}/seats`} className="alert-link fw-semibold">Choose seats again</Link>
        </div>
      )}

      <div className="card im-card shadow-lg overflow-hidden position-relative mb-4">
        <div className="p-4 p-md-5">
          <div className="d-flex justify-content-between align-items-start pb-4 mb-4 border-bottom" style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}>
            <div>
              <div className="small text-secondary fw-semibold text-uppercase" style={{ letterSpacing: '0.08em' }}>Booking reference</div>
              <div className="h3 mb-0 font-monospace fw-bold text-accent">{b.reference}</div>
            </div>
            <StatusBadge status={b.status} />
          </div>

          <div className="d-flex gap-3 align-items-center p-3 mb-4 rounded-3" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <Poster title={show.movie.title} url={show.movie.posterUrl} className="poster-thumb" decorative />
            <div>
              <h1 className="h5 fw-bold mb-1 text-light">{show.movie.title}</h1>
              <p className="text-secondary mb-0 small">
                <span className="text-light fw-medium">{show.theater.name}</span> · <span>{show.screenName}</span><br />
                <span className="text-accent">{fmtDateTime(show.startsAt)}</span>
              </p>
            </div>
          </div>

          <ul className="list-group list-group-flush mb-4 rounded-3" style={{ background: 'rgba(15, 23, 42, 0.5)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            {b.seats.map((s) => (
              <li key={s.label} className="list-group-item bg-transparent d-flex justify-content-between align-items-center py-2 px-3">
                <span>
                  Seat <strong className="text-light">{s.label}</strong> <span className="text-secondary small">({s.category.toLowerCase()})</span>
                </span>
                <span className="text-light fw-medium">{money(s.price)}</span>
              </li>
            ))}
            <li className="list-group-item bg-transparent d-flex justify-content-between align-items-center py-3 px-3 fw-bold fs-5 border-top" style={{ borderColor: 'rgba(255, 255, 255, 0.12)' }}>
              <span>Total</span>
              <span className="text-accent">{money(b.totalAmount)}</span>
            </li>
          </ul>

          {b.payments?.length > 0 && (
            <div className="p-3 mb-4 rounded-3" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div className="d-flex align-items-center gap-2 mb-2">
                <h2 className="h6 fw-bold mb-0 text-light">Payment</h2>
                <span className="badge rounded-pill" style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#cbd5e1' }}>simulated</span>
              </div>
              <ul className="list-unstyled small mb-0">
                {b.payments.map((p) => (
                  <li key={p.id} className="text-secondary">
                    <span className="text-light fw-semibold">{money(p.amount)}</span> · <strong className="text-light">{p.status}</strong>{p.transactionRef ? ` · ${p.transactionRef}` : ''}{p.failureReason ? ` · ${p.failureReason}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {msg && <div className="alert alert-danger py-2 mb-3" role="alert">{msg}</div>}

          {b.status === 'PENDING' && (
            <div className="pt-2">
              <div className="alert alert-warning mb-3" role="status">
                Seats held for <Countdown until={b.expiresAt} onExpire={reload} />. After that they are released automatically.
              </div>
              <div className="d-flex gap-2 flex-wrap">
                <Link className="btn btn-accent flex-grow-1 py-2 shadow-sm" to={`/bookings/${id}/checkout`}>Proceed to payment</Link>
                <button className="btn btn-outline-danger py-2 px-3" disabled={busy} onClick={() => act('release', 'Release these seats? They will become available to others.')}>
                  Release seats
                </button>
              </div>
            </div>
          )}

          {b.status === 'CONFIRMED' && b.cancellation && (
            <div className="pt-3 border-top" style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}>
              <p className="small text-secondary mb-3">
                {b.cancellation.allowed ? `Free cancellation until ${fmtDateTime(b.cancellation.deadline)}.` : b.cancellation.reason}
              </p>
              <button className="btn btn-outline-danger" disabled={busy || !b.cancellation.allowed}
                onClick={() => act('cancel', 'Cancel this booking? Your seats will be released and the simulated payment refunded.')}>
                Cancel booking
              </button>
            </div>
          )}

          {b.status === 'CANCELLED' && (
            <div className="alert alert-secondary mb-0">
              {b.confirmedAt ? `This booking was cancelled${refunded ? ' and the simulated payment refunded' : ''}.` : 'This reservation was released.'}
            </div>
          )}

          {b.status === 'EXPIRED' && (
            <div className="alert alert-secondary mb-0">
              This reservation expired and the seats were released. <Link to={`/shows/${show.id}/seats`} className="alert-link">Pick seats again</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
