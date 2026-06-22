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

function normalizeImageUrl(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      readTextValue(
        record.href ?? record.url ?? record.link ?? record["@_href"] ?? record["@_url"],
      ) || null
    );
  }
  return null;
}

function mapRss2JsonFeed(payload: Rss2JsonPayload) {
  const feed = payload.feed ?? {};
  const items = Array.isArray(payload.items) ? payload.items : [];

  return {
    channel: {
      title: readTextValue(feed.title),
      "itunes:author": readTextValue(feed.author),
      author: readTextValue(feed.author),
      description: readTextValue(feed.description),
      image: { url: normalizeImageUrl(feed.image) },
      language: readTextValue(feed.language),
      "itunes:category": readTextValue(feed.category)
        ? [{ "@_text": readTextValue(feed.category) }]
        : [],
      item: items.map((item) => ({
        guid: readTextValue(item.guid || item.link || item.title),
        title: readTextValue(item.title),
        description: readTextValue(item.description || item.content),
        pubDate: readTextValue(item.pubDate),
        "itunes:duration": readTextValue(item.duration),
        enclosure: {
          "@_url": readTextValue(item.enclosure || item.thumbnail || item.link),
        },
      })),
    },
  };
}

function extractXimalayaAlbumId(value: string) {
  return value.match(/ximalaya\.com\/(?:album|podcast)\/(\d+)/i)?.[1] ?? null;
}

function extractPlatformUrlsFromText(text: string) {
  const xiaoyuzhouMatch = text.match(/https?:\/\/www\.xiaoyuzhoufm\.com\/podcast\/[a-z0-9]+/i);
  const ximalayaId = extractXimalayaAlbumId(text);
  return {
    xiaoyuzhouUrl: xiaoyuzhouMatch?.[0]?.replace(/^http:/i, "https:") ?? null,
    ximalayaUrl: ximalayaId ? `https://www.ximalaya.com/album/${ximalayaId}` : null,
  };
}

function mergePlatformUrls(...values: Array<unknown>) {
  const combined = values
    .map((value) => (typeof value === "string" ? value : value == null ? "" : JSON.stringify(value)))
    .join("\n");
  return extractPlatformUrlsFromText(combined);
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
        const payload = (await res.json().catch(() => null)) as {
          contents?: string;
          status?: { http_code?: number };
        } | null;
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
  const text = episodes
    .map((e) => e.title)
    .join(" ")
    .toLowerCase();
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

    try {
      const doc =
        rssFetch.format === "xml" ? parser.parse(rssFetch.xml) : mapRss2JsonFeed(rssFetch.payload);
      const channel = doc?.rss?.channel ?? doc?.feed;
      if (!channel) {
        return {
          ok: false,
          error: "RSS 内容无法识别，返回的可能是网页而不是播客源，请换一个官方 RSS 地址再试",
          status: 422,
          source: rssFetch.source,
          blockedSource: false,
          fallbackTried: rssFetch.source !== "direct",
          podcastId: null,
        };
      }

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
      const category = (cats[0] as { "@_text"?: string })?.["@_text"] ?? null;

      const items = asArray(channel.item ?? channel.entry);
      const episodes = items
        .map((it: Record<string, unknown>) => {
          const pub = it.pubDate ?? it.published ?? it["dc:date"];
          const d = pub ? new Date(String(pub)) : null;
          const enclosure = it.enclosure as { "@_url"?: string } | undefined;
          return {
            guid:
              String((it.guid as { "#text"?: string })?.["#text"] ?? it.guid ?? it.id ?? "") ||
              null,
            title: String(it.title ?? "").trim(),
            description: String(it.description ?? it.summary ?? "")
              .trim()
              .slice(0, 2000),
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
        updateFreqDays = Math.round((gaps.reduce((a, b) => a + b, 0) / gaps.length) * 10) / 10;
      }

      const durations = episodes
        .map((e) => e.duration_seconds)
        .filter((x): x is number => x != null && x > 0);
      const avgDurationMin = durations.length
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60)
        : null;

      let apple = await lookupAppleByFeed(rssUrl);
      if (!apple && title) apple = await lookupAppleByTitle(title);
      const itunesId = apple?.collectionId ? String(apple.collectionId) : null;
      const itunesUrl = (apple?.collectionViewUrl as string | undefined) ?? null;
      const platformUrls = mergePlatformUrls(
        rssUrl,
        rssFetch.format === "xml" ? rssFetch.xml : rssFetch.payload,
        channel.link,
        description,
        itunesUrl,
      );

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
        ...(platformUrls.xiaoyuzhouUrl ? { xiaoyuzhou_url: platformUrls.xiaoyuzhouUrl } : {}),
        ...(platformUrls.ximalayaUrl ? { ximalaya_url: platformUrls.ximalayaUrl } : {}),
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
        await supabaseAdmin.from("episodes").upsert(epRows, { onConflict: "podcast_id,guid" });
      }

      const xySubs =
        (pod as { xiaoyuzhou_subscribers?: number | null }).xiaoyuzhou_subscribers ?? null;
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
          const days = Math.max(1, (Date.now() - new Date(prev.taken_at).getTime()) / 86400000);
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
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "播客导入失败，请稍后重试",
        status: 500,
        source: rssFetch.source,
        blockedSource: false,
        fallbackTried: rssFetch.source !== "direct",
        podcastId: null,
      };
    }
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

    const MAX_TOTAL = 100000;
    const PAGE = 1000;
    type PodcastListRow = {
      id: string;
      xiaoyuzhou_subscribers: number | null;
      ximalaya_subscribers: number | null;
      apple_subscribers: number | null;
      monthly_active_listeners: number | null;
      ximalaya_plays: number | null;
      [key: string]: unknown;
    };
    const all: PodcastListRow[] = [];
    for (let from = 0; from < MAX_TOTAL; from += PAGE) {
    let q = supabaseAdmin
        .from("podcasts")
        .select(
          "id,title,author,image_url,category,episode_count,latest_episode_at,update_frequency_days,commercial_score,activity_score,growth_score,lifecycle_stage,audience_tags,market,xiaoyuzhou_subscribers,ximalaya_subscribers,apple_subscribers,monthly_active_listeners,ximalaya_plays",
        )
        .eq("market", market)
        .order("commercial_score", { ascending: false })
        .range(from, from + PAGE - 1);
      if (podcastIds) q = q.in("id", podcastIds);
      if (category) q = q.ilike("category", `%${category}%`);
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      if (!rows || rows.length === 0) break;
      all.push(...rows);
      if (rows.length < PAGE) break;
    }

    const latestSnapshots = new Map<
      string,
      {
        estimated_subscribers: number | null;
        estimated_reviews: number | null;
        taken_at: string | null;
      }
    >();
    const ids = all.map((p) => p.id).filter(Boolean);
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const { data: snapshots, error } = await supabaseAdmin
        .from("snapshots")
        .select("podcast_id,estimated_subscribers,estimated_reviews,taken_at")
        .in("podcast_id", chunk)
        .order("taken_at", { ascending: false });
      if (error) throw new Error(error.message);
      for (const snapshot of snapshots ?? []) {
        if (!snapshot.podcast_id || latestSnapshots.has(snapshot.podcast_id)) continue;
        latestSnapshots.set(snapshot.podcast_id, {
          estimated_subscribers: snapshot.estimated_subscribers ?? null,
          estimated_reviews: snapshot.estimated_reviews ?? null,
          taken_at: snapshot.taken_at ?? null,
        });
      }
    }

    const withSubscriberCounts = all.map((p) => {
      const snapshot = latestSnapshots.get(p.id);
      const subscriberCount =
        p.xiaoyuzhou_subscribers ??
        p.ximalaya_subscribers ??
        p.apple_subscribers ??
        p.monthly_active_listeners ??
        snapshot?.estimated_subscribers ??
        null;
      const subscriberSource =
        p.xiaoyuzhou_subscribers != null
          ? "小宇宙"
          : p.ximalaya_subscribers != null
            ? "喜马拉雅"
            : p.apple_subscribers != null
              ? "Apple"
              : p.monthly_active_listeners != null
                ? "人工登记"
                : snapshot?.estimated_subscribers != null
                  ? "估算"
                  : null;
      return {
        ...p,
        estimated_subscribers: snapshot?.estimated_subscribers ?? null,
        estimated_reviews: snapshot?.estimated_reviews ?? null,
        subscriber_count: subscriberCount,
        subscriber_source: subscriberSource,
        subscriber_snapshot_at: snapshot?.taken_at ?? null,
      };
    });
    return { podcasts: withSubscriberCounts };
  });

export const listBrandCategories = createServerFn({ method: "GET" }).handler(async () => {
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
});

type OutreachWindow = {
  days: 7 | 14 | 30;
  subscriber_delta: number | null;
  subscriber_growth_pct: number | null;
  play_delta: number | null;
  episode_delta: number | null;
};

type OutreachOpportunity = {
  id: string;
  title: string | null;
  author: string | null;
  image_url: string | null;
  category: string | null;
  platform: "小宇宙" | "喜马拉雅" | "多平台" | "其他";
  platform_url: string | null;
  subscriber_count: number | null;
  ximalaya_plays: number | null;
  commercial_score: number;
  activity_score: number;
  growth_score: number;
  update_frequency_days: number | null;
  latest_episode_at: string | null;
  windows: OutreachWindow[];
  snapshot_count: number;
  last_snapshot_at: string | null;
  data_freshness_days: number | null;
  quality_score: number;
  performance_score: number;
  momentum_score: number;
  signal_level: "强信号" | "中信号" | "观察信号";
  outreach_priority: "高" | "中" | "观察";
  reason: string;
  suggested_action: string;
  evidence: string[];
};

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pct(delta: number | null, base: number | null) {
  if (delta == null || base == null || base <= 0) return null;
  return Math.round((delta / base) * 1000) / 10;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function daysSince(iso: string | null) {
  if (!iso) return 999;
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 86400000);
}

function fmtSignedCount(value: number | null) {
  if (value == null) return null;
  if (value >= 10000) return `+${(value / 10000).toFixed(1)}万`;
  return `+${value.toLocaleString()}`;
}

function w14Text(windows: OutreachWindow[]) {
  const w14 = windows.find((w) => w.days === 14);
  if (!w14) return null;
  if (w14.subscriber_delta != null) return `14天订阅 ${fmtSignedCount(w14.subscriber_delta)}`;
  if (w14.play_delta != null) return `14天播放 ${fmtSignedCount(w14.play_delta)}`;
  return null;
}

export async function buildOutreachOpportunities() {
  const { data: latestRun, error: latestRunError } = await supabaseAdmin
    .from("daily_refresh_runs")
    .select(
      "id,started_at,finished_at,status,trigger_source,discovered_count,discovery_attempts,refreshed_count,failed_count,error_message",
    )
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const refreshRun = latestRunError ? null : latestRun;

  const { data: topCommercialPods, error: commercialError } = await supabaseAdmin
    .from("podcasts")
    .select(
      "id,title,author,image_url,category,episode_count,latest_episode_at,update_frequency_days,commercial_score,activity_score,growth_score,audience_tags,market,xiaoyuzhou_url,xiaoyuzhou_subscribers,ximalaya_url,ximalaya_subscribers,ximalaya_plays",
    )
    .eq("market", "cn")
    .order("commercial_score", { ascending: false })
    .limit(300);
  if (commercialError) throw new Error(commercialError.message);

  const { data: topGrowthPods, error: growthError } = await supabaseAdmin
    .from("podcasts")
    .select(
      "id,title,author,image_url,category,episode_count,latest_episode_at,update_frequency_days,commercial_score,activity_score,growth_score,audience_tags,market,xiaoyuzhou_url,xiaoyuzhou_subscribers,ximalaya_url,ximalaya_subscribers,ximalaya_plays",
    )
    .eq("market", "cn")
    .order("growth_score", { ascending: false })
    .limit(300);
  if (growthError) throw new Error(growthError.message);

  const { data: topSubscriberPods, error: subscriberError } = await supabaseAdmin
    .from("podcasts")
    .select(
      "id,title,author,image_url,category,episode_count,latest_episode_at,update_frequency_days,commercial_score,activity_score,growth_score,audience_tags,market,xiaoyuzhou_url,xiaoyuzhou_subscribers,ximalaya_url,ximalaya_subscribers,ximalaya_plays",
    )
    .eq("market", "cn")
    .order("xiaoyuzhou_subscribers", { ascending: false, nullsFirst: false })
    .limit(300);
  if (subscriberError) throw new Error(subscriberError.message);

  const pods = Array.from(
    new Map(
      [...(topCommercialPods ?? []), ...(topGrowthPods ?? []), ...(topSubscriberPods ?? [])].map((p) => [
        p.id,
        p,
      ]),
    ).values(),
  ).slice(0, 700);

  const ids = (pods ?? []).map((p) => p.id).filter(Boolean);
  const since = new Date(Date.now() - 31 * 86400000).toISOString();
  const snapshotsByPodcast = new Map<
    string,
    Array<{
      taken_at: string;
      episode_count: number | null;
      estimated_subscribers: number | null;
      xiaoyuzhou_subscribers: number | null;
      ximalaya_plays: number | null;
    }>
  >();

  for (let i = 0; i < ids.length; i += 500) {
    const { data: snaps, error: snapError } = await supabaseAdmin
      .from("snapshots")
      .select("podcast_id,taken_at,episode_count,estimated_subscribers,xiaoyuzhou_subscribers,ximalaya_plays")
      .in("podcast_id", ids.slice(i, i + 500))
      .gte("taken_at", since)
      .order("taken_at", { ascending: true });
    if (snapError) {
      console.warn("[outreach-opportunities] snapshots unavailable", snapError.message);
      continue;
    }
    for (const snap of snaps ?? []) {
      const list = snapshotsByPodcast.get(snap.podcast_id) ?? [];
      list.push({
        taken_at: snap.taken_at,
        episode_count: snap.episode_count ?? null,
        estimated_subscribers: snap.estimated_subscribers ?? null,
        xiaoyuzhou_subscribers: snap.xiaoyuzhou_subscribers ?? null,
        ximalaya_plays: snap.ximalaya_plays ?? null,
      });
      snapshotsByPodcast.set(snap.podcast_id, list);
    }
  }

  const opportunities: OutreachOpportunity[] = (pods ?? []).map((p) => {
    const snapshots = snapshotsByPodcast.get(p.id) ?? [];
    const latestSnapshot = snapshots.at(-1) ?? null;
    const currentSubscribers =
      numberOrNull(p.xiaoyuzhou_subscribers) ??
      numberOrNull(p.ximalaya_subscribers) ??
      latestSnapshot?.estimated_subscribers ??
      null;
    const currentPlays = numberOrNull(p.ximalaya_plays) ?? latestSnapshot?.ximalaya_plays ?? null;
    const currentEpisodes = numberOrNull(p.episode_count);
    const dataFreshnessDays = latestSnapshot?.taken_at
      ? Math.round(daysSince(latestSnapshot.taken_at))
      : null;
    const hasCurrentPlatformMetric =
      currentSubscribers != null || currentPlays != null || currentEpisodes != null;

    const snapshotForWindow = (days: 7 | 14 | 30) => {
      const cutoff = Date.now() - days * 86400000;
      return (
        [...snapshots]
          .reverse()
          .find((s) => new Date(s.taken_at).getTime() <= cutoff) ??
        snapshots[0] ??
        null
      );
    };

    const windows: OutreachWindow[] = ([7, 14, 30] as const).map((days) => {
      const base = snapshotForWindow(days);
      const baseSubscribers =
        base?.xiaoyuzhou_subscribers ?? base?.estimated_subscribers ?? currentSubscribers;
      const subscriberDelta =
        currentSubscribers != null && baseSubscribers != null
          ? Math.max(0, currentSubscribers - baseSubscribers)
          : null;
      const playDelta =
        currentPlays != null && base?.ximalaya_plays != null
          ? Math.max(0, currentPlays - base.ximalaya_plays)
          : null;
      const episodeDelta =
        currentEpisodes != null && base?.episode_count != null
          ? Math.max(0, currentEpisodes - base.episode_count)
          : null;
      return {
        days,
        subscriber_delta: subscriberDelta,
        subscriber_growth_pct: pct(subscriberDelta, baseSubscribers),
        play_delta: playDelta,
        episode_delta: episodeDelta,
      };
    });

    const w7 = windows[0];
    const w30 = windows[2];
    const recentActivity =
      Math.max(0, 30 - daysSince(p.latest_episode_at ?? null)) +
      Math.max(0, 14 - (p.update_frequency_days ?? 14));
    const subscriberScale = Math.min(28, Math.log10(Math.max(currentSubscribers ?? 1, 1)) * 5);
    const playScale = Math.min(18, Math.log10(Math.max(currentPlays ?? 1, 1)) * 2.5);
    const growthVelocity =
      Math.min(26, (w7.subscriber_growth_pct ?? 0) * 4) +
      Math.min(18, (w30.subscriber_growth_pct ?? 0) * 1.6) +
      Math.min(16, Math.log10(Math.max((w30.play_delta ?? 0) + 1, 1)) * 3) +
      Math.min(14, (w30.episode_delta ?? 0) * 3);
    const performanceScore = clampScore(
      (p.commercial_score ?? 50) * 0.35 +
        (p.activity_score ?? 50) * 0.2 +
        (p.growth_score ?? 50) * 0.15 +
        subscriberScale +
        playScale +
        recentActivity * 0.5,
    );
    const momentumScore = clampScore(
      (p.growth_score ?? 50) * 0.25 +
        (p.activity_score ?? 50) * 0.2 +
        growthVelocity +
        recentActivity,
    );
    const hasRecentSnapshot = dataFreshnessDays != null && dataFreshnessDays <= 8;
    const updateCadenceScore = clampScore(100 - Math.min(80, (p.update_frequency_days ?? 21) * 4));
    const qualityScore = clampScore(
      performanceScore * 0.42 +
        momentumScore * 0.28 +
        (p.commercial_score ?? 50) * 0.18 +
        updateCadenceScore * 0.12 +
        (hasRecentSnapshot ? 6 : hasCurrentPlatformMetric ? 0 : -8),
    );
    const platform =
      p.xiaoyuzhou_url && p.ximalaya_url
        ? "多平台"
        : p.xiaoyuzhou_url
          ? "小宇宙"
          : p.ximalaya_url
            ? "喜马拉雅"
            : "其他";
    const platformUrl = p.xiaoyuzhou_url ?? p.ximalaya_url ?? null;
    const priorityScore = Math.max(qualityScore, performanceScore, momentumScore);
    const outreachPriority = priorityScore >= 78 ? "高" : priorityScore >= 62 ? "中" : "观察";
    const signalLevel =
      priorityScore >= 78 && snapshots.length >= 2
        ? "强信号"
        : priorityScore >= 62
          ? "中信号"
          : "观察信号";
    const growthText =
      w7.subscriber_growth_pct != null
        ? `7天订阅增长 ${w7.subscriber_growth_pct}%`
        : w30.play_delta != null
          ? `30天播放增长 ${w30.play_delta.toLocaleString()}`
          : `近30天更新 ${w30.episode_delta ?? 0} 集`;
    const evidence = [
      currentSubscribers != null ? `订阅 ${currentSubscribers.toLocaleString()}` : null,
      w7.subscriber_delta != null ? `7天订阅 ${fmtSignedCount(w7.subscriber_delta)}` : null,
      w14Text(windows),
      w30.play_delta != null ? `30天播放 ${fmtSignedCount(w30.play_delta)}` : null,
      w30.episode_delta != null ? `30天更新 +${w30.episode_delta} 集` : null,
      p.update_frequency_days != null ? `约 ${p.update_frequency_days} 天/更` : null,
      dataFreshnessDays != null ? `数据 ${dataFreshnessDays} 天前` : "当前平台数据",
    ].filter(Boolean) as string[];

    return {
      id: p.id,
      title: p.title ?? null,
      author: p.author ?? null,
      image_url: p.image_url ?? null,
      category: p.category ?? null,
      platform,
      platform_url: platformUrl,
      subscriber_count: currentSubscribers,
      ximalaya_plays: currentPlays,
      commercial_score: p.commercial_score ?? 0,
      activity_score: p.activity_score ?? 0,
      growth_score: p.growth_score ?? 0,
      update_frequency_days: p.update_frequency_days ?? null,
      latest_episode_at: p.latest_episode_at ?? null,
      windows,
      snapshot_count: snapshots.length,
      last_snapshot_at: latestSnapshot?.taken_at ?? null,
      data_freshness_days: dataFreshnessDays,
      quality_score: qualityScore,
      performance_score: performanceScore,
      momentum_score: momentumScore,
      signal_level: signalLevel,
      outreach_priority: outreachPriority,
      reason:
        qualityScore >= 78
          ? `综合质量高，${growthText}，适合优先询价建联`
          : performanceScore >= momentumScore
            ? `存量表现强，${growthText}，适合优先询价建联`
            : `增长势头较好，${growthText}，适合进入观察和试投池`,
      suggested_action:
        outreachPriority === "高"
          ? "本周优先建联，索要刊例、档期和历史转化案例"
          : outreachPriority === "中"
            ? "加入候选池，先询价并安排小预算测试"
            : "继续观察 7-14 天，等待增长或更新信号更明确",
      evidence,
    };
  });

  const topPerformance = [...opportunities]
    .sort((a, b) => b.performance_score - a.performance_score)
    .slice(0, 12);
  const promising = [...opportunities]
    .sort((a, b) => b.momentum_score - a.momentum_score)
    .slice(0, 12);
  const suggestedOutreach = [...new Map([...topPerformance, ...promising].map((p) => [p.id, p])).values()]
    .sort((a, b) => {
      const priority = { 高: 2, 中: 1, 观察: 0 };
      return (
        priority[b.outreach_priority] - priority[a.outreach_priority] ||
        Math.max(b.performance_score, b.momentum_score) - Math.max(a.performance_score, a.momentum_score)
      );
    })
    .slice(0, 18);

  return {
    generatedAt: new Date().toISOString(),
    windows: [7, 14, 30],
    latestRun: refreshRun ?? null,
    topPerformance,
    promising,
    suggestedOutreach,
  };
}

export const listOutreachOpportunities = createServerFn({ method: "GET" }).handler(
  buildOutreachOpportunities,
);

export const getPodcastDetail = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const [podRes, epRes, snapRes, contactRes, adProfileRes, competitorsRes, evidenceRes] = await Promise.all([
      supabaseAdmin.from("podcasts").select("*").eq("id", data.id).single(),
      supabaseAdmin
        .from("episodes")
        .select("id,guid,title,description,pub_date,duration_seconds,audio_url")
        .eq("podcast_id", data.id)
        .order("pub_date", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("snapshots")
        .select(
          "taken_at,episode_count,estimated_reviews,estimated_subscribers,xiaoyuzhou_subscribers,ximalaya_plays,daily_play_delta",
        )
        .eq("podcast_id", data.id)
        .order("taken_at", { ascending: true })
        .limit(60),
      supabaseAdmin
        .from("creator_contacts")
        .select("id,platform,profile_url,contact_name,contact_email,status,notes,updated_at")
        .eq("podcast_id", data.id)
        .order("updated_at", { ascending: false })
        .limit(20),
      supabaseAdmin.from("podcast_ad_profiles").select("*").eq("podcast_id", data.id).maybeSingle(),
      supabaseAdmin
        .from("competitor_campaigns")
        .select("*")
        .eq("podcast_id", data.id)
        .order("last_seen_at", { ascending: false })
        .limit(20),
      (supabaseAdmin as never as { from: (table: string) => ReturnType<typeof supabaseAdmin.from> })
        .from("podcast_source_evidence")
        .select("*")
        .eq("podcast_id", data.id)
        .order("captured_at", { ascending: false })
        .limit(30),
    ]);
    if (podRes.error) throw new Error(podRes.error.message);
    return {
      podcast: podRes.data,
      episodes: epRes.data ?? [],
      snapshots: snapRes.data ?? [],
      contacts: contactRes.data ?? [],
      adProfile: adProfileRes.error ? null : (adProfileRes.data ?? null),
      competitors: competitorsRes.data ?? [],
      evidence: evidenceRes.error ? [] : (evidenceRes.data ?? []),
    };
  });

export const updatePodcastMetrics = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        audience_persona: z.string().max(2000).nullable().optional(),
        audience_age_range: z.string().max(200).nullable().optional(),
        audience_gender_split: z.string().max(200).nullable().optional(),
        audience_geo: z.string().max(500).nullable().optional(),
        completion_rate: z.number().min(0).max(100).nullable().optional(),
        new_listener_retention: z.number().min(0).max(100).nullable().optional(),
        monthly_active_listeners: z.number().int().min(0).nullable().optional(),
        cpm_rate: z.number().min(0).nullable().optional(),
        metrics_notes: z.string().max(4000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { id, ...rest } = data;
    const { error } = await supabaseAdmin
      .from("podcasts")
      .update({ ...rest, metrics_updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ============================================================
// Search podcasts by name (uses Apple iTunes Search API)
// ============================================================
export const searchPodcasts = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        query: z.string().min(1).max(200),
        market: z.enum(["cn", "na"]).default("cn"),
        limit: z.number().int().min(1).max(25).default(15),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const country = data.market === "na" ? "US" : "CN";
    const url = `https://itunes.apple.com/search?media=podcast&country=${country}&limit=${data.limit}&term=${encodeURIComponent(
      data.query,
    )}`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": RSS_FETCH_HEADERS["User-Agent"] } });
      if (!res.ok) {
        return { ok: false as const, error: `搜索失败（HTTP ${res.status}）`, results: [] };
      }
      const json = (await res.json()) as {
        results?: Array<{
          collectionId?: number;
          trackId?: number;
          collectionName?: string;
          trackName?: string;
          artistName?: string;
          feedUrl?: string;
          artworkUrl600?: string;
          artworkUrl100?: string;
          primaryGenreName?: string;
          trackCount?: number;
          releaseDate?: string;
          country?: string;
          collectionViewUrl?: string;
        }>;
      };
      const results = (json.results ?? [])
        .filter((r) => !!r.feedUrl)
        .map((r) => ({
          id: String(r.collectionId ?? r.trackId ?? r.feedUrl),
          title: r.collectionName ?? r.trackName ?? "Unknown",
          author: r.artistName ?? "",
          feedUrl: r.feedUrl as string,
          artwork: r.artworkUrl600 ?? r.artworkUrl100 ?? null,
          genre: r.primaryGenreName ?? null,
          trackCount: r.trackCount ?? null,
          releaseDate: r.releaseDate ?? null,
          itunesUrl: r.collectionViewUrl ?? null,
        }));
      return { ok: true as const, results };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false as const, error: `搜索出错：${msg}`, results: [] };
    }
  });
