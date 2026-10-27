import { useTitle } from '../useTitle.js';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApi } from '../useApi.js';
import { EmptyState, ErrorState, Loading } from '../components/State.jsx';
import { fmtDateTime } from '../format.js';

export default function Notifications() {
  useTitle('Notifications');
  const { data, meta, loading, error, reload } = useApi('/notifications');
  if (loading && !data) return <Loading label="Loading notifications…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const changed = () => window.dispatchEvent(new Event('notifications:changed'));
  const markAll = async () => { await api('/notifications/read-all', { method: 'POST' }); reload(); changed(); };
  const markOne = async (id) => { await api(`/notifications/${id}/read`, { method: 'POST' }); reload(); changed(); };
  return (
    <div className="mx-auto" style={{ maxWidth: 760 }}>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 fw-bold mb-0">Notifications</h1>
        {meta?.unread > 0 && (
          <button className="btn btn-outline-light btn-sm px-3 shadow-sm" onClick={markAll}>
            Mark all read ({meta.unread})
          </button>
        )}
      </div>
      {data.length === 0 ? <EmptyState title="No notifications yet" /> : (
        <ul className="list-group d-flex flex-column gap-2 list-unstyled">
          {data.map((n) => (
            <li key={n.id} className={`list-group-item im-card p-3 p-md-4 ${n.readAt ? 'text-secondary opacity-75' : 'border-start border-warning border-4'}`}
              style={{ background: 'var(--im-surface-card)', borderRadius: '14px' }}>
              <div className="d-flex justify-content-between align-items-baseline gap-2 mb-1">
                <strong className="text-light fs-6">{n.title}</strong>
                <span className="small text-secondary">{fmtDateTime(n.createdAt)}</span>
              </div>
              <div className="small text-secondary mb-2" style={{ lineHeight: 1.6 }}>{n.message}</div>
              <div className="small d-flex align-items-center gap-3">
                {n.booking && <Link to={`/bookings/${n.booking}`} className="fw-semibold text-accent text-decoration-none">View booking →</Link>}
                {!n.readAt && <button className="btn btn-link btn-sm p-0 text-secondary text-decoration-none" onClick={() => markOne(n.id)}>Mark read</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
