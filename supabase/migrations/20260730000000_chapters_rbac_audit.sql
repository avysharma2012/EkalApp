-- Phase 1: Two-level chapter hierarchy, separate RBAC (volunteer / chapter_admin / super_admin),
-- and an append-only audit log. Additive/ALTER-based so it applies cleanly on top of the
-- existing schema (both local and any already-deployed project).

-- ============================================================================
-- 1. Chapters (root + sub-chapter, exactly two levels)
-- ============================================================================
create table public.chapters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  state text,
  parent_id uuid references public.chapters(id) on delete set null,
  is_unassigned boolean not null default false,
  created_at timestamptz not null default now()
);

create function public.enforce_chapter_depth()
returns trigger language plpgsql as $$
begin
  if new.parent_id is not null and exists (
    select 1 from public.chapters where id = new.parent_id and parent_id is not null
  ) then
    raise exception 'Chapters only support two levels: a sub-chapter cannot itself be a parent';
  end if;
  return new;
end;
$$;

create trigger trg_chapter_depth
  before insert or update on public.chapters
  for each row execute function public.enforce_chapter_depth();

-- Reserved default chapter, fixed id so app code can reference it directly.
insert into public.chapters (id, name, is_unassigned)
values ('00000000-0000-0000-0000-000000000001', 'Unassigned', true)
on conflict (id) do nothing;

create unique index chapters_single_unassigned on public.chapters (is_unassigned) where is_unassigned;

-- ============================================================================
-- 2. profiles: current-chapter pointer
-- ============================================================================
alter table public.profiles add column chapter_id uuid references public.chapters(id);
update public.profiles set chapter_id = '00000000-0000-0000-0000-000000000001' where chapter_id is null;
alter table public.profiles alter column chapter_id set not null;
alter table public.profiles alter column chapter_id set default '00000000-0000-0000-0000-000000000001';

-- ============================================================================
-- 3. chapter_memberships: append-only history of every chapter a user has been in
-- ============================================================================
create table public.chapter_memberships (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  chapter_id uuid not null references public.chapters(id),
  created_at timestamptz not null default now()
);

insert into public.chapter_memberships (user_id, chapter_id)
select id, chapter_id from public.profiles;

-- ============================================================================
-- 4. user_roles: RBAC-06 — role lives separately from the editable profile row.
-- Absence of a row = Volunteer. At most one elevated-role row per user.
-- ============================================================================
create table public.user_roles (
  id bigint generated always as identity primary key,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  role text not null check (role in ('chapter_admin', 'super_admin')),
  chapter_id uuid references public.chapters(id),
  created_at timestamptz not null default now(),
  constraint user_roles_scope_matches_role check (
    (role = 'chapter_admin' and chapter_id is not null) or
    (role = 'super_admin' and chapter_id is null)
  )
);

-- Carry forward the old boolean-ish admin flag as chapter_admin of the user's current chapter.
insert into public.user_roles (user_id, role, chapter_id)
select id, 'chapter_admin', chapter_id from public.profiles where role = 'admin'
on conflict (user_id) do nothing;

alter table public.profiles drop column role;

-- ============================================================================
-- 5. audit_log: append-only (no update/delete policy or grant, by design)
-- ============================================================================
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action_type text not null,
  target_user_id uuid references public.profiles(id),
  target_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 6. Helper functions
-- ============================================================================
create or replace function public.is_super_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'super_admin');
$$;

create or replace function public.is_chapter_admin_of(target_chapter uuid)
returns boolean language sql security definer set search_path = public stable as $$
  select public.is_super_admin() or exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'chapter_admin' and chapter_id = target_chapter
  );
$$;

-- Redefines the existing is_admin() used by prior migrations' RLS policies —
-- same name/signature, so those policies keep working unchanged.
create or replace function public.is_admin()
returns boolean language sql security definer set search_path = public stable as $$
  select public.is_super_admin() or exists (
    select 1 from public.user_roles where user_id = auth.uid() and role = 'chapter_admin'
  );
$$;

create or replace function public.admin_chapter_id()
returns uuid language sql security definer set search_path = public stable as $$
  select chapter_id from public.user_roles where user_id = auth.uid() and role = 'chapter_admin';
$$;

-- ============================================================================
-- 7. Role grant/revoke RPCs — GLOBAL-06 (no self-modification) and RBAC-04/05
-- enforced here rather than in raw RLS, since the rules are conditional.
-- ============================================================================
create or replace function public.grant_chapter_admin(target_user uuid, target_chapter uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if target_user = auth.uid() then
    raise exception 'You cannot change your own admin status';
  end if;
  if not public.is_super_admin() and public.admin_chapter_id() is distinct from target_chapter then
    raise exception 'Chapter admins may only grant admin within their own chapter';
  end if;
  if not (public.is_super_admin() or public.is_chapter_admin_of(target_chapter)) then
    raise exception 'Not authorized to grant chapter admin for this chapter';
  end if;

  insert into public.user_roles (user_id, role, chapter_id)
  values (target_user, 'chapter_admin', target_chapter)
  on conflict (user_id) do update set role = 'chapter_admin', chapter_id = excluded.chapter_id;
end;
$$;

create or replace function public.grant_super_admin(target_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if target_user = auth.uid() then
    raise exception 'You cannot change your own admin status';
  end if;
  if not public.is_super_admin() then
    raise exception 'Only a super admin can grant super admin status';
  end if;

  insert into public.user_roles (user_id, role, chapter_id)
  values (target_user, 'super_admin', null)
  on conflict (user_id) do update set role = 'super_admin', chapter_id = null;
end;
$$;

create or replace function public.revoke_admin_role(target_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  target_role text;
  target_chapter uuid;
begin
  if target_user = auth.uid() then
    raise exception 'You cannot change your own admin status';
  end if;

  select role, chapter_id into target_role, target_chapter
  from public.user_roles where user_id = target_user;

  if target_role is null then
    return; -- already a volunteer
  end if;
  if target_role = 'super_admin' and not public.is_super_admin() then
    raise exception 'Only a super admin can revoke super admin status';
  end if;
  if target_role = 'chapter_admin' and not (public.is_super_admin() or public.is_chapter_admin_of(target_chapter)) then
    raise exception 'Not authorized to revoke this admin''s role';
  end if;

  delete from public.user_roles where user_id = target_user;
end;
$$;

-- ============================================================================
-- 8. Move a volunteer to a different chapter (CHAP-06/07): updates the current
-- pointer and appends a membership record, never deletes history.
-- ============================================================================
create or replace function public.move_volunteer_to_chapter(target_user uuid, new_chapter uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_super_admin() or public.is_chapter_admin_of(new_chapter)) then
    raise exception 'Not authorized to move volunteers into this chapter';
  end if;

  update public.profiles set chapter_id = new_chapter where id = target_user;
  insert into public.chapter_memberships (user_id, chapter_id) values (target_user, new_chapter);
end;
$$;

-- ============================================================================
-- 9. Idempotent account provisioning (AUTH-07): fixed default role/chapter,
-- never trusts client-supplied role (SEC-05).
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target_chapter uuid := coalesce(
    nullif(new.raw_user_meta_data->>'chapter_id', '')::uuid,
    '00000000-0000-0000-0000-000000000001'
  );
begin
  insert into public.profiles (id, name, email, chapter_id, country)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    new.email,
    target_chapter,
    new.raw_user_meta_data->>'country'
  )
  on conflict (id) do nothing;

  insert into public.chapter_memberships (user_id, chapter_id)
  select new.id, target_chapter
  where not exists (select 1 from public.chapter_memberships where user_id = new.id);

  return new;
end;
$$;

-- ============================================================================
-- 10. RLS
-- ============================================================================
alter table public.chapters enable row level security;
alter table public.chapter_memberships enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_log enable row level security;

create policy "chapters readable by authenticated"
  on public.chapters for select to authenticated using (true);

create policy "super admins manage chapters"
  on public.chapters for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- Writes to chapter_memberships only happen via the SECURITY DEFINER functions
-- above (which run as the function owner and bypass RLS) — no direct insert/
-- update/delete policy is defined here on purpose.
create policy "users see relevant chapter memberships"
  on public.chapter_memberships for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin() or public.is_chapter_admin_of(chapter_id));

-- Same pattern for user_roles: grants/revokes only via the RPCs above.
create policy "role visibility"
  on public.user_roles for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_super_admin()
    or (role = 'chapter_admin' and public.is_chapter_admin_of(chapter_id))
  );

create policy "admins write audit log"
  on public.audit_log for insert to authenticated
  with check (actor_id = auth.uid() and public.is_admin());

create policy "admins read scoped audit log"
  on public.audit_log for select to authenticated
  using (
    public.is_super_admin()
    or (
      public.is_admin() and (
        target_user_id is null
        or exists (
          select 1 from public.profiles p
          where p.id = target_user_id and p.chapter_id = public.admin_chapter_id()
        )
      )
    )
  );

-- ============================================================================
-- 11. Grants — table grants are the outer gate, RLS narrows further.
-- chapter_memberships/user_roles intentionally get no direct write grant:
-- all writes go through the SECURITY DEFINER RPCs above.
-- ============================================================================
grant select, insert, update, delete on public.chapters to authenticated, service_role;
grant select on public.chapter_memberships to authenticated, service_role;
grant select on public.user_roles to authenticated, service_role;
grant select, insert on public.audit_log to authenticated, service_role;
