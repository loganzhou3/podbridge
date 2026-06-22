type DashboardPodcastRow = {
  id: string;
  title: string | null;
  author: string | null;
  image_url: string | null;
  category: string | null;
  episode_count: number | null;
  latest_episode_at: string | null;
  update_frequency_days: number | null;
  commercial_score: number | null;
  activity_score: number | null;
  growth_score: number | null;
  lifecycle_stage: string | null;
  audience_tags: string[] | null;
  market: string | null;
  xiaoyuzhou_subscribers: number | null;
  ximalaya_subscribers: number | null;
  apple_subscribers: number | null;
  monthly_active_listeners: number | null;
  ximalaya_plays: number | null;
  xiaoyuzhou_url: string | null;
  ximalaya_url: string | null;
  itunes_url: string | null;
  podcast_ad_profiles: {
    host_read_min_rmb: number | null;
    host_read_max_rmb: number | null;
    sponsorship_min_rmb: number | null;
    sponsorship_max_rmb: number | null;
    custom_episode_min_rmb: number | null;
    custom_episode_max_rmb: number | null;
    data_confidence: string | null;
    source_notes: string | null;
    manually_confirmed_at: string | null;
  } | null;
};

const DASHBOARD_SELECT = [
  "id",
  "title",
  "author",
  "image_url",
  "category",
  "episode_count",
  "latest_episode_at",
  "update_frequency_days",
  "commercial_score",
  "activity_score",
  "growth_score",
  "lifecycle_stage",
  "audience_tags",
  "market",
  "xiaoyuzhou_subscribers",
  "ximalaya_subscribers",
  "apple_subscribers",
  "monthly_active_listeners",
  "ximalaya_plays",
  "xiaoyuzhou_url",
  "ximalaya_url",
  "itunes_url",
  "podcast_ad_profiles(host_read_min_rmb,host_read_max_rmb,sponsorship_min_rmb,sponsorship_max_rmb,custom_episode_min_rmb,custom_episode_max_rmb,data_confidence,source_notes,manually_confirmed_at)",
].join(",");

function getSupabaseRestConfig() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase 环境变量未配置");
  return { url, key };
}

async function restGet<T>(path: string): Promise<T> {
  const { url, key } = getSupabaseRestConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function getSubscriberCount(p: DashboardPodcastRow) {
  return (
    p.xiaoyuzhou_subscribers ??
    p.ximalaya_subscribers ??
    p.apple_subscribers ??
    p.monthly_active_listeners ??
    null
  );
}

function getSubscriberSource(p: DashboardPodcastRow) {
  if (p.xiaoyuzhou_subscribers != null) return "小宇宙";
  if (p.ximalaya_subscribers != null) return "喜马拉雅";
  if (p.apple_subscribers != null) return "Apple";
  if (p.monthly_active_listeners != null) return "人工登记";
  return null;
}

async function getBrandPodcastIds(brand: string) {
  const rows = await restGet<Array<{ podcast_id: string | null }>>(
    `brand_recommendations?select=podcast_id&brand_name=ilike.*${encodeURIComponent(brand)}*&limit=5000`,
  );
  return Array.from(new Set(rows.map((row) => row.podcast_id).filter(Boolean))) as string[];
}

export async function buildDashboardPodcasts({
  brand,
  category,
}: {
  brand?: string;
  category?: string;
}) {
  const brandText = brand?.trim();
  const categoryText = category?.trim();
  const podcastIds = brandText ? await getBrandPodcastIds(brandText) : null;
  if (podcastIds && podcastIds.length === 0) return { podcasts: [] };

  const pageSize = 1000;
  const all: DashboardPodcastRow[] = [];
  for (let offset = 0; offset < 100000; offset += pageSize) {
    const params = [
      "market=eq.cn",
      `select=${DASHBOARD_SELECT}`,
      "order=commercial_score.desc.nullslast",
      `limit=${pageSize}`,
      `offset=${offset}`,
    ];
    if (categoryText) params.push(`category=ilike.*${encodeURIComponent(categoryText)}*`);
    if (podcastIds) params.push(`id=in.(${podcastIds.join(",")})`);

    const rows = await restGet<DashboardPodcastRow[]>(`podcasts?${params.join("&")}`);
    if (!rows.length) break;
    all.push(...rows);
    if (rows.length < pageSize) break;
  }

  return {
    podcasts: all.map((podcast) => {
      const subscriberCount = getSubscriberCount(podcast);
      return {
        ...podcast,
        subscriber_count: subscriberCount,
        subscriber_source: getSubscriberSource(podcast),
        estimated_subscribers: subscriberCount,
      };
    }),
  };
}
