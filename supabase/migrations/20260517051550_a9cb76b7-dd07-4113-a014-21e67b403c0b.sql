
ALTER TABLE public.podcasts
  ADD COLUMN IF NOT EXISTS xiaoyuzhou_url text,
  ADD COLUMN IF NOT EXISTS ximalaya_url text,
  ADD COLUMN IF NOT EXISTS xiaoyuzhou_subscribers integer,
  ADD COLUMN IF NOT EXISTS ximalaya_plays bigint,
  ADD COLUMN IF NOT EXISTS ai_strategy jsonb,
  ADD COLUMN IF NOT EXISTS ai_strategy_at timestamptz;

CREATE TABLE IF NOT EXISTS public.brand_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  podcast_id uuid NOT NULL,
  brand_name text NOT NULL,
  category text,
  fit_score integer,
  reason text,
  website text,
  contact_email text,
  contact_notes text,
  contacts_fetched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brand_rec_podcast ON public.brand_recommendations(podcast_id);

ALTER TABLE public.brand_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read brand_rec" ON public.brand_recommendations FOR SELECT USING (true);
CREATE POLICY "public insert brand_rec" ON public.brand_recommendations FOR INSERT WITH CHECK (true);
CREATE POLICY "public update brand_rec" ON public.brand_recommendations FOR UPDATE USING (true);
CREATE POLICY "public delete brand_rec" ON public.brand_recommendations FOR DELETE USING (true);

CREATE TABLE IF NOT EXISTS public.brand_contacts_cache (
  brand_key text PRIMARY KEY,
  brand_name text NOT NULL,
  website text,
  contact_email text,
  notes text,
  raw jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.brand_contacts_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read brand_cache" ON public.brand_contacts_cache FOR SELECT USING (true);
CREATE POLICY "public insert brand_cache" ON public.brand_contacts_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "public update brand_cache" ON public.brand_contacts_cache FOR UPDATE USING (true);
