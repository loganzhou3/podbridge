import { createFileRoute } from "@tanstack/react-router";
import { buildDashboardPodcasts } from "@/lib/dashboard-podcasts";

async function getDashboardPodcasts({ request }: { request: Request }) {
  try {
    const url = new URL(request.url);
    const payload = await buildDashboardPodcasts({
      brand: url.searchParams.get("brand") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
    });
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

export const Route = createFileRoute("/api/public/dashboard-podcasts")({
  server: {
    handlers: {
      GET: getDashboardPodcasts,
    },
  },
});
