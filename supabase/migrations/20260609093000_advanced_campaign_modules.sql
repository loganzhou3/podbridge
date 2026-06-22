create table if not exists public.podcast_ad_profiles (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid not null references public.podcasts(id) on delete cascade,
  contact_method text,
  contact_email text,
  contact_wechat text,
  quote_min_rmb integer,
  quote_max_rmb integer,
  response_rate numeric(5,2),
  collaboration_status text not null default 'unknown',
  historical_brands text[] not null default '{}',
  ad_categories text[] not null default '{}',
  notes text,
  brand_safety_score integer not null default 80,
  brand_safety_tags text[] not null default '{}',
  brand_safety_notes text,
  suggested_price_min_rmb integer,
  suggested_price_max_rmb integer,
  pricing_basis text,
  data_confidence text not null default 'ai_estimated',
  source_notes text,
  manually_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(podcast_id)
);

create table if not exists public.competitor_campaigns (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid references public.podcasts(id) on delete set null,
  brand_name text not null,
  brand_category text,
  ad_format text,
  first_seen_at date,
  last_seen_at date,
  evidence_url text,
  notes text,
  data_confidence text not null default 'public_data',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_submissions (
  id uuid primary key default gen_random_uuid(),
  podcast_name text not null,
  host_name text,
  podcast_url text,
  contact_email text,
  contact_wechat text,
  introduction text,
  quote_min_rmb integer,
  quote_max_rmb integer,
  ad_categories text[] not null default '{}',
  authorized_metrics jsonb not null default '{}'::jsonb,
  status text not null default 'new',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.campaign_podcasts
  add column if not exists pipeline_status text not null default 'candidate',
  add column if not exists match_explanation text,
  add column if not exists brand_safety_score integer,
  add column if not exists brand_safety_tags text[] not null default '{}',
  add column if not exists brand_safety_notes text,
  add column if not exists suggested_price_min_rmb integer,
  add column if not exists suggested_price_max_rmb integer,
  add column if not exists pricing_basis text,
  add column if not exists data_confidence text not null default 'ai_estimated',
  add column if not exists competitor_brands text[] not null default '{}';

create index if not exists idx_podcast_ad_profiles_podcast on public.podcast_ad_profiles(podcast_id);
create index if not exists idx_podcast_ad_profiles_status on public.podcast_ad_profiles(collaboration_status);
create index if not exists idx_competitor_campaigns_podcast on public.competitor_campaigns(podcast_id, last_seen_at desc);
create index if not exists idx_competitor_campaigns_brand on public.competitor_campaigns(brand_name);
create index if not exists idx_creator_submissions_created on public.creator_submissions(created_at desc);
create index if not exists idx_campaign_podcasts_pipeline on public.campaign_podcasts(campaign_id, pipeline_status);

alter table public.podcast_ad_profiles enable row level security;
alter table public.competitor_campaigns enable row level security;
alter table public.creator_submissions enable row level security;

create policy "public read podcast_ad_profiles" on public.podcast_ad_profiles for select using (true);
create policy "public insert podcast_ad_profiles" on public.podcast_ad_profiles for insert with check (true);
create policy "public update podcast_ad_profiles" on public.podcast_ad_profiles for update using (true);

create policy "public read competitor_campaigns" on public.competitor_campaigns for select using (true);
create policy "public insert competitor_campaigns" on public.competitor_campaigns for insert with check (true);
create policy "public update competitor_campaigns" on public.competitor_campaigns for update using (true);

create policy "public read creator_submissions" on public.creator_submissions for select using (true);
create policy "public insert creator_submissions" on public.creator_submissions for insert with check (true);
create policy "public update creator_submissions" on public.creator_submissions for update using (true);
