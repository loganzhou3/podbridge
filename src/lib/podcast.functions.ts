import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { XMLParser } from "fast-xml-parser";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const RSS_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5",
};
const RSS_BLOCK_STATUSES = new Set([403, 429, 451, 503]);

type IngestPodcastResult =
  | { ok: true; podcastId: string; source: string }
  | {
      ok: false;
      error: string;
      status: number;
      source: string;
      blockedSource: boolean;
      fallbackTried: boolean;
      podcastId: null;
    };

type Rss2JsonPayload = {
  status?: string;
  message?: string;
  feed?: Record<string, unknown>;
  items?: Array<Record<string, unknown>>;
};

type FetchRssResult =
  | { ok: true; source: string; format: "xml"; xml: string }
  | { ok: true; source: string; format: "rss2json"; payload: Rss2JsonPayload }
  | {
      ok: false;
      status: number;
      error: string;
      source: string;
      blockedSource: boolean;
      fallbackTried: boolean;
    };

function looksLikeHtmlPayload(value: string) {
  const s = value.trim().toLowerCase();
  return s.startsWith("<!doctype html") || s.startsWith("<html") || s.includes("<body");
}

function looksLikeXmlPayload(value: string) {
  const s = value.trim().toLowerCase();
  if (!s.startsWith("<")) return false;
  if (looksLikeHtmlPayload(s)) return false;
  return (
    s.startsWith("<?xml") ||
    s.startsWith("<rss") ||
    s.startsWith("<feed") ||
    s.startsWith("<rdf:rdf")
  );
}

function readTextValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return String(record["#text"] ?? record["@_text"] ?? record.value ?? "").trim();
  }
  return "";
}

async function fetchRssContent(rssUrl: string): Promise<FetchRssResult> {
  const readText = async (res: Response) => {
    try {
      return await res.text();
    } catch {
      return "";
    }
  };

  const attempts = [
    { source: "direct", url: rssUrl, mode: "text" as const, headers: RSS_FETCH_HEADERS },
    {
      source: "allorigins-raw",
      url: `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`,
      mode: "text" as const,
      headers: RSS_FETCH_HEADERS,
    },
    {
      source: "allorigins-get",
      url: `https://api.allorigins.win/get?disableCache=true&url=${encodeURIComponent(rssUrl)}`,
      mode: "allorigins" as const,
      headers: RSS_FETCH_HEADERS,
    },
    {
      source: "codetabs",
      url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(rssUrl)}`,
      mode: "text" as const,
      headers: RSS_FETCH_HEADERS,
    },
    {
      source: "rss2json",
      url: `https://api.rss2json.com/v1/api.json?count=100&rss_url=${encodeURIComponent(rssUrl)}`,
      mode: "rss2json" as const,
      headers: {
        "User-Agent": RSS_FETCH_HEADERS["User-Agent"],
        Accept: "application/json, text/plain;q=0.9, */*;q=0.5",
      },
    },
  ];

  let lastStatus = 0;
  let lastError = "";
  let lastSource = "direct";
  let fallbackTried = false;
  let sawBlockedSource = false;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    const isFallback = i > 0;
    if (isFallback) fallbackTried = true;
    lastSource = attempt.source;

    try {
      const res = await fetch(attempt.url, {
        headers: attempt.headers,
        redirect: "follow",
      });

      lastStatus = res.status;
      if (RSS_BLOCK_STATUSES.has(res.status)) sawBlockedSource = true;
      if (!res.ok) {
        lastError = (await readText(res)).slice(0, 300) || res.statusText || "request failed";
        if (!isFallback && !RSS_BLOCK_STATUSES.has(res.status)) {
          break;
        }
        continue;
      }

      if (attempt.mode === "rss2json") {
        const payload = (await res.json().catch(() => null)) as Rss2JsonPayload | null;
        if (payload?.status === "ok" && payload.feed) {
          return { ok: true, source: attempt.source, format: "rss2json", payload };
        }
        lastError = payload?.message?.trim() || "rss2json returned no feed";
        continue;
      }

      let xml = "";
      if (attempt.mode === "allorigins") {
        const payload = (await res.json().catch(() => null)) as
          | { contents?: string; status?: { http_code?: number } }
          | null;
        xml = payload?.contents?.trim() ?? "";
        if (!xml && payload?.status?.http_code) {
          lastStatus = payload.status.http_code;
        }
      } else {
        xml = (await res.text()).trim();
      }

      if (!xml) {
        lastError = "empty response body";
        continue;
      }

      if (looksLikeXmlPayload(xml)) {
        return { ok: true, source: attempt.source, format: "xml", xml };
      }

      lastError = looksLikeHtmlPayload(xml)
        ? "response is HTML, not RSS XML"
        : "response is not a valid RSS/Atom XML payload";
    } catch (error) {
      lastError = error instanceof Error ? error.message : "request failed";
    }
  }

  return {
    ok: false,
    status: lastStatus || 500,
    error: lastError || "无法获取 RSS",
    source: lastSource,
    blockedSource: sawBlockedSource || RSS_BLOCK_STATUSES.has(lastStatus),
    fallbackTried,
  };
}

function asArray<T>(x: T | T[] | undefined): T[] {
  if (!x) return [];
  return Array.isArray(x) ? x : [x];
}

function parseDuration(d: unknown): number | null {
  if (d == null) return null;
  const s = String(d).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const parts = s.split(":").map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

async function lookupAppleByFeed(feedUrl: string) {
  try {
    const u = `https://itunes.apple.com/search?media=podcast&limit=1&term=${encodeURIComponent(feedUrl)}`;
    const res = await fetch(u);
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
    return data.results?.[0] ?? null;
  } catch {
    return null;
  }
}

async function lookupAppleByTitle(title: string) {
  try {
    const u = `https://itunes.apple.com/search?media=podcast&limit=1&term=${encodeURIComponent(title)}`;
    const res = await fetch(u);
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
    return data.results?.[0] ?? null;
  } catch {
    return null;
  }
}

function deriveTags(channel: Record<string, unknown>, episodes: { title: string }[]): string[] {
  const tags = new Set<string>();
  const cats = asArray(channel["itunes:category"] as unknown);
  for (const c of cats) {
    const t = (c as { "@_text"?: string })?.["@_text"];
    if (t) tags.add(t);
  }
  const text = episodes.map((e) => e.title).join(" ").toLowerCase();
  const dict: Record<string, string> = {
    商业: "商业财经",
    创业: "创业投资",
    投资: "投资理财",
    科技: "科技数码",
    AI: "AI/科技",
    历史: "历史文化",
    心理: "心理成长",
    生活: "生活方式",
    职场: "职场成长",
    访谈: "深度访谈",
    电影: "影视娱乐",
  };
  for (const [k, v] of Object.entries(dict)) {
    if (text.includes(k.toLowerCase())) tags.add(v);
  }
  return Array.from(tags).slice(0, 8);
}

function scorePodcast(input: {
  episodeCount: number;
  updateFreqDays: number | null;
  daysSinceLatest: number;
  avgDuration: number | null;
  hasApple: boolean;
}) {
  // Activity: 频率越高、最近更新越快越高
  let activity = 50;
  if (input.updateFreqDays != null) {
    if (input.updateFreqDays <= 3) activity += 30;
    else if (input.updateFreqDays <= 7) activity += 20;
    else if (input.updateFreqDays <= 14) activity += 5;
    else activity -= 15;
  }
  if (input.daysSinceLatest <= 7) activity += 15;
  else if (input.daysSinceLatest <= 30) activity += 5;
  else if (input.daysSinceLatest > 90) activity -= 25;
  activity = Math.max(0, Math.min(100, activity));

  // Growth: 集数 + 持续运营
  let growth = 40;
  if (input.episodeCount >= 100) growth += 30;
  else if (input.episodeCount >= 50) growth += 20;
  else if (input.episodeCount >= 20) growth += 10;
  if (input.daysSinceLatest <= 14) growth += 20;
  if (input.hasApple) growth += 10;
  growth = Math.max(0, Math.min(100, growth));

  // Commercial: 时长 + 活跃 + 平台覆盖
  let commercial = 30;
  if (input.avgDuration && input.avgDuration >= 25) commercial += 20;
  if (input.avgDuration && input.avgDuration >= 45) commercial += 10;
  commercial += Math.round(activity * 0.3);
  commercial += Math.round(growth * 0.2);
  if (input.hasApple) commercial += 8;
  commercial = Math.max(0, Math.min(100, commercial));

  let lifecycle = "成长期";
  if (input.episodeCount < 10) lifecycle = "萌芽期";
  else if (input.daysSinceLatest > 90) lifecycle = "停更/沉寂";
  else if (input.episodeCount >= 100 && activity >= 70) lifecycle = "成熟期";
  else if (input.episodeCount >= 50) lifecycle = "稳定期";

  return { activity, growth, commercial, lifecycle };
}

export const ingestPodcast = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        rssUrl: z.string().url().max(2048),
        market: z.enum(["cn", "na"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<IngestPodcastResult> => {
    const rssUrl = data.rssUrl;
    const market = data.market ?? "cn";
    const rssFetch = await fetchRssContent(rssUrl);
    if (!rssFetch.ok) {
      return {
        ok: false,
        error: rssFetch.blockedSource
          ? `无法获取 RSS（HTTP ${rssFetch.status}），该源可能限制了服务器访问；已尝试代理抓取但仍失败，请换一个镜像/官方地址再试`
          : `无法获取 RSS（HTTP ${rssFetch.status}），链接可能已失效或返回了非 RSS 内容，请检查地址后重试`,
        status: rssFetch.status,
        source: rssFetch.source,
        blockedSource: rssFetch.blockedSource,
        fallbackTried: rssFetch.fallbackTried,
        podcastId: null,
      };
    }

    const xml = rssFetch.xml;
    const doc = parser.parse(xml);
    const channel = doc?.rss?.channel ?? doc?.feed;
    if (!channel) throw new Error("RSS 格式无法识别");

    const title = String(channel.title ?? "").trim() || "未命名播客";
    const author = String(channel["itunes:author"] ?? channel.author ?? "").trim();
    const description = String(channel.description ?? channel["itunes:summary"] ?? "").trim();
    const image =
      channel["itunes:image"]?.["@_href"] ??
      channel.image?.url ??
      channel.image?.["@_href"] ??
      null;
    const language = String(channel.language ?? "zh-cn");
    const cats = asArray(channel["itunes:category"] as unknown);
    const category =
      (cats[0] as { "@_text"?: string })?.["@_text"] ?? null;

    const items = asArray(channel.item ?? channel.entry);
    const episodes = items
      .map((it: Record<string, unknown>) => {
        const pub = it.pubDate ?? it.published ?? it["dc:date"];
        const d = pub ? new Date(String(pub)) : null;
        const enclosure = it.enclosure as { "@_url"?: string } | undefined;
        return {
          guid: String((it.guid as { "#text"?: string })?.["#text"] ?? it.guid ?? it.id ?? "") || null,
          title: String(it.title ?? "").trim(),
          description: String(it.description ?? it.summary ?? "").trim().slice(0, 2000),
          pub_date: d && !isNaN(d.getTime()) ? d.toISOString() : null,
          duration_seconds: parseDuration(it["itunes:duration"]),
          audio_url: enclosure?.["@_url"] ?? null,
        };
      })
      .filter((e) => e.title);

    const sortedDates = episodes
      .map((e) => (e.pub_date ? new Date(e.pub_date).getTime() : null))
      .filter((x): x is number => x != null)
      .sort((a, b) => b - a);

    const latest = sortedDates[0] ?? null;
    const first = sortedDates[sortedDates.length - 1] ?? null;
    const daysSinceLatest = latest ? (Date.now() - latest) / 86400000 : 9999;

    let updateFreqDays: number | null = null;
    if (sortedDates.length >= 3) {
      const gaps: number[] = [];
      for (let i = 0; i < Math.min(sortedDates.length - 1, 20); i++) {
        gaps.push((sortedDates[i] - sortedDates[i + 1]) / 86400000);
      }
      updateFreqDays =
        Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10;
    }

    const durations = episodes
      .map((e) => e.duration_seconds)
      .filter((x): x is number => x != null && x > 0);
    const avgDurationMin = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60)
      : null;

    // Apple lookup
    let apple = await lookupAppleByFeed(rssUrl);
    if (!apple && title) apple = await lookupAppleByTitle(title);
    const itunesId = apple?.collectionId ? String(apple.collectionId) : null;
    const itunesUrl = (apple?.collectionViewUrl as string | undefined) ?? null;

    const tags = deriveTags(channel, episodes);
    const scores = scorePodcast({
      episodeCount: episodes.length,
      updateFreqDays,
      daysSinceLatest,
      avgDuration: avgDurationMin,
      hasApple: !!apple,
    });

    const upsertRow = {
      rss_url: rssUrl,
      title,
      author,
      description: description.slice(0, 2000),
      image_url: image,
      itunes_id: itunesId,
      itunes_url: itunesUrl,
      category,
      language,
      market,
      latest_episode_at: latest ? new Date(latest).toISOString() : null,
      first_episode_at: first ? new Date(first).toISOString() : null,
      episode_count: episodes.length,
      update_frequency_days: updateFreqDays,
      avg_duration_minutes: avgDurationMin,
      commercial_score: scores.commercial,
      activity_score: scores.activity,
      growth_score: scores.growth,
      lifecycle_stage: scores.lifecycle,
      audience_tags: tags,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: pod, error } = await supabaseAdmin
      .from("podcasts")
      .upsert(upsertRow, { onConflict: "rss_url" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    // Replace episodes (limit 100)
    const epRows = episodes.slice(0, 100).map((e) => ({
      podcast_id: pod.id,
      guid: e.guid || `${pod.id}:${e.title}`,
      title: e.title,
      description: e.description,
      pub_date: e.pub_date,
      duration_seconds: e.duration_seconds,
      audio_url: e.audio_url,
    }));
    if (epRows.length) {
      await supabaseAdmin
        .from("episodes")
        .upsert(epRows, { onConflict: "podcast_id,guid" });
    }

    // Snapshot for trend — include real platform metrics + compute daily play delta
    const xySubs = (pod as { xiaoyuzhou_subscribers?: number | null }).xiaoyuzhou_subscribers ?? null;
    const xmPlays = (pod as { ximalaya_plays?: number | null }).ximalaya_plays ?? null;
    let dailyDelta: number | null = null;
    if (xmPlays != null) {
      const { data: prev } = await supabaseAdmin
        .from("snapshots")
        .select("ximalaya_plays,taken_at")
        .eq("podcast_id", pod.id)
        .not("ximalaya_plays", "is", null)
        .order("taken_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (prev?.ximalaya_plays != null && prev.taken_at) {
        const days = Math.max(
          1,
          (Date.now() - new Date(prev.taken_at).getTime()) / 86400000,
        );
        dailyDelta = Math.round(Math.max(0, xmPlays - prev.ximalaya_plays) / days);
      }
    }
    await supabaseAdmin.from("snapshots").insert({
      podcast_id: pod.id,
      episode_count: episodes.length,
      estimated_reviews: Math.round(
        episodes.length * 8 + scores.activity * 3 + scores.growth * 2,
      ),
      estimated_subscribers: Math.round(
        episodes.length * 120 + scores.growth * 250 + scores.commercial * 80,
      ),
      xiaoyuzhou_subscribers: xySubs,
      ximalaya_plays: xmPlays,
      daily_play_delta: dailyDelta,
    });

    return { ok: true, podcastId: pod.id as string, source: rssFetch.source };
  });

export const listPodcasts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        brand: z.string().trim().max(100).optional().nullable(),
        category: z.string().trim().max(100).optional().nullable(),
        market: z.enum(["cn", "na"]).optional().nullable(),
      })
      .partial()
      .optional()
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const brand = data?.brand?.trim();
    const category = data?.category?.trim();
    const market = data?.market ?? "cn";

    let podcastIds: string[] | null = null;
    if (brand) {
      const { data: br, error: brErr } = await supabaseAdmin
        .from("brand_recommendations")
        .select("podcast_id")
        .ilike("brand_name", `%${brand}%`);
      if (brErr) throw new Error(brErr.message);
      podcastIds = Array.from(new Set((br ?? []).map((r) => r.podcast_id)));
      if (podcastIds.length === 0) return { podcasts: [] };
    }

    let q = supabaseAdmin
      .from("podcasts")
      .select(
        "id,title,author,image_url,category,episode_count,latest_episode_at,update_frequency_days,commercial_score,activity_score,growth_score,lifecycle_stage,audience_tags,market,xiaoyuzhou_subscribers,ximalaya_plays",
      )
      .eq("market", market)
      .order("commercial_score", { ascending: false })
      .limit(100);
    if (podcastIds) q = q.in("id", podcastIds);
    if (category) q = q.ilike("category", `%${category}%`);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { podcasts: rows ?? [] };
  });

export const listBrandCategories = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await supabaseAdmin
      .from("brand_recommendations")
      .select("category")
      .not("category", "is", null)
      .limit(500);
    if (error) throw new Error(error.message);
    const counts = new Map<string, number>();
    for (const r of data ?? []) {
      const c = (r.category ?? "").trim();
      if (!c) continue;
      counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const categories = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([name, count]) => ({ name, count }));
    return { categories };
  },
);

export const getPodcastDetail = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const [podRes, epRes, snapRes] = await Promise.all([
      supabaseAdmin.from("podcasts").select("*").eq("id", data.id).single(),
      supabaseAdmin
        .from("episodes")
        .select("id,title,pub_date,duration_seconds")
        .eq("podcast_id", data.id)
        .order("pub_date", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("snapshots")
        .select("taken_at,episode_count,estimated_reviews,estimated_subscribers,xiaoyuzhou_subscribers,ximalaya_plays,daily_play_delta")
        .eq("podcast_id", data.id)
        .order("taken_at", { ascending: true })
        .limit(60),
    ]);
    if (podRes.error) throw new Error(podRes.error.message);
    return {
      podcast: podRes.data,
      episodes: epRes.data ?? [],
      snapshots: snapRes.data ?? [],
    };
  });
