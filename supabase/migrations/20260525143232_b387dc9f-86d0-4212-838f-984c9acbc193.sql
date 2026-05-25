
-- brand_contacts_cache: server-only
DROP POLICY IF EXISTS "public insert brand_cache" ON public.brand_contacts_cache;
DROP POLICY IF EXISTS "public read brand_cache" ON public.brand_contacts_cache;
DROP POLICY IF EXISTS "public update brand_cache" ON public.brand_contacts_cache;

-- brand_recommendations: read-only public
DROP POLICY IF EXISTS "public insert brand_rec" ON public.brand_recommendations;
DROP POLICY IF EXISTS "public update brand_rec" ON public.brand_recommendations;
DROP POLICY IF EXISTS "public delete brand_rec" ON public.brand_recommendations;

-- podcasts: read-only public
DROP POLICY IF EXISTS "public insert podcasts" ON public.podcasts;
DROP POLICY IF EXISTS "public update podcasts" ON public.podcasts;

-- episodes: read-only public
DROP POLICY IF EXISTS "public insert episodes" ON public.episodes;

-- snapshots: read-only public
DROP POLICY IF EXISTS "public insert snapshots" ON public.snapshots;
