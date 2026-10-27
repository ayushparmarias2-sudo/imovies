import { useTitle } from '../useTitle.js';
import { Link } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { EmptyState, ErrorState, Loading } from '../components/State.jsx';
import Poster from '../components/Poster.jsx';
import { fmtDateTime, money } from '../format.js';

const COLORS = { PENDING: 'warning', CONFIRMED: 'success', CANCELLED: 'secondary', EXPIRED: 'secondary', FAILED: 'danger' };
export const StatusBadge = ({ status }) => <span className={`badge text-bg-${COLORS[status] || 'secondary'}`}>{status}</span>;

export default function MyBookings() {
  useTitle('My bookings');
  const { data, loading, error, reload } = useApi('/bookings/mine');
  if (loading) return <Loading label="Loading your bookings…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div className="mx-auto" style={{ maxWidth: 840 }}>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 fw-bold mb-0">My bookings</h1>
        <span className="badge rounded-pill" style={{ background: 'rgba(255, 255, 255, 0.08)', color: '#cbd5e1', padding: '0.45rem 0.85rem' }}>
          {data.length} {data.length === 1 ? 'booking' : 'bookings'}
        </span>
      </div>
      {data.length === 0 ? (
        <EmptyState title="No bookings yet"><Link to="/" className="btn btn-accent btn-sm mt-3 px-3 shadow-sm">Browse movies</Link></EmptyState>
      ) : (
        <div className="list-group d-flex flex-column gap-3">
          {data.map((b) => (
            <Link key={b.id} to={`/bookings/${b.id}`}
              className="list-group-item list-group-item-action im-card text-decoration-none d-flex align-items-start gap-3 p-3 p-md-4 shadow-sm"
              style={{ background: 'var(--im-surface-card)', borderRadius: '14px' }}>
              <Poster title={b.show?.movie?.title || 'Movie'} url={b.show?.movie?.posterUrl} className="poster-thumb" decorative />
              <div className="flex-grow-1">
                <div className="fw-bold fs-6 text-light mb-1">{b.show?.movie?.title}</div>
                <div className="small text-secondary mb-2">{b.show?.theater?.name} · {b.show && fmtDateTime(b.show.startsAt)}</div>
                <div className="small text-light">
                  <span className="text-secondary">Seats:</span> <span className="fw-semibold">{b.seats.map((s) => s.label).join(', ')}</span> · <span className="font-monospace text-accent">{b.reference}</span>
                </div>
              </div>
              <div className="text-end ms-auto">
                <StatusBadge status={b.status} />
                <div className="mt-2 fw-bold fs-6 text-light">{money(b.totalAmount)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
