import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchAnnouncements } from '../lib/api';

export function AnnouncementsPage() {
  const { markAnnouncementsRead } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnnouncements().then(setAnnouncements).finally(() => setLoading(false));
    markAnnouncementsRead(); // ANN-04: visiting the page clears the indicator.
  }, []);

  if (loading) return <div className="page-loading">Loading announcements…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Announcements</h1>
          <p>Updates from Ekal admins.</p>
        </div>
      </div>

      {announcements.length === 0 ? (
        <p className="empty-state">No announcements yet.</p>
      ) : (
        announcements.map((a) => (
          <div key={a.id} className="announcement-card card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <strong>{a.title}</strong>
              {a.is_pinned && <span className="badge badge-approved">Pinned</span>}
            </div>
            <p style={{ marginTop: 6 }}>{a.body}</p>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              {a.profiles?.name || 'Admin'} · {new Date(a.created_at).toLocaleDateString()}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
