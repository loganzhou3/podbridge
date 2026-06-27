import fs from "node:fs";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 PodBridge/1.0";

function loadEnv(file = ".env") {
  const env = {};
  if (fs.existsSync(file)) {
    for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const [key, ...rest] = line.split("=");
      env[key] = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return { ...env, ...process.env };
}

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const env = loadEnv();
const SUPABASE_URL = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const limit = Number(argValue("--limit", "0")) || Infinity;
const offset = Number(argValue("--offset", "0")) || 0;
const concurrency = Math.max(1, Math.min(10, Number(argValue("--concurrency", "5")) || 5));
const dryRun = process.argv.includes("--dry-run");

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return null;
  const match = value.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*(万|w|W)?/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * (match[2] ? 10000 : 1));
}

async function rest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`, {
    method: options.method ?? "GET",
    headers: {
      apikey: SUPABASE_KEY,
      authorization: `Bearer ${SUPABASE_KEY}`,
      ...(options.headers ?? {}),
    },
    body: options.body,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function patchPodcast(id, updates) {
  if (dryRun) return [];
  return rest(`podcasts?id=eq.${id}&select=id`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify(updates),
  });
}

async function fetchText(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/rss+xml,application/json,*/*",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url, timeoutMs = 12000) {
  return JSON.parse(await fetchText(url, timeoutMs));
}

function xiaoyuzhouUrlFromRss(xml) {
  return (
    xml
      .match(/https?:\/\/(?:www\.)?xiaoyuzhoufm\.com\/podcast\/[a-z0-9]+/i)?.[0]
      ?.replace(/\?utm_source=rss.*/, "") ?? null
  );
}

function ximalayaUrlFromRssUrl(url) {
  const match = url?.match(/ximalaya\.com\/album\/(\d+)\.xml/i);
  return match ? `https://www.ximalaya.com/album/${match[1]}` : null;
}

function xiaoyuzhouPid(url) {
  return url?.match(/xiaoyuzhoufm\.com\/podcast\/([a-z0-9]+)/i)?.[1] ?? null;
}

function ximalayaAlbumId(url) {
  return url?.match(/ximalaya\.com\/(?:album|podcast)\/(\d+)/i)?.[1] ?? null;
}

let xiaoyuzhouBuildId = null;
async function getXiaoyuzhouBuildId(sampleUrl) {
  if (xiaoyuzhouBuildId) return xiaoyuzhouBuildId;
  const html = await fetchText(sampleUrl, 15000);
  xiaoyuzhouBuildId = html.match(/"buildId":"([^"]+)"/)?.[1] ?? null;
  if (!xiaoyuzhouBuildId) {
    const raw = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
    )?.[1];
    if (raw) xiaoyuzhouBuildId = JSON.parse(raw).buildId;
  }
  if (!xiaoyuzhouBuildId) throw new Error("Cannot resolve Xiaoyuzhou buildId");
  return xiaoyuzhouBuildId;
}

async function scrapeXiaoyuzhou(url) {
  const pid = xiaoyuzhouPid(url);
  if (!pid) return null;
  const buildId = await getXiaoyuzhouBuildId(url);
  const payload = await fetchJson(
    `https://www.xiaoyuzhoufm.com/_next/data/${buildId}/podcast/${pid}.json`,
  );
  const podcast = payload?.pageProps?.podcast;
  if (!podcast) return null;
  return {
    xiaoyuzhou_subscribers: asNumber(podcast.subscriptionCount),
    xiaoyuzhou_episode_count: asNumber(podcast.episodeCount),
    latest_episode_at: podcast.latestEpisodePubDate ?? null,
  };
}

async function scrapeXimalaya(url) {
  const albumId = ximalayaAlbumId(url);
  if (!albumId) return null;
  const payload = await fetchJson(
    `https://mobile.ximalaya.com/mobile/v1/album?device=android&albumId=${encodeURIComponent(
      albumId,
    )}`,
  );
  const album = payload?.data?.album;
  if (!album) return null;
  return {
    ximalaya_subscribers: asNumber(album.subscribeCount),
    ximalaya_plays: asNumber(album.playTimes),
    ximalaya_comments: asNumber(album.unReadAlbumCommentCount),
    latest_episode_at: album.lastUptrackAt ? new Date(album.lastUptrackAt).toISOString() : null,
  };
}

async function fetchPodcasts() {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; from < 100000; from += pageSize) {
    const batch = await rest(
      [
        "podcasts?",
        "market=eq.cn",
        "&select=id,title,rss_url,xiaoyuzhou_url,ximalaya_url,xiaoyuzhou_subscribers,ximalaya_subscribers,ximalaya_plays,latest_episode_at",
        `&offset=${from}`,
        `&limit=${pageSize}`,
      ].join(""),
    );
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows.slice(offset, Number.isFinite(limit) ? offset + limit : undefined);
}

async function runPool(items, worker) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async (_, workerId) => {
      while (cursor < items.length) {
        const index = cursor++;
        await worker(items[index], index, workerId);
        await sleep(120);
      }
    }),
  );
}

const podcasts = await fetchPodcasts();
const stats = {
  total: podcasts.length,
  derivedXiaoyuzhouUrls: 0,
  derivedXimalayaUrls: 0,
  enrichedXiaoyuzhou: 0,
  enrichedXimalaya: 0,
  failed: 0,
  failures: [],
};

console.log(
  JSON.stringify({
    phase: "loaded",
    total: podcasts.length,
    offset,
    limit: Number.isFinite(limit) ? limit : "all",
    concurrency,
    dryRun,
  }),
);

const urlTargets = podcasts.filter((podcast) => podcast.rss_url);
await runPool(urlTargets, async (podcast, index) => {
  try {
    const updates = { updated_at: new Date().toISOString() };
    if (!podcast.ximalaya_url) {
      const url = ximalayaUrlFromRssUrl(podcast.rss_url);
      if (url) {
        updates.ximalaya_url = url;
        podcast.ximalaya_url = url;
        stats.derivedXimalayaUrls += 1;
      }
    }
    if (!podcast.xiaoyuzhou_url && /feed\.xyzfm\.space/i.test(podcast.rss_url)) {
      const xml = await fetchText(podcast.rss_url);
      const url = xiaoyuzhouUrlFromRss(xml);
      if (url) {
        updates.xiaoyuzhou_url = url;
        podcast.xiaoyuzhou_url = url;
        stats.derivedXiaoyuzhouUrls += 1;
      }
    }
    if (Object.keys(updates).length > 1) await patchPodcast(podcast.id, updates);
  } catch (error) {
    stats.failed += 1;
    if (stats.failures.length < 50) {
      stats.failures.push({ id: podcast.id, title: podcast.title, message: error.message });
    }
  }
  if (index % 100 === 0) console.log(JSON.stringify({ phase: "urls", index, ...stats }));
});

const metricTargets = podcasts.filter(
  (podcast) =>
    (podcast.xiaoyuzhou_url && podcast.xiaoyuzhou_subscribers == null) ||
    (podcast.ximalaya_url &&
      podcast.ximalaya_subscribers == null &&
      podcast.ximalaya_plays == null),
);

await runPool(metricTargets, async (podcast, index) => {
  try {
    const updates = {
      updated_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
      metrics_updated_at: new Date().toISOString(),
    };
    if (podcast.xiaoyuzhou_url && podcast.xiaoyuzhou_subscribers == null) {
      const data = await scrapeXiaoyuzhou(podcast.xiaoyuzhou_url);
      if (data) {
        Object.assign(
          updates,
          Object.fromEntries(Object.entries(data).filter(([, value]) => value != null)),
        );
        stats.enrichedXiaoyuzhou += 1;
      }
    }
    if (
      podcast.ximalaya_url &&
      podcast.ximalaya_subscribers == null &&
      podcast.ximalaya_plays == null
    ) {
      const data = await scrapeXimalaya(podcast.ximalaya_url);
      if (data) {
        Object.assign(
          updates,
          Object.fromEntries(Object.entries(data).filter(([, value]) => value != null)),
        );
        stats.enrichedXimalaya += 1;
      }
    }
    if (Object.keys(updates).length > 3) await patchPodcast(podcast.id, updates);
  } catch (error) {
    stats.failed += 1;
    if (stats.failures.length < 50) {
      stats.failures.push({ id: podcast.id, title: podcast.title, message: error.message });
    }
  }
  if (index % 100 === 0) console.log(JSON.stringify({ phase: "metrics", index, ...stats }));
});

console.log(JSON.stringify({ phase: "done", ...stats }, null, 2));
