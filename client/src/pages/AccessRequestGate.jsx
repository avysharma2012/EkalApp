import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchChapters,
  submitAccessRequest,
  checkAccessRequestStatus,
  logVisitor,
  lookupIpGeolocation,
  lookupZip,
  reverseGeocode,
  getBrowserLocation,
  matchChapterToLocation,
} from '../lib/api';

const STORAGE_KEY = 'ekal_access_request_email';

export function AccessRequestGate() {
  const [chapters, setChapters] = useState([]);
  const [rememberedEmail, setRememberedEmail] = useState(() => localStorage.getItem(STORAGE_KEY) || '');
  const [status, setStatus] = useState(null); // null while checking, or 'pending'|'approved'|'rejected'|'none'
  const [checkingStatus, setCheckingStatus] = useState(false);

  const [form, setForm] = useState({ name: '', email: '', chapter_id: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [zipInput, setZipInput] = useState('');
  const [showZip, setShowZip] = useState(false);

  useEffect(() => {
    fetchChapters().then(setChapters).catch(() => setChapters([]));
    logVisitor('/request-access', null);
  }, []);

  const checkStatus = useCallback(async (email) => {
    setCheckingStatus(true);
    try {
      const s = await checkAccessRequestStatus(email);
      setStatus(s || 'none');
    } catch {
      setStatus('none');
    } finally {
      setCheckingStatus(false);
    }
  }, []);

  useEffect(() => {
    if (rememberedEmail) checkStatus(rememberedEmail);
  }, [rememberedEmail, checkStatus]);

  // GATE-03(a): silent IP-based geolocation on load — never blocks the form.
  useEffect(() => {
    if (rememberedEmail || chapters.length === 0) return;
    lookupIpGeolocation().then((geo) => {
      if (!geo) return;
      const matchId = matchChapterToLocation(chapters, { city: geo.city, state: geo.region_code || geo.region });
      if (matchId) setForm((f) => (f.chapter_id ? f : { ...f, chapter_id: matchId }));
    });
  }, [chapters, rememberedEmail]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleZipLookup() {
    if (!zipInput.trim()) return;
    setGeoBusy(true);
    try {
      const result = await lookupZip(zipInput.trim());
      const place = result?.places?.[0];
      if (place) {
        const matchId = matchChapterToLocation(chapters, { city: place['place name'], state: place['state abbreviation'] });
        if (matchId) update('chapter_id', matchId);
        else setError('No matching chapter found for that ZIP — please choose one manually.');
      } else {
        setError('Could not find that ZIP code.');
      }
    } finally {
      setGeoBusy(false);
    }
  }

  async function handleUseLocation() {
    setGeoBusy(true);
    setError('');
    try {
      const coords = await getBrowserLocation();
      if (!coords) {
        setError('Could not access your location — please choose your chapter manually.');
        return;
      }
      const result = await reverseGeocode(coords.lat, coords.lon);
      const address = result?.address;
      if (address) {
        const matchId = matchChapterToLocation(chapters, { city: address.city || address.town || address.village, state: address.state });
        if (matchId) update('chapter_id', matchId);
        else setError('No matching chapter found for your location — please choose one manually.');
      }
    } finally {
      setGeoBusy(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.chapter_id) {
      setError('Please select a chapter.');
      return;
    }
    setSubmitting(true);
    try {
      const geo = await lookupIpGeolocation().catch(() => null);
      await submitAccessRequest({ name: form.name, email: form.email, chapterId: form.chapter_id, geo });
      logVisitor('/request-access:submit', geo);
      localStorage.setItem(STORAGE_KEY, form.email.toLowerCase());
      setRememberedEmail(form.email.toLowerCase());
    } catch (err) {
      // GATE-04: never disclose which case occurred — show the same opaque confirmation regardless.
      localStorage.setItem(STORAGE_KEY, form.email.toLowerCase());
      setRememberedEmail(form.email.toLowerCase());
    } finally {
      setSubmitting(false);
    }
  }

  function tryDifferentEmail() {
    localStorage.removeItem(STORAGE_KEY);
    setRememberedEmail('');
    setStatus(null);
    setForm({ name: '', email: '', chapter_id: '' });
  }

  const roots = chapters.filter((c) => !c.parent_id && !c.is_unassigned).sort((a, b) => a.name.localeCompare(b.name));
  const subsByParent = {};
  chapters.filter((c) => c.parent_id).forEach((c) => {
    subsByParent[c.parent_id] = subsByParent[c.parent_id] || [];
    subsByParent[c.parent_id].push(c);
  });

  if (rememberedEmail) {
    return (
      <div className="auth-page">
        <div className="card">
          <h1>Ekal Volunteering</h1>
          {checkingStatus || status === null ? (
            <p className="subtitle">Checking your request status…</p>
          ) : status === 'approved' ? (
            <>
              <p className="subtitle">You're approved! You can now sign in.</p>
              <Link to="/login" className="btn btn-primary" style={{ width: '100%', display: 'block', textAlign: 'center' }}>Proceed to Sign In</Link>
            </>
          ) : status === 'rejected' ? (
            <>
              <div className="error-banner">Your access request was not approved. Please contact an Ekal administrator.</div>
              <button className="btn btn-secondary" style={{ width: '100%' }} onClick={tryDifferentEmail}>Try a different email</button>
            </>
          ) : status === 'pending' ? (
            <>
              <p className="subtitle">Your request is pending review. We'll be in touch once it's approved.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => checkStatus(rememberedEmail)}>Check Status</button>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={tryDifferentEmail}>Try a different email</button>
              </div>
            </>
          ) : (
            <>
              <p className="subtitle">If your email has a pending request, you'll see its status here.</p>
              <button className="btn btn-secondary" style={{ width: '100%' }} onClick={tryDifferentEmail}>Try a different email</button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="card">
        <h1>Ekal Volunteering</h1>
        <p className="subtitle">Ekal is invite-only. Request access below and an administrator will review it.</p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label htmlFor="name">Full name</label>
            <input id="name" required value={form.name} onChange={(e) => update('name', e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" required value={form.email} onChange={(e) => update('email', e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="chapter">Chapter</label>
            <select id="chapter" required value={form.chapter_id} onChange={(e) => update('chapter_id', e.target.value)}>
              <option value="">— Select your chapter —</option>
              {roots.map((r) => (
                <optgroup key={r.id} label={r.name}>
                  <option value={r.id}>{r.name} (general)</option>
                  {(subsByParent[r.id] || []).sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button type="button" className="btn btn-ghost btn-sm" disabled={geoBusy} onClick={() => setShowZip((v) => !v)}>Look up by ZIP</button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={geoBusy} onClick={handleUseLocation}>Use my current location</button>
            </div>
            {showZip && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <input placeholder="ZIP code" value={zipInput} onChange={(e) => setZipInput(e.target.value)} style={{ flex: 1 }} />
                <button type="button" className="btn btn-secondary btn-sm" disabled={geoBusy} onClick={handleZipLookup}>Find chapter</button>
              </div>
            )}
          </div>
          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%' }}>
            {submitting ? 'Submitting…' : 'Request Access'}
          </button>
        </form>
        <div className="auth-switch">
          Already approved? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
