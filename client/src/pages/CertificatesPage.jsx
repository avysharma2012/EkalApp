import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { fetchApprovedHoursInRange, createCertificateRequest, fetchMyCertificateRequests } from '../lib/api';

export function CertificatesPage() {
  const { user } = useAuth();
  const [approvedHours, setApprovedHours] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    const [hours, reqs] = await Promise.all([fetchApprovedHoursInRange(user.id), fetchMyCertificateRequests(user.id)]);
    setApprovedHours(hours);
    setRequests(reqs);
  }

  useEffect(() => {
    if (user) load().finally(() => setLoading(false));
  }, [user]);

  function toggle(id) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(approvedHours.map((h) => h.id)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  const selectedTotal = approvedHours.filter((h) => selected.has(h.id)).reduce((sum, h) => sum + Number(h.hours), 0);

  async function handleSubmit(e) {
    e.preventDefault();
    if (selected.size === 0) {
      setError('Select at least one approved hour entry.');
      return;
    }
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      await createCertificateRequest(user.id, [...selected], note);
      setSuccess('Certificate request submitted — an admin will review it.');
      setSelected(new Set());
      setNote('');
      await load();
    } catch (err) {
      setError(err.message || 'Could not submit certificate request');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="page-loading">Loading…</div>;

  const approved = requests.filter((r) => r.status === 'approved');
  const pending = requests.filter((r) => r.status === 'pending');
  const rejected = requests.filter((r) => r.status === 'rejected');

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Certificates</h1>
          <p>Request a signed certificate for a set of your approved hours.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {success && <div className="success-banner">{success}</div>}

      <div className="card">
        <h2>Request a certificate</h2>
        {approvedHours.length === 0 ? (
          <p className="empty-state">You don't have any approved hours yet.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={selectAll}>Select all</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={deselectAll}>Deselect all</button>
              <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--muted)', alignSelf: 'center' }}>
                {selected.size} selected · {selectedTotal} hours
              </span>
            </div>
            <div className="table-wrap" style={{ marginBottom: 14 }}>
              <table className="table">
                <thead><tr><th></th><th>Date</th><th>Activity</th><th>Hours</th></tr></thead>
                <tbody>
                  {approvedHours.map((h) => (
                    <tr key={h.id}>
                      <td><input type="checkbox" checked={selected.has(h.id)} onChange={() => toggle(h.id)} /></td>
                      <td>{h.log_date}</td>
                      <td>{h.activity}</td>
                      <td>{h.hours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-field">
              <label>Note (optional)</label>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the reviewer should know" />
            </div>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Request certificate'}
            </button>
          </form>
        )}
      </div>

      <div className="card">
        <h2>Signed ({approved.length})</h2>
        {approved.length === 0 ? <p className="empty-state">No signed certificates yet.</p> : (
          approved.map((r) => (
            <div key={r.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{r.total_hours} hours</strong> across {r.activity_count} activities
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>Signed by {r.signer?.name} on {r.date_issued}</div>
              </div>
              <Link to={`/certificates/${r.id}`} className="btn btn-secondary btn-sm">View certificate</Link>
            </div>
          ))
        )}
      </div>

      {pending.length > 0 && (
        <div className="card">
          <h2>Pending ({pending.length})</h2>
          {pending.map((r) => (
            <div key={r.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              {r.total_hours} hours across {r.activity_count} activities <span className="badge badge-pending">Pending</span>
            </div>
          ))}
        </div>
      )}

      {rejected.length > 0 && (
        <div className="card">
          <h2>Rejected ({rejected.length})</h2>
          {rejected.map((r) => (
            <div key={r.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              {r.total_hours} hours across {r.activity_count} activities <span className="badge badge-rejected">Rejected</span>
              {r.rejection_reason && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.rejection_reason}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
