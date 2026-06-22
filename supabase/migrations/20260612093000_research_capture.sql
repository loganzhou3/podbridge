create table if not exists public.research_tasks (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  keyword text not null,
  target_category text,
  notes text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.research_capture_records (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.research_tasks(id) on delete set null,
  podcast_id uuid references public.podcasts(id) on delete set null,
  platform text not null,
  podcast_title text not null,
  host_name text,
  description text,
  category text,
  source_url text not null,
  rss_url text,
  visible_followers integer,
  visible_play_count integer,
  episode_count integer,
  latest_episode_date date,
  update_frequency text,
  comment_count integer,
  ranking_info text,
  suitable_industries text[] not null default '{}',
  notes text,
  captured_at timestamptz not null default now(),
  captured_by text not null default 'manual',
  capture_method text not null default 'manual',
  confidence integer not null default 80,
  evidence_note text not null,
  screenshot_url text,
  ai_tags text[] not null default '{}',
  ai_brand_fit text[] not null default '{}',
  ai_brand_safety jsonb not null default '{}'::jsonb,
  ai_recommended_formats text[] not null default '{}',
  status text not null default 'captured',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.podcast_source_evidence (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid references public.podcasts(id) on delete cascade,
  record_id uuid references public.research_capture_records(id) on delete set null,
  claim text not null,
  source_platform text not null,
  source_label text not null,
  source_url text,
  confidence integer not null default 80,
  captured_at timestamptz not null default now(),
  captured_by text not null default 'manual',
  capture_method text not null default 'manual',
  explanation text not null,
  screenshot_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_research_tasks_status on public.research_tasks(status, created_at desc);
create index if not exists idx_research_capture_task on public.research_capture_records(task_id, created_at desc);
create index if not exists idx_research_capture_podcast on public.research_capture_records(podcast_id, created_at desc);
create index if not exists idx_podcast_source_evidence_podcast on public.podcast_source_evidence(podcast_id, captured_at desc);

alter table public.research_tasks enable row level security;
alter table public.research_capture_records enable row level security;
alter table public.podcast_source_evidence enable row level security;

create policy "public read research_tasks" on public.research_tasks for select using (true);
create policy "public insert research_tasks" on public.research_tasks for insert with check (true);
create policy "public update research_tasks" on public.research_tasks for update using (true);

create policy "public read research_capture_records" on public.research_capture_records for select using (true);
create policy "public insert research_capture_records" on public.research_capture_records for insert with check (true);
create policy "public update research_capture_records" on public.research_capture_records for update using (true);

create policy "public read podcast_source_evidence" on public.podcast_source_evidence for select using (true);
create policy "public insert podcast_source_evidence" on public.podcast_source_evidence for insert with check (true);
create policy "public update podcast_source_evidence" on public.podcast_source_evidence for update using (true);
