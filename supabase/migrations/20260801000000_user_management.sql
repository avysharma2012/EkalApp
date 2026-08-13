-- Phase 3: admin user management + bulk import support.

-- ============================================================================
-- 1. Same RESTRICT-by-default bug as audit_log/access_requests, three more
-- instances: deleting an admin who ever created an event/announcement or
-- reviewed hours would otherwise be blocked outright (violates USER-10,
-- which requires user deletion to always be possible; DATA-02 says the
-- record should survive with the reference nulled, not the deletion fail).
-- ============================================================================
alter table public.announcements
  drop constraint announcements_created_by_fkey,
  add constraint announcements_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.events
  drop constraint events_created_by_fkey,
  add constraint events_created_by_fkey foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.hour_logs
  drop constraint hour_logs_reviewed_by_fkey,
  add constraint hour_logs_reviewed_by_fkey foreign key (reviewed_by) references public.profiles(id) on delete set null;

-- ============================================================================
-- 2. event_signups: track who enrolled a volunteer (admin vs self) and
-- whether the enrollment was flagged auto-approve-intended (USER-08).
-- ============================================================================
alter table public.event_signups add column enrolled_by uuid references public.profiles(id) on delete set null;
alter table public.event_signups add column auto_approve_intent boolean not null default false;

-- Admins may enroll any user directly, in addition to the existing
-- self-signup policy (RLS OR-combines permissive policies).
create policy "admins enroll any user"
  on public.event_signups for insert
  to authenticated
  with check (public.is_admin());
