-- Phase 6: pin/unpin (ANN-01..03) and realtime support for the unread
-- indicator (ANN-04).

alter table public.announcements add column is_pinned boolean not null default false;

-- GLOBAL-09/ANN-04: the unread badge needs to see new announcements land
-- live without a manual refresh.
alter publication supabase_realtime add table public.announcements;
