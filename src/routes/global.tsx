import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { RssIngestForm } from "@/components/rss-ingest-form";
import { BulkIngestForm } from "@/components/bulk-ingest-form";
import { PodcastSearchForm } from "@/components/podcast-search-form";
import { listPodcasts } from "@/lib/podcast.functions";
import { Badge } from "@/components/ui/badge";
import { Activity, Clock, Tag, TrendingUp, Loader2, Globe2, Target } from "lucide-react";

export const Route = createFileRoute("/global")({
  head: () => ({
    meta: [
      { title: "Overseas — PodBridge" },
      {
        name: "description",
        content:
          "Curated North-American English podcasts for Chinese cross-border brands going global.",
      },
    ],
  }),
  component: GlobalDashboard,
});

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Math.round((Date.now() - d.getTime()) / 86400000);
  if (diff < 1) return "today";
  if (diff < 30) return `${diff}d ago`;
  return d.toISOString().slice(0, 10);
}

function ScoreBar({ value, label }: { value: number; label: string }) {
  const color =
    value >= 75 ? "var(--success)" : value >= 50 ? "var(--brand)" : "var(--warning)";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function GlobalDashboard() {
  const list = useServerFn(listPodcasts);
  const [tier, setTier] = useState<"all" | "top" | "mid" | "long">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["podcasts", "na"],
    queryFn: () => list({ data: { market: "na" } }),
  });

  const all = data?.podcasts ?? [];
  const filtered = all.filter((p) => {
    const c = p.commercial_score ?? 0;
    if (tier === "top") return c >= 80;
    if (tier === "mid") return c >= 55 && c < 80;
    if (tier === "long") return c < 55;
    return true;
  });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1 text-xs text-muted-foreground">
              <Globe2 className="h-3 w-3" />
              出海 · Cross-Border
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              North-American Podcast Inventory
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              为中国跨境品牌（DTC / 消费电子 / App / SaaS）遴选合适的北美英文播客
            </p>
          </div>
          <div className="hidden text-right md:block">
            <div className="text-2xl font-bold tabular-nums">{filtered.length}</div>
            <div className="text-xs text-muted-foreground">NA podcasts</div>
          </div>
        </div>

        <div
          className="mb-6 rounded-xl border border-border bg-card p-4"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">Add a North-American podcast (RSS)</div>
            <Link
              to="/global/planner"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <Target className="h-3.5 w-3.5" />
              出海规划师
            </Link>
          </div>
          <div className="mb-2 text-xs text-muted-foreground">Search by name (recommended)</div>
          <PodcastSearchForm market="na" />
          <div className="my-4 border-t border-border" />
          <div className="mb-2 text-xs text-muted-foreground">Or paste RSS URL</div>
          <RssIngestForm market="na" />
          <p className="mt-2 text-[11px] text-muted-foreground">
            e.g. <code className="rounded bg-muted px-1.5 py-0.5">https://feeds.megaphone.fm/hubermanlab</code>
          </p>
          <div className="my-4 border-t border-border" />
          <div className="mb-2 text-sm font-medium">Bulk import</div>
          <BulkIngestForm market="na" />
        </div>

        <div className="mb-6 flex flex-wrap gap-1.5">
          {([
            ["all", "All tiers"],
            ["top", "Top (≥80)"],
            ["mid", "Mid (55–79)"],
            ["long", "Long-tail (<55)"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTier(k)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                tier === k
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="grid place-items-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-16 text-center text-muted-foreground">
            No NA podcasts yet. Paste an RSS above to ingest your first one.
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <Link
              key={p.id}
              to="/podcast/$id"
              params={{ id: p.id }}
              className="group rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5"
              style={{ boxShadow: "var(--shadow-card)" }}
            >
              <div className="flex gap-4">
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.title ?? ""}
                    className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="grid h-16 w-16 flex-shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <Activity className="h-6 w-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold leading-tight">{p.title}</h3>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {p.author || "Unknown host"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {fmtDate(p.latest_episode_at)}
                    </span>
                    <span>·</span>
                    <span>{p.episode_count} eps</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
                <ScoreBar value={p.commercial_score ?? 0} label="Commercial" />
                <ScoreBar value={p.activity_score ?? 0} label="Activity" />
                <ScoreBar value={p.growth_score ?? 0} label="Growth" />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                {p.lifecycle_stage && (
                  <Badge variant="secondary" className="text-[10px]">
                    <TrendingUp className="mr-1 h-2.5 w-2.5" />
                    {p.lifecycle_stage}
                  </Badge>
                )}
                {(p.audience_tags ?? []).slice(0, 3).map((t: string) => (
                  <Badge key={t} variant="outline" className="text-[10px]">
                    <Tag className="mr-1 h-2.5 w-2.5" />
                    {t}
                  </Badge>
                ))}
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
