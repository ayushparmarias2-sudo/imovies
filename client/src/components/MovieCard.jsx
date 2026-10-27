import { Link } from 'react-router-dom';
import Poster from './Poster.jsx';
import { duration } from '../format.js';

export default function MovieCard({ movie }) {
  const upcoming = new Date(movie.releaseDate) > new Date();
  return (
    <Link to={`/movies/${movie.id}`} className="movie-card text-decoration-none h-100 d-flex flex-column">
      <div className="position-relative overflow-hidden">
        <Poster title={movie.title} url={movie.posterUrl} decorative />
        <span className="badge cert-badge">{movie.certificate}</span>
        {upcoming && <span className="badge bg-warning text-dark soon-badge shadow-sm">Upcoming</span>}
      </div>
      <div className="p-3 d-flex flex-column flex-grow-1 justify-content-between">
        <div>
          <h3 className="h6 fw-bold mb-1 text-light text-truncate" title={movie.title}>{movie.title}</h3>
          <div className="small text-secondary text-truncate mb-1">{movie.genres.join(' • ')}</div>
        </div>
        <div className="small text-secondary pt-1 border-top border-secondary-subtle d-flex justify-content-between align-items-center" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <span>{duration(movie.durationMinutes)}</span>
          <span>·</span>
          <span>{movie.language}</span>
        </div>
      </div>
    </Link>
  );
}
