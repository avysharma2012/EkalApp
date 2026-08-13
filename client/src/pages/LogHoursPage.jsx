import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchMyHours, createHourLog, fetchEvents } from '../lib/api';

export function LogHoursPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ activity: '', description: '', log_date: '', hours: '', notes: '', event_id: '' });

  async function load() {
    const [l, e] = await Promise.all([fetchMyHours(user.id), fetchEvents()]);
    setLogs(l);
    setEvents(e);
  }

  useEffect(() => {
    if (!user) return;
    load().finally(() => setLoading(false));
  }, [user]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await createHourLog({
        user_id: user.id,
        activity: form.activity,
        description: form.description,
        log_date: form.log_date,
        hours: Number(form.hours),
        notes: form.notes || null,
        event_id: form.event_id ? Number(form.event_id) : null,
      });
      setForm({ activity: '', description: '', log_date: '', hours: '', notes: '', event_id: '' });
      await load();
    } catch (err) {
      setError(err.message || 'Could not submit hours');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="page-loading">Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Log Volunteer Hours</h1>
          <p>Submit your hours and request admin approval — no need to chase anyone down.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/verified-hours" className="btn btn-secondary">Verified hours report</Link>
          <Link to="/certificates" className="btn btn-secondary">My certificates</Link>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>New entry</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
          This will be routed to your current chapter automatically (see your Profile page). Wrong chapter? Ask an admin to move you.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-field">
              <label>Activity</label>
              <input required minLength={3} maxLength={200} value={form.activity} onChange={(e) => update('activity', e.target.value)} placeholder="e.g. Weekend teaching session" />
            </div>
            <div className="form-field">
              <label>Linked event (optional)</label>
              <select value={form.event_id} onChange={(e) => update('event_id', e.target.value)}>
                <option value="">— None —</option>
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
              </select>
            </div>
          </div>
          <div className="form-field">
            <label>Description</label>
            <textarea required minLength={10} maxLength={2000} rows={3} value={form.description} onChange={(e) => update('description', e.target.value)} placeholder="What did you do? (10-2000 characters)" />
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Date</label>
              <input type="date" required min="2020-01-01" max={new Date().toISOString().slice(0, 10)} value={form.log_date} onChange={(e) => update('log_date', e.target.value)} />
            </div>
            <div className="form-field">
              <label>Hours</label>
              <input type="number" step="0.5" min="0.5" max="24" required value={form.hours} onChange={(e) => update('hours', e.target.value)} />
            </div>
          </div>
          <div className="form-field">
            <label>Notes (optional)</label>
            <textarea rows={2} value={form.notes} onChange={(e) => update('notes', e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit for approval'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>My submissions</h2>
        {logs.length === 0 ? (
          <p className="empty-state">No hours logged yet — add your first entry above.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th><th>Activity</th><th>Event</th><th>Hours</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td>{l.log_date}</td>
                    <td>{l.activity}</td>
                    <td>{l.events?.title || '—'}</td>
                    <td>{l.hours}</td>
                    <td>
                      <span className={`badge badge-${l.status}`}>{l.status}</span>
                      {l.status === 'rejected' && l.rejection_reason && (
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{l.rejection_reason}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
