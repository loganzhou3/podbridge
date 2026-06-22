import { createFileRoute } from "@tanstack/react-router";
import { runDailyRefreshCore } from "@/lib/daily-refresh";

async function runDailyRefresh() {
  try {
    const payload = await runDailyRefreshCore("api");
    return new Response(JSON.stringify(payload), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export const Route = createFileRoute("/api/public/hooks/daily-refresh")({
  server: {
    handlers: {
      GET: runDailyRefresh,
      POST: runDailyRefresh,
    },
  },
});
