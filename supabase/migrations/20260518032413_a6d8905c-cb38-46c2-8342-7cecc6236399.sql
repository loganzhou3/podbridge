ALTER TABLE public.podcasts
  ADD COLUMN IF NOT EXISTS market TEXT NOT NULL DEFAULT 'cn';

CREATE INDEX IF NOT EXISTS idx_podcasts_market ON public.podcasts(market);

ALTER TABLE public.snapshots
  ADD COLUMN IF NOT EXISTS xiaoyuzhou_subscribers INTEGER,
  ADD COLUMN IF NOT EXISTS ximalaya_plays BIGINT,
  ADD COLUMN IF NOT EXISTS itunes_review_count INTEGER,
  ADD COLUMN IF NOT EXISTS daily_play_delta BIGINT;
