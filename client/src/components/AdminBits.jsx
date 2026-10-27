export const Pager = ({ meta, page, setPage }) => meta && meta.pages > 1 ? (
  <div className="d-flex justify-content-center align-items-center gap-3 my-4">
    <button className="btn btn-outline-secondary btn-sm px-3" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</button>
    <span className="small text-secondary fw-medium">Page {meta.page} of {meta.pages} ({meta.total} total)</span>
    <button className="btn btn-outline-secondary btn-sm px-3" disabled={page >= meta.pages} onClick={() => setPage(page + 1)}>Next →</button>
  </div>
) : null;

export const Field = ({ id, label, children, help }) => (
  <div className="mb-3"><label htmlFor={id} className="form-label small fw-semibold text-secondary mb-1">{label}</label>{children}{help && <div className="form-text small mt-1">{help}</div>}</div>
);

export const FormAlert = ({ msg }) => msg ? <div className="alert alert-danger py-2 small mb-3" role="alert">{msg}</div> : null;
