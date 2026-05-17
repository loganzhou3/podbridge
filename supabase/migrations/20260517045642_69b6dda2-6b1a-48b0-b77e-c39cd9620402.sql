
create table public.podcasts (
  id uuid primary key default gen_random_uuid(),
  rss_url text not null unique,
  title text,
  author text,
  description text,
  image_url text,
  itunes_id text,
  itunes_url text,
  category text,
  language text,
  latest_episode_at timestamptz,
  first_episode_at timestamptz,
  episode_count integer default 0,
  update_frequency_days numeric,
  avg_duration_minutes numeric,
  commercial_score integer default 0,
  activity_score integer default 0,
  growth_score integer default 0,
  lifecycle_stage text,
  audience_tags text[] default '{}',
  last_synced_at timestamptz default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid not null references public.podcasts(id) on delete cascade,
  guid text,
  title text,
  description text,
  pub_date timestamptz,
  duration_seconds integer,
  audio_url text,
  created_at timestamptz not null default now(),
  unique(podcast_id, guid)
);

create index idx_episodes_podcast on public.episodes(podcast_id, pub_date desc);

create table public.snapshots (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid not null references public.podcasts(id) on delete cascade,
  taken_at timestamptz not null default now(),
  episode_count integer,
  apple_rank integer,
  estimated_reviews integer,
  estimated_subscribers integer
);

create index idx_snapshots_podcast on public.snapshots(podcast_id, taken_at desc);

alter table public.podcasts enable row level security;
alter table public.episodes enable row level security;
alter table public.snapshots enable row level security;

create policy "public read podcasts" on public.podcasts for select using (true);
create policy "public insert podcasts" on public.podcasts for insert with check (true);
create policy "public update podcasts" on public.podcasts for update using (true);

create policy "public read episodes" on public.episodes for select using (true);
create policy "public insert episodes" on public.episodes for insert with check (true);

create policy "public read snapshots" on public.snapshots for select using (true);
create policy "public insert snapshots" on public.snapshots for insert with check (true);
