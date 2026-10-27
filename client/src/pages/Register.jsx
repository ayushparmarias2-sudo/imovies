import { useTitle } from '../useTitle.js';
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { errorText } from '../format.js';

export default function Register() {
  useTitle('Create account');
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const from = useLocation().state?.from || '/';
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  if (user) return <Navigate to={from} replace />;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await register(form.name, form.email, form.password); navigate(from, { replace: true }); }
    catch (err) { setError(errorText(err)); setBusy(false); }
  };
  return (
    <div className="py-4 py-md-5">
      <div className="auth-box mx-auto shadow-lg">
        <div className="text-center mb-4">
          <div className="fs-2 mb-1" aria-hidden="true">🎟️</div>
          <h1 className="h3 fw-bold mb-1">Create your account</h1>
          <p className="text-secondary small mb-0">Join iMovies to book seats in seconds</p>
        </div>
        {error && <div className="alert alert-danger py-2 small mb-3" role="alert">{error}</div>}
        <form onSubmit={submit} noValidate>
          <div className="mb-3">
            <label htmlFor="name" className="form-label small fw-semibold text-secondary">Full name</label>
            <input id="name" className="form-control" autoComplete="name" required value={form.name} onChange={set('name')} />
          </div>
          <div className="mb-3">
            <label htmlFor="email" className="form-label small fw-semibold text-secondary">Email</label>
            <input id="email" type="email" className="form-control" autoComplete="email" required value={form.email} onChange={set('email')} />
          </div>
          <div className="mb-4">
            <label htmlFor="password" className="form-label small fw-semibold text-secondary">Password</label>
            <input id="password" type="password" className="form-control" autoComplete="new-password" required aria-describedby="pw-help" value={form.password} onChange={set('password')} />
            <div id="pw-help" className="form-text small mt-1">At least 8 characters, including a letter and a number.</div>
          </div>
          <button className="btn btn-accent w-100 py-2 fs-6 shadow-sm" disabled={busy}>
            {busy ? 'Creating account…' : 'Sign up'}
          </button>
        </form>
        <p className="mt-4 mb-0 text-center small text-secondary">
          Already registered? <Link to="/login" state={{ from }} className="fw-semibold text-accent">Log in</Link>
        </p>
      </div>
    </div>
  );
}
