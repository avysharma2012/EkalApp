import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchAllHourLogs, approveHourLog, rejectHourLog, resetHourLogToPending, writeAuditLog } from '../lib/api';
import { SignatureModal } from '../components/SignatureModal';

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: null, label: 'All submissions' },
];

export function AdminApprovalsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('pending');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyIds, setBusyIds] = useState(new Set());
  const [selected, setSelected] = useState(new Set());
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState(null); // { mode: 'approve'|'reject', ids: [] }

  async function load(status) {
    setLoading(true);
    try {
      setLogs(await fetchAllHourLogs(status));
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(tab); }, [tab]);

  function toggle(id) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll(ids) {
    setSelected(new Set(ids));
  }

  async function runApprove(ids, signature) {
    setBusyIds(new Set(ids));
    setError('');
    try {
      for (const id of ids) {
        const log = logs.find((l) => l.id === id);
        await approveHourLog(id, signature, user.id);
        writeAuditLog('hours_approved', { targetUserId: log?.user_id, targetId: id, details: { activity: log?.activity, hours: log?.hours } });
      }
      await load(tab);
    } catch (err) {
      setError(err.message || 'Could not approve these submissions');
    } finally {
      setBusyIds(new Set());
      setModal(null);
    }
  }

  async function runReject(ids, reason) {
    setBusyIds(new Set(ids));
    setError('');
    try {
      for (const id of ids) {
        const log = logs.find((l) => l.id === id);
        await rejectHourLog(id, reason, user.id);
        writeAuditLog('hours_rejected', { targetUserId: log?.user_id, targetId: id, details: { activity: log?.activity, hours: log?.hours, reason } });
      }
      await load(tab);
    } catch (err) {
      setError(err.message || 'Could not reject these submissions');
    } finally {
      setBusyIds(new Set());
      setModal(null);
    }
  }

  async function handleReset(id) {
    if (!window.confirm('Reset this submission back to Pending? This clears the reviewer, signature, and rejection reason.')) return;
    setBusyIds(new Set([id]));
    setError('');
    try {
      const log = logs.find((l) => l.id === id);
      await resetHourLogToPending(id);
      writeAuditLog('hours_reset', { targetUserId: log?.user_id, targetId: id, details: { activity: log?.activity } });
      await load(tab);
    } catch (err) {
      setError(err.message || 'Could not reset this submission');
    } finally {
      setBusyIds(new Set());
    }
  }

  const q = query.trim().toLowerCase();
  const filtered = logs.filter((l) => !q || [l.profiles?.name, l.profiles?.email, l.activity].filter(Boolean).some((v) => v.toLowerCase().includes(q)));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Hour Approvals</h1>
          <p>Review volunteer submissions.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.label} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === 'pending' && selected.size > 0 && (
        <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13 }}>{selected.size} selected</span>
          <button className="btn btn-success btn-sm" onClick={() => setModal({ mode: 'approve', ids: [...selected] })}>Approve selected</button>
          <button className="btn btn-danger btn-sm" onClick={() => setModal({ mode: 'reject', ids: [...selected] })}>Reject selected</button>
        </div>
      )}

      <div className="card">
        <input
          placeholder="Search by volunteer or activity…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 16, width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--ink)' }}
        />
        {loading ? (
          <p className="empty-state">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="empty-state">Nothing here yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {tab === 'pending' && <th><input type="checkbox" checked={selected.size === filtered.length} onChange={() => selectAll(selected.size === filtered.length ? [] : filtered.map((l) => l.id))} /></th>}
                  <th>Volunteer</th><th>Activity</th><th>Chapter</th><th>Date</th><th>Hours</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => (
                  <tr key={l.id}>
                    {tab === 'pending' && <td><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} /></td>}
                    <td>{l.profiles?.name}<div style={{ fontSize: 12, color: 'var(--muted)' }}>{l.profiles?.email}</div></td>
                    <td>{l.activity}<div style={{ fontSize: 12, color: 'var(--muted)' }}>{l.description}</div></td>
                    <td>{l.chapters?.name || '—'}</td>
                    <td>{l.log_date}</td>
                    <td>{l.hours}</td>
                    <td>
                      <span className={`badge badge-${l.status}`}>{l.status}</span>
                      {l.status === 'rejected' && l.rejection_reason && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{l.rejection_reason}</div>}
                    </td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      {l.status === 'pending' ? (
                        <>
                          <button className="btn btn-success btn-sm" disabled={busyIds.has(l.id)} onClick={() => setModal({ mode: 'approve', ids: [l.id] })}>Approve</button>
                          <button className="btn btn-danger btn-sm" disabled={busyIds.has(l.id)} onClick={() => setModal({ mode: 'reject', ids: [l.id] })}>Reject</button>
                        </>
                      ) : (
                        <>
                          <button className="btn btn-secondary btn-sm" disabled={busyIds.has(l.id)} onClick={() => setModal({ mode: l.status === 'approved' ? 'reject' : 'approve', ids: [l.id] })}>
                            {l.status === 'approved' ? 'Re-reject' : 'Re-approve'}
                          </button>
                          <button className="btn btn-ghost btn-sm" disabled={busyIds.has(l.id)} onClick={() => handleReset(l.id)}>Reset to pending</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal?.mode === 'approve' && (
        <SignatureModal
          title={`Approve ${modal.ids.length} submission${modal.ids.length === 1 ? '' : 's'}`}
          onConfirm={(signature) => runApprove(modal.ids, signature)}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.mode === 'reject' && (
        <RejectModal
          count={modal.ids.length}
          onConfirm={(reason) => runReject(modal.ids, reason)}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
}

function RejectModal({ count, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: 420, maxWidth: '90vw' }}>
        <h2>Reject {count} submission{count === 1 ? '' : 's'}</h2>
        <div className="form-field">
          <label>Reason</label>
          <textarea rows={3} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Shown to the volunteer" />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-danger" disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>Confirm rejection</button>
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
