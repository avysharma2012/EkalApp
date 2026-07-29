import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchAnnouncements, createAnnouncement, deleteAnnouncement } from '../lib/api';

export function AdminAnnouncementsPage() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: '', body: '' });

  async function load() {
    setAnnouncements(await fetchAnnouncements());
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await createAnnouncement({ ...form, created_by: user.id });
      setForm({ title: '', body: '' });
      await load();
    } catch (err) {
      setError(err.message || 'Could not post announcement');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id) {
    await deleteAnnouncement(id);
    await load();
  }

  if (loading) return <div className="page-loading">Loading announcements…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Announcements</h1>
          <p>Share updates with all volunteers.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>New announcement</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label>Title</label>
            <input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="form-field">
            <label>Message</label>
            <textarea rows={3} required value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Posting…' : 'Post announcement'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>All announcements</h2>
        {announcements.length === 0 && <p className="empty-state">No announcements yet.</p>}
        {announcements.map((a) => (
          <div key={a.id} className="announcement-card card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{a.title}</strong>
              <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(a.id)}>Delete</button>
            </div>
            <p style={{ marginTop: 6 }}>{a.body}</p>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>
              {a.profiles?.name || 'Admin'} · {new Date(a.created_at).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
