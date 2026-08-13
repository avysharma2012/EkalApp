import { supabase } from './supabase';

async function unwrap(queryPromise) {
  const { data, error } = await queryPromise;
  if (error) throw error;
  return data;
}

// ---- Events ----
export async function fetchEvents() {
  const { data: events, error } = await supabase.from('events').select('*').order('event_date', { ascending: true });
  if (error) throw error;

  const { data: { user } } = await supabase.auth.getUser();
  const { data: signups } = await supabase.from('event_signups').select('event_id').eq('user_id', user.id);
  const signedUpIds = new Set((signups || []).map((s) => s.event_id));

  const counts = {};
  const { data: allSignups } = await supabase.from('event_signups').select('event_id');
  (allSignups || []).forEach((s) => { counts[s.event_id] = (counts[s.event_id] || 0) + 1; });

  return events.map((e) => ({ ...e, signed_up: signedUpIds.has(e.id), signup_count: counts[e.id] || 0 }));
}

export function createEvent(event) {
  return unwrap(supabase.from('events').insert(event).select().single());
}

export function deleteEvent(id) {
  return unwrap(supabase.from('events').delete().eq('id', id));
}

export function signUpForEvent(eventId, userId) {
  return unwrap(supabase.from('event_signups').insert({ event_id: eventId, user_id: userId }));
}

export function cancelSignup(eventId, userId) {
  return unwrap(supabase.from('event_signups').delete().eq('event_id', eventId).eq('user_id', userId));
}

export function fetchEventSignups(eventId) {
  return unwrap(
    supabase
      .from('event_signups')
      .select('signed_up_at, profiles(id, name, email)')
      .eq('event_id', eventId)
      .order('signed_up_at', { ascending: true })
  );
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
  return unwrap(supabase.from('hour_logs').insert(log).select().single());
}

export function fetchAllHourLogs(status) {
  let q = supabase
    .from('hour_logs')
    .select('*, profiles!hour_logs_user_id_fkey(name, email), events(title)')
    .order('created_at', { ascending: true });
  if (status) q = q.eq('status', status);
  return unwrap(q);
}

export function reviewHourLog(id, decision, reviewerId) {
  return unwrap(
    supabase
      .from('hour_logs')
      .update({ status: decision, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
  );
}

export async function downloadCertificate(logId) {
  const { data: { session } } = await supabase.auth.getSession();
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-certificate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ logId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Failed to generate certificate');
  }
  const blob = await res.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `ekal-certificate-${logId}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// ---- Announcements ----
export function fetchAnnouncements() {
  return unwrap(
    supabase
      .from('announcements')
      .select('*, profiles(name)')
      .order('created_at', { ascending: false })
  );
}

export function createAnnouncement(announcement) {
  return unwrap(supabase.from('announcements').insert(announcement).select().single());
}

export function deleteAnnouncement(id) {
  return unwrap(supabase.from('announcements').delete().eq('id', id));
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

export function adminLogHoursForVolunteer({ userId, activity, log_date, hours, notes, event_id, autoApprove, adminId }) {
  const payload = {
    user_id: userId,
    activity,
    log_date,
    hours,
    notes: notes || null,
    event_id: event_id || null,
  };
  if (autoApprove) {
    payload.status = 'approved';
    payload.reviewed_by = adminId;
    payload.reviewed_at = new Date().toISOString();
  }
  return unwrap(supabase.from('hour_logs').insert(payload).select().single());
}
