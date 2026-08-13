import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchCertificateRequestDetail } from '../lib/api';

export function CertificateViewPage() {
  const { id } = useParams();
  const [cert, setCert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCertificateRequestDetail(id)
      .then(setCert)
      .catch((err) => setError(err.message || 'Could not load this certificate'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="page-loading">Loading…</div>;
  if (error) return <div className="error-banner">{error}</div>;
  if (!cert || cert.status !== 'approved') return <div className="error-banner">This certificate isn't available.</div>;

  const totalHours = cert.activities.reduce((sum, a) => sum + Number(a.hours), 0);

  return (
    <div>
      <div className="page-header no-print">
        <div>
          <h1>Certificate</h1>
          <p>Issued {cert.date_issued}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/certificates" className="btn btn-ghost">Back</Link>
          <button className="btn btn-primary" onClick={() => window.print()}>Print / Save as PDF</button>
        </div>
      </div>

      <div className="print-doc certificate-doc">
        <div className="cert-org">EKAL VOLUNTEERING APP</div>
        <div className="cert-title">Certificate of Volunteer Service</div>
        <p style={{ color: 'var(--muted)' }}>This certificate is proudly presented to</p>
        <div className="cert-name">{cert.profiles?.name}</div>
        <p style={{ marginBottom: 20 }}>for completing <strong>{totalHours} volunteer hours</strong> across {cert.activities.length} activities</p>

        <table>
          <thead><tr><th>Activity</th><th>Date</th><th>Hours</th></tr></thead>
          <tbody>
            {cert.activities.map((a) => (
              <tr key={a.id}><td>{a.activity}</td><td>{a.log_date}</td><td>{a.hours}</td></tr>
            ))}
          </tbody>
        </table>

        {cert.note && <p style={{ fontStyle: 'italic', color: 'var(--muted)' }}>{cert.note}</p>}

        <div className="signature-block">
          <div>
            <div className="signature-preview">{cert.signature}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{cert.signer?.name}, Ekal Administrator</div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Issued {cert.date_issued}</div>
        </div>
      </div>
    </div>
  );
}
