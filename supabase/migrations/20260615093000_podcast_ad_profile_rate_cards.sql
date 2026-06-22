alter table public.podcast_ad_profiles
  add column if not exists host_read_min_rmb integer,
  add column if not exists host_read_max_rmb integer,
  add column if not exists sponsorship_min_rmb integer,
  add column if not exists sponsorship_max_rmb integer,
  add column if not exists custom_episode_min_rmb integer,
  add column if not exists custom_episode_max_rmb integer;
