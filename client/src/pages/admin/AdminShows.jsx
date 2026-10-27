import { useState } from 'react';
import { api } from '../../api.js';
import { useApi } from '../../useApi.js';
import { EmptyState, ErrorState, Loading } from '../../components/State.jsx';
import { Field, FormAlert } from '../../components/AdminBits.jsx';
import { errorText, fmtDateTime } from '../../format.js';

const blank = { movie: '', theater: '', screenName: '', startsAt: '', standard: 200, premium: 350 };

export default function AdminShows() {
  const shows = useApi('/shows?limit=100');
  const movies = useApi('/movies?status=nowShowing&limit=50');
  const theaters = useApi('/theaters');
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');
  const [flash, setFlash] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v, ...(k === 'theater' ? { screenName: '' } : {}) }));
  const screens = theaters.data?.find((t) => t.id === form?.theater)?.screens || [];

  const save = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      await api('/shows', { method: 'POST', body: { movie: form.movie, theater: form.theater, screenName: form.screenName,
        startsAt: new Date(form.startsAt).toISOString(), pricing: { standard: Number(form.standard), premium: Number(form.premium) } } });
      setFlash('Show created with its seat inventory.'); setForm(null); shows.reload();
    } catch (err) { setMsg(errorText(err)); }
  };
  const remove = async (s) => {
    if (!window.confirm(`Delete the ${fmtDateTime(s.startsAt)} show of "${s.movie.title}"?`)) return;
    try { await api(`/shows/${s.id}`, { method: 'DELETE' }); setFlash('Show deleted.'); shows.reload(); } catch (err) { setFlash(errorText(err)); }
  };

  return (
    <>
      <div className="d-flex justify-content-between mb-3"><h2 className="h5 mb-0">Upcoming shows</h2>{!form && <button className="btn btn-accent btn-sm" onClick={() => { setForm({ ...blank }); setMsg(''); }}>+ Add show</button>}</div>
      {flash && <div className="alert alert-info py-2" role="status">{flash}</div>}
      {form && (
        <form className="card im-card mb-4" onSubmit={save}><div className="card-body">
          <h3 className="h6">New show</h3><FormAlert msg={msg} />
          <div className="row g-2">
            <div className="col-md-4"><Field id="sh-m" label="Movie (released only)"><select id="sh-m" className="form-select" required value={form.movie} onChange={(e) => set('movie', e.target.value)}><option value="">Select…</option>{(movies.data || []).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</select></Field></div>
            <div className="col-md-4"><Field id="sh-t" label="Theater"><select id="sh-t" className="form-select" required value={form.theater} onChange={(e) => set('theater', e.target.value)}><option value="">Select…</option>{(theaters.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field></div>
            <div className="col-md-4"><Field id="sh-s" label="Screen"><select id="sh-s" className="form-select" required value={form.screenName} onChange={(e) => set('screenName', e.target.value)} disabled={!form.theater}><option value="">Select…</option>{screens.map((s) => <option key={s.name}>{s.name}</option>)}</select></Field></div>
            <div className="col-md-4"><Field id="sh-d" label="Start (your local time)"><input id="sh-d" type="datetime-local" className="form-control" required value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} /></Field></div>
            <div className="col-6 col-md-4"><Field id="sh-p1" label="Standard price (₹)"><input id="sh-p1" type="number" min="0" className="form-control" required value={form.standard} onChange={(e) => set('standard', e.target.value)} /></Field></div>
            <div className="col-6 col-md-4"><Field id="sh-p2" label="Premium price (₹)"><input id="sh-p2" type="number" min="0" className="form-control" required value={form.premium} onChange={(e) => set('premium', e.target.value)} /></Field></div>
          </div>
          <div className="mt-3 d-flex gap-2"><button className="btn btn-accent btn-sm">Create show</button><button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setForm(null)}>Cancel</button></div>
        </div></form>
      )}
      {shows.loading && <Loading />}
      {shows.error && <ErrorState error={shows.error} onRetry={shows.reload} />}
      {shows.data?.length === 0 && <EmptyState title="No upcoming shows" />}
      {shows.data?.length > 0 && (
        <div className="table-responsive"><table className="table table-sm align-middle"><thead><tr><th>Movie</th><th>Theater / screen</th><th>Starts</th><th>Seats left</th><th /></tr></thead>
          <tbody>{shows.data.map((s) => (
            <tr key={s.id}><td>{s.movie.title}</td><td>{s.theater.name} · {s.screenName}</td><td>{fmtDateTime(s.startsAt)}</td><td>{s.availableSeats}</td>
              <td className="text-end"><button className="btn btn-outline-danger btn-sm" onClick={() => remove(s)}>Delete</button></td></tr>
          ))}</tbody></table></div>
      )}
      <p className="small text-secondary">Shows with bookings cannot be deleted. Showing the next 100 upcoming shows.</p>
    </>
  );
}
