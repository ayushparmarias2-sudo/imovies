import { useTitle } from '../useTitle.js';
import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApi } from '../useApi.js';
import Countdown from '../components/Countdown.jsx';
import Poster from '../components/Poster.jsx';
import { ErrorState, Loading } from '../components/State.jsx';
import { errorText, fmtDateTime, money } from '../format.js';

/** DEMONSTRATION checkout: no card fields, no real payment. The outcome is chosen by the user for testing. */
export default function Checkout() {
  useTitle('Checkout');
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: b, loading, error, reload } = useApi(`/bookings/${id}`);
  const [outcome, setOutcome] = useState('SUCCESS');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  if (loading && !b) return <Loading label="Loading checkout…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (b.status !== 'PENDING') return <Navigate to={`/bookings/${id}`} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const r = await api(`/bookings/${id}/pay`, { method: 'POST', body: { outcome } });
      navigate(`/bookings/${id}`, { replace: true, state: { paid: r.data.payment.status } });
    } catch (err) { setMsg(errorText(err)); setBusy(false); reload(); }
  };

  return (
    <div className="mx-auto" style={{ maxWidth: 580 }}>
      <div className="alert alert-warning d-flex align-items-center gap-2 p-3 mb-4 shadow-sm" role="note">
        <span className="fs-5" aria-hidden="true">🔒</span>
        <div>
          <strong>Demonstration checkout.</strong> This is a simulated payment — no real money moves and no card details are requested. Never enter real card information here.
        </div>
      </div>

      <div className="card im-card shadow-lg">
        <form className="card-body p-4 p-md-5" onSubmit={submit}>
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h1 className="h4 fw-bold mb-0">Checkout</h1>
            <span className="badge rounded-pill" style={{ background: 'rgba(245, 179, 1, 0.12)', color: '#f5b301', border: '1px solid rgba(245, 179, 1, 0.3)', padding: '0.45rem 0.8rem' }}>
              Simulated Transaction
            </span>
          </div>

          <div className="d-flex gap-3 align-items-center p-3 mb-4 rounded-3" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <Poster title={b.show.movie.title} url={b.show.movie.posterUrl} className="poster-thumb" decorative />
            <div>
              <div className="fw-bold text-light fs-6 mb-1">{b.show.movie.title}</div>
              <p className="text-secondary small mb-0">
                {b.show.theater.name} · {b.show.screenName}<br />
                <span className="text-light">{fmtDateTime(b.show.startsAt)}</span>
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
            <li className="list-group-item bg-transparent d-flex justify-content-between align-items-center py-2 px-3 text-secondary">
              <span>Tickets</span>
              <span>{b.seats.length}</span>
            </li>
            <li className="list-group-item bg-transparent d-flex justify-content-between align-items-center py-3 px-3 fw-bold fs-5 border-top" style={{ borderColor: 'rgba(255, 255, 255, 0.12)' }}>
              <span>Total</span>
              <span className="text-accent">{money(b.totalAmount)}</span>
            </li>
          </ul>

          <div className="d-flex align-items-center gap-2 p-2 px-3 mb-4 rounded-pill" style={{ background: 'rgba(245, 179, 1, 0.08)', border: '1px solid rgba(245, 179, 1, 0.25)', width: 'fit-content' }}>
            <span className="small text-light">Seats held for <strong className="text-accent"><Countdown until={b.expiresAt} onExpire={reload} /></strong></span>
          </div>

          <fieldset className="mb-4">
            <legend className="h6 fw-bold mb-3 text-light">Simulated outcome (for testing)</legend>
            <div className="d-flex flex-column gap-2">
              <label htmlFor="o-ok" className={`p-3 rounded-3 d-flex align-items-center gap-3 cursor-pointer transition-all ${outcome === 'SUCCESS' ? 'border-accent' : ''}`}
                style={{ background: outcome === 'SUCCESS' ? 'rgba(245, 179, 1, 0.1)' : 'rgba(255, 255, 255, 0.02)', border: outcome === 'SUCCESS' ? '1px solid var(--im-accent)' : '1px solid rgba(255, 255, 255, 0.08)', cursor: 'pointer' }}>
                <input className="form-check-input m-0" type="radio" name="outcome" id="o-ok" checked={outcome === 'SUCCESS'} onChange={() => setOutcome('SUCCESS')} />
                <span className="form-check-label fw-medium text-light">Payment succeeds</span>
              </label>
              <label htmlFor="o-fail" className={`p-3 rounded-3 d-flex align-items-center gap-3 cursor-pointer transition-all ${outcome === 'FAILURE' ? 'border-danger' : ''}`}
                style={{ background: outcome === 'FAILURE' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.02)', border: outcome === 'FAILURE' ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.08)', cursor: 'pointer' }}>
                <input className="form-check-input m-0" type="radio" name="outcome" id="o-fail" checked={outcome === 'FAILURE'} onChange={() => setOutcome('FAILURE')} />
                <span className="form-check-label fw-medium text-light">Payment fails (seats are released)</span>
              </label>
            </div>
          </fieldset>

          {msg && <div className="alert alert-danger py-2" role="alert">{msg}</div>}

          <div className="d-flex gap-2 pt-2">
            <button className="btn btn-accent flex-grow-1 py-2 fs-6 shadow-sm" disabled={busy}>
              {busy ? 'Processing…' : `Pay ${money(b.totalAmount)} (simulated)`}
            </button>
            <Link className="btn btn-outline-secondary px-4 py-2" to={`/bookings/${id}`}>Back</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
