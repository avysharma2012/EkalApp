import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchAccessRequests, approveAccessRequest, rejectAccessRequest, fetchChapters, writeAuditLog } from '../lib/api';

export function AdminAccessRequestsPage() {
  const { isSuperAdmin } = useAuth();
  const [requests, setRequests] = useState([]);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [chapterOverride, setChapterOverride] = useState({});

  async function load() {
    const [reqs, chaps] = await Promise.all([fetchAccessRequests(), fetchChapters()]);
    setRequests(reqs);
    setChapters(chaps);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const counts = {
    pending: requests.filter((r) => r.status === 'pending').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
  };

  async function handleApprove(r) {
    if (!window.confirm(`Approve ${r.name} (${r.email})? This creates their account and emails them sign-in instructions.`)) return;
    setBusyId(r.id);
    setError('');
    try {
      const chapterId = isSuperAdmin ? (chapterOverride[r.id] || r.chapter_id) : undefined;
      await approveAccessRequest(r.id, chapterId);
      await load();
    } catch (err) {
      setError(err.message || 'Could not approve this request');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(r) {
    const reason = window.prompt(`Reason for rejecting ${r.name}'s request (optional):`);
    if (reason === null) return; // cancelled
    setBusyId(r.id);
    setError('');
    try {
      await rejectAccessRequest(r.id, reason);
      writeAuditLog('access_rejected', { targetId: r.id, details: { email: r.email, reason } });
      await load();
    } catch (err) {
      setError(err.message || 'Could not reject this request');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <div className="page-loading">Loading access requests…</div>;

  const pending = requests.filter((r) => r.status === 'pending');
  const decided = requests.filter((r) => r.status !== 'pending');

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Access Requests</h1>
          <p>Review and approve new volunteers.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <div className="stat-card"><div className="stat-value">{counts.pending}</div><div className="stat-label">Pending</div></div>
        <div className="stat-card"><div className="stat-value">{counts.approved}</div><div className="stat-label">Approved</div></div>
        <div className="stat-card"><div className="stat-value">{counts.rejected}</div><div className="stat-label">Rejected</div></div>
        <div className="stat-card"><div className="stat-value">{requests.length}</div><div className="stat-label">Total</div></div>
      </div>

      <div className="card">
        <h2>Pending</h2>
        {pending.length === 0 ? (
          <p className="empty-state">No pending requests.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Submitted</th><th>Name</th><th>Email</th><th>Chapter</th><th>Location</th><th></th></tr>
              </thead>
              <tbody>
                {pending.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.created_at).toLocaleString()}</td>
                    <td>{r.name}</td>
                    <td>{r.email}</td>
                    <td>
                      {r.chapters?.name || <span className="badge badge-pending">none selected</span>}
                      {isSuperAdmin && (
                        <select
                          value={chapterOverride[r.id] || r.chapter_id || ''}
                          onChange={(e) => setChapterOverride((o) => ({ ...o, [r.id]: e.target.value }))}
                          style={{ display: 'block', marginTop: 4, fontSize: 12 }}
                        >
                          <option value="">— choose —</option>
                          {chapters.filter((c) => !c.is_unassigned).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{[r.city, r.region, r.country].filter(Boolean).join(', ') || '—'}</td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-success btn-sm" disabled={busyId === r.id} onClick={() => handleApprove(r)}>Approve</button>
                      <button className="btn btn-danger btn-sm" disabled={busyId === r.id} onClick={() => handleReject(r)}>Reject</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {decided.length > 0 && (
        <div className="card">
          <h2>Reviewed</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Name</th><th>Email</th><th>Status</th><th>Reviewed</th></tr>
              </thead>
              <tbody>
                {decided.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.email}</td>
                    <td><span className={`badge badge-${r.status}`}>{r.status}</span>{r.rejection_reason && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.rejection_reason}</div>}</td>
                    <td>{r.reviewed_at ? new Date(r.reviewed_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
