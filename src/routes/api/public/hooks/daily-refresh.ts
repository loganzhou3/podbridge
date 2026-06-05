import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ingestPodcast } from "@/lib/podcast.functions";
import { refreshPodcastTracking } from "@/lib/insights.functions";

export const Route = createFileRoute("/api/public/hooks/daily-refresh")({
  server: {
    handlers: {
      POST: async () => {
        const { data: pods, error } = await supabaseAdmin
          .from("podcasts")
          .select("id,rss_url,market,xiaoyuzhou_url,ximalaya_url")
          .order("last_synced_at", { ascending: true })
          .limit(50);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        const results: Array<{ id: string; ok: boolean; tracked?: boolean; error?: string }> = [];
        for (const p of pods ?? []) {
          try {
            // 1) Discover (if needed) + scrape platforms + write snapshot
            let tracked = false;
            try {
              const r = await refreshPodcastTracking({ data: { podcastId: p.id } });
              tracked = r.ok;
            } catch (e) {
              console.error("track failed", p.id, e);
            }

            // 2) Re-ingest RSS if available — keeps RSS-derived fields fresh
            if (p.rss_url) {
              const ingestResult = await ingestPodcast({
                data: {
                  rssUrl: p.rss_url,
                  market: (p.market === "na" ? "na" : "cn") as "cn" | "na",
                },
              });
              if (ingestResult.ok === false) {
                results.push({ id: p.id, ok: false, tracked, error: ingestResult.error });
                continue;
              }
            }
            results.push({ id: p.id, ok: true, tracked });
          } catch (e) {
            results.push({
              id: p.id,
              ok: false,
              error: e instanceof Error ? e.message : "unknown",
            });
          }
        }
        return new Response(
          JSON.stringify({ refreshed: results.length, results }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
