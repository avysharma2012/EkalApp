import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchPendingCertificateRequests, fetchCertificateRequestDetail, approveCertificateRequest, rejectCertificateRequest, writeAuditLog } from '../lib/api';
import { SignatureModal } from '../components/SignatureModal';

export function AdminCertificatesPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [modal, setModal] = useState(null); // { mode, request }

  async function load() {
    setRequests(await fetchPendingCertificateRequests());
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function toggleExpand(r) {
    if (expandedId === r.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(r.id);
    setDetail(await fetchCertificateRequestDetail(r.id));
  }

  async function handleApprove(request, signature, dateIssued) {
    setError('');
    try {
      await approveCertificateRequest(request.id, signature, dateIssued || new Date().toISOString().slice(0, 10), user.id);
      writeAuditLog('certificate_approved', {
        targetUserId: request.user_id,
        targetId: request.id,
        details: { total_hours: request.total_hours, activity_count: request.activity_count },
      });
      setModal(null);
      setExpandedId(null);
      await load();
    } catch (err) {
      setError(err.message || 'Could not approve this certificate');
    }
  }

  async function handleReject(request, reason) {
    setError('');
    try {
      await rejectCertificateRequest(request.id, reason, user.id);
      writeAuditLog('certificate_rejected', { targetUserId: request.user_id, targetId: request.id, details: { reason } });
      setModal(null);
      setExpandedId(null);
      await load();
    } catch (err) {
      setError(err.message || 'Could not reject this certificate');
    }
  }

  if (loading) return <div className="page-loading">Loading certificate requests…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Certificate Requests</h1>
          <p>Review and sign certificates for volunteers' approved hours.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        {requests.length === 0 ? (
          <p className="empty-state">No pending certificate requests.</p>
        ) : (
          requests.map((r) => (
            <div key={r.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
              <div className="event-card">
                <div>
                  <strong>{r.profiles?.name}</strong>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>{r.total_hours} hours across {r.activity_count} activities · requested {new Date(r.created_at).toLocaleDateString()}</div>
                  {r.note && <div style={{ fontSize: 13, marginTop: 4 }}>"{r.note}"</div>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => toggleExpand(r)}>{expandedId === r.id ? 'Hide' : 'View activities'}</button>
                  <button className="btn btn-success btn-sm" onClick={() => setModal({ mode: 'approve', request: r })}>Approve</button>
                  <button className="btn btn-danger btn-sm" onClick={() => setModal({ mode: 'reject', request: r })}>Reject</button>
                </div>
              </div>
              {expandedId === r.id && detail && (
                <div style={{ marginTop: 10, paddingLeft: 8 }}>
                  <table className="table">
                    <thead><tr><th>Activity</th><th>Date</th><th>Hours</th></tr></thead>
                    <tbody>
                      {detail.activities.map((a) => (
                        <tr key={a.id}><td>{a.activity}</td><td>{a.log_date}</td><td>{a.hours}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {modal?.mode === 'approve' && (
        <SignatureModal
          title={`Sign certificate for ${modal.request.profiles?.name}`}
          message={`${modal.request.total_hours} hours across ${modal.request.activity_count} activities.`}
          extraField={{ label: 'Date issued', type: 'date', defaultValue: new Date().toISOString().slice(0, 10) }}
          onConfirm={(signature, dateIssued) => handleApprove(modal.request, signature, dateIssued)}
          onCancel={() => setModal(null)}
        />
      )}
      {modal?.mode === 'reject' && (
        <RejectCertModal request={modal.request} onConfirm={(reason) => handleReject(modal.request, reason)} onCancel={() => setModal(null)} />
      )}
    </div>
  );
}

function RejectCertModal({ request, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card" style={{ width: 420, maxWidth: '90vw' }}>
        <h2>Reject certificate for {request.profiles?.name}</h2>
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
