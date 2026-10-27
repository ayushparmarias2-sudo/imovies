import { errorText } from '../format.js';

export const Loading = ({ label = 'Loading…' }) => (
  <div className="text-center py-5 my-4" role="status" aria-live="polite">
    <div className="spinner-border text-accent" style={{ width: '2.5rem', height: '2.5rem', borderWidth: '0.22rem' }} aria-hidden="true" />
    <div className="mt-3 text-secondary fw-medium">{label}</div>
  </div>
);

export const EmptyState = ({ title, children }) => (
  <div className="text-center py-5 px-3 my-4 rounded-4" style={{ background: 'rgba(15, 23, 42, 0.4)', border: '1px dashed rgba(255, 255, 255, 0.1)' }}>
    <div className="display-5 mb-2" aria-hidden="true">🎞️</div>
    <h2 className="h5 text-light fw-bold mb-2">{title}</h2>
    <div className="text-secondary">{children}</div>
  </div>
);

export const ErrorState = ({ error, onRetry }) => (
  <div className="alert alert-danger d-flex flex-wrap align-items-center justify-content-between gap-3 p-3 my-3 shadow-sm" role="alert">
    <div className="d-flex align-items-center gap-2">
      <span aria-hidden="true">⚠️</span>
      <span>{errorText(error)}</span>
    </div>
    {onRetry && <button className="btn btn-sm btn-outline-light px-3" onClick={onRetry}>Retry</button>}
  </div>
);
