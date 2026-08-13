import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchVolunteers, fetchChapters, grantChapterAdmin, grantSuperAdmin, revokeAdminRole,
  createUser, deleteUser, writeAuditLog,
} from '../lib/api';
import { exportEntityToCsv } from '../lib/csv';
import { checkPasswordPolicy } from '../lib/passwordPolicy';

const ROLE_LABEL = { volunteer: 'Volunteer', chapter_admin: 'Chapter Admin', super_admin: 'Super Admin' };
const EMPTY_ADD_FORM = { name: '', email: '', password: '', chapter_id: '' };

export function AdminVolunteersPage() {
  const { user, isSuperAdmin, adminChapterId } = useAuth();
  const [volunteers, setVolunteers] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [chapterFilter, setChapterFilter] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);
  const [addSubmitting, setAddSubmitting] = useState(false);

  async function load() {
    const [vols, chaps] = await Promise.all([fetchVolunteers(), fetchChapters()]);
    setVolunteers(vols);
    setChapters(chaps);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const filtered = volunteers.filter((v) => {
    const matchesQuery = v.name.toLowerCase().includes(query.toLowerCase()) || v.email.toLowerCase().includes(query.toLowerCase());
    const matchesChapter = !chapterFilter || v.chapter_id === chapterFilter;
    return matchesQuery && matchesChapter;
  });

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

  async function handleDelete(v) {
    if (!window.confirm(`Delete ${v.name}'s account? This permanently removes their profile, hour logs, event signups, and certificate requests. This cannot be undone.`)) return;
    setBusyId(v.id);
    setError('');
    try {
      await deleteUser(v.id);
      await load();
    } catch (err) {
      setError(err.message || 'Could not delete this user');
    } finally {
      setBusyId(null);
    }
  }

  function updateAddForm(field, value) {
    setAddForm((f) => ({ ...f, [field]: value }));
  }

  const addPasswordPolicy = checkPasswordPolicy(addForm.password);

  async function handleAddUser(e) {
    e.preventDefault();
    setError('');
    if (!addPasswordPolicy.valid) {
      setError('Please choose a password that meets all the requirements shown below.');
      return;
    }
    setAddSubmitting(true);
    try {
      await createUser({
        name: addForm.name,
        email: addForm.email,
        password: addForm.password,
        chapterId: isSuperAdmin ? addForm.chapter_id || null : adminChapterId,
      });
      setAddForm(EMPTY_ADD_FORM);
      setShowAddForm(false);
      await load();
    } catch (err) {
      setError(err.message || 'Could not create this user');
    } finally {
      setAddSubmitting(false);
    }
  }

  function handleExport() {
    exportEntityToCsv('volunteers', filtered, [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'chapter_name', label: 'Chapter' },
      { key: 'role', label: 'Role' },
      { key: 'approved_hours', label: 'Approved Hours' },
      { key: 'pending_count', label: 'Pending Submissions' },
    ]);
  }

  if (loading) return <div className="page-loading">Loading volunteers…</div>;

  const rootChapters = chapters.filter((c) => !c.parent_id && !c.is_unassigned);
  const subChaptersByParent = {};
  chapters.filter((c) => c.parent_id).forEach((c) => {
    subChaptersByParent[c.parent_id] = subChaptersByParent[c.parent_id] || [];
    subChaptersByParent[c.parent_id].push(c);
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Volunteers</h1>
          <p>{volunteers.length} registered users.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/admin/bulk-import" className="btn btn-secondary">Bulk import</Link>
          <button className="btn btn-primary" onClick={() => setShowAddForm((v) => !v)}>
            {showAddForm ? 'Cancel' : 'Add user'}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showAddForm && (
        <div className="card">
          <h2>Add a user</h2>
          <form onSubmit={handleAddUser}>
            <div className="form-row">
              <div className="form-field">
                <label>Full name</label>
                <input required value={addForm.name} onChange={(e) => updateAddForm('name', e.target.value)} />
              </div>
              <div className="form-field">
                <label>Email</label>
                <input type="email" required value={addForm.email} onChange={(e) => updateAddForm('email', e.target.value)} />
              </div>
            </div>
            {isSuperAdmin ? (
              <div className="form-field">
                <label>Chapter</label>
                <select value={addForm.chapter_id} onChange={(e) => updateAddForm('chapter_id', e.target.value)}>
                  <option value="">— Unassigned —</option>
                  {rootChapters.map((r) => (
                    <optgroup key={r.id} label={r.name}>
                      <option value={r.id}>{r.name} (general)</option>
                      {(subChaptersByParent[r.id] || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
                This user will be added to your chapter.
              </p>
            )}
            <div className="form-field">
              <label>Temporary password</label>
              <input type="password" required value={addForm.password} onChange={(e) => updateAddForm('password', e.target.value)} />
            </div>
            {addForm.password && (
              <div style={{ marginBottom: 14, fontSize: 13 }}>
                <strong>Strength: {addPasswordPolicy.label}</strong>
                {addPasswordPolicy.feedback.length > 0 && (
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18, color: 'var(--muted)' }}>
                    {addPasswordPolicy.feedback.map((f) => <li key={f}>{f}</li>)}
                  </ul>
                )}
              </div>
            )}
            <button className="btn btn-primary" type="submit" disabled={addSubmitting}>
              {addSubmitting ? 'Creating…' : 'Create account'}
            </button>
          </form>
        </div>
      )}

      <div className="card">
        <div className="form-row" style={{ marginBottom: 16 }}>
          <input
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 2, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--ink)' }}
          />
          {isSuperAdmin && (
            <select value={chapterFilter} onChange={(e) => setChapterFilter(e.target.value)} style={{ flex: 1 }}>
              <option value="">All chapters</option>
              {chapters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button className="btn btn-secondary" onClick={handleExport} style={{ flex: '0 0 auto' }}>Export to CSV</button>
        </div>
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
                            <button className="btn btn-danger btn-sm" disabled={busyId === v.id} onClick={() => handleDelete(v)}>Delete</button>
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
