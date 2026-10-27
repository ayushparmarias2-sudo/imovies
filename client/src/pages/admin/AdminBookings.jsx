import { useState } from 'react';
import { api } from '../../api.js';
import { useApi } from '../../useApi.js';
import { EmptyState, ErrorState, Loading } from '../../components/State.jsx';
import { Pager } from '../../components/AdminBits.jsx';
import { StatusBadge } from '../MyBookings.jsx';
import { errorText, fmtDateTime, money } from '../../format.js';

export default function AdminBookings() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const list = useApi(`/admin/bookings?page=${page}${status ? `&status=${status}` : ''}`);
  const [flash, setFlash] = useState('');

  const cancel = async (b) => {
    if (!window.confirm(`Cancel booking ${b.reference} for ${b.user.email}? Seats are released and the simulated payment refunded.`)) return;
    try { await api(`/admin/bookings/${b.id}/cancel`, { method: 'POST' }); setFlash(`Booking ${b.reference} cancelled.`); list.reload(); }
    catch (e) { setFlash(errorText(e)); }
  };
  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3 gap-2 flex-wrap"><h2 className="h5 mb-0">Bookings</h2>
        <div><label htmlFor="b-status" className="visually-hidden">Filter by status</label>
          <select id="b-status" className="form-select form-select-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>{['PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'FAILED'].map((s) => <option key={s}>{s}</option>)}</select></div></div>
      {flash && <div className="alert alert-info py-2" role="status">{flash}</div>}
      {list.loading && <Loading />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data?.length === 0 && <EmptyState title="No bookings found" />}
      {list.data?.length > 0 && (
        <div className="table-responsive"><table className="table table-sm align-middle"><thead><tr><th>Reference</th><th>Customer</th><th>Show</th><th>Seats</th><th>Amount</th><th>Status</th><th /></tr></thead>
          <tbody>{list.data.map((b) => (
            <tr key={b.id}><td className="font-monospace">{b.reference}</td><td>{b.user.name}<div className="small text-secondary">{b.user.email}</div></td>
              <td>{b.show.movie.title}<div className="small text-secondary">{b.show.theater.name} · {fmtDateTime(b.show.startsAt)}</div></td>
              <td>{b.seats.map((s) => s.label).join(', ')}</td><td>{money(b.totalAmount)}</td><td><StatusBadge status={b.status} /></td>
              <td className="text-end">{b.status === 'CONFIRMED' && <button className="btn btn-outline-danger btn-sm" onClick={() => cancel(b)}>Cancel</button>}</td></tr>
          ))}</tbody></table></div>
      )}
      <Pager meta={list.meta} page={page} setPage={setPage} />
      <p className="small text-secondary">Booking records are never deleted (audit trail); admins can cancel confirmed bookings, which releases seats and refunds the simulated payment.</p>
    </>
  );
}
