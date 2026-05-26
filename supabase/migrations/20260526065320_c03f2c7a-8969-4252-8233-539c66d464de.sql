
ALTER TABLE public.podcasts ALTER COLUMN rss_url DROP NOT NULL;

ALTER TABLE public.podcasts
  ADD COLUMN IF NOT EXISTS xiaoyuzhou_episode_count integer,
  ADD COLUMN IF NOT EXISTS xiaoyuzhou_comments integer,
  ADD COLUMN IF NOT EXISTS ximalaya_subscribers integer,
  ADD COLUMN IF NOT EXISTS ximalaya_comments integer,
  ADD COLUMN IF NOT EXISTS apple_subscribers integer,
  ADD COLUMN IF NOT EXISTS apple_reviews integer;

CREATE UNIQUE INDEX IF NOT EXISTS podcasts_xiaoyuzhou_url_key
  ON public.podcasts (xiaoyuzhou_url)
  WHERE xiaoyuzhou_url IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS podcasts_ximalaya_url_key
  ON public.podcasts (ximalaya_url)
  WHERE ximalaya_url IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS podcasts_rss_url_key
  ON public.podcasts (rss_url)
  WHERE rss_url IS NOT NULL;
