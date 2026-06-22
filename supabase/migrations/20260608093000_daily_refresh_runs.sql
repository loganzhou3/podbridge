create table if not exists public.daily_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  trigger_source text not null default 'manual',
  seeds text[] not null default '{}',
  discovery_attempts integer not null default 0,
  discovered_count integer not null default 0,
  refreshed_count integer not null default 0,
  failed_count integer not null default 0,
  result jsonb not null default '{}'::jsonb,
  error_message text
);

create index if not exists daily_refresh_runs_started_at_idx
  on public.daily_refresh_runs (started_at desc);

alter table public.daily_refresh_runs enable row level security;

drop policy if exists "public read daily refresh runs" on public.daily_refresh_runs;
create policy "public read daily refresh runs"
  on public.daily_refresh_runs for select
  using (true);
