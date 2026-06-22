import { createFileRoute } from "@tanstack/react-router";
import { buildOutreachOpportunities } from "@/lib/outreach-opportunities";

async function getOutreachOpportunities() {
  try {
    const payload = await buildOutreachOpportunities();
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

export const Route = createFileRoute("/api/public/outreach-opportunities")({
  server: {
    handlers: {
      GET: getOutreachOpportunities,
    },
  },
});
