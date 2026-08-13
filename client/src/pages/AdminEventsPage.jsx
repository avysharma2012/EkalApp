import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchEvents, createEvent, updateEvent, deleteEvent, fetchEventSignups, fetchVolunteerRoster,
  enrollUserInEvent, fetchChapters, syncEkalEvents, writeAuditLog,
} from '../lib/api';
import { exportEntityToCsv } from '../lib/csv';
import { EventCalendar } from '../components/EventCalendar';

const EVENT_TYPES = ['Fundraising', 'Workshop', 'Community Service', 'Educational', 'Event', 'Conference'];
const EMPTY_FORM = { title: '', description: '', event_date: '', event_time: '', location: '', city: '', state: '', event_type: '', chapter_id: '' };

export function AdminEventsPage() {
  const { user, isSuperAdmin, adminChapterId } = useAuth();
  const [events, setEvents] = useState([]);
  const [roster, setRoster] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [signups, setSignups] = useState([]);
  const [signupsLoading, setSignupsLoading] = useState(false);
  const [enrollForm, setEnrollForm] = useState({ userId: '', autoApprove: false });
  const [enrolling, setEnrolling] = useState(false);
  const [view, setView] = useState('list');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  async function load() {
    const [evts, vols, chaps] = await Promise.all([fetchEvents(), fetchVolunteerRoster(), fetchChapters()]);
    setEvents(evts);
    setRoster(vols);
    setChapters(chaps);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function startEdit(e) {
    setEditingId(e.id);
    setForm({
      title: e.title, description: e.description || '', event_date: e.event_date, event_time: e.event_time || '',
      location: e.location || '', city: e.city || '', state: e.state || '', event_type: e.event_type || '',
      chapter_id: e.chapter_id || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = { ...form, event_time: form.event_time || null, chapter_id: isSuperAdmin ? (form.chapter_id || null) : adminChapterId };
      if (editingId) {
        await updateEvent(editingId, payload);
        writeAuditLog('event_updated', { targetId: editingId, details: { title: payload.title } });
      } else {
        const created = await createEvent({ ...payload, created_by: user.id });
        writeAuditLog('event_created', { targetId: created.id, details: { title: created.title } });
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message || 'Could not save event');
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
      setSignups(await fetchEventSignups(id));
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
      setSignups(await fetchEventSignups(eventId));
      await load();
    } catch (err) {
      setError(err.message || 'Could not enroll this volunteer');
    } finally {
      setEnrolling(false);
    }
  }

  function handleExportRoster(event) {
    const flatRows = signups.map((s) => ({ name: s.profiles?.name, email: s.profiles?.email, notes: s.notes, signed_up_at: s.signed_up_at }));
    exportEntityToCsv(`event-${event.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-roster`, flatRows, [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'notes', label: 'Notes' },
      { key: 'signed_up_at', label: 'Signed Up' },
    ]);
  }

  async function handleSync() {
    setSyncing(true);
    setError('');
    setSyncResult(null);
    try {
      const result = await syncEkalEvents();
      setSyncResult(result);
      await load();
    } catch (err) {
      setError(err.message || 'Could not sync events from Ekal.org');
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return <div className="page-loading">Loading events…</div>;

  const rootChapters = chapters.filter((c) => !c.parent_id && !c.is_unassigned);
  const subChaptersByParent = {};
  chapters.filter((c) => c.parent_id).forEach((c) => {
    subChaptersByParent[c.parent_id] = subChaptersByParent[c.parent_id] || [];
    subChaptersByParent[c.parent_id].push(c);
  });

  function renderEventCard(e) {
    const enrolledIds = new Set(signups.map((s) => s.profiles?.id));
    const enrollableRoster = roster.filter((v) => !enrolledIds.has(v.id));
    return (
      <div key={e.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <div className="event-card">
          <div>
            <strong>{e.title}</strong>
            {e.event_type && <span className="badge badge-approved" style={{ marginLeft: 8 }}>{e.event_type}</span>}
            {!e.chapter_id && <span className="badge badge-pending" style={{ marginLeft: 4 }}>Global</span>}
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {e.event_date}{e.event_time && ` · ${e.event_time.slice(0, 5)}`} · {[e.location, e.city, e.state].filter(Boolean).join(', ') || 'Location TBD'} · {e.signup_count} signed up
              {e.chapters?.name && ` · ${e.chapters.name}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => toggleExpand(e.id)}>
              {expandedId === e.id ? 'Hide signups' : 'View signups'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => startEdit(e)}>Edit</button>
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
                      {s.notes && <span style={{ color: 'var(--muted)' }}> — {s.notes}</span>}
                    </li>
                  ))}
                </ul>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => handleExportRoster(e)}>Export roster to CSV</button>
              </>
            )}
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Enroll a volunteer directly</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={enrollForm.userId} onChange={(ev) => setEnrollForm((f) => ({ ...f, userId: ev.target.value }))} style={{ flex: 1, minWidth: 200 }}>
                  <option value="">— Select a volunteer —</option>
                  {enrollableRoster.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.email})</option>)}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input type="checkbox" checked={enrollForm.autoApprove} onChange={(ev) => setEnrollForm((f) => ({ ...f, autoApprove: ev.target.checked }))} style={{ width: 'auto' }} />
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
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Manage Events</h1>
          <p>Create events and see who's registered.</p>
        </div>
        {isSuperAdmin && (
          <button className="btn btn-secondary" onClick={handleSync} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync from Ekal.org'}
          </button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}
      {syncResult && (
        <div className="success-banner">
          Synced: {syncResult.inserted} new, {syncResult.updated} updated, {syncResult.total} total parsed.
          {syncResult.validationErrors?.length > 0 && ` ${syncResult.validationErrors.length} skipped due to parsing issues.`}
        </div>
      )}

      <div className="card">
        <h2>{editingId ? 'Edit event' : 'New event'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-field">
              <label>Title</label>
              <input required minLength={3} maxLength={200} value={form.title} onChange={(e) => update('title', e.target.value)} />
            </div>
            <div className="form-field">
              <label>Type</label>
              <select value={form.event_type} onChange={(e) => update('event_type', e.target.value)}>
                <option value="">— Select —</option>
                {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Date</label>
              <input type="date" required min="2020-01-01" value={form.event_date} onChange={(e) => update('event_date', e.target.value)} />
            </div>
            <div className="form-field">
              <label>Time (optional)</label>
              <input type="time" value={form.event_time} onChange={(e) => update('event_time', e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>Venue / location</label>
              <input value={form.location} onChange={(e) => update('location', e.target.value)} />
            </div>
            <div className="form-field">
              <label>City</label>
              <input value={form.city} onChange={(e) => update('city', e.target.value)} />
            </div>
            <div className="form-field">
              <label>State</label>
              <input value={form.state} onChange={(e) => update('state', e.target.value)} />
            </div>
          </div>
          {isSuperAdmin ? (
            <div className="form-field">
              <label>Chapter (leave blank for a global event, visible to everyone)</label>
              <select value={form.chapter_id} onChange={(e) => update('chapter_id', e.target.value)}>
                <option value="">— Global event —</option>
                {rootChapters.map((r) => (
                  <optgroup key={r.id} label={r.name}>
                    <option value={r.id}>{r.name} (general)</option>
                    {(subChaptersByParent[r.id] || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
          ) : (
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>This event will belong to your chapter.</p>
          )}
          <div className="form-field">
            <label>Description</label>
            <textarea rows={2} value={form.description} onChange={(e) => update('description', e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : editingId ? 'Save changes' : 'Create event'}
            </button>
            {editingId && <button type="button" className="btn btn-ghost" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); }}>Cancel</button>}
          </div>
        </form>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>All events</h2>
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>List</button>
            <button className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}>Calendar</button>
          </div>
        </div>
        {events.length === 0 && <p className="empty-state">No events yet.</p>}
        {view === 'calendar' ? (
          <EventCalendar events={events} renderEvent={renderEventCard} />
        ) : (
          events.map(renderEventCard)
        )}
      </div>
    </div>
  );
}
