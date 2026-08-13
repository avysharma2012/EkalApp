import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sendPasswordReset } from '../lib/api';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await sendPasswordReset(email.trim());
    } catch {
      // ignore — identical response either way (AUTH-03/SEC-03)
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  }

  return (
    <div className="auth-page">
      <div className="card">
        <h1>Reset your password</h1>
        {submitted ? (
          <>
            <p className="subtitle">If that email has an account, a password-reset link is on its way — check your inbox.</p>
            <Link to="/login" className="btn btn-secondary" style={{ width: '100%', display: 'block', textAlign: 'center' }}>Back to sign in</Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
            <div className="auth-switch"><Link to="/login">Back to sign in</Link></div>
          </form>
        )}
      </div>
    </div>
  );
}
