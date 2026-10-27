import { useTitle } from '../useTitle.js';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApi } from '../useApi.js';
import Poster from '../components/Poster.jsx';
import { EmptyState, ErrorState, Loading } from '../components/State.jsx';
import { dayKey, duration, fmtDay, fmtTime } from '../format.js';

export default function MovieDetails() {
  const { id } = useParams();
  const movie = useApi(`/movies/${id}`);
  const shows = useApi(`/shows?movie=${id}&limit=100`);
  const [day, setDay] = useState(null);
  useTitle(movie.data?.title || 'Movie');

  if (movie.loading) return <Loading label="Loading movie…" />;
  if (movie.error) {
    return movie.error.status === 404
      ? <EmptyState title="Movie not found"><Link to="/" className="btn btn-accent btn-sm mt-2">Browse movies</Link></EmptyState>
      : <ErrorState error={movie.error} onRetry={movie.reload} />;
  }
  const m = movie.data;

  // group shows: day -> theater -> shows
  const days = new Map();
  for (const s of shows.data || []) {
    const k = dayKey(s.startsAt);
    if (!days.has(k)) days.set(k, { label: fmtDay(s.startsAt), theaters: new Map() });
    const d = days.get(k);
    if (!d.theaters.has(s.theater.id)) d.theaters.set(s.theater.id, { theater: s.theater, shows: [] });
    d.theaters.get(s.theater.id).shows.push(s);
  }
  const keys = [...days.keys()];
  const active = days.get(day) ? day : keys[0];

  return (
    <>
      <div className="card im-card p-4 p-md-5 mb-5 overflow-hidden position-relative">
        <div className="row g-4 align-items-center position-relative" style={{ zIndex: 1 }}>
          <div className="col-12 col-md-4 col-lg-3 text-center text-md-start">
            <Poster title={m.title} url={m.posterUrl} className="detail-poster mx-auto mx-md-0" />
          </div>
          <div className="col-12 col-md-8 col-lg-9">
            <h1 className="display-6 fw-bold mb-2">{m.title}</h1>
            <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
              {m.genres.map((g) => (
                <span key={g} className="badge rounded-pill" style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.12)', color: '#e2e8f0', padding: '0.4rem 0.75rem' }}>
                  {g}
                </span>
              ))}
              <span className="badge rounded-pill cert-badge-pill" style={{ background: 'rgba(245, 179, 1, 0.12)', border: '1px solid rgba(245, 179, 1, 0.35)', color: '#f5b301', padding: '0.4rem 0.75rem' }}>
                {m.certificate}
              </span>
            </div>
            <div className="text-secondary small mb-3 d-flex flex-wrap align-items-center gap-2">
              <span className="fw-medium text-light">{duration(m.durationMinutes)}</span>
              <span>•</span>
              <span className="fw-medium text-light">{m.language}</span>
              <span>•</span>
              <span>Release: {new Date(m.releaseDate).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </div>
            <p className="lead fs-6 text-light opacity-90 mb-0" style={{ maxWidth: '720px', lineHeight: 1.7 }}>
              {m.description}
            </p>
          </div>
        </div>
      </div>

      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2 className="h4 fw-bold mb-0">Showtimes</h2>
      </div>
      {shows.loading && <Loading label="Loading showtimes…" />}
      {shows.error && <ErrorState error={shows.error} onRetry={shows.reload} />}
      {!shows.loading && !shows.error && keys.length === 0 && (
        <EmptyState title="No upcoming shows"><p className="small">{new Date(m.releaseDate) > new Date() ? 'This movie has not been released yet.' : 'Check back soon for new showtimes.'}</p></EmptyState>
      )}
      {keys.length > 0 && (
        <>
          <div className="d-flex flex-wrap gap-2 mb-3" role="group" aria-label="Show dates">
            {keys.map((k) => (
              <button key={k} type="button" aria-pressed={k === active} className={`btn btn-sm ${k === active ? 'btn-accent' : 'btn-outline-secondary'}`} onClick={() => setDay(k)}>{days.get(k).label}</button>
            ))}
          </div>
          {[...days.get(active).theaters.values()].map(({ theater, shows: list }) => (
            <div key={theater.id} className="card im-card mb-4 shadow-sm">
              <div className="card-body p-4">
                <div className="d-flex align-items-center gap-2 mb-1">
                  <span className="fs-5" aria-hidden="true">🏛️</span>
                  <h3 className="h6 fw-bold mb-0 text-light">{theater.name}</h3>
                </div>
                <div className="small text-secondary mb-3 ps-4">{theater.address}</div>
                <div className="d-flex flex-wrap gap-2 ps-4">
                  {list.map((s) => (
                    <Link key={s.id} to={`/shows/${s.id}/seats`} className={`btn btn-outline-light show-btn ${s.availableSeats === 0 ? 'disabled' : ''}`}
                      aria-disabled={s.availableSeats === 0} aria-label={`${fmtTime(s.startsAt)}, ${s.screenName}, ${s.availableSeats} seats left`}>
                      <strong className="fs-6 d-block text-light">{fmtTime(s.startsAt)}</strong>
                      <small className="d-block text-secondary">{s.screenName} · {s.availableSeats === 0 ? 'Sold out' : `${s.availableSeats} left`}</small>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}
