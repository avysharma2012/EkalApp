import { supabase } from './supabase';

async function unwrap(queryPromise) {
  const { data, error } = await queryPromise;
  if (error) throw error;
  return data;
}

async function callEdgeFunction(name, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const responseBody = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(responseBody.error || `${name} failed`);
  return responseBody;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---- Events ----
export async function fetchEvents() {
  const { data: events, error } = await supabase.from('events').select('*, chapters(name)').order('event_date', { ascending: true });
  if (error) throw error;

  const { data: { user } } = await supabase.auth.getUser();
  const { data: mySignups } = await supabase.from('event_signups').select('event_id, notes').eq('user_id', user.id);
  const mySignupByEvent = Object.fromEntries((mySignups || []).map((s) => [s.event_id, s]));

  const counts = {};
  const { data: allSignups } = await supabase.from('event_signups').select('event_id');
  (allSignups || []).forEach((s) => { counts[s.event_id] = (counts[s.event_id] || 0) + 1; });

  return events.map((e) => ({
    ...e,
    signed_up: !!mySignupByEvent[e.id],
    my_notes: mySignupByEvent[e.id]?.notes || '',
    signup_count: counts[e.id] || 0,
  }));
}

export function createEvent(event) {
  return unwrap(supabase.from('events').insert(event).select().single());
}

export function updateEvent(id, patch) {
  return unwrap(supabase.from('events').update(patch).eq('id', id).select().single());
}

export function deleteEvent(id) {
  return unwrap(supabase.from('events').delete().eq('id', id));
}

export function signUpForEvent(eventId, userId, notes) {
  return unwrap(supabase.from('event_signups').insert({ event_id: eventId, user_id: userId, notes: notes || null }));
}

export function updateSignupNotes(eventId, userId, notes) {
  return unwrap(supabase.from('event_signups').update({ notes: notes || null }).eq('event_id', eventId).eq('user_id', userId));
}

export function cancelSignup(eventId, userId) {
  return unwrap(supabase.from('event_signups').delete().eq('event_id', eventId).eq('user_id', userId));
}

export function fetchEventSignups(eventId) {
  return unwrap(
    supabase
      .from('event_signups')
      .select('signed_up_at, notes, profiles(id, name, email)')
      .eq('event_id', eventId)
      .order('signed_up_at', { ascending: true })
  );
}

export function syncEkalEvents() {
  return callEdgeFunction('sync-ekal-events', {});
}

// ---- Hour logs ----
export async function fetchMyHours(userId) {
  return unwrap(
    supabase
      .from('hour_logs')
      .select('*, events(title)')
      .eq('user_id', userId)
      .order('log_date', { ascending: false })
  );
}

export function createHourLog(log) {
  // status/reviewed_by/reviewed_at/chapter_id are all forced server-side by
  // a trigger regardless of what's sent here (HRS-02/CHAP-08).
  return unwrap(supabase.from('hour_logs').insert(log).select().single());
}

export function fetchAllHourLogs(status) {
  let q = supabase
    .from('hour_logs')
    .select('*, profiles!hour_logs_user_id_fkey(name, email), events(title), chapters(name)')
    .order('created_at', { ascending: true });
  if (status) q = q.eq('status', status);
  return unwrap(q);
}

// HRS-06: approving requires a typed signature; each record (including each
// row of a bulk approval) is reviewed and audit-logged individually.
export function approveHourLog(id, signature, reviewerId) {
  return unwrap(
    supabase
      .from('hour_logs')
      .update({ status: 'approved', signature, reviewed_by: reviewerId, reviewed_at: new Date().toISOString(), rejection_reason: null })
      .eq('id', id)
      .select()
      .single()
  );
}

// HRS-07: rejecting requires a reason, shown back to the volunteer.
export function rejectHourLog(id, reason, reviewerId) {
  return unwrap(
    supabase
      .from('hour_logs')
      .update({ status: 'rejected', rejection_reason: reason, signature: null, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
  );
}

// HRS-08: clears reviewer/timestamp/signature/rejection reason, back to Pending.
export function resetHourLogToPending(id) {
  return unwrap(
    supabase
      .from('hour_logs')
      .update({ status: 'pending', signature: null, rejection_reason: null, reviewed_by: null, reviewed_at: null })
      .eq('id', id)
      .select()
      .single()
  );
}

// HRS-09: a volunteer's own approved hours within an optional date range.
export async function fetchApprovedHoursInRange(userId, { from, to } = {}) {
  let q = supabase
    .from('hour_logs')
    .select('*, profiles!hour_logs_reviewed_by_fkey(name)')
    .eq('user_id', userId)
    .eq('status', 'approved')
    .order('log_date', { ascending: false });
  if (from) q = q.gte('log_date', from);
  if (to) q = q.lte('log_date', to);
  return unwrap(q);
}

// ---- Announcements ----
export function fetchAnnouncements() {
  return unwrap(
    supabase
      .from('announcements')
      .select('*, profiles(name)')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
  );
}

export function createAnnouncement(announcement) {
  return unwrap(supabase.from('announcements').insert(announcement).select().single());
}

export function updateAnnouncement(id, patch) {
  return unwrap(supabase.from('announcements').update(patch).eq('id', id).select().single());
}

// ANN-03: pin/unpin is explicitly exempt from audit logging.
export function togglePinAnnouncement(id, isPinned) {
  return unwrap(supabase.from('announcements').update({ is_pinned: isPinned }).eq('id', id).select().single());
}

export function deleteAnnouncement(id) {
  return unwrap(supabase.from('announcements').delete().eq('id', id));
}

// ANN-04: live unread badge — resolves with the most recent announcement's
// timestamp, then calls onNewAnnouncement for every one that lands after.
export function subscribeToAnnouncements(onNewAnnouncement) {
  const channel = supabase
    .channel('announcements-live')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, (payload) => {
      onNewAnnouncement(payload.new);
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ---- Admin ----
export async function fetchAdminStats() {
  const [{ count: totalProfiles }, { count: roleCount }, { count: pendingCount }, approvedRes, { count: upcomingEvents }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('user_roles').select('*', { count: 'exact', head: true }),
    supabase.from('hour_logs').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('hour_logs').select('hours').eq('status', 'approved'),
    supabase.from('events').select('*', { count: 'exact', head: true }).gte('event_date', new Date().toISOString().slice(0, 10)),
  ]);
  const approvedHours = (approvedRes.data || []).reduce((sum, r) => sum + Number(r.hours), 0);
  return { volunteerCount: (totalProfiles || 0) - (roleCount || 0), pendingCount, approvedHours, upcomingEvents };
}

// Returns every user (any role) with their computed role, chapter, and hours summary.
export async function fetchVolunteers() {
  const [{ data: profiles, error }, { data: roles }, { data: chapters }, { data: logs }] = await Promise.all([
    supabase.from('profiles').select('*').order('name'),
    supabase.from('user_roles').select('*'),
    supabase.from('chapters').select('id, name'),
    supabase.from('hour_logs').select('user_id, hours, status'),
  ]);
  if (error) throw error;

  const roleByUser = Object.fromEntries((roles || []).map((r) => [r.user_id, r]));
  const chapterNameById = Object.fromEntries((chapters || []).map((c) => [c.id, c.name]));
  const byUser = {};
  (logs || []).forEach((l) => {
    byUser[l.user_id] = byUser[l.user_id] || { approved_hours: 0, pending_count: 0 };
    if (l.status === 'approved') byUser[l.user_id].approved_hours += Number(l.hours);
    if (l.status === 'pending') byUser[l.user_id].pending_count += 1;
  });

  return profiles.map((v) => ({
    ...v,
    role: roleByUser[v.id]?.role || 'volunteer',
    chapter_name: chapterNameById[v.chapter_id] || 'Unassigned',
    approved_hours: byUser[v.id]?.approved_hours || 0,
    pending_count: byUser[v.id]?.pending_count || 0,
  }));
}

export function fetchVolunteerRoster() {
  return unwrap(supabase.from('profiles').select('id, name, email').order('name'));
}

// ---- Roles (RPCs — enforce self-modification and scope rules server-side) ----
export function grantChapterAdmin(targetUser, targetChapter) {
  return unwrap(supabase.rpc('grant_chapter_admin', { target_user: targetUser, target_chapter: targetChapter }));
}

export function grantSuperAdmin(targetUser) {
  return unwrap(supabase.rpc('grant_super_admin', { target_user: targetUser }));
}

export function revokeAdminRole(targetUser) {
  return unwrap(supabase.rpc('revoke_admin_role', { target_user: targetUser }));
}

// ---- Chapters ----
export function fetchChapters() {
  return unwrap(supabase.from('chapters').select('*').order('name'));
}

export function createChapter(chapter) {
  return unwrap(supabase.from('chapters').insert(chapter).select().single());
}

export function updateChapter(id, patch) {
  return unwrap(supabase.from('chapters').update(patch).eq('id', id).select().single());
}

export function deleteChapter(id) {
  return unwrap(supabase.from('chapters').delete().eq('id', id));
}

export function moveVolunteerToChapter(targetUser, newChapter) {
  return unwrap(supabase.rpc('move_volunteer_to_chapter', { target_user: targetUser, new_chapter: newChapter }));
}

// ---- Audit log ----
// Fire-and-forget by design (GLOBAL-04): a logging failure must never block
// the mutating action that triggered it.
export async function writeAuditLog(actionType, { targetUserId = null, targetId = null, details = null } = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('audit_log').insert({
      actor_id: user.id,
      action_type: actionType,
      target_user_id: targetUserId,
      target_id: targetId != null ? String(targetId) : null,
      details,
    });
    if (error) console.error('audit log write failed', error);
  } catch (e) {
    console.error('audit log write failed', e);
  }
}

export function fetchAuditLog() {
  return unwrap(
    supabase
      .from('audit_log')
      .select('*, actor:profiles!audit_log_actor_id_fkey(name, email), target:profiles!audit_log_target_user_id_fkey(name, email)')
      .order('created_at', { ascending: false })
      .limit(500)
  );
}

// ---- Geolocation (best-effort, short-timeout, never blocks the caller) ----
export async function lookupIpGeolocation() {
  try {
    return await fetchWithTimeout('https://ipapi.co/json/', {}, 2500);
  } catch {
    return null;
  }
}

export async function lookupZip(zip) {
  try {
    return await fetchWithTimeout(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`, {}, 2500);
  } catch {
    return null;
  }
}

export async function reverseGeocode(lat, lon) {
  try {
    return await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`,
      {},
      2500
    );
  } catch {
    return null;
  }
}

export function getBrowserLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 3000 }
    );
  });
}

// Best-effort match of a city/state pair to an existing chapter — never throws.
export function matchChapterToLocation(chapters, { city, state } = {}) {
  if (!state) return null;
  const stateNorm = state.trim().toLowerCase();
  const root = chapters.find((c) => !c.parent_id && !c.is_unassigned && c.state?.trim().toLowerCase() === stateNorm);
  if (!root) return null;
  if (city) {
    const cityNorm = city.trim().toLowerCase();
    const sub = chapters.find((c) => c.parent_id === root.id && c.city?.trim().toLowerCase() === cityNorm);
    if (sub) return sub.id;
  }
  return root.id;
}

// ---- Visitor logging (GATE-09 / VIS-01) — unauthenticated, best-effort ----
const BOT_SIGNATURES = ['bot', 'crawler', 'spider', 'curl', 'wget', 'python-requests', 'headless', 'scrapy', 'phantomjs'];

export function classifyUserAgent(userAgent) {
  const ua = (userAgent || '').toLowerCase();
  const hit = BOT_SIGNATURES.find((sig) => ua.includes(sig));
  if (hit) return { isBot: true, reason: `user agent contains "${hit}"` };
  if (!ua) return { isBot: true, reason: 'missing user agent' };
  return { isBot: false, reason: null };
}

export async function logVisitor(path, geo) {
  try {
    const { isBot, reason } = classifyUserAgent(navigator.userAgent);
    await supabase.from('visitor_logs').insert({
      path,
      ip: geo?.ip || null,
      user_agent: navigator.userAgent,
      country: geo?.country_name || geo?.country || null,
      region: geo?.region || null,
      city: geo?.city || null,
      is_bot: isBot,
      bot_reason: reason,
    });
  } catch (e) {
    console.error('visitor log write failed', e);
  }
}

// ---- Access requests (GATE / AREQ) ----
export async function submitAccessRequest({ name, email, chapterId, geo }) {
  const { error } = await supabase.rpc('submit_access_request', {
    p_name: name,
    p_email: email,
    p_chapter_id: chapterId || null,
    p_country: geo?.country_name || geo?.country || null,
    p_region: geo?.region || null,
    p_city: geo?.city || null,
  });
  if (error) throw error;
}

export async function checkAccessRequestStatus(email) {
  const { data, error } = await supabase.rpc('check_access_request_status', { target_email: email });
  if (error) throw error;
  return data; // 'pending' | 'approved' | 'rejected' | null
}

export function fetchAccessRequests() {
  return unwrap(
    supabase
      .from('access_requests')
      .select('*, chapters(name)')
      .order('created_at', { ascending: false })
  );
}

export function approveAccessRequest(requestId, chapterId) {
  return callEdgeFunction('approve-access-request', { requestId, chapterId });
}

export async function rejectAccessRequest(requestId, reason) {
  const { data: { user } } = await supabase.auth.getUser();
  return unwrap(
    supabase
      .from('access_requests')
      .update({ status: 'rejected', rejection_reason: reason || null, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq('id', requestId)
      .select()
      .single()
  );
}

// ---- Auth extensions ----
export async function resolveLoginEmail(identifier) {
  const { data, error } = await supabase.rpc('resolve_login_email', { identifier });
  if (error) throw error;
  return data;
}

export async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin + window.location.pathname, shouldCreateUser: false },
  });
  if (error) throw error;
}

export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// ---- Admin user management (USER-02/03/10) ----
export function createUser({ name, email, password, chapterId }) {
  return callEdgeFunction('admin-create-user', { name, email, password, chapterId });
}

export function deleteUser(targetUserId) {
  return callEdgeFunction('admin-delete-user', { targetUserId });
}

// Resolves a chapter name (optionally disambiguated by parent chapter name)
// to a chapter id. Returns { chapterId, error } — never throws, so bulk
// import can record a per-row reason instead of aborting the whole batch.
export function resolveChapterByName(chapters, chapterName, parentName) {
  if (!chapterName) return { chapterId: null, error: null };
  const nameNorm = chapterName.trim().toLowerCase();
  let matches = chapters.filter((c) => c.name.trim().toLowerCase() === nameNorm);
  if (matches.length === 0) return { chapterId: null, error: `No chapter named "${chapterName}"` };
  if (matches.length > 1) {
    if (!parentName) return { chapterId: null, error: `Multiple chapters named "${chapterName}" — specify a parent chapter to disambiguate` };
    const parentNorm = parentName.trim().toLowerCase();
    const parent = chapters.find((c) => c.name.trim().toLowerCase() === parentNorm && !c.parent_id);
    if (!parent) return { chapterId: null, error: `No parent chapter named "${parentName}"` };
    matches = matches.filter((c) => c.parent_id === parent.id);
    if (matches.length === 0) return { chapterId: null, error: `"${chapterName}" is not a sub-chapter of "${parentName}"` };
  }
  return { chapterId: matches[0].id, error: null };
}

// ---- Certificate requests (CERT-01..07) ----
// hourLogIds/note are the only client-controlled fields — status/chapter_id/
// reviewer fields are all forced server-side by a trigger (same pattern as
// hour_logs).
export async function createCertificateRequest(userId, hourLogIds, note) {
  const request = await unwrap(
    supabase.from('certificate_requests').insert({ user_id: userId, note: note || null }).select().single()
  );
  const links = hourLogIds.map((hourLogId) => ({ certificate_request_id: request.id, hour_log_id: hourLogId }));
  const { error } = await supabase.from('certificate_request_hours').insert(links);
  if (error) throw error;
  return request;
}

export async function fetchMyCertificateRequests(userId) {
  const requests = await unwrap(
    supabase
      .from('certificate_requests')
      .select('*, signer:profiles!certificate_requests_reviewed_by_fkey(name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
  );
  return attachCertificateTotals(requests);
}

export async function fetchPendingCertificateRequests() {
  const requests = await unwrap(
    supabase
      .from('certificate_requests')
      .select('*, profiles!certificate_requests_user_id_fkey(name, email)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
  );
  return attachCertificateTotals(requests);
}

export async function fetchCertificateRequestDetail(id) {
  const request = await unwrap(
    supabase
      .from('certificate_requests')
      .select('*, profiles!certificate_requests_user_id_fkey(name, email), signer:profiles!certificate_requests_reviewed_by_fkey(name)')
      .eq('id', id)
      .single()
  );
  const links = await unwrap(
    supabase.from('certificate_request_hours').select('hour_logs(*)').eq('certificate_request_id', id)
  );
  return { ...request, activities: links.map((l) => l.hour_logs) };
}

async function attachCertificateTotals(requests) {
  const results = [];
  for (const r of requests) {
    const links = await unwrap(
      supabase.from('certificate_request_hours').select('hour_logs(hours)').eq('certificate_request_id', r.id)
    );
    const totalHours = links.reduce((sum, l) => sum + Number(l.hour_logs?.hours || 0), 0);
    results.push({ ...r, total_hours: totalHours, activity_count: links.length });
  }
  return results;
}

export function approveCertificateRequest(id, signature, dateIssued, reviewerId) {
  return unwrap(
    supabase
      .from('certificate_requests')
      .update({ status: 'approved', signature, date_issued: dateIssued, reviewed_by: reviewerId, reviewed_at: new Date().toISOString(), rejection_reason: null })
      .eq('id', id)
      .select()
      .single()
  );
}

export function rejectCertificateRequest(id, reason, reviewerId) {
  return unwrap(
    supabase
      .from('certificate_requests')
      .update({ status: 'rejected', rejection_reason: reason, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
  );
}

// ---- Event enrollment (USER-08) ----
export function enrollUserInEvent(eventId, targetUserId, { autoApproveIntent = false, enrolledBy } = {}) {
  return unwrap(
    supabase.from('event_signups').insert({
      event_id: eventId,
      user_id: targetUserId,
      enrolled_by: enrolledBy,
      auto_approve_intent: autoApproveIntent,
    })
  );
}
