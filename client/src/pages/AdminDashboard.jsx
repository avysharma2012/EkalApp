import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAdminStats, fetchAllHourLogs } from '../lib/api';

export function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchAdminStats(), fetchAllHourLogs('pending')])
      .then(([s, p]) => {
        setStats(s);
        setPending(p.slice(0, 5));
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">Loading admin dashboard…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Admin Dashboard</h1>
          <p>Volunteer engagement at a glance.</p>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card">
          <div className="stat-value">{stats.volunteerCount}</div>
          <div className="stat-label">Registered volunteers</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.pendingCount}</div>
          <div className="stat-label">Pending approvals</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.approvedHours}</div>
          <div className="stat-label">Total approved hours</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.upcomingEvents}</div>
          <div className="stat-label">Upcoming events</div>
        </div>
      </div>

      <div className="card">
        <h2>Needs your review</h2>
        {pending.length === 0 && <p className="empty-state">No pending hour submissions right now.</p>}
        {pending.map((l) => (
          <div key={l.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <strong>{l.profiles?.name}</strong> — {l.activity} ({l.hours}h on {l.log_date})
          </div>
        ))}
        <Link to="/admin/approvals" className="btn btn-secondary btn-sm" style={{ display: 'inline-block', marginTop: 12 }}>Go to approvals</Link>
      </div>
    </div>
  );
}
