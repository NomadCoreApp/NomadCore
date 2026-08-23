-- ============================================================
-- NomadCore — AI receptionist backend (Supabase)
-- Project: twgatpwehkerapwtpkag  (NomadCore's own project — the one
-- nomad-core.com already uses; keeps NomadCore leads with NomadCore data).
--
-- Built to the Agent Build Standard v1.2. This migration stands alone: it
-- does NOT depend on any pre-existing admin helper. The three tables are
-- service-role only (RLS on, no anon/authenticated policy) — the edge
-- function writes with the service-role key, and the owner reads via the
-- SQL editor / dashboard. If NomadCore already has an admin predicate,
-- see the commented policies at the bottom to expose reads in-app.
--
--   ai_config      DEP-05 runtime kill switch (flip enabled, no deploy)
--   ai_call_log    COST-01/02 shared rate-limit + spend-ceiling counter
--   nc_inquiries   captured leads / questions / waitlist (save_lead tool)
--   retention      PRIV-02 nightly purge of the rate-log + old transcripts
-- ============================================================

-- ── DEP-05: runtime kill switch ──────────────────────────────
create table if not exists public.ai_config (
  fn         text primary key,
  enabled    boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.ai_config enable row level security;
-- No anon/authenticated policy: service role bypasses RLS; owner edits in SQL editor.
insert into public.ai_config (fn, enabled) values ('nc-assistant', true)
  on conflict (fn) do nothing;
-- To take the agent offline WITHOUT a deploy:
--   update public.ai_config set enabled = false where fn = 'nc-assistant';

-- ── COST-01/02: rate-limit + spend-ceiling counter ───────────
create table if not exists public.ai_call_log (
  id         bigint generated always as identity primary key,
  fn         text not null,
  ip         text not null,
  created_at timestamptz not null default now()
);
alter table public.ai_call_log enable row level security;
create index if not exists ai_call_log_fn_created_idx on public.ai_call_log (fn, created_at);
create index if not exists ai_call_log_fn_ip_created_idx on public.ai_call_log (fn, ip, created_at);

-- ── Captured leads / questions / waitlist ────────────────────
create table if not exists public.nc_inquiries (
  id            bigint generated always as identity primary key,
  name          text,
  email         text not null,
  phone         text,
  kind          text not null default 'lead'
                  check (kind in ('question','support','feedback','lead')),
  message       text,
  status        text not null default 'new'
                  check (status in ('new','contacted','closed')),
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
alter table public.nc_inquiries enable row level security;
create index if not exists nc_inquiries_created_idx on public.nc_inquiries (created_at desc);
create index if not exists nc_inquiries_status_idx  on public.nc_inquiries (status);
-- No anon/authenticated policy: only the service-role edge function writes,
-- and the owner reads via the SQL editor / dashboard. See admin note below.

-- Least-access hardening (migration nc_assistant_lockdown_grants): remove the
-- default anon/authenticated API grants so these service-role-only tables are
-- not reachable or discoverable via PostgREST/GraphQL at all. The edge function
-- uses the service role, which is unaffected.
revoke all on public.nc_inquiries from anon, authenticated;
revoke all on public.ai_config    from anon, authenticated;
revoke all on public.ai_call_log  from anon, authenticated;

-- ── PRIV-02: retention — a real number, applied to every copy ─
create extension if not exists pg_cron;

create or replace function public.ai_retention_purge()
returns void language sql security definer set search_path='' as $$
  -- rate-log is transient: 2 days is plenty for the hour/day windows.
  delete from public.ai_call_log where created_at < now() - interval '2 days';
  -- strip stored transcripts from old inquiry rows after 180 days
  -- (the lead itself stays; only the conversation text is dropped).
  update public.nc_inquiries set meta = meta - 'transcript'
    where created_at < now() - interval '180 days' and meta ? 'transcript';
$$;
revoke execute on function public.ai_retention_purge() from anon, authenticated, public;

-- schedule nightly at 03:19 (idempotent-ish: unschedule a prior copy first).
select cron.unschedule('nc_ai_retention_purge')
  where exists (select 1 from cron.job where jobname = 'nc_ai_retention_purge');
select cron.schedule('nc_ai_retention_purge', '19 3 * * *', $$select public.ai_retention_purge()$$);

-- ── OPTIONAL: expose reads in-app to admins ──────────────────
-- If NomadCore already has an admin predicate (e.g. a boolean on profiles or
-- an is_admin() function), add a read policy so an admin dashboard can list
-- inquiries without the service-role key. Example (adjust to your schema):
--
--   create policy nc_inquiries_admin_read on public.nc_inquiries
--     for select using ( public.nc_is_admin() );
--   create policy ai_config_admin_all on public.ai_config
--     for all using ( public.nc_is_admin() ) with check ( public.nc_is_admin() );
