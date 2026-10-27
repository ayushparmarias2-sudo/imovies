import { useTitle } from '../useTitle.js';
import { useEffect, useState } from 'react';
import { useApi } from '../useApi.js';
import MovieCard from '../components/MovieCard.jsx';
import { EmptyState, ErrorState, Loading } from '../components/State.jsx';

const TABS = [['all', 'All'], ['nowShowing', 'Now showing'], ['upcoming', 'Upcoming']];

export default function Home() {
  useTitle('Movies');
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('');
  const [status, setStatus] = useState('all');
  const [withShows, setWithShows] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => { const t = setTimeout(() => { setSearch(input.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [input]);

  const params = new URLSearchParams({ status, page, limit: 12 });
  if (search) params.set('search', search);
  if (genre) params.set('genre', genre);
  if (withShows) params.set('availability', 'withShows');
  const movies = useApi(`/movies?${params}`);
  const genres = useApi('/movies/genres');
  const filtered = search || genre || withShows || status !== 'all';
  const reset = () => { setInput(''); setSearch(''); setGenre(''); setStatus('all'); setWithShows(false); setPage(1); };

  return (
    <>
      <section className="hero rounded-4 p-4 p-md-5 mb-4 position-relative">
        <div className="position-relative" style={{ zIndex: 1 }}>
          <div className="d-inline-flex align-items-center gap-2 px-3 py-1 mb-3 rounded-pill" style={{ background: 'rgba(245, 179, 1, 0.12)', border: '1px solid rgba(245, 179, 1, 0.3)', color: '#f5b301', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.06em' }}>
            <span>✨</span>
            <span>PREMIER CINEMA EXPERIENCE</span>
          </div>
          <h1 className="display-6 fw-bold mb-2">
            Movie ticket booking, <span className="text-accent">made simple.</span>
          </h1>
          <p className="text-secondary fs-6 mb-0" style={{ maxWidth: '600px' }}>
            Pick a movie, choose your seats, and reserve them in seconds.
          </p>
        </div>
      </section>

      <div className="p-3 p-md-4 rounded-4 mb-4" style={{ background: 'rgba(15, 23, 42, 0.55)', border: '1px solid rgba(255, 255, 255, 0.08)', backdropFilter: 'blur(12px)' }}>
        <form className="row g-3 align-items-end mb-3" role="search" onSubmit={(e) => e.preventDefault()}>
          <div className="col-12 col-md-5">
            <label htmlFor="q" className="form-label small text-secondary fw-semibold mb-1">Search by title</label>
            <div className="position-relative">
              <input id="q" type="search" className="form-control ps-3" placeholder="e.g. Midnight Monsoon" value={input} onChange={(e) => setInput(e.target.value)} />
            </div>
          </div>
          <div className="col-6 col-md-3">
            <label htmlFor="genre" className="form-label small text-secondary fw-semibold mb-1">Genre</label>
            <select id="genre" className="form-select" value={genre} onChange={(e) => { setGenre(e.target.value); setPage(1); }}>
              <option value="">All genres</option>
              {(genres.data || []).map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div className="col-6 col-md-4 pb-1">
            <div className="form-check d-flex align-items-center gap-2 m-0 pt-2">
              <input id="withShows" className="form-check-input m-0" type="checkbox" checked={withShows} onChange={(e) => { setWithShows(e.target.checked); setPage(1); }} />
              <label htmlFor="withShows" className="form-check-label small fw-medium">Only movies with upcoming shows</label>
            </div>
          </div>
        </form>

        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 pt-2 border-top" style={{ borderColor: 'rgba(255, 255, 255, 0.06)' }}>
          <div className="btn-group" role="group" aria-label="Release status">
            {TABS.map(([v, t]) => (
              <button key={v} type="button" className={`btn btn-sm ${status === v ? 'btn-accent' : 'btn-outline-secondary'}`} aria-pressed={status === v} onClick={() => { setStatus(v); setPage(1); }}>{t}</button>
            ))}
          </div>
          {filtered && (
            <button className="btn btn-link btn-sm text-secondary text-decoration-none p-0" onClick={reset}>
              ✕ Reset filters
            </button>
          )}
        </div>
      </div>

      {movies.loading && <Loading label="Loading movies…" />}
      {movies.error && <ErrorState error={movies.error} onRetry={movies.reload} />}
      {!movies.loading && !movies.error && movies.data?.length === 0 && (
        <EmptyState title={filtered ? 'No movies match your filters' : 'No movies yet'}>
          {filtered && <button className="btn btn-outline-light btn-sm mt-2" onClick={reset}>Clear filters</button>}
        </EmptyState>
      )}
      {!movies.loading && !movies.error && movies.data?.length > 0 && (
        <>
          <div className="row row-cols-2 row-cols-md-3 row-cols-lg-4 g-3">
            {movies.data.map((m) => <div className="col" key={m.id}><MovieCard movie={m} /></div>)}
          </div>
          {movies.meta?.pages > 1 && (
            <nav className="d-flex justify-content-center align-items-center gap-3 mt-4" aria-label="Pagination">
              <button className="btn btn-outline-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</button>
              <span className="small text-secondary">Page {movies.meta.page} of {movies.meta.pages}</span>
              <button className="btn btn-outline-secondary btn-sm" disabled={page >= movies.meta.pages} onClick={() => setPage(page + 1)}>Next →</button>
            </nav>
          )}
        </>
      )}
    </>
  );
}
