# Ekal Volunteering App

A volunteer engagement platform for Ekal: log hours, request admin approval, download
certificates, browse/sign up for events, and read announcements — plus an admin portal
to review hours, manage events, and message volunteers.

**Stack:** React (Vite) frontend on GitHub Pages · Supabase (Postgres + Auth + Edge Functions) as the backend.
There's no separate server — the frontend talks to Supabase directly for data/auth, and calls
one Edge Function to generate certificate PDFs.

## Project layout

- `client/` — React app (Vite). Talks to Supabase via `@supabase/supabase-js`.
- `supabase/migrations/` — SQL schema, RLS policies, and grants.
- `supabase/functions/generate-certificate/` — Edge Function (Deno) that generates the
  certificate PDF for an approved hour log.
- `.github/workflows/deploy.yml` — builds the frontend and publishes it to GitHub Pages.

## Local development

Requires [Docker](https://www.docker.com/) and the Supabase CLI (`npx supabase`).

```bash
npx supabase start          # spins up local Postgres, Auth, Studio, Edge Functions
npx supabase functions serve generate-certificate --no-verify-jwt
cd client && npm install && npm run dev
```

`supabase start` prints local keys — `client/.env` is already wired to the default local
project (`http://127.0.0.1:54321` + the demo anon key), so no changes are needed for local dev.

Local Supabase Studio (handy for browsing data): http://127.0.0.1:54323

## Deploying to your real Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. **Apply the schema:** open your project's Dashboard → SQL Editor, and run the contents
   of `supabase/migrations/20260727000000_init.sql`, then
   `20260727000001_grants.sql`, then `20260727000002_admin_manage_profiles.sql`, in that order.
   (Or, from your own terminal — not this one — run `supabase login`, `supabase link --project-ref <ref>`,
   then `supabase db push`.)
3. **Deploy the Edge Function:** from your own terminal, `supabase functions deploy generate-certificate`.
4. **Get your API keys:** Dashboard → Project Settings → API. Copy the Project URL and the
   `anon`/`publishable` key (never the `service_role`/`secret` key — that one must stay
   server-side only, and this app never needs it client-side).
5. Set `client/.env` (for local testing against the real project) or the GitHub Actions
   repo variables `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (for the Pages deploy) to
   those values.

### Bootstrapping the first admin

Signup always creates a `volunteer` — nobody can self-assign admin access. To create your
first admin, register a normal account in the app, then run this once in the Supabase
SQL Editor:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

After that, admins can promote other volunteers to admin from the **Volunteers** page in
the app (the "Make admin" button) — no more manual SQL needed.

## Deploying the frontend to GitHub Pages

1. Push this repo to GitHub.
2. Repo Settings → Pages → Source: **GitHub Actions**.
3. Repo Settings → Secrets and variables → Actions → **Variables** tab: add
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (your real project's values from above).
4. Push to `main` — the workflow in `.github/workflows/deploy.yml` builds and publishes
   automatically. The app uses `HashRouter`, so it works correctly on Pages without any
   server-side rewrite rules, regardless of the repo name.

## Security notes

- Row Level Security is enabled on every table; volunteers can only read/write their own
  hour logs and event signups, and only admins can approve hours, manage events, or post
  announcements (enforced in Postgres, not just the UI).
- The `anon` key is safe to ship in the frontend bundle by design — it has no power on its
  own without a valid user session, and every table is protected by RLS.
- The certificate PDF is generated server-side (Edge Function using the `service_role` key,
  which never reaches the browser) and checks that the requester owns the log (or is an
  admin) and that the hours are actually approved before generating anything.
