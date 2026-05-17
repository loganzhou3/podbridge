import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ingestPodcast } from "@/lib/podcast.functions";

export const Route = createFileRoute("/api/public/hooks/daily-refresh")({
  server: {
    handlers: {
      POST: async () => {
        const { data: pods, error } = await supabaseAdmin
          .from("podcasts")
          .select("id,rss_url")
          .order("last_synced_at", { ascending: true })
          .limit(50);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        for (const p of pods ?? []) {
          try {
            await ingestPodcast({ data: { rssUrl: p.rss_url } });
            results.push({ id: p.id, ok: true });
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
