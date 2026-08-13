import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { updatePassword } from '../lib/api';
import { checkPasswordPolicy } from '../lib/passwordPolicy';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'invalid'
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let settled = false;

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        settled = true;
        setStatus('ready');
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!settled && session) {
        settled = true;
        setStatus('ready');
      }
    });

    const timeout = setTimeout(() => {
      if (!settled) setStatus('invalid');
    }, 4000);

    return () => {
      listener.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const policy = checkPasswordPolicy(password);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!policy.valid) {
      setError('Please choose a password that meets all the requirements below.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await updatePassword(password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Could not update your password.');
    } finally {
      setSubmitting(false);
    }
  }

  if (status === 'loading') {
    return <div className="auth-page"><div className="card"><p className="page-loading">Validating your reset link…</p></div></div>;
  }

  if (status === 'invalid') {
    return (
      <div className="auth-page">
        <div className="card">
          <h1>Link expired</h1>
          <p className="subtitle">This password-reset link is invalid or has expired. Please request a new one.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="card">
        <h1>Choose a new password</h1>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="password">New password</label>
            <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {password && (
            <div style={{ marginBottom: 14, fontSize: 13 }}>
              <strong>Strength: {policy.label}</strong>
              {policy.feedback.length > 0 && (
                <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: 'var(--muted)' }}>
                  {policy.feedback.map((f) => <li key={f}>{f}</li>)}
                </ul>
              )}
            </div>
          )}
          <div className="form-field">
            <label htmlFor="confirm">Confirm password</label>
            <input id="confirm" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
            {submitting ? 'Saving…' : 'Set new password'}
          </button>
        </form>
      </div>
    </div>
  );
}
