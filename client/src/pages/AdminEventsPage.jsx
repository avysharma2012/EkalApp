import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchEvents, createEvent, deleteEvent, fetchEventSignups, fetchVolunteerRoster, enrollUserInEvent, writeAuditLog } from '../lib/api';
import { exportEntityToCsv } from '../lib/csv';

export function AdminEventsPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', event_date: '', location: '' });
  const [expandedId, setExpandedId] = useState(null);
  const [signups, setSignups] = useState([]);
  const [signupsLoading, setSignupsLoading] = useState(false);
  const [enrollForm, setEnrollForm] = useState({ userId: '', autoApprove: false });
  const [enrolling, setEnrolling] = useState(false);

  async function load() {
    const [evts, vols] = await Promise.all([fetchEvents(), fetchVolunteerRoster()]);
    setEvents(evts);
    setRoster(vols);
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
      const created = await createEvent({ ...form, created_by: user.id });
      writeAuditLog('event_created', { targetId: created.id, details: { title: created.title } });
      setForm({ title: '', description: '', event_date: '', location: '' });
      await load();
    } catch (err) {
      setError(err.message || 'Could not create event');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id) {
    const title = events.find((e) => e.id === id)?.title;
    if (!window.confirm(`Delete "${title}"? Everyone's signups for this event will also be deleted. This cannot be undone.`)) return;
    setError('');
    try {
      await deleteEvent(id);
      writeAuditLog('event_deleted', { targetId: id, details: { title } });
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
    setEnrollForm({ userId: '', autoApprove: false });
    setSignupsLoading(true);
    try {
      const data = await fetchEventSignups(id);
      setSignups(data);
    } finally {
      setSignupsLoading(false);
    }
  }

  async function handleEnroll(eventId) {
    if (!enrollForm.userId) return;
    setEnrolling(true);
    setError('');
    try {
      await enrollUserInEvent(eventId, enrollForm.userId, { autoApproveIntent: enrollForm.autoApprove, enrolledBy: user.id });
      writeAuditLog('user_enrolled', { targetUserId: enrollForm.userId, targetId: eventId, details: { auto_approve_intent: enrollForm.autoApprove } });
      setEnrollForm({ userId: '', autoApprove: false });
      const data = await fetchEventSignups(eventId);
      setSignups(data);
      await load();
    } catch (err) {
      setError(err.message || 'Could not enroll this volunteer');
    } finally {
      setEnrolling(false);
    }
  }

  function handleExportRoster(event) {
    const flatRows = signups.map((s) => ({ name: s.profiles?.name, email: s.profiles?.email, signed_up_at: s.signed_up_at }));
    exportEntityToCsv(`event-${event.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-roster`, flatRows, [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'signed_up_at', label: 'Signed Up' },
    ]);
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
        {events.map((e) => {
          const enrolledIds = new Set(signups.map((s) => s.profiles?.id));
          const enrollableRoster = roster.filter((v) => !enrolledIds.has(v.id));
          return (
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
                    <>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {signups.map((s, i) => (
                          <li key={i} style={{ fontSize: 14, padding: '4px 0' }}>
                            {s.profiles?.name} <span style={{ color: 'var(--muted)' }}>({s.profiles?.email})</span>
                          </li>
                        ))}
                      </ul>
                      <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => handleExportRoster(e)}>Export roster to CSV</button>
                    </>
                  )}
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Enroll a volunteer directly</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <select
                        value={enrollForm.userId}
                        onChange={(ev) => setEnrollForm((f) => ({ ...f, userId: ev.target.value }))}
                        style={{ flex: 1, minWidth: 200 }}
                      >
                        <option value="">— Select a volunteer —</option>
                        {enrollableRoster.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.email})</option>)}
                      </select>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <input
                          type="checkbox"
                          checked={enrollForm.autoApprove}
                          onChange={(ev) => setEnrollForm((f) => ({ ...f, autoApprove: ev.target.checked }))}
                          style={{ width: 'auto' }}
                        />
                        Auto-approve intended
                      </label>
                      <button className="btn btn-secondary btn-sm" disabled={!enrollForm.userId || enrolling} onClick={() => handleEnroll(e.id)}>
                        {enrolling ? 'Enrolling…' : 'Enroll'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
