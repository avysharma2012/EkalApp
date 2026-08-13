import { useEffect, useState } from 'react';
import { fetchAuditLog } from '../lib/api';
import { exportEntityToCsv } from '../lib/csv';

function formatActionType(type) {
  return type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

export function AdminAuditLogPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
    fetchAuditLog().then(setEntries).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page-loading">Loading audit log…</div>;

  const actionTypes = [...new Set(entries.map((e) => e.action_type))].sort();
  const q = query.trim().toLowerCase();
  const filtered = entries.filter((e) => {
    const matchesAction = !actionFilter || e.action_type === actionFilter;
    const matchesQuery = !q || [e.actor?.name, e.actor?.email, e.target?.name, e.target?.email, e.action_type]
      .filter(Boolean)
      .some((v) => v.toLowerCase().includes(q));
    return matchesAction && matchesQuery;
  });

  function handleExport() {
    const rows = filtered.map((e) => ({
      timestamp: e.created_at,
      actor: e.actor?.name || '—',
      action: formatActionType(e.action_type),
      target: e.target?.name || '',
      details: JSON.stringify(e.details || {}),
    }));
    exportEntityToCsv('audit-log', rows, [
      { key: 'timestamp', label: 'Timestamp' },
      { key: 'actor', label: 'Actor' },
      { key: 'action', label: 'Action' },
      { key: 'target', label: 'Target' },
      { key: 'details', label: 'Details' },
    ]);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Audit Log</h1>
          <p>Every administrative action, most recent 500 entries.</p>
        </div>
        <button className="btn btn-secondary" onClick={handleExport}>Export to CSV</button>
      </div>

      <div className="card">
        <div className="form-row" style={{ marginBottom: 16 }}>
          <input
            placeholder="Search by actor, target, or action…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 2, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--ink)' }}
          />
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={{ flex: 1 }}>
            <option value="">All actions</option>
            {actionTypes.map((t) => <option key={t} value={t}>{formatActionType(t)}</option>)}
          </select>
        </div>
        {filtered.length === 0 ? (
          <p className="empty-state">No matching audit entries.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{new Date(e.created_at).toLocaleString()}</td>
                    <td>{e.actor?.name || <span style={{ color: 'var(--muted)' }}>deleted user</span>}</td>
                    <td><span className="badge badge-approved">{formatActionType(e.action_type)}</span></td>
                    <td>{e.target?.name || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                    <td>
                      {e.details && (
                        <pre style={{ fontSize: 11, margin: 0, whiteSpace: 'pre-wrap', color: 'var(--muted)', maxWidth: 320 }}>
                          {JSON.stringify(e.details, null, 2)}
                        </pre>
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
