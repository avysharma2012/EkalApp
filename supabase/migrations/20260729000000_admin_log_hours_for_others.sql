-- Allow admins to submit hour logs on behalf of any volunteer (e.g. after an in-person
-- event where attendees didn't log their own hours). The existing
-- "users create their own hour logs" policy still covers self-submission;
-- Postgres RLS OR-combines multiple permissive policies for the same command.
create policy "admins create hour logs for any volunteer"
  on public.hour_logs for insert
  to authenticated
  with check (public.is_admin());
