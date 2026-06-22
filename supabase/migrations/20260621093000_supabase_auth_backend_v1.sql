-- PodBridge Supabase Backend & Auth V1
-- Incremental and compatible with the existing podcast/campaign schema.

do $$ begin
  create type public.app_role as enum ('admin', 'brand_user', 'creator', 'researcher');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  company_name text,
  role public.app_role not null default 'brand_user',
  avatar_url text,
  website text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where user_id = auth.uid()), 'brand_user'::public.app_role)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select public.current_app_role() = 'admin'::public.app_role $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name, company_name, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'company_name', ''),
    'brand_user'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.podcasts
  add column if not exists host_name text,
  add column if not exists description text,
  add column if not exists language text,
  add column if not exists country text,
  add column if not exists platform text,
  add column if not exists source_url text,
  add column if not exists rss_url text,
  add column if not exists brand_safety_score integer;

alter table public.campaigns
  add column if not exists owner_id uuid references auth.users(id) on delete cascade,
  add column if not exists campaign_name text,
  add column if not exists brand_name text,
  add column if not exists brand_website text,
  add column if not exists product_description text,
  add column if not exists product_category text,
  add column if not exists target_market text,
  add column if not exists budget numeric(14,2),
  add column if not exists currency text default 'CNY',
  add column if not exists objective text,
  add column if not exists target_audience text,
  add column if not exists audience_age_range text,
  add column if not exists audience_gender text,
  add column if not exists audience_location text,
  add column if not exists audience_interest text,
  add column if not exists brand_tone text,
  add column if not exists preferred_categories text,
  add column if not exists forbidden_topics text,
  add column if not exists blocked_industries text,
  add column if not exists required_message text,
  add column if not exists start_date date,
  add column if not exists end_date date;

update public.campaigns
set campaign_name = coalesce(campaign_name, name)
where campaign_name is null;

create table if not exists public.campaign_podcast_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  podcast_id uuid references public.podcasts(id) on delete set null,
  podcast_name text not null,
  category text,
  platform text,
  commercial_score numeric,
  match_score integer,
  brand_safety_score integer,
  estimated_price_range text,
  recommended_format text,
  recommendation_reason text,
  confidence integer check (confidence between 0 and 100),
  source_type text,
  source_label text,
  source_url text,
  contact_status text not null default 'candidate',
  contact_person text,
  contact_info text,
  quoted_price numeric(14,2),
  negotiated_price numeric(14,2),
  note text,
  next_action text,
  next_follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, podcast_id)
);

create table if not exists public.creator_claim_requests (
  id uuid primary key default gen_random_uuid(),
  podcast_id uuid references public.podcasts(id) on delete set null,
  podcast_name text not null,
  claimant_user_id uuid not null references auth.users(id) on delete cascade,
  claimant_name text not null,
  role text not null,
  contact_email text not null,
  phone_or_wechat text,
  linkedin_or_website text,
  official_podcast_url text,
  proof_description text,
  proof_file_url text,
  accepts_sponsorship boolean not null default true,
  available_formats text[] not null default '{}',
  preferred_industries text[] not null default '{}',
  blocked_industries text[] not null default '{}',
  host_read_price_range text,
  sponsorship_price_range text,
  interview_price_range text,
  package_price_range text,
  price_note text,
  currency text not null default 'CNY',
  audience_description text,
  previous_sponsors text,
  case_study_url text,
  additional_note text,
  status text not null default 'pending' check (status in ('pending','verified','rejected','needs_more_info')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sponsor_intelligence_items (
  id uuid primary key default gen_random_uuid(),
  brand_name text not null,
  brand_website text,
  industry text not null,
  product_category text,
  target_market text not null,
  podcast_name text not null,
  podcast_id uuid references public.podcasts(id) on delete set null,
  podcast_url text,
  campaign_format text not null,
  observed_date date,
  estimated_budget_range text,
  campaign_note text,
  source_type text not null,
  source_label text not null,
  source_url text,
  confidence integer not null check (confidence between 0 and 100),
  evidence_note text,
  ai_strategy_summary text,
  ai_audience_inference text,
  ai_brand_fit text,
  ai_risk_note text,
  status text not null default 'pending' check (status in ('pending','verified','rejected','needs_more_info')),
  created_by uuid not null references auth.users(id) on delete cascade,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('podcast','campaign','creator_claim','sponsor_intelligence','ai_recommendation','rate_card','brand_safety')),
  entity_id uuid not null,
  claim text not null,
  source_type text not null,
  source_label text not null,
  source_url text,
  confidence integer not null check (confidence between 0 and 100),
  explanation text,
  captured_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_campaigns_owner on public.campaigns(owner_id, updated_at desc);
create index if not exists idx_campaign_items_campaign on public.campaign_podcast_items(campaign_id, updated_at desc);
create index if not exists idx_claims_user on public.creator_claim_requests(claimant_user_id, created_at desc);
create index if not exists idx_sponsors_status on public.sponsor_intelligence_items(status, created_at desc);
create index if not exists idx_evidence_entity on public.evidence_items(entity_type, entity_id, created_at desc);
create index if not exists idx_audit_created on public.audit_logs(created_at desc);

alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_podcast_items enable row level security;
alter table public.creator_claim_requests enable row level security;
alter table public.sponsor_intelligence_items enable row level security;
alter table public.evidence_items enable row level security;
alter table public.audit_logs enable row level security;

-- Remove legacy anonymous mutation policies. Public podcast SELECT remains intact.
drop policy if exists "public insert podcasts" on public.podcasts;
drop policy if exists "public update podcasts" on public.podcasts;
drop policy if exists "public insert campaigns" on public.campaigns;
drop policy if exists "public update campaigns" on public.campaigns;
drop policy if exists "public read campaigns" on public.campaigns;
drop policy if exists "public insert campaign_podcasts" on public.campaign_podcasts;
drop policy if exists "public update campaign_podcasts" on public.campaign_podcasts;

create policy "profiles read own or admin" on public.profiles for select
  using (user_id = auth.uid() or public.is_admin());
create policy "profiles update own or admin" on public.profiles for update
  using (user_id = auth.uid() or public.is_admin())
  with check (public.is_admin() or (user_id = auth.uid() and role = public.current_app_role()));

create policy "campaign owners read" on public.campaigns for select
  using (owner_id = auth.uid() or public.is_admin());
create policy "campaign owners insert" on public.campaigns for insert
  with check (owner_id = auth.uid());
create policy "campaign owners update" on public.campaigns for update
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
create policy "campaign owners delete" on public.campaigns for delete
  using (owner_id = auth.uid() or public.is_admin());

create policy "campaign item owners read" on public.campaign_podcast_items for select
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and (c.owner_id = auth.uid() or public.is_admin())));
create policy "campaign item owners insert" on public.campaign_podcast_items for insert
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and c.owner_id = auth.uid()));
create policy "campaign item owners update" on public.campaign_podcast_items for update
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and (c.owner_id = auth.uid() or public.is_admin())));
create policy "campaign item owners delete" on public.campaign_podcast_items for delete
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and (c.owner_id = auth.uid() or public.is_admin())));

create policy "claims read own or admin" on public.creator_claim_requests for select
  using (status = 'verified' or claimant_user_id = auth.uid() or public.is_admin());
create policy "claims insert own" on public.creator_claim_requests for insert
  with check (claimant_user_id = auth.uid());
create policy "claims update admin only" on public.creator_claim_requests for update
  using (public.is_admin()) with check (public.is_admin());

create policy "sponsor public verified read" on public.sponsor_intelligence_items for select
  using (status = 'verified' or created_by = auth.uid() or public.is_admin());
create policy "sponsor researcher insert" on public.sponsor_intelligence_items for insert
  with check (created_by = auth.uid() and public.current_app_role() in ('researcher','admin'));
create policy "sponsor author draft update" on public.sponsor_intelligence_items for update
  using ((created_by = auth.uid() and status <> 'verified') or public.is_admin())
  with check ((created_by = auth.uid() and status <> 'verified') or public.is_admin());
create policy "sponsor author delete" on public.sponsor_intelligence_items for delete
  using ((created_by = auth.uid() and status <> 'verified') or public.is_admin());

create policy "evidence public read" on public.evidence_items for select using (true);
create policy "evidence researcher insert" on public.evidence_items for insert
  with check (created_by = auth.uid() and public.current_app_role() in ('researcher','admin'));
create policy "evidence admin update" on public.evidence_items for update
  using (public.is_admin()) with check (public.is_admin());
create policy "evidence admin delete" on public.evidence_items for delete using (public.is_admin());

create policy "audit admin read" on public.audit_logs for select using (public.is_admin());

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, old_value, new_value)
  values (auth.uid(), tg_op, tg_table_name, coalesce(new.id, old.id), to_jsonb(old), to_jsonb(new));
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_creator_claims on public.creator_claim_requests;
create trigger audit_creator_claims after insert or update or delete on public.creator_claim_requests
  for each row execute function public.write_audit_log();
drop trigger if exists audit_sponsor_items on public.sponsor_intelligence_items;
create trigger audit_sponsor_items after insert or update or delete on public.sponsor_intelligence_items
  for each row execute function public.write_audit_log();
