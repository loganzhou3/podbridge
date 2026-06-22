create table if not exists public.brand_briefs (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null,
  product_description text not null,
  goal text not null,
  budget_rmb integer not null,
  target_tier text not null default '混合',
  audience_notes text,
  flight_start date,
  flight_end date,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  brief_id uuid references public.brand_briefs(id) on delete set null,
  name text not null,
  status text not null default 'planning',
  plan jsonb,
  actual_spend_rmb integer,
  actual_reach integer,
  actual_clicks integer,
  actual_conversions integer,
  review_notes text,
  review_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_contacts (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid references public.podcasts(id) on delete cascade,
  contact_name text,
  contact_email text,
  platform text,
  profile_url text,
  status text not null default 'unknown',
  notes text,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(podcast_id, platform, profile_url)
);

create table if not exists public.campaign_podcasts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  podcast_id uuid references public.podcasts(id) on delete set null,
  plan_label text,
  title text not null,
  suggested_format text,
  estimated_cpm_rmb integer,
  estimated_episodes integer,
  expected_reach integer,
  fit_reason text,
  outreach_status text not null default 'not_contacted',
  quoted_price_rmb integer,
  scheduled_date date,
  actual_spend_rmb integer,
  actual_reach integer,
  actual_clicks integer,
  actual_conversions integer,
  notes text,
  sort_order integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_brand_briefs_created on public.brand_briefs(created_at desc);
create index if not exists idx_campaigns_brief on public.campaigns(brief_id);
create index if not exists idx_campaign_podcasts_campaign on public.campaign_podcasts(campaign_id, sort_order);
create index if not exists idx_creator_contacts_podcast on public.creator_contacts(podcast_id);

alter table public.brand_briefs enable row level security;
alter table public.campaigns enable row level security;
alter table public.creator_contacts enable row level security;
alter table public.campaign_podcasts enable row level security;

create policy "public read brand_briefs" on public.brand_briefs for select using (true);
create policy "public insert brand_briefs" on public.brand_briefs for insert with check (true);
create policy "public update brand_briefs" on public.brand_briefs for update using (true);

create policy "public read campaigns" on public.campaigns for select using (true);
create policy "public insert campaigns" on public.campaigns for insert with check (true);
create policy "public update campaigns" on public.campaigns for update using (true);

create policy "public read creator_contacts" on public.creator_contacts for select using (true);
create policy "public insert creator_contacts" on public.creator_contacts for insert with check (true);
create policy "public update creator_contacts" on public.creator_contacts for update using (true);

create policy "public read campaign_podcasts" on public.campaign_podcasts for select using (true);
create policy "public insert campaign_podcasts" on public.campaign_podcasts for insert with check (true);
create policy "public update campaign_podcasts" on public.campaign_podcasts for update using (true);
