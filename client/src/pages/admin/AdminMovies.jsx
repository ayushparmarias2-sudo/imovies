import { useState } from 'react';
import { api } from '../../api.js';
import { useApi } from '../../useApi.js';
import { EmptyState, ErrorState, Loading } from '../../components/State.jsx';
import { Field, FormAlert, Pager } from '../../components/AdminBits.jsx';
import { duration, errorText } from '../../format.js';

const blank = { title: '', description: '', genres: [], durationMinutes: 120, language: 'English', certificate: 'UA', releaseDate: '', posterUrl: '', isActive: true };

export default function AdminMovies() {
  const [page, setPage] = useState(1);
  const list = useApi(`/movies?includeInactive=true&limit=10&page=${page}`);
  const genres = useApi('/movies/genres');
  const [form, setForm] = useState(null); // null = hidden; object = create/edit
  const [editId, setEditId] = useState(null);
  const [msg, setMsg] = useState('');
  const [flash, setFlash] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const edit = (m) => { setEditId(m.id); setForm({ ...m, releaseDate: m.releaseDate.slice(0, 10) }); setMsg(''); };
  const save = async (e) => {
    e.preventDefault(); setMsg('');
    const body = { title: form.title, description: form.description, genres: form.genres, durationMinutes: Number(form.durationMinutes),
      language: form.language, certificate: form.certificate, releaseDate: form.releaseDate, posterUrl: form.posterUrl || '', isActive: form.isActive };
    try {
      await api(editId ? `/movies/${editId}` : '/movies', { method: editId ? 'PUT' : 'POST', body });
      setFlash(editId ? 'Movie updated.' : 'Movie created.'); setForm(null); setEditId(null); list.reload();
    } catch (err) { setMsg(errorText(err)); }
  };
  const remove = async (m) => {
    if (!window.confirm(`Delete "${m.title}"? This cannot be undone.`)) return;
    try { await api(`/movies/${m.id}`, { method: 'DELETE' }); setFlash('Movie deleted.'); list.reload(); }
    catch (err) { setFlash(errorText(err)); }
  };

  return (
    <>
      <div className="d-flex justify-content-between mb-3"><h2 className="h5 mb-0">Movies</h2>
        {!form && <button className="btn btn-accent btn-sm" onClick={() => { setForm({ ...blank }); setEditId(null); setMsg(''); }}>+ Add movie</button>}</div>
      {flash && <div className="alert alert-info py-2" role="status">{flash}</div>}
      {form && (
        <form className="card im-card mb-4" onSubmit={save}><div className="card-body">
          <h3 className="h6">{editId ? 'Edit movie' : 'New movie'}</h3>
          <FormAlert msg={msg} />
          <div className="row g-2">
            <div className="col-md-6"><Field id="m-title" label="Title"><input id="m-title" className="form-control" required value={form.title} onChange={(e) => set('title', e.target.value)} /></Field></div>
            <div className="col-md-3"><Field id="m-lang" label="Language"><input id="m-lang" className="form-control" required value={form.language} onChange={(e) => set('language', e.target.value)} /></Field></div>
            <div className="col-md-3"><Field id="m-cert" label="Certificate"><select id="m-cert" className="form-select" value={form.certificate} onChange={(e) => set('certificate', e.target.value)}>{['U', 'UA', 'A', 'S'].map((c) => <option key={c}>{c}</option>)}</select></Field></div>
            <div className="col-12"><Field id="m-desc" label="Description (min 10 characters)"><textarea id="m-desc" className="form-control" rows="2" required minLength="10" value={form.description} onChange={(e) => set('description', e.target.value)} /></Field></div>
            <div className="col-md-3"><Field id="m-dur" label="Duration (minutes)"><input id="m-dur" type="number" min="30" max="300" className="form-control" required value={form.durationMinutes} onChange={(e) => set('durationMinutes', e.target.value)} /></Field></div>
            <div className="col-md-3"><Field id="m-rel" label="Release date"><input id="m-rel" type="date" className="form-control" required value={form.releaseDate} onChange={(e) => set('releaseDate', e.target.value)} /></Field></div>
            <div className="col-md-6"><Field id="m-poster" label="Poster image (optional): https://… URL or /posters/<file>"><input id="m-poster" type="text" inputMode="url" placeholder="https://example.com/poster.jpg" className="form-control" value={form.posterUrl} onChange={(e) => set('posterUrl', e.target.value)} /></Field></div>
            <div className="col-12"><fieldset><legend className="form-label small mb-1">Genres</legend>
              {(genres.data || []).map((g) => (
                <div className="form-check form-check-inline" key={g}><input className="form-check-input" type="checkbox" id={`g-${g}`} checked={form.genres.includes(g)}
                  onChange={(e) => set('genres', e.target.checked ? [...form.genres, g] : form.genres.filter((x) => x !== g))} /><label className="form-check-label" htmlFor={`g-${g}`}>{g}</label></div>
              ))}</fieldset></div>
            <div className="col-12"><div className="form-check"><input className="form-check-input" type="checkbox" id="m-active" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} /><label className="form-check-label" htmlFor="m-active">Active (visible to customers)</label></div></div>
          </div>
          <div className="mt-3 d-flex gap-2"><button className="btn btn-accent btn-sm">{editId ? 'Save changes' : 'Create movie'}</button><button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setForm(null)}>Cancel</button></div>
        </div></form>
      )}
      {list.loading && <Loading />}
      {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
      {list.data?.length === 0 && <EmptyState title="No movies yet" />}
      {list.data?.length > 0 && (
        <div className="table-responsive"><table className="table table-sm align-middle">
          <thead><tr><th>Title</th><th>Genres</th><th>Length</th><th>Release</th><th>Status</th><th><span className="visually-hidden">Actions</span></th></tr></thead>
          <tbody>{list.data.map((m) => (
            <tr key={m.id}><td>{m.title}</td><td>{m.genres.join(', ')}</td><td>{duration(m.durationMinutes)}</td><td>{m.releaseDate.slice(0, 10)}</td>
              <td>{m.isActive ? <span className="badge text-bg-success">Active</span> : <span className="badge text-bg-secondary">Hidden</span>}</td>
              <td className="text-end text-nowrap"><button className="btn btn-outline-light btn-sm me-1" onClick={() => edit(m)}>Edit</button><button className="btn btn-outline-danger btn-sm" onClick={() => remove(m)}>Delete</button></td></tr>
          ))}</tbody></table></div>
      )}
      <Pager meta={list.meta} page={page} setPage={setPage} />
    </>
  );
}
