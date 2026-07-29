import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchMyHours, fetchEvents, fetchAnnouncements } from '../lib/api';

export function VolunteerDashboard() {
  const { user, profile } = useAuth();
  const [logs, setLogs] = useState([]);
  const [events, setEvents] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([fetchMyHours(user.id), fetchEvents(), fetchAnnouncements()])
      .then(([l, e, a]) => {
        setLogs(l);
        setEvents(e.filter((ev) => ev.event_date >= new Date().toISOString().slice(0, 10)).slice(0, 4));
        setAnnouncements(a.slice(0, 3));
      })
      .finally(() => setLoading(false));
  }, [user]);

  const approvedHours = logs.filter((l) => l.status === 'approved').reduce((s, l) => s + Number(l.hours), 0);
  const pendingCount = logs.filter((l) => l.status === 'pending').length;

  if (loading) return <div className="page-loading">Loading dashboard…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Welcome back, {profile?.name?.split(' ')[0] || 'Volunteer'}</h1>
          <p>Here's your volunteering snapshot.</p>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-value">{approvedHours}</div>
          <div className="stat-label">Approved hours</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{pendingCount}</div>
          <div className="stat-label">Pending approval</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{logs.length}</div>
          <div className="stat-label">Total logs submitted</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{events.length}</div>
          <div className="stat-label">Upcoming events</div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Upcoming events</h2>
          {events.length === 0 && <p className="empty-state">No upcoming events yet.</p>}
          {events.map((e) => (
            <div key={e.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <strong>{e.title}</strong>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{formatDate(e.event_date)} {e.location ? `· ${e.location}` : ''}</div>
            </div>
          ))}
          <Link to="/events" className="btn btn-secondary btn-sm" style={{ display: 'inline-block', marginTop: 12 }}>View all events</Link>
        </div>

        <div className="card">
          <h2>Announcements</h2>
          {announcements.length === 0 && <p className="empty-state">No announcements yet.</p>}
          {announcements.map((a) => (
            <div key={a.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <strong>{a.title}</strong>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{a.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
