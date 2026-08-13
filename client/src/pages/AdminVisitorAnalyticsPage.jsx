import { useEffect, useState } from 'react';
import { fetchVisitorLogs, fetchVisitorStats } from '../lib/api';

export function AdminVisitorAnalyticsPage() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchVisitorLogs(), fetchVisitorStats()])
      .then(([l, s]) => { setLogs(l); setStats(s); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">Loading visitor analytics…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Visitor Analytics</h1>
          <p>Traffic to the pre-login access request gate.</p>
        </div>
      </div>

      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card"><div className="stat-value">{stats.total}</div><div className="stat-label">Total visits</div></div>
        <div className="stat-card"><div className="stat-value">{stats.uniqueIps}</div><div className="stat-label">Unique IPs</div></div>
        <div className="stat-card"><div className="stat-value">{stats.humanCount}</div><div className="stat-label">Human</div></div>
        <div className="stat-card"><div className="stat-value">{stats.botCount}</div><div className="stat-label">Bot</div></div>
      </div>

      <div className="card">
        <h2>Recent visits</h2>
        {logs.length === 0 ? (
          <p className="empty-state">No visits recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Time</th><th>IP</th><th>Location</th><th>Page</th><th>Type</th><th>User agent</th></tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} style={l.is_bot ? { opacity: 0.7 } : undefined}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{new Date(l.created_at).toLocaleString()}</td>
                    <td>{l.ip || '—'}</td>
                    <td>{[l.city, l.region, l.country].filter(Boolean).join(', ') || '—'}</td>
                    <td>{l.path || '—'}</td>
                    <td>
                      {l.is_bot ? (
                        <span className="badge badge-rejected" title={l.bot_reason}>Bot</span>
                      ) : (
                        <span className="badge badge-approved">Human</span>
                      )}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.user_agent}
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
