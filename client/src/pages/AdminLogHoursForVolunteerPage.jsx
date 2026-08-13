import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchVolunteerRoster, fetchEvents, adminLogHoursForVolunteer, fetchAllHourLogs, writeAuditLog } from '../lib/api';

export function AdminLogHoursForVolunteerPage() {
  const { user } = useAuth();
  const [volunteers, setVolunteers] = useState([]);
  const [events, setEvents] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    userId: '',
    activity: '',
    log_date: '',
    hours: '',
    notes: '',
    event_id: '',
    autoApprove: true,
  });

  async function load() {
    const [roster, evts, logs] = await Promise.all([
      fetchVolunteerRoster(),
      fetchEvents(),
      fetchAllHourLogs(),
    ]);
    setVolunteers(roster);
    setEvents(evts);
    setRecent(logs.slice(-8).reverse());
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
    setSuccess('');
    setSubmitting(true);
    try {
      const created = await adminLogHoursForVolunteer({
        userId: form.userId,
        activity: form.activity,
        log_date: form.log_date,
        hours: Number(form.hours),
        notes: form.notes,
        event_id: form.event_id ? Number(form.event_id) : null,
        autoApprove: form.autoApprove,
        adminId: user.id,
      });
      writeAuditLog(form.autoApprove ? 'hours_approved' : 'hours_logged_for_volunteer', {
        targetUserId: form.userId,
        targetId: created.id,
        details: { activity: form.activity, hours: Number(form.hours), logged_by_admin: true },
      });
      const volunteerName = volunteers.find((v) => v.id === form.userId)?.name;
      setSuccess(`Logged ${form.hours}h for ${volunteerName}${form.autoApprove ? ' (approved)' : ' (pending your approval)'}.`);
      setForm({ userId: '', activity: '', log_date: '', hours: '', notes: '', event_id: '', autoApprove: true });
      await load();
    } catch (err) {
      setError(err.message || 'Could not log these hours');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="page-loading">Loading…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Log Hours for a Volunteer</h1>
          <p>Enter hours on someone's behalf — e.g. after an in-person event they didn't log themselves.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <div className="card">
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-field">
              <label>Volunteer</label>
              <select required value={form.userId} onChange={(e) => update('userId', e.target.value)}>
                <option value="">— Select a volunteer —</option>
                {volunteers.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} ({v.email})</option>
                ))}
              </select>
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
            <label>Activity</label>
            <input required value={form.activity} onChange={(e) => update('activity', e.target.value)} placeholder="e.g. Weekend teaching session" />
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Date</label>
              <input type="date" required value={form.log_date} onChange={(e) => update('log_date', e.target.value)} />
            </div>
            <div className="form-field">
              <label>Hours</label>
              <input type="number" step="0.25" min="0.25" required value={form.hours} onChange={(e) => update('hours', e.target.value)} />
            </div>
          </div>
          <div className="form-field">
            <label>Notes (optional)</label>
            <textarea rows={2} value={form.notes} onChange={(e) => update('notes', e.target.value)} />
          </div>
          <div className="form-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="autoApprove"
              checked={form.autoApprove}
              onChange={(e) => update('autoApprove', e.target.checked)}
              style={{ width: 'auto' }}
            />
            <label htmlFor="autoApprove" style={{ margin: 0 }}>Mark as approved immediately</label>
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Log hours'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Recently logged</h2>
        {recent.length === 0 ? (
          <p className="empty-state">Nothing logged yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Volunteer</th><th>Activity</th><th>Date</th><th>Hours</th><th>Status</th></tr>
              </thead>
              <tbody>
                {recent.map((l) => (
                  <tr key={l.id}>
                    <td>{l.profiles?.name}</td>
                    <td>{l.activity}</td>
                    <td>{l.log_date}</td>
                    <td>{l.hours}</td>
                    <td><span className={`badge badge-${l.status}`}>{l.status}</span></td>
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
