import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { resolveLoginEmail, sendMagicLink } from '../lib/api';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('password'); // 'password' | 'magic-link'
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const email = await resolveLoginEmail(identifier.trim());
      // AUTH-04: one generic message regardless of which part was wrong, and
      // regardless of whether the identifier even resolved to an account.
      if (!email) throw new Error('generic');
      await login({ email, password });
      navigate('/');
    } catch {
      setError('Invalid email/username or password.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMagicLinkSubmit(e) {
    e.preventDefault();
    setError('');
    setInfo('');
    setSubmitting(true);
    try {
      await sendMagicLink(identifier.trim());
    } catch {
      // ignore — never disclose whether the account exists (AUTH-02/SEC-03)
    } finally {
      // Same message either way.
      setInfo('If that email has an account, a sign-in link is on its way — check your inbox.');
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="card">
        <h1>Ekal Volunteering</h1>
        <p className="subtitle">Ekal is invite-only. Sign in below, or request access if you're new.</p>
        {error && <div className="error-banner">{error}</div>}
        {info && <div className="success-banner">{info}</div>}

        <div className="tabs" style={{ marginBottom: 18 }}>
          <button type="button" className={mode === 'password' ? 'active' : ''} onClick={() => { setMode('password'); setError(''); setInfo(''); }}>Password</button>
          <button type="button" className={mode === 'magic-link' ? 'active' : ''} onClick={() => { setMode('magic-link'); setError(''); setInfo(''); }}>Magic link</button>
        </div>

        {mode === 'password' ? (
          <form onSubmit={handlePasswordSubmit}>
            <div className="form-field">
              <label htmlFor="identifier">Email or username</label>
              <input id="identifier" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
            </div>
            <div className="form-field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>
            <div className="auth-switch"><Link to="/forgot-password">Forgot password?</Link></div>
          </form>
        ) : (
          <form onSubmit={handleMagicLinkSubmit}>
            <div className="form-field">
              <label htmlFor="magic-email">Email</label>
              <input id="magic-email" type="email" required value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
              {submitting ? 'Sending…' : 'Email me a sign-in link'}
            </button>
          </form>
        )}

        <div className="auth-switch">
          New to Ekal? <Link to="/request-access">Request access</Link>
        </div>
      </div>
    </div>
  );
}
