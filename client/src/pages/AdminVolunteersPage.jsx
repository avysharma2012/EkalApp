import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchVolunteers, grantChapterAdmin, grantSuperAdmin, revokeAdminRole, writeAuditLog } from '../lib/api';

const ROLE_LABEL = { volunteer: 'Volunteer', chapter_admin: 'Chapter Admin', super_admin: 'Super Admin' };

export function AdminVolunteersPage() {
  const { user, isSuperAdmin } = useAuth();
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

  async function runAction(v, action, actionType, details) {
    if (!window.confirm(`${action.confirmMessage(v)}`)) return;
    setBusyId(v.id);
    setError('');
    try {
      await action.run(v);
      writeAuditLog(actionType, { targetUserId: v.id, details });
      await load();
    } catch (err) {
      setError(err.message || 'Could not update this user');
    } finally {
      setBusyId(null);
    }
  }

  const makeChapterAdmin = {
    confirmMessage: (v) => `Give ${v.name} admin access over ${v.chapter_name}? They'll be able to approve hours, manage events, and post announcements for that chapter.`,
    run: (v) => grantChapterAdmin(v.id, v.chapter_id),
  };
  const revoke = {
    confirmMessage: (v) => `Remove ${v.name}'s admin access? They'll become a regular volunteer.`,
    run: (v) => revokeAdminRole(v.id),
  };
  const makeSuperAdmin = {
    confirmMessage: (v) => `Give ${v.name} Super Admin access across ALL chapters? This is the highest privilege level.`,
    run: (v) => grantSuperAdmin(v.id),
  };

  if (loading) return <div className="page-loading">Loading volunteers…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Volunteers</h1>
          <p>{volunteers.length} registered users.</p>
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
                <tr><th>Name</th><th>Email</th><th>Chapter</th><th>Role</th><th>Approved hours</th><th>Pending</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((v) => {
                  const isSelf = v.id === user.id;
                  return (
                    <tr key={v.id}>
                      <td>{v.name}</td>
                      <td>{v.email}</td>
                      <td>{v.chapter_name}</td>
                      <td><span className={`badge ${v.role === 'volunteer' ? '' : 'badge-approved'}`}>{ROLE_LABEL[v.role]}</span></td>
                      <td>{v.approved_hours}</td>
                      <td>{v.pending_count > 0 ? <span className="badge badge-pending">{v.pending_count}</span> : '—'}</td>
                      <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {isSelf ? (
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>This is you</span>
                        ) : (
                          <>
                            {v.role === 'volunteer' && (
                              <button className="btn btn-secondary btn-sm" disabled={busyId === v.id} onClick={() => runAction(v, makeChapterAdmin, 'role_assigned', { role: 'chapter_admin', chapter: v.chapter_name })}>
                                Make chapter admin
                              </button>
                            )}
                            {v.role !== 'volunteer' && (
                              <button className="btn btn-ghost btn-sm" disabled={busyId === v.id} onClick={() => runAction(v, revoke, 'role_removed', { previous_role: v.role })}>
                                Revoke admin
                              </button>
                            )}
                            {isSuperAdmin && v.role !== 'super_admin' && (
                              <button className="btn btn-secondary btn-sm" disabled={busyId === v.id} onClick={() => runAction(v, makeSuperAdmin, 'role_assigned', { role: 'super_admin' })}>
                                Make super admin
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
