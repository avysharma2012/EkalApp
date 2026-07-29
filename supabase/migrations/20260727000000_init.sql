-- Ekal Volunteering App schema

create type public.app_role as enum ('volunteer', 'admin');
create type public.hour_status as enum ('pending', 'approved', 'rejected');

-- Profile row created for every auth.users signup (via trigger below)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role public.app_role not null default 'volunteer',
  country text,
  date_joined date not null default current_date
);

create table public.events (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  event_date date not null,
  location text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.event_signups (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  signed_up_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create table public.hour_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id bigint references public.events(id),
  activity text not null,
  log_date date not null,
  hours numeric not null check (hours > 0),
  notes text,
  status public.hour_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.announcements (
  id bigint generated always as identity primary key,
  title text not null,
  body text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role, country)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'volunteer'),
    new.raw_user_meta_data->>'country'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Helper: is the current user an admin?
create function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_signups enable row level security;
alter table public.hour_logs enable row level security;
alter table public.announcements enable row level security;

-- Profiles: everyone can read all profiles (needed for admin lists / names on events),
-- but can only update their own, non-role fields protected by app logic.
create policy "profiles are readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Events: readable by everyone; only admins can insert/update/delete
create policy "events are readable by authenticated users"
  on public.events for select
  to authenticated
  using (true);

create policy "admins manage events"
  on public.events for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Event signups: users manage their own signups; admins can read all
create policy "users see their own signups"
  on public.event_signups for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "users create their own signups"
  on public.event_signups for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users delete their own signups"
  on public.event_signups for delete
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Hour logs: volunteers manage their own; admins can read/update all
create policy "users see their own hour logs"
  on public.hour_logs for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "users create their own hour logs"
  on public.hour_logs for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "admins review hour logs"
  on public.hour_logs for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Announcements: readable by everyone; only admins can post
create policy "announcements are readable by authenticated users"
  on public.announcements for select
  to authenticated
  using (true);

create policy "admins manage announcements"
  on public.announcements for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
