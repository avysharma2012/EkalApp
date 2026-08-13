import { useEffect, useState } from 'react';
import { fetchChapters, createChapter, updateChapter, deleteChapter, writeAuditLog } from '../lib/api';

const EMPTY_FORM = { id: null, name: '', city: '', state: '', parent_id: '' };

export function AdminChaptersPage() {
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [expanded, setExpanded] = useState({});
  const [query, setQuery] = useState('');

  async function load() {
    setChapters(await fetchChapters());
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const roots = chapters.filter((c) => !c.parent_id && !c.is_unassigned);
  const subsByParent = {};
  chapters.filter((c) => c.parent_id).forEach((c) => {
    subsByParent[c.parent_id] = subsByParent[c.parent_id] || [];
    subsByParent[c.parent_id].push(c);
  });

  const q = query.trim().toLowerCase();
  const matches = (c) => !q || [c.name, c.city, c.state].filter(Boolean).some((v) => v.toLowerCase().includes(q));
  const visibleRoots = roots.filter((r) => matches(r) || (subsByParent[r.id] || []).some(matches));

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function startEdit(chapter) {
    setForm({ id: chapter.id, name: chapter.name, city: chapter.city || '', state: chapter.state || '', parent_id: chapter.parent_id || '' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        name: form.name,
        city: form.city || null,
        state: form.parent_id ? (chapters.find((c) => c.id === form.parent_id)?.state ?? null) : (form.state || null),
        parent_id: form.parent_id || null,
      };
      if (form.id) {
        await updateChapter(form.id, payload);
        writeAuditLog('chapter_updated', { targetId: form.id, details: payload });
      } else {
        const created = await createChapter(payload);
        writeAuditLog('chapter_created', { targetId: created.id, details: payload });
      }
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err.message || 'Could not save chapter');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(chapter) {
    const warning = chapter.parent_id
      ? `Delete sub-chapter "${chapter.name}"? Member accounts keep their profiles but lose this chapter association.`
      : `Delete "${chapter.name}"? Its sub-chapters will become unassigned rather than deleted, and member accounts keep their profiles but lose this chapter association.`;
    if (!window.confirm(warning)) return;
    setError('');
    try {
      await deleteChapter(chapter.id);
      writeAuditLog('chapter_deleted', { targetId: chapter.id, details: { name: chapter.name } });
      await load();
    } catch (err) {
      setError(err.message || 'Could not delete chapter');
    }
  }

  if (loading) return <div className="page-loading">Loading chapters…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Chapters</h1>
          <p>Manage the state-level chapters and their city sub-chapters.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>{form.id ? 'Edit chapter' : 'New chapter'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-field">
              <label>Name</label>
              <input required value={form.name} onChange={(e) => update('name', e.target.value)} />
            </div>
            <div className="form-field">
              <label>Parent chapter (leave blank for a root/state chapter)</label>
              <select value={form.parent_id} onChange={(e) => update('parent_id', e.target.value)}>
                <option value="">— None (root chapter) —</option>
                {roots.filter((r) => r.id !== form.id).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="form-field">
              <label>City</label>
              <input value={form.city} onChange={(e) => update('city', e.target.value)} />
            </div>
            <div className="form-field">
              <label>State {form.parent_id && '(inherited from parent)'}</label>
              <input
                value={form.parent_id ? (chapters.find((c) => c.id === form.parent_id)?.state || '') : form.state}
                onChange={(e) => update('state', e.target.value)}
                disabled={!!form.parent_id}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Saving…' : form.id ? 'Save changes' : 'Create chapter'}
            </button>
            {form.id && <button type="button" className="btn btn-ghost" onClick={() => setForm(EMPTY_FORM)}>Cancel</button>}
          </div>
        </form>
      </div>

      <div className="card">
        <input
          placeholder="Search by name, city, or state…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 16, width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--ink)' }}
        />
        {visibleRoots.length === 0 ? (
          <p className="empty-state">No chapters match your search.</p>
        ) : (
          visibleRoots.map((root) => (
            <div key={root.id} style={{ borderBottom: '1px solid var(--border)', padding: '10px 0' }}>
              <div className="event-card">
                <div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setExpanded((e) => ({ ...e, [root.id]: !e[root.id] }))}>
                    {expanded[root.id] ? '▾' : '▸'} {root.name}
                  </button>
                  <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--muted)' }}>
                    {root.city ? `${root.city}, ` : ''}{root.state || ''} · {(subsByParent[root.id] || []).length} sub-chapters
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => startEdit(root)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(root)}>Delete</button>
                </div>
              </div>
              {expanded[root.id] && (subsByParent[root.id] || []).length > 0 && (
                <div style={{ marginLeft: 24, marginTop: 8 }}>
                  {(subsByParent[root.id] || []).map((sub) => (
                    <div key={sub.id} className="event-card" style={{ padding: '6px 0' }}>
                      <span>{sub.name}{sub.city ? ` · ${sub.city}` : ''}</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => startEdit(sub)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(sub)}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
