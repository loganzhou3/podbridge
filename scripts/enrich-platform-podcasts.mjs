import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const METRICS_MARKER = "\n\n---PODBRIDGE_PLATFORM_METRICS---\n";

function loadEnv(file = ".env") {
  const env = {};
  if (!fs.existsSync(file)) return { ...process.env };
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const i = s.indexOf("=");
    if (i < 0) continue;
    let value = s.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[s.slice(0, i)] = value;
  }
  return { ...env, ...process.env };
}

function argValue(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

const limit = Number(argValue("--limit") ?? 0) || Infinity;
const offset = Number(argValue("--offset") ?? 0) || 0;
const concurrency = Math.max(1, Math.min(12, Number(argValue("--concurrency") ?? 4) || 4));
const platformFilter = argValue("--platform");
const retryFailed = process.argv.includes("--retry-failed");
const onlyFailed = process.argv.includes("--only-failed");
const refreshAll = process.argv.includes("--refresh-all");
const delayMs = Math.max(0, Number(argValue("--delay-ms") ?? 0) || 0);
const retryDelayMs = Math.max(1000, Number(argValue("--retry-delay-ms") ?? 45000) || 45000);
const maxAttempts = Math.max(1, Math.min(5, Number(argValue("--attempts") ?? 3) || 3));

class HttpStatusError extends Error {
  constructor(status, url) {
    super(`HTTP ${status}`);
    this.name = "HttpStatusError";
    this.status = status;
    this.url = url;
    this.retryable = status === 403 || status === 408 || status === 425 || status === 429 || status >= 500;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    if (!cleaned) return null;
    const n = Number(cleaned[0]);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  return null;
}

function stripHtml(value) {
  if (typeof value !== "string") return null;
  return (
    value
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim() || null
  );
}

function cleanUrl(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractXyzPid(url) {
  return url?.match(/xiaoyuzhoufm\.com\/podcast\/([a-z0-9]+)/i)?.[1] ?? null;
}

function extractXmlyAlbumId(url) {
  return url?.match(/ximalaya\.com\/(?:album|podcast)\/(\d+)/i)?.[1] ?? null;
}

async function fetchText(url, headers = {}) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/json,text/plain;q=0.9,*/*;q=0.5",
      ...headers,
    },
    redirect: "follow",
  });
  if (!res.ok) throw new HttpStatusError(res.status, url);
  return res.text();
}

async function fetchJson(url, headers = {}) {
  const text = await fetchText(url, {
    Accept: "application/json,text/plain;q=0.9,*/*;q=0.5",
    ...headers,
  });
  return JSON.parse(text);
}

let xyzBuildId = null;
async function getXyzBuildId(sampleUrl) {
  if (xyzBuildId) return xyzBuildId;
  const html = await fetchText(sampleUrl);
  xyzBuildId = html.match(/"buildId":"([^"]+)"/)?.[1] ?? null;
  if (!xyzBuildId) {
    const nextData = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
    )?.[1];
    xyzBuildId = nextData ? JSON.parse(nextData).buildId : null;
  }
  if (!xyzBuildId) throw new Error("小宇宙 buildId 解析失败");
  return xyzBuildId;
}

function weekKey(date) {
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return null;
  const monday = new Date(d);
  monday.setUTCHours(0, 0, 0, 0);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return monday.toISOString().slice(0, 10);
}

function buildWeeklyTrend(episodes) {
  const now = Date.now();
  const start = new Date(now - 25 * 7 * 86400000);
  const buckets = new Map();
  for (let i = 0; i < 26; i++) {
    const d = new Date(start.getTime() + i * 7 * 86400000);
    buckets.set(weekKey(d), { week: weekKey(d), episodes: 0, comments: 0, plays: 0 });
  }
  for (const ep of episodes) {
    const t = new Date(ep.pubDate ?? "").getTime();
    if (!Number.isFinite(t)) continue;
    const weeksAgo = Math.floor((now - t) / (7 * 86400000));
    if (weeksAgo < 0 || weeksAgo > 25) continue;
    const key = weekKey(ep.pubDate);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.episodes += 1;
    bucket.comments += ep.commentCount ?? 0;
    bucket.plays += ep.playCount ?? 0;
  }
  return [...buckets.values()];
}

function averageUpdateDays(episodes) {
  const times = episodes
    .map((ep) => new Date(ep.pubDate ?? "").getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a);
  if (times.length < 2) return null;
  const gaps = [];
  for (let i = 0; i < Math.min(times.length - 1, 19); i++) {
    gaps.push((times[i] - times[i + 1]) / 86400000);
  }
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return Number.isFinite(avg) ? Math.round(avg * 10) / 10 : null;
}

function appendEpisodeMetrics(description, metrics) {
  const cleanDescription = String(description ?? "").split(METRICS_MARKER)[0].trim();
  return `${cleanDescription}${METRICS_MARKER}${JSON.stringify(metrics)}`.slice(0, 20000);
}

function parseMetricsNotes(value) {
  if (!value || typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return { previous_metrics_notes: value.slice(0, 1200) };
  }
}

async function scrapeXiaoyuzhou(url) {
  const pid = extractXyzPid(url);
  if (!pid) throw new Error("无法识别小宇宙 pid");
  const buildId = await getXyzBuildId(url);
  const payload = await fetchJson(
    `https://www.xiaoyuzhoufm.com/_next/data/${buildId}/podcast/${pid}.json`,
  );
  const podcast = payload?.pageProps?.podcast;
  if (!podcast) throw new Error("小宇宙节目数据无法解析");
  const podcasters = Array.isArray(podcast.podcasters) ? podcast.podcasters : [];
  const hostNames = podcasters
    .map((p) => p?.nickname)
    .filter((name) => typeof name === "string" && name.trim());
  const episodes = (Array.isArray(podcast.episodes) ? podcast.episodes : []).map((ep) => ({
    platform: "xiaoyuzhou",
    platformEpisodeId: ep.eid ? String(ep.eid) : null,
    guid: ep.eid ? `xiaoyuzhou:${ep.eid}` : `xiaoyuzhou:${pid}:${ep.title}`,
    title: typeof ep.title === "string" ? ep.title.trim() : null,
    description: stripHtml(ep.description),
    pubDate: ep.pubDate ?? null,
    durationSeconds: asNumber(ep.duration),
    audioUrl: cleanUrl(ep.enclosure?.url),
    imageUrl: cleanUrl(ep.image?.picUrl ?? ep.image?.largePicUrl),
    playCount: asNumber(ep.playCount),
    commentCount: asNumber(ep.commentCount ?? ep.commentsCount),
  }));
  const totalComments = episodes.reduce((sum, ep) => sum + (ep.commentCount ?? 0), 0);
  const totalPlays = asNumber(podcast.playTime);

  return {
    platform: "xiaoyuzhou",
    title: typeof podcast.title === "string" ? podcast.title.trim() : null,
    author:
      hostNames.join("、") || (typeof podcast.author === "string" ? podcast.author.trim() : null),
    description: stripHtml(podcast.description ?? podcast.brief),
    imageUrl: cleanUrl(podcast.image?.picUrl ?? podcast.image?.largePicUrl),
    subscribers: asNumber(podcast.subscriptionCount),
    comments: totalComments || null,
    plays: totalPlays,
    episodeCount: asNumber(podcast.episodeCount),
    latestEpisodeAt: podcast.latestEpisodePubDate ?? episodes[0]?.pubDate ?? null,
    episodes,
    episodeLimitReason:
      episodes.length < 20 ? "xiaoyuzhou_public_page_currently_exposes_15_episodes" : null,
  };
}

async function scrapeXimalaya(url) {
  const albumId = extractXmlyAlbumId(url);
  if (!albumId) throw new Error("无法识别喜马拉雅 albumId");
  const [albumPayload, tracksPayload] = await Promise.all([
    fetchJson(
      `https://mobile.ximalaya.com/mobile/v1/album?device=android&albumId=${encodeURIComponent(albumId)}`,
    ),
    fetchJson(
      `https://mobile.ximalaya.com/mobile/v1/album/track?device=android&albumId=${encodeURIComponent(albumId)}&pageId=1&pageSize=20`,
    ),
  ]);
  const album = albumPayload?.data?.album;
  const user = albumPayload?.data?.user;
  if (albumPayload?.ret !== 0 || !album) throw new Error(albumPayload?.msg || "喜马拉雅专辑数据为空");

  const episodes = (Array.isArray(tracksPayload?.data?.list) ? tracksPayload.data.list : []).map(
    (track) => ({
      platform: "ximalaya",
      platformEpisodeId: track.trackId ? String(track.trackId) : null,
      guid: track.trackId ? `ximalaya:${track.trackId}` : `ximalaya:${albumId}:${track.title}`,
      title: typeof track.title === "string" ? track.title.trim() : null,
      description: stripHtml(track.intro),
      pubDate: track.createdAt ? new Date(track.createdAt).toISOString() : null,
      durationSeconds: asNumber(track.duration),
      audioUrl: null,
      imageUrl: cleanUrl(track.coverLarge ?? track.coverMiddle ?? track.coverSmall),
      playCount: asNumber(track.playtimes),
      commentCount: asNumber(track.comments ?? track.commentCount ?? track.commentsCount),
    }),
  );

  return {
    platform: "ximalaya",
    title: typeof album.title === "string" ? album.title.trim() : null,
    author:
      (typeof album.nickname === "string" && album.nickname.trim()) ||
      (typeof user?.nickname === "string" && user.nickname.trim()) ||
      null,
    description:
      stripHtml(album.intro) ||
      stripHtml(album.shortIntro) ||
      stripHtml(album.introRich) ||
      stripHtml(album.customSubTitle),
    imageUrl: cleanUrl(album.coverLarge ?? album.coverWebLarge ?? album.detailCoverPath),
    subscribers: asNumber(album.subscribeCount),
    comments: asNumber(album.unReadAlbumCommentCount),
    plays: asNumber(album.playTimes),
    episodeCount: asNumber(album.tracks ?? album.totalTrackCount),
    latestEpisodeAt: album.lastUptrackAt ? new Date(album.lastUptrackAt).toISOString() : episodes[0]?.pubDate,
    episodes,
    episodeLimitReason: null,
  };
}

async function getExistingSnapshot(supabase, podcastId) {
  const { data } = await supabase
    .from("snapshots")
    .select("taken_at,estimated_subscribers,xiaoyuzhou_subscribers,ximalaya_plays")
    .eq("podcast_id", podcastId)
    .order("taken_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function enrichOne(supabase, pod) {
  const sourceUrl =
    platformFilter === "ximalaya"
      ? pod.ximalaya_url
      : platformFilter === "xiaoyuzhou"
        ? pod.xiaoyuzhou_url
        : pod.xiaoyuzhou_url || pod.ximalaya_url;
  const platform = sourceUrl?.includes("xiaoyuzhoufm.com") ? "xiaoyuzhou" : "ximalaya";
  if (!sourceUrl) throw new Error("缺少平台 URL");

  const scraped =
    platform === "xiaoyuzhou" ? await scrapeXiaoyuzhou(sourceUrl) : await scrapeXimalaya(sourceUrl);
  const updateFrequencyDays = averageUpdateDays(scraped.episodes);
  const weeklyTrend = buildWeeklyTrend(scraped.episodes);
  const previousSnapshot = await getExistingSnapshot(supabase, pod.id);
  const now = new Date().toISOString();
  const previousNotes = parseMetricsNotes(pod.metrics_notes);
  const previousSubscribers =
    previousSnapshot?.estimated_subscribers ??
    previousSnapshot?.xiaoyuzhou_subscribers ??
    pod.xiaoyuzhou_subscribers ??
    pod.ximalaya_subscribers ??
    null;
  const subscriberDelta =
    scraped.subscribers != null && previousSubscribers != null
      ? scraped.subscribers - previousSubscribers
      : null;

  const platformUpdates =
    platform === "xiaoyuzhou"
      ? {
          xiaoyuzhou_subscribers: scraped.subscribers,
          xiaoyuzhou_comments: scraped.comments,
          xiaoyuzhou_episode_count: scraped.episodeCount,
        }
      : {
          ximalaya_subscribers: scraped.subscribers,
          ximalaya_comments: scraped.comments,
          ximalaya_plays: scraped.plays,
        };

  const metricsNotes = {
    ...previousNotes,
    platform_enrichment: {
      status: "ok",
      platform,
      source_url: sourceUrl,
      scraped_at: now,
      latest_episodes_written: scraped.episodes.length,
      requested_latest_episodes: 20,
      episode_limit_reason: scraped.episodeLimitReason,
      subscriber_current: scraped.subscribers,
      subscriber_previous: previousSubscribers,
      subscriber_delta: subscriberDelta,
      total_comments_observed: scraped.comments,
      total_plays_observed: scraped.plays,
      update_frequency_days_recent: updateFrequencyDays,
      weekly_trend_26w: weeklyTrend,
    },
  };

  const { error: podError } = await supabase
    .from("podcasts")
    .update({
      title: scraped.title ?? pod.title,
      author: scraped.author ?? pod.author,
      description: scraped.description ?? pod.description,
      image_url: scraped.imageUrl ?? pod.image_url,
      episode_count: scraped.episodeCount ?? pod.episode_count ?? 0,
      latest_episode_at: scraped.latestEpisodeAt ?? pod.latest_episode_at,
      update_frequency_days: updateFrequencyDays ?? pod.update_frequency_days,
      metrics_notes: JSON.stringify(metricsNotes).slice(0, 12000),
      metrics_updated_at: now,
      last_synced_at: now,
      updated_at: now,
      ...platformUpdates,
    })
    .eq("id", pod.id);
  if (podError) throw podError;

  const episodeRows = scraped.episodes.slice(0, 20).map((ep) => ({
    podcast_id: pod.id,
    guid: ep.guid,
    title: ep.title,
    description: appendEpisodeMetrics(ep.description, {
      platform,
      platform_episode_id: ep.platformEpisodeId,
      source_url: sourceUrl,
      image_url: ep.imageUrl,
      play_count: ep.playCount,
      comment_count: ep.commentCount,
      scraped_at: now,
    }),
    pub_date: ep.pubDate,
    duration_seconds: ep.durationSeconds,
    audio_url: ep.audioUrl,
  }));
  if (episodeRows.length) {
    const { error: epError } = await supabase
      .from("episodes")
      .upsert(episodeRows, { onConflict: "podcast_id,guid" });
    if (epError) throw epError;
  }

  const { error: snapError } = await supabase.from("snapshots").insert({
    podcast_id: pod.id,
    episode_count: scraped.episodeCount ?? null,
    estimated_subscribers: scraped.subscribers,
    xiaoyuzhou_subscribers: platform === "xiaoyuzhou" ? scraped.subscribers : null,
    ximalaya_plays: platform === "ximalaya" ? scraped.plays : null,
    daily_play_delta:
      platform === "ximalaya" &&
      scraped.plays != null &&
      previousSnapshot?.ximalaya_plays != null &&
      previousSnapshot?.taken_at
        ? Math.round(
            Math.max(0, scraped.plays - previousSnapshot.ximalaya_plays) /
              Math.max(1, (Date.now() - new Date(previousSnapshot.taken_at).getTime()) / 86400000),
          )
        : null,
  });
  if (snapError) throw snapError;

  return {
    id: pod.id,
    title: scraped.title ?? pod.title,
    platform,
    episodes: episodeRows.length,
    subscribers: scraped.subscribers,
    subscriberDelta,
    image: Boolean(scraped.imageUrl),
  };
}

async function enrichOneWithRetry(supabase, pod) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await enrichOne(supabase, pod);
    } catch (error) {
      lastError = error;
      if (!error?.retryable || attempt >= maxAttempts) break;
      const wait = retryDelayMs * attempt;
      console.log(
        JSON.stringify({
          retry: true,
          attempt,
          wait_ms: wait,
          id: pod.id,
          title: pod.title,
          message: error.message,
        }),
      );
      await sleep(wait);
    }
  }
  throw lastError;
}

async function fetchPodcastBatch(supabase) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; from < 100000; from += pageSize) {
    let query = supabase
      .from("podcasts")
      .select(
        "id,title,author,description,image_url,episode_count,latest_episode_at,update_frequency_days,metrics_notes,xiaoyuzhou_url,ximalaya_url,xiaoyuzhou_subscribers,ximalaya_subscribers,last_synced_at",
      )
      .eq("market", "cn")
      .order("last_synced_at", { ascending: true, nullsFirst: true })
      .range(from, from + pageSize - 1);
    if (platformFilter === "xiaoyuzhou") query = query.not("xiaoyuzhou_url", "is", null);
    else if (platformFilter === "ximalaya") query = query.not("ximalaya_url", "is", null);
    else query = query.or("xiaoyuzhou_url.not.is.null,ximalaya_url.not.is.null");

    if (refreshAll) {
      // Include previously enriched rows so scheduled jobs can refresh stale metrics.
    } else if (onlyFailed) {
      query = query.ilike("metrics_notes", '%"platform_enrichment":{"status":"failed"%');
    } else {
      query = query.not("metrics_notes", "ilike", '%"platform_enrichment":{"status":"ok"%');
      if (!retryFailed) {
        query = query.not("metrics_notes", "ilike", '%"platform_enrichment":{"status":"failed"%');
      }
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows.slice(offset, offset + limit);
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const podcasts = await fetchPodcastBatch(supabase);
  console.log(
    JSON.stringify({
      total: podcasts.length,
      offset,
      limit: Number.isFinite(limit) ? limit : "all",
      concurrency,
      platform: platformFilter ?? "auto",
      retryFailed,
      onlyFailed,
      refreshAll,
      delayMs,
      retryDelayMs,
      maxAttempts,
    }),
  );

  const result = { ok: 0, failed: 0, failures: [] };
  let cursor = 0;
  async function worker(workerId) {
    while (cursor < podcasts.length) {
      const index = cursor++;
      const pod = podcasts[index];
      if (delayMs > 0) await sleep(delayMs);
      try {
        const enriched = await enrichOneWithRetry(supabase, pod);
        result.ok += 1;
        console.log(JSON.stringify({ progress: index + 1, workerId, ok: true, ...enriched }));
      } catch (error) {
        result.failed += 1;
        const message = error?.message ?? String(error);
        if (result.failures.length < 50) {
          result.failures.push({ index, id: pod.id, title: pod.title, message });
        }
        const notes = {
          ...parseMetricsNotes(pod.metrics_notes),
          platform_enrichment: {
            status: "failed",
            scraped_at: new Date().toISOString(),
            error: message.slice(0, 800),
          },
        };
        await supabase
          .from("podcasts")
          .update({
            metrics_notes: JSON.stringify(notes).slice(0, 12000),
            metrics_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", pod.id);
        console.log(
          JSON.stringify({ progress: index + 1, workerId, ok: false, title: pod.title, message }),
        );
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i + 1)));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
