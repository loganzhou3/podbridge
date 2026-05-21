
ALTER TABLE public.podcasts
  ADD COLUMN IF NOT EXISTS audience_persona text,
  ADD COLUMN IF NOT EXISTS audience_age_range text,
  ADD COLUMN IF NOT EXISTS audience_gender_split text,
  ADD COLUMN IF NOT EXISTS audience_geo text,
  ADD COLUMN IF NOT EXISTS completion_rate numeric,
  ADD COLUMN IF NOT EXISTS new_listener_retention numeric,
  ADD COLUMN IF NOT EXISTS monthly_active_listeners integer,
  ADD COLUMN IF NOT EXISTS cpm_rate numeric,
  ADD COLUMN IF NOT EXISTS metrics_notes text,
  ADD COLUMN IF NOT EXISTS metrics_updated_at timestamptz;
