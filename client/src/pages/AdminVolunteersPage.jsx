import { useEffect, useState } from 'react';
import { fetchVolunteers, promoteToAdmin } from '../lib/api';

export function AdminVolunteersPage() {
  const [volunteers, setVolunteers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setVolunteers(await fetchVolunteers());
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const filtered = volunteers.filter((v) =>
    v.name.toLowerCase().includes(query.toLowerCase()) || v.email.toLowerCase().includes(query.toLowerCase())
  );

  async function handlePromote(v) {
    if (!window.confirm(`Give ${v.name} admin access? They'll be able to approve hours, manage events, and post announcements.`)) return;
    setBusyId(v.id);
    setError('');
    try {
      await promoteToAdmin(v.id);
      await load();
    } catch (err) {
      setError(err.message || 'Could not update this volunteer');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="page-loading">Loading volunteers…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Volunteers</h1>
          <p>{volunteers.length} registered volunteers.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <input
          placeholder="Search by name or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 16, width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--ink)' }}
        />
        {filtered.length === 0 ? (
          <p className="empty-state">No volunteers match your search.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Name</th><th>Email</th><th>Country</th><th>Joined</th><th>Approved hours</th><th>Pending</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id}>
                    <td>{v.name}</td>
                    <td>{v.email}</td>
                    <td>{v.country || '—'}</td>
                    <td>{v.date_joined}</td>
                    <td>{v.approved_hours}</td>
                    <td>{v.pending_count > 0 ? <span className="badge badge-pending">{v.pending_count}</span> : '—'}</td>
                    <td>
                      <button className="btn btn-secondary btn-sm" disabled={busyId === v.id} onClick={() => handlePromote(v)}>
                        {busyId === v.id ? 'Updating…' : 'Make admin'}
                      </button>
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
