import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchEvents, signUpForEvent, cancelSignup } from '../lib/api';

export function EventsPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setEvents(await fetchEvents());
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function toggleSignup(event) {
    setBusyId(event.id);
    setError('');
    try {
      if (event.signed_up) await cancelSignup(event.id, user.id);
      else await signUpForEvent(event.id, user.id);
      await load();
    } catch (err) {
      setError(err.message || 'Could not update your signup');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="page-loading">Loading events…</div>;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.event_date >= today);
  const past = events.filter((e) => e.event_date < today);

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
        <h2>Upcoming</h2>
        {upcoming.length === 0 && <p className="empty-state">No upcoming events scheduled yet.</p>}
        {upcoming.map((e) => (
          <EventRow key={e.id} event={e} busy={busyId === e.id} onToggle={() => toggleSignup(e)} />
        ))}
      </div>

      {past.length > 0 && (
        <div className="card">
          <h2>Past events</h2>
          {past.map((e) => (
            <EventRow key={e.id} event={e} readOnly />
          ))}
        </div>
      )}
    </div>
  );
}

function EventRow({ event, busy, onToggle, readOnly }) {
  const [year, month, day] = event.event_date.split('-');
  const monthName = new Date(event.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' });
  return (
    <div className="event-card" style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 14 }}>
        <div className="event-date-chip">
          <span className="day">{day}</span>
          <span className="month">{monthName}</span>
        </div>
        <div>
          <strong>{event.title}</strong>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{event.location || 'Location TBD'}</div>
          {event.description && <div style={{ fontSize: 13, marginTop: 4 }}>{event.description}</div>}
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{event.signup_count} signed up</div>
        </div>
      </div>
      {!readOnly && (
        <button
          className={`btn btn-sm ${event.signed_up ? 'btn-ghost' : 'btn-primary'}`}
          onClick={onToggle}
          disabled={busy}
        >
          {busy ? 'Updating…' : event.signed_up ? 'Cancel signup' : 'Sign up'}
        </button>
      )}
    </div>
  );
}
