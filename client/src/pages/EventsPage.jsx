import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchEvents, signUpForEvent, updateSignupNotes, cancelSignup } from '../lib/api';
import { EventCalendar } from '../components/EventCalendar';

export function EventsPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [view, setView] = useState('list'); // 'list' | 'calendar'
  const [query, setQuery] = useState('');

  async function load() {
    setEvents(await fetchEvents());
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function handleSignup(event, notes) {
    setBusyId(event.id);
    setError('');
    try {
      await signUpForEvent(event.id, user.id, notes);
      await load();
    } catch (err) {
      setError(err.message || 'Could not sign up');
    } finally {
      setBusyId(null);
    }
  }

  async function handleUpdateNotes(event, notes) {
    setBusyId(event.id);
    setError('');
    try {
      await updateSignupNotes(event.id, user.id, notes);
      await load();
    } catch (err) {
      setError(err.message || 'Could not update your signup');
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(event) {
    if (!window.confirm(`Cancel your signup for "${event.title}"?`)) return;
    setBusyId(event.id);
    setError('');
    try {
      await cancelSignup(event.id, user.id);
      await load();
    } catch (err) {
      setError(err.message || 'Could not cancel your signup');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="page-loading">Loading events…</div>;

  const today = new Date().toISOString().slice(0, 10);
  const q = query.trim().toLowerCase();
  const matches = (e) => !q || [e.title, e.city, e.state, e.location].filter(Boolean).some((v) => v.toLowerCase().includes(q));

  const upcoming = events.filter((e) => e.event_date >= today && matches(e));
  const past = events.filter((e) => e.event_date < today && matches(e));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Ekal Events</h1>
          <p>Browse upcoming events and sign up directly.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="form-row" style={{ marginBottom: 16 }}>
          <input
            placeholder="Search by title, city, state, or location…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--ink)' }}
          />
          <div className="tabs" style={{ marginBottom: 0 }}>
            <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>List</button>
            <button className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}>Calendar</button>
          </div>
        </div>

        {view === 'calendar' ? (
          <EventCalendar
            events={[...upcoming, ...past]}
            renderEvent={(e) => (
              <EventRow
                event={e}
                busy={busyId === e.id}
                readOnly={e.event_date < today}
                onSignup={(notes) => handleSignup(e, notes)}
                onUpdateNotes={(notes) => handleUpdateNotes(e, notes)}
                onCancel={() => handleCancel(e)}
              />
            )}
          />
        ) : (
          <>
            <h2>Upcoming</h2>
            {upcoming.length === 0 && <p className="empty-state">No upcoming events match your search.</p>}
            {upcoming.map((e) => (
              <EventRow
                key={e.id}
                event={e}
                busy={busyId === e.id}
                onSignup={(notes) => handleSignup(e, notes)}
                onUpdateNotes={(notes) => handleUpdateNotes(e, notes)}
                onCancel={() => handleCancel(e)}
              />
            ))}

            {past.length > 0 && (
              <>
                <h2 style={{ marginTop: 24 }}>Past events</h2>
                {past.map((e) => <EventRow key={e.id} event={e} readOnly />)}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EventRow({ event, busy, readOnly, onSignup, onUpdateNotes, onCancel }) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState(event.my_notes || '');
  const [year, month, day] = event.event_date.split('-');
  const monthName = new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' });

  return (
    <div className="event-card" style={{ padding: '14px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', gap: 14 }}>
        <div className="event-date-chip">
          <span className="day">{day}</span>
          <span className="month">{monthName}</span>
        </div>
        <div>
          <strong>{event.title}</strong>
          {event.event_type && <span className="badge badge-approved" style={{ marginLeft: 8 }}>{event.event_type}</span>}
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {[event.location, event.city, event.state].filter(Boolean).join(', ') || 'Location TBD'}
            {event.event_time && ` · ${event.event_time.slice(0, 5)}`}
          </div>
          {event.chapters?.name && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{event.chapters.name}</div>}
          {event.description && <div style={{ fontSize: 13, marginTop: 4 }}>{event.description}</div>}
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{event.signup_count} signed up</div>

          {!readOnly && event.signed_up && (
            editingNotes ? (
              <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                <input value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} placeholder="Notes (optional)" style={{ fontSize: 13 }} />
                <button className="btn btn-secondary btn-sm" onClick={() => { onUpdateNotes(notesDraft); setEditingNotes(false); }}>Save</button>
              </div>
            ) : (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
                {event.my_notes ? `Your note: ${event.my_notes}` : 'No note added'}{' '}
                <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }} onClick={() => setEditingNotes(true)}>Edit</button>
              </div>
            )
          )}
        </div>
      </div>
      {!readOnly && (
        event.signed_up ? (
          <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
            {busy ? 'Updating…' : 'Cancel signup'}
          </button>
        ) : (
          <SignupControl busy={busy} onSignup={onSignup} />
        )
      )}
    </div>
  );
}

function SignupControl({ busy, onSignup }) {
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);

  if (!showNotes) {
    return <button className="btn btn-primary btn-sm" onClick={() => setShowNotes(true)} disabled={busy}>Sign up</button>;
  }
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" style={{ fontSize: 13 }} />
      <button className="btn btn-primary btn-sm" onClick={() => onSignup(notes)} disabled={busy}>
        {busy ? 'Signing up…' : 'Confirm'}
      </button>
    </div>
  );
}
