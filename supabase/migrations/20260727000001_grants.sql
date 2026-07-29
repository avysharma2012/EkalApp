-- RLS policies restrict access, but PostgREST also requires the underlying
-- SQL privilege grants to exist for the authenticated role on these tables.
grant select, insert, update, delete on
  public.profiles,
  public.events,
  public.event_signups,
  public.hour_logs,
  public.announcements
to authenticated, service_role;
