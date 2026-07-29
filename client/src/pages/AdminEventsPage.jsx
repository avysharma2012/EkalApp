import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchEvents, createEvent, deleteEvent, fetchEventSignups } from '../lib/api';

export function AdminEventsPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', event_date: '', location: '' });
  const [expandedId, setExpandedId] = useState(null);
  const [signups, setSignups] = useState([]);
  const [signupsLoading, setSignupsLoading] = useState(false);

  async function load() {
    setEvents(await fetchEvents());
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await createEvent({ ...form, created_by: user.id });
      setForm({ title: '', description: '', event_date: '', location: '' });
      await load();
    } catch (err) {
      setError(err.message || 'Could not create event');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id) {
    setError('');
    try {
      await deleteEvent(id);
      if (expandedId === id) setExpandedId(null);
      await load();
    } catch (err) {
      setError(err.message || 'Could not delete event');
    }
  }

  async function toggleExpand(id) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setSignupsLoading(true);
    try {
      const data = await fetchEventSignups(id);
      setSignups(data);
    } finally {
      setSignupsLoading(false);
    }
  }

  if (loading) return <div className="page-loading">Loading events…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Manage Events</h1>
          <p>Create events and see who's registered.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>New event</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-field">
              <label>Title</label>
              <input required value={form.title} onChange={(e) => update('title', e.target.value)} />
            </div>
            <div className="form-field">
              <label>Date</label>
              <input type="date" required value={form.event_date} onChange={(e) => update('event_date', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Location</label>
              <input value={form.location} onChange={(e) => update('location', e.target.value)} />
            </div>
          </div>
          <div className="form-field">
            <label>Description</label>
            <textarea rows={2} value={form.description} onChange={(e) => update('description', e.target.value)} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create event'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>All events</h2>
        {events.length === 0 && <p className="empty-state">No events yet.</p>}
        {events.map((e) => (
          <div key={e.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <div className="event-card">
              <div>
                <strong>{e.title}</strong>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{e.event_date} · {e.location || 'Location TBD'} · {e.signup_count} signed up</div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => toggleExpand(e.id)}>
                  {expandedId === e.id ? 'Hide signups' : 'View signups'}
                </button>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(e.id)}>Delete</button>
              </div>
            </div>
            {expandedId === e.id && (
              <div style={{ marginTop: 10, paddingLeft: 8 }}>
                {signupsLoading ? (
                  <p className="empty-state">Loading signups…</p>
                ) : signups.length === 0 ? (
                  <p className="empty-state">No one has signed up yet.</p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {signups.map((s, i) => (
                      <li key={i} style={{ fontSize: 14, padding: '4px 0' }}>
                        {s.profiles?.name} <span style={{ color: 'var(--muted)' }}>({s.profiles?.email})</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
