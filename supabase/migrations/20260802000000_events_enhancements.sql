-- Phase 4: event type/location/chapter scoping, signup notes, and the
-- Ekal.org sync's supporting columns.

-- ============================================================================
-- 1. events: type, location detail, chapter scoping, time, sync tracking.
-- chapter_id null = a global event, visible to every chapter (EVT-01).
-- ============================================================================
alter table public.events add column city text;
alter table public.events add column state text;
alter table public.events add column event_time time;
alter table public.events add column event_type text check (
  event_type is null or event_type in ('Fundraising', 'Workshop', 'Community Service', 'Educational', 'Event', 'Conference')
);
alter table public.events add column chapter_id uuid references public.chapters(id);
alter table public.events add column external_url text unique;

alter table public.events add constraint events_title_length check (char_length(title) between 3 and 200);
alter table public.events add constraint events_date_sane check (event_date >= '2020-01-01');

-- ============================================================================
-- 2. event_signups: optional note from the volunteer at signup time (EVT-06).
-- ============================================================================
alter table public.event_signups add column notes text;

-- ============================================================================
-- 3. RLS rework: events visibility and management are chapter-scoped.
-- ============================================================================
drop policy "events are readable by authenticated users" on public.events;
drop policy "admins manage events" on public.events;

create policy "events readable within scope"
  on public.events for select
  to authenticated
  using (
    chapter_id is null
    or chapter_id = (select chapter_id from public.profiles where id = auth.uid())
    or public.is_super_admin()
    or (public.is_admin() and chapter_id = public.admin_chapter_id())
  );

-- Chapter admins manage only their own chapter's events; global (chapter_id
-- null) events and any other chapter's events are super-admin only.
create policy "admins manage events within scope"
  on public.events for all
  to authenticated
  using (public.is_super_admin() or (chapter_id is not null and public.is_chapter_admin_of(chapter_id)))
  with check (public.is_super_admin() or (chapter_id is not null and public.is_chapter_admin_of(chapter_id)));
