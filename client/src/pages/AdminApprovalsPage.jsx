import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchAllHourLogs, reviewHourLog } from '../lib/api';

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

export function AdminApprovalsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('pending');
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  async function load(status) {
    setLoading(true);
    try {
      setLogs(await fetchAllHourLogs(status));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(tab); }, [tab]);

  async function handleReview(id, decision) {
    setBusyId(id);
    setError('');
    try {
      await reviewHourLog(id, decision, user.id);
      await load(tab);
    } catch (err) {
      setError(err.message || 'Could not update this submission');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Hour Approvals</h1>
          <p>Review volunteer submissions and issue certificates.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <div className="card">
        {loading ? (
          <p className="empty-state">Loading…</p>
        ) : logs.length === 0 ? (
          <p className="empty-state">Nothing here yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Volunteer</th><th>Activity</th><th>Event</th><th>Date</th><th>Hours</th><th>Status</th>
                  {tab === 'pending' && <th></th>}
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td>{l.profiles?.name}<div style={{ fontSize: 12, color: 'var(--muted)' }}>{l.profiles?.email}</div></td>
                    <td>{l.activity}{l.notes && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{l.notes}</div>}</td>
                    <td>{l.events?.title || '—'}</td>
                    <td>{l.log_date}</td>
                    <td>{l.hours}</td>
                    <td><span className={`badge badge-${l.status}`}>{l.status}</span></td>
                    {tab === 'pending' && (
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-success btn-sm" disabled={busyId === l.id} onClick={() => handleReview(l.id, 'approved')}>Approve</button>
                        <button className="btn btn-danger btn-sm" disabled={busyId === l.id} onClick={() => handleReview(l.id, 'rejected')}>Reject</button>
                      </td>
                    )}
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
