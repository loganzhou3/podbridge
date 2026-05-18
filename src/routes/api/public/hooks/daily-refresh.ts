import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ingestPodcast } from "@/lib/podcast.functions";
import { scrapePodcastPlatforms } from "@/lib/insights.functions";

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

        const results: Array<{ id: string; ok: boolean; scraped?: boolean; error?: string }> = [];
        for (const p of pods ?? []) {
          try {
            // 1) Scrape platform metrics first so snapshot captures current values
            let scraped = false;
            if (p.xiaoyuzhou_url || p.ximalaya_url) {
              try {
                await scrapePodcastPlatforms({ data: { podcastId: p.id } });
                scraped = true;
              } catch (e) {
                console.error("scrape failed", p.id, e);
              }
            }
            // 2) Re-ingest RSS — writes a fresh snapshot incl. daily delta
            await ingestPodcast({
              data: {
                rssUrl: p.rss_url,
                market: (p.market === "na" ? "na" : "cn") as "cn" | "na",
              },
            });
            results.push({ id: p.id, ok: true, scraped });
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
