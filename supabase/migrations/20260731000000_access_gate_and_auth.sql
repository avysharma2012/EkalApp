-- Phase 2: invite-only access gate, access-request review, and auth extensions
-- (username-based sign-in, visitor logging for the pre-login gate).

-- ============================================================================
-- 1. access_requests (GATE / AREQ)
-- ============================================================================
create table public.access_requests (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null unique,
  chapter_id uuid references public.chapters(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  -- ON DELETE SET NULL, not the default RESTRICT: reviewing a request must
  -- never block deleting that admin's account later (USER-10).
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  country text,
  region text,
  city text,
  created_at timestamptz not null default now()
);

alter table public.access_requests enable row level security;

-- Admins see requests scoped to their chapter; super admins see all.
create policy "admins read scoped access requests"
  on public.access_requests for select
  to authenticated
  using (
    public.is_super_admin()
    or (public.is_admin() and (chapter_id is null or chapter_id = public.admin_chapter_id()))
  );

-- Direct client updates may only ever set status to 'rejected' — approval
-- requires creating an auth account, which only the approve-access-request
-- Edge Function (service role) can do.
create policy "admins reject scoped access requests"
  on public.access_requests for update
  to authenticated
  using (
    public.is_admin()
    and (chapter_id is null or public.is_super_admin() or chapter_id = public.admin_chapter_id())
  )
  with check (status = 'rejected');

grant select, update on public.access_requests to authenticated;
grant select, insert, update on public.access_requests to service_role;

-- Submission goes through this SECURITY DEFINER function rather than a
-- direct table insert. Two reasons: (1) supabase-js's upsert() requests
-- RETURNING by default, which Postgres evaluates against SELECT-RLS too —
-- granting anon broad SELECT here would leak who has requested access
-- (GATE-10); routing through a function that returns nothing sidesteps that
-- entirely. (2) It keeps the idempotent on-conflict-do-nothing behavior
-- (GATE-04) in one place.
create or replace function public.submit_access_request(
  p_name text, p_email text, p_chapter_id uuid,
  p_country text default null, p_region text default null, p_city text default null
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.access_requests (name, email, chapter_id, country, region, city)
  values (p_name, lower(p_email), p_chapter_id, p_country, p_region, p_city)
  on conflict (email) do nothing;
end;
$$;

grant execute on function public.submit_access_request(text, text, uuid, text, text, text) to anon, authenticated;

-- Status lookup for an unauthenticated visitor (GATE-08/GATE-10): returns
-- only the status, never discloses whether a full account already exists.
create or replace function public.check_access_request_status(target_email text)
returns text
language sql security definer set search_path = public stable as $$
  select status from public.access_requests where lower(email) = lower(target_email) limit 1;
$$;

grant execute on function public.check_access_request_status(text) to anon, authenticated;

-- ============================================================================
-- 2. visitor_logs (GATE-09 / VIS-01..04) — pre-login traffic only.
-- ============================================================================
create table public.visitor_logs (
  id bigint generated always as identity primary key,
  path text,
  ip text,
  user_agent text,
  country text,
  region text,
  city text,
  is_bot boolean not null default false,
  bot_reason text,
  created_at timestamptz not null default now()
);

alter table public.visitor_logs enable row level security;

create policy "anyone can write a visitor log entry"
  on public.visitor_logs for insert
  to anon, authenticated
  with check (true);

create policy "super admins read visitor logs"
  on public.visitor_logs for select
  to authenticated
  using (public.is_super_admin());

grant select, insert on public.visitor_logs to anon;
grant select, insert on public.visitor_logs to authenticated;
grant select, insert on public.visitor_logs to service_role;

-- ============================================================================
-- 3. Chapters must be readable pre-login too (GATE-02's chapter dropdown).
-- Phase 1 only granted this to `authenticated`.
-- ============================================================================
drop policy "chapters readable by authenticated" on public.chapters;

create policy "chapters readable by anyone"
  on public.chapters for select to anon, authenticated using (true);

grant select on public.chapters to anon;

-- ============================================================================
-- 4. Username-based sign-in (AUTH-01): an optional handle on profiles,
-- resolved to a real email before calling signInWithPassword. The lookup is
-- a SECURITY DEFINER function so unauthenticated callers never get direct
-- read access to the profiles table (SEC-03: no account-existence leakage).
-- ============================================================================
alter table public.profiles add column username text unique;

create or replace function public.resolve_login_email(identifier text)
returns text
language sql security definer set search_path = public stable as $$
  select case
    when identifier like '%@%' then identifier
    else (select email from public.profiles where lower(username) = lower(identifier) limit 1)
  end;
$$;

grant execute on function public.resolve_login_email(text) to anon, authenticated;
