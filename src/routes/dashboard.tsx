import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { RssIngestForm } from "@/components/rss-ingest-form";
import { listPodcasts } from "@/lib/podcast.functions";
import { Badge } from "@/components/ui/badge";
import { Activity, Clock, Tag, TrendingUp, Loader2 } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — PodMetrics" },
      { name: "description", content: "对比所有已分析的中文播客，按商业价值排序。" },
    ],
  }),
  component: DashboardPage,
});

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Math.round((Date.now() - d.getTime()) / 86400000);
  if (diff < 1) return "今日";
  if (diff < 30) return `${diff} 天前`;
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

function DashboardPage() {
  const list = useServerFn(listPodcasts);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["podcasts"],
    queryFn: () => list(),
  });

  const podcasts = data?.podcasts ?? [];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">播客 Dashboard</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              按商业价值评分排序，点击卡片查看详细分析
            </p>
          </div>
          <div className="hidden text-right md:block">
            <div className="text-2xl font-bold tabular-nums">{podcasts.length}</div>
            <div className="text-xs text-muted-foreground">已分析播客</div>
          </div>
        </div>

        <div
          className="mb-10 rounded-xl border border-border bg-card p-4"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="mb-3 text-sm font-medium">添加新播客分析</div>
          <RssIngestForm />
        </div>

        {isLoading && (
          <div className="grid place-items-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {!isLoading && podcasts.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-16 text-center">
            <p className="text-muted-foreground">
              还没有分析过的播客，上方粘贴一个 RSS 链接开始
            </p>
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {podcasts.map((p) => (
            <Link
              key={p.id}
              to="/podcast/$id"
              params={{ id: p.id }}
              onClick={() => refetch()}
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
                    {p.author || "未知主播"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {fmtDate(p.latest_episode_at)}
                    </span>
                    <span>·</span>
                    <span>{p.episode_count} 集</span>
                    {p.update_frequency_days != null && (
                      <>
                        <span>·</span>
                        <span>每 {p.update_frequency_days} 天</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
                <ScoreBar value={p.commercial_score ?? 0} label="商业" />
                <ScoreBar value={p.activity_score ?? 0} label="活跃" />
                <ScoreBar value={p.growth_score ?? 0} label="增长" />
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
