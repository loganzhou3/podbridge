import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ingestPodcast } from "@/lib/podcast.functions";
import {
  ingestFromPlatformUrl,
  scrapePodcastPlatforms,
  searchPodcastsAllPlatforms,
} from "@/lib/insights.functions";

const DISCOVERY_SEEDS = [
  "播客",
  "小宇宙",
  "喜马拉雅播客",
  "中文播客",
  "商业",
  "财经",
  "投资",
  "消费",
  "品牌",
  "营销",
  "电商",
  "出海",
  "科技",
  "AI",
  "互联网",
  "产品经理",
  "创业",
  "职场",
  "职业",
  "管理",
  "人文",
  "历史",
  "文化",
  "读书",
  "社会",
  "女性",
  "情感",
  "生活方式",
  "健康",
  "医疗",
  "心理",
  "亲子",
  "母婴",
  "旅行",
  "城市",
  "音乐",
  "电影",
  "影视",
  "游戏",
  "体育",
  "圆桌",
  "访谈",
  "对谈",
  "脱口秀",
  "新闻",
  "热点",
  "教育",
  "留学",
  "英语",
  "法律",
  "艺术",
  "设计",
  "美食",
  "咖啡",
];

type RefreshSource = "manual" | "api" | "cron";
type DailyRefreshOptions = {
  seedCount?: number;
  searchLimit?: number;
  refreshLimit?: number;
  runDiscovery?: boolean;
  snapshotLimit?: number;
  discoveryImportLimit?: number;
};

type RefreshRunRow = {
  id: string;
};

function startOfShanghaiDayIso() {
  const now = new Date();
  const shanghaiNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
  shanghaiNow.setHours(0, 0, 0, 0);
  const utcTime = shanghaiNow.getTime() - 8 * 60 * 60 * 1000;
  return new Date(utcTime).toISOString();
}

async function createRefreshRun(source: RefreshSource, seeds: string[]) {
  const { data, error } = await supabaseAdmin
    .from("daily_refresh_runs")
    .insert({ trigger_source: source, seeds })
    .select("id")
    .single();
  if (error) {
    console.warn("[daily-refresh] Could not create refresh run", error.message);
    return null;
  }
  return data as RefreshRunRow;
}

async function finishRefreshRun(
  runId: string | null,
  payload: {
    status: "success" | "partial" | "failed";
    discoveryAttempts: number;
    discoveredCount: number;
    refreshedCount: number;
    failedCount: number;
    result: Record<string, unknown>;
    errorMessage?: string;
  },
) {
  if (!runId) return;
  const { error } = await supabaseAdmin
    .from("daily_refresh_runs")
    .update({
      finished_at: new Date().toISOString(),
      status: payload.status,
      discovery_attempts: payload.discoveryAttempts,
      discovered_count: payload.discoveredCount,
      refreshed_count: payload.refreshedCount,
      failed_count: payload.failedCount,
      result: payload.result,
      error_message: payload.errorMessage ?? null,
    })
    .eq("id", runId);
  if (error) console.warn("[daily-refresh] Could not finish refresh run", error.message);
}

async function registerDailySnapshotsForAllCn(limit: number) {
  const since = startOfShanghaiDayIso();
  let registered = 0;
  const pageSize = 1000;

  for (let from = 0; from < limit; from += pageSize) {
    const to = Math.min(from + pageSize - 1, limit - 1);
    const { data: pods, error } = await supabaseAdmin
      .from("podcasts")
      .select(
        "id,episode_count,xiaoyuzhou_subscribers,ximalaya_subscribers,ximalaya_plays,monthly_active_listeners,apple_subscribers",
      )
      .eq("market", "cn")
      .order("last_synced_at", { ascending: true, nullsFirst: true })
      .range(from, to);
    if (error) throw new Error(error.message);
    if (!pods?.length) break;

    const ids = pods.map((p) => p.id);
    const { data: existing } = await supabaseAdmin
      .from("snapshots")
      .select("podcast_id")
      .in("podcast_id", ids)
      .gte("taken_at", since);
    const alreadyRegistered = new Set((existing ?? []).map((row) => row.podcast_id));

    const rows = pods
      .filter((p) => !alreadyRegistered.has(p.id))
      .map((p) => ({
        podcast_id: p.id,
        episode_count: p.episode_count ?? null,
        estimated_subscribers:
          p.xiaoyuzhou_subscribers ??
          p.ximalaya_subscribers ??
          p.monthly_active_listeners ??
          p.apple_subscribers ??
          null,
        xiaoyuzhou_subscribers: p.xiaoyuzhou_subscribers ?? null,
        ximalaya_plays: p.ximalaya_plays ?? null,
      }));

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      if (!chunk.length) continue;
      const { error: insertError } = await supabaseAdmin.from("snapshots").insert(chunk);
      if (insertError) throw new Error(insertError.message);
      registered += chunk.length;
    }
    if (pods.length < pageSize) break;
  }

  return registered;
}

export async function runDailyRefreshCore(source: RefreshSource = "api", options: DailyRefreshOptions = {}) {
  const seedCount = options.seedCount ?? (source === "cron" ? 16 : 8);
  const searchLimit = options.searchLimit ?? (source === "cron" ? 24 : 12);
  const refreshLimit = options.refreshLimit ?? (source === "cron" ? 120 : 5);
  const runDiscovery = options.runDiscovery ?? true;
  const snapshotLimit = options.snapshotLimit ?? (source === "cron" ? 10000 : 500);
  const discoveryImportLimit = options.discoveryImportLimit ?? (source === "cron" ? 120 : 30);
  const seedIndex = Math.floor(Date.now() / 86400000) % DISCOVERY_SEEDS.length;
  const seeds = Array.from(
    { length: seedCount },
    (_, i) => DISCOVERY_SEEDS[(seedIndex + i) % DISCOVERY_SEEDS.length],
  );
  const run = await createRefreshRun(source, seeds);
  const discovered: Array<{ title: string; platform: string; ok: boolean; error?: string }> = [];
  const results: Array<{ id: string; ok: boolean; scraped?: boolean; rss?: boolean; error?: string }> = [];
  let registeredSnapshots = 0;
  let discoveryImports = 0;

  try {
    registeredSnapshots = await registerDailySnapshotsForAllCn(snapshotLimit);

    for (const seed of runDiscovery ? seeds : []) {
      try {
        const found = await searchPodcastsAllPlatforms({
          data: { query: seed, market: "cn", limit: searchLimit },
        });
        for (const hit of found.results) {
          if (discoveryImports >= discoveryImportLimit) break;
          try {
            let imported:
              | { ok: true; podcastId?: string | null; platform?: string }
              | { ok: false; error?: string; podcastId?: string | null };

            if (hit.platform === "apple" || hit.platform === "listen_notes") {
              if (!hit.feedUrl) continue;
              const { data: exists } = await supabaseAdmin
                .from("podcasts")
                .select("id")
                .eq("rss_url", hit.feedUrl)
                .limit(1);
              if (exists?.length) continue;
              imported = await ingestPodcast({ data: { rssUrl: hit.feedUrl, market: "cn" } });
            } else {
              const existsQuery =
                hit.platform === "xiaoyuzhou"
                  ? supabaseAdmin.from("podcasts").select("id").eq("xiaoyuzhou_url", hit.url).limit(1)
                  : supabaseAdmin.from("podcasts").select("id").eq("ximalaya_url", hit.url).limit(1);
              const { data: exists } = await existsQuery;
              if (exists?.length) continue;
              imported = await ingestFromPlatformUrl({ data: { url: hit.url, market: "cn" } });
            }
            if (imported.ok && imported.podcastId && (hit.xiaoyuzhouUrl || hit.ximalayaUrl)) {
              await supabaseAdmin
                .from("podcasts")
                .update({
                  ...(hit.xiaoyuzhouUrl ? { xiaoyuzhou_url: hit.xiaoyuzhouUrl } : {}),
                  ...(hit.ximalayaUrl ? { ximalaya_url: hit.ximalayaUrl } : {}),
                  updated_at: new Date().toISOString(),
                })
                .eq("id", imported.podcastId);
            }
            if (imported.ok) discoveryImports += 1;
            discovered.push({
              title: hit.title,
              platform: hit.platform,
              ok: imported.ok,
              error: imported.ok ? undefined : imported.error,
            });
          } catch (e) {
            discovered.push({
              title: hit.title,
              platform: hit.platform,
              ok: false,
              error: e instanceof Error ? e.message : "unknown",
            });
          }
        }
        if (discoveryImports >= discoveryImportLimit) break;
      } catch (e) {
        discovered.push({
          title: seed,
          platform: "seed",
          ok: false,
          error: e instanceof Error ? e.message : "unknown",
        });
      }
    }

    const { data: pods, error } = await supabaseAdmin
      .from("podcasts")
      .select("id,rss_url,market,xiaoyuzhou_url,ximalaya_url")
      .eq("market", "cn")
      .order("last_synced_at", { ascending: true, nullsFirst: true })
      .limit(refreshLimit);
    if (error) throw new Error(error.message);

    for (const p of pods ?? []) {
      try {
        let scraped = false;
        if (p.xiaoyuzhou_url || p.ximalaya_url) {
          try {
            await scrapePodcastPlatforms({ data: { podcastId: p.id } });
            scraped = true;
          } catch (e) {
            console.error("scrape failed", p.id, e);
          }
        }

        if (p.rss_url) {
          const ingestResult = await ingestPodcast({
            data: {
              rssUrl: p.rss_url,
              market: (p.market === "na" ? "na" : "cn") as "cn" | "na",
            },
          });
          if (ingestResult.ok === false) {
            results.push({ id: p.id, ok: false, scraped, rss: true, error: ingestResult.error });
            continue;
          }
          results.push({ id: p.id, ok: true, scraped, rss: true });
        } else {
          results.push({ id: p.id, ok: scraped, scraped, rss: false });
        }
      } catch (e) {
        results.push({
          id: p.id,
          ok: false,
          error: e instanceof Error ? e.message : "unknown",
        });
      }
    }

    const failedCount =
      discovered.filter((item) => !item.ok).length + results.filter((item) => !item.ok).length;
    const payload = {
      discovered: discovered.filter((item) => item.ok).length,
      discovery_attempts: discovered.length,
      refreshed: results.length,
      registered_snapshots: registeredSnapshots,
      failed: failedCount,
      seeds,
      discovered_results: discovered,
      refresh_results: results,
    };
    await finishRefreshRun(run?.id ?? null, {
      status: failedCount > 0 ? "partial" : "success",
      discoveryAttempts: discovered.length,
      discoveredCount: payload.discovered,
      refreshedCount: results.length,
      failedCount,
      result: payload,
    });
    return payload;
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    const payload = {
      discovered: discovered.filter((item) => item.ok).length,
      discovery_attempts: discovered.length,
      refreshed: results.length,
      registered_snapshots: registeredSnapshots,
      failed: discovered.filter((item) => !item.ok).length + results.filter((item) => !item.ok).length,
      seeds,
      discovered_results: discovered,
      refresh_results: results,
      error: message,
    };
    await finishRefreshRun(run?.id ?? null, {
      status: "failed",
      discoveryAttempts: discovered.length,
      discoveredCount: payload.discovered,
      refreshedCount: results.length,
      failedCount: payload.failed,
      result: payload,
      errorMessage: message,
    });
    throw e;
  }
}
