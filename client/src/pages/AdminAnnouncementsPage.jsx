import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchAnnouncements, createAnnouncement, updateAnnouncement, togglePinAnnouncement, deleteAnnouncement, writeAuditLog } from '../lib/api';

const EMPTY_FORM = { id: null, title: '', body: '' };

export function AdminAnnouncementsPage() {
  const { user, markAnnouncementsRead } = useAuth();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  async function load() {
    setAnnouncements(await fetchAnnouncements());
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
    markAnnouncementsRead();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (form.id) {
        await updateAnnouncement(form.id, { title: form.title, body: form.body });
        writeAuditLog('announcement_updated', { targetId: form.id, details: { title: form.title } });
      } else {
        const created = await createAnnouncement({ title: form.title, body: form.body, created_by: user.id });
        writeAuditLog('announcement_created', { targetId: created.id, details: { title: created.title } });
      }
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err.message || 'Could not save announcement');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id) {
    const title = announcements.find((a) => a.id === id)?.title;
    if (!window.confirm(`Delete announcement "${title}"? This cannot be undone.`)) return;
    await deleteAnnouncement(id);
    writeAuditLog('announcement_deleted', { targetId: id, details: { title } });
    if (form.id === id) setForm(EMPTY_FORM);
    await load();
  }

  async function handleTogglePin(a) {
    // ANN-03: pin/unpin is deliberately exempt from audit logging.
    await togglePinAnnouncement(a.id, !a.is_pinned);
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
        <h2>{form.id ? 'Edit announcement' : 'New announcement'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label>Title</label>
            <input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="form-field">
            <label>Message</label>
            <textarea rows={3} required value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : form.id ? 'Save changes' : 'Post announcement'}
            </button>
            {form.id && <button type="button" className="btn btn-ghost" onClick={() => setForm(EMPTY_FORM)}>Cancel</button>}
          </div>
        </form>
      </div>

      <div className="card">
        <h2>All announcements</h2>
        {announcements.length === 0 && <p className="empty-state">No announcements yet.</p>}
        {announcements.map((a) => (
          <div key={a.id} className="announcement-card card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <strong>{a.title}</strong>
                {a.is_pinned && <span className="badge badge-approved" style={{ marginLeft: 8 }}>Pinned</span>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => handleTogglePin(a)}>{a.is_pinned ? 'Unpin' : 'Pin'}</button>
                <button className="btn btn-secondary btn-sm" onClick={() => setForm({ id: a.id, title: a.title, body: a.body })}>Edit</button>
                <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(a.id)}>Delete</button>
              </div>
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
