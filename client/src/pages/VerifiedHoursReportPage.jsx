import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchApprovedHoursInRange } from '../lib/api';

export function VerifiedHoursReportPage() {
  const { user, profile } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  async function load(range) {
    setLoading(true);
    setLogs(await fetchApprovedHoursInRange(user.id, range));
    setLoading(false);
  }

  useEffect(() => {
    if (user) load({});
  }, [user]);

  function handleFilter(e) {
    e.preventDefault();
    load({ from: from || undefined, to: to || undefined });
  }

  const total = logs.reduce((sum, l) => sum + Number(l.hours), 0);

  return (
    <div>
      <div className="page-header no-print">
        <div>
          <h1>Verified Hours Report</h1>
          <p>Your approved hours, with the reviewing admin's signature.</p>
        </div>
        <button className="btn btn-secondary" onClick={() => window.print()}>Print / Save as PDF</button>
      </div>

      <div className="card no-print">
        <form onSubmit={handleFilter} className="form-row" style={{ alignItems: 'flex-end' }}>
          <div className="form-field">
            <label>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="form-field">
            <label>To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button className="btn btn-secondary" type="submit">Apply</button>
        </form>
      </div>

      <div className="card print-doc">
        {loading ? (
          <p className="page-loading">Loading…</p>
        ) : (
          <>
            <div className="print-doc-header">
              <div>
                <h2 style={{ margin: 0 }}>Verified Volunteer Hours</h2>
                <p style={{ color: 'var(--muted)', margin: '4px 0 0' }}>{profile?.name}{from || to ? ` · ${from || '…'} to ${to || '…'}` : ''}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--rust)' }}>{total}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>total hours</div>
              </div>
            </div>
            {logs.length === 0 ? (
              <p className="empty-state">No approved hours in this range.</p>
            ) : (
              <table>
                <thead>
                  <tr><th>Date</th><th>Activity</th><th>Hours</th><th>Approved by</th></tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td>{l.log_date}</td>
                      <td>{l.activity}</td>
                      <td>{l.hours}</td>
                      <td>
                        {l.profiles?.name || '—'}
                        {l.signature && <div className="signature-preview" style={{ fontSize: 16 }}>{l.signature}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
