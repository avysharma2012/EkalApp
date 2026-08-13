-- Phase 5: hours submission/verification overhaul (server-enforced pending-only,
-- chapter scoping, signatures) and the certificate request subsystem.

-- ============================================================================
-- 1. hour_logs: description, signature, rejection reason, chapter stamp,
-- and validation bounds (HRS-01).
-- ============================================================================
alter table public.hour_logs add column description text not null default '';
alter table public.hour_logs add column signature text;
alter table public.hour_logs add column rejection_reason text;
alter table public.hour_logs add column chapter_id uuid references public.chapters(id);

alter table public.hour_logs add constraint hour_logs_activity_length check (char_length(activity) between 3 and 200);
alter table public.hour_logs add constraint hour_logs_description_length check (char_length(description) between 10 and 2000);
alter table public.hour_logs add constraint hour_logs_hours_bounds check (hours >= 0.5 and hours <= 24 and hours * 2 = round(hours * 2));
alter table public.hour_logs add constraint hour_logs_date_sane check (log_date <= current_date and log_date >= '2020-01-01');

-- HRS-02/CHAP-08: every submission is Pending, unconditionally, no matter what
-- the client sends (including any admin "auto-approve" attempt) — and always
-- stamped with the volunteer's *current* chapter server-side, never chosen by
-- the client.
create or replace function public.enforce_hour_log_insert_defaults()
returns trigger language plpgsql as $$
begin
  new.status := 'pending';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.signature := null;
  new.rejection_reason := null;
  new.chapter_id := (select chapter_id from public.profiles where id = new.user_id);
  return new;
end;
$$;

create trigger trg_hour_log_insert_defaults
  before insert on public.hour_logs
  for each row execute function public.enforce_hour_log_insert_defaults();

-- Chapter-scope the existing review policies now that hour_logs carries a
-- chapter (RBAC-02): a chapter admin only reviews their own chapter's queue.
drop policy "users see their own hour logs" on public.hour_logs;
create policy "users see relevant hour logs"
  on public.hour_logs for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_super_admin()
    or (public.is_admin() and chapter_id = public.admin_chapter_id())
  );

drop policy "admins review hour logs" on public.hour_logs;
create policy "admins review scoped hour logs"
  on public.hour_logs for update
  to authenticated
  using (public.is_super_admin() or (public.is_admin() and chapter_id = public.admin_chapter_id()));

-- ============================================================================
-- 2. certificate_requests + the hours they bundle (CERT-01..07)
-- ============================================================================
create table public.certificate_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  chapter_id uuid references public.chapters(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,
  signature text,
  date_issued date,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now()
);

create table public.certificate_request_hours (
  id bigint generated always as identity primary key,
  certificate_request_id bigint not null references public.certificate_requests(id) on delete cascade,
  hour_log_id bigint not null references public.hour_logs(id) on delete cascade,
  unique (certificate_request_id, hour_log_id)
);

create or replace function public.enforce_certificate_request_insert_defaults()
returns trigger language plpgsql as $$
begin
  new.status := 'pending';
  new.reviewed_by := null;
  new.reviewed_at := null;
  new.signature := null;
  new.date_issued := null;
  new.rejection_reason := null;
  new.chapter_id := (select chapter_id from public.profiles where id = new.user_id);
  return new;
end;
$$;

create trigger trg_certificate_request_insert_defaults
  before insert on public.certificate_requests
  for each row execute function public.enforce_certificate_request_insert_defaults();

alter table public.certificate_requests enable row level security;
alter table public.certificate_request_hours enable row level security;

create policy "users see own certificate requests, admins see scoped"
  on public.certificate_requests for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_super_admin()
    or (public.is_admin() and chapter_id = public.admin_chapter_id())
  );

create policy "users create their own certificate requests"
  on public.certificate_requests for insert
  to authenticated
  with check (user_id = auth.uid());

-- CERT-06: no reset-to-pending path — admins may set approved or rejected,
-- but the UI never offers a way back, and this policy doesn't special-case
-- 'rejected' the way access_requests' does, since approval here is a plain
-- data update (no privileged Admin API step involved).
create policy "admins review scoped certificate requests"
  on public.certificate_requests for update
  to authenticated
  using (public.is_super_admin() or (public.is_admin() and chapter_id = public.admin_chapter_id()));

create policy "certificate hours follow request visibility"
  on public.certificate_request_hours for select
  to authenticated
  using (
    exists (
      select 1 from public.certificate_requests cr
      where cr.id = certificate_request_id
        and (cr.user_id = auth.uid() or public.is_super_admin() or (public.is_admin() and cr.chapter_id = public.admin_chapter_id()))
    )
  );

-- A volunteer may only link their own approved hours to their own request.
create policy "users link their own approved hours"
  on public.certificate_request_hours for insert
  to authenticated
  with check (
    exists (select 1 from public.certificate_requests cr where cr.id = certificate_request_id and cr.user_id = auth.uid())
    and exists (select 1 from public.hour_logs hl where hl.id = hour_log_id and hl.user_id = auth.uid() and hl.status = 'approved')
  );

grant select, insert, update on public.certificate_requests to authenticated, service_role;
grant select, insert on public.certificate_request_hours to authenticated, service_role;
