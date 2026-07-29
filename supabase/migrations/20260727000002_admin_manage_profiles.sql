-- Allow admins to update any profile (e.g. to promote a volunteer to admin).
-- The existing "users can update their own profile" policy still covers self-edits;
-- Postgres RLS OR-combines multiple permissive policies for the same command.
create policy "admins manage all profiles"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
