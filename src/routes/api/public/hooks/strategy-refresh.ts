import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateAdStrategy } from "@/lib/insights.functions";

// Auto re-generates AI strategy for the 5 podcasts whose strategy is most stale
// (or has never been generated). Called by pg_cron weekly.
export const Route = createFileRoute("/api/public/hooks/strategy-refresh")({
  server: {
    handlers: {
      POST: async () => {
        const { data: pods, error } = await supabaseAdmin
          .from("podcasts")
          .select("id,ai_strategy_at")
          .order("ai_strategy_at", { ascending: true, nullsFirst: true })
          .limit(5);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const results: Array<{ id: string; ok: boolean; error?: string }> = [];
        for (const p of pods ?? []) {
          try {
            await generateAdStrategy({ data: { podcastId: p.id } });
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
