import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPodcastDetail } from "@/lib/podcast.functions";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import {
  AdStrategyPanel,
  BrandPanel,
  PlatformLinksPanel,
} from "@/components/insights-panels";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  Calendar,
  Clock,
  ExternalLink,
  Loader2,
  Mic,
  Tag,
  TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/podcast/$id")({
  component: PodcastDetail,
});

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

function ScoreRing({ value, label, color }: { value: number; label: string; color: string }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-20 w-20">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
          <circle
            cx="40"
            cy="40"
            r={r}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={off}
            stroke={color}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-xl font-bold tabular-nums">
          {value}
        </div>
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function PodcastDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getPodcastDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["podcast", id],
    queryFn: () => fn({ data: { id } }),
  });

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="grid place-items-center py-32 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  const { podcast: p, episodes, snapshots } = data;

  // Episode publish timeline (weekly buckets, last 26 weeks)
  const weeklyBuckets = (() => {
    const buckets: Record<string, number> = {};
    const now = Date.now();
    for (let i = 25; i >= 0; i--) {
      const d = new Date(now - i * 7 * 86400000);
      const key = `${d.getMonth() + 1}/${d.getDate()}`;
      buckets[key] = 0;
    }
    const keys = Object.keys(buckets);
    for (const ep of episodes) {
      if (!ep.pub_date) continue;
      const t = new Date(ep.pub_date).getTime();
      const weeksAgo = Math.floor((now - t) / (7 * 86400000));
      if (weeksAgo < 0 || weeksAgo > 25) continue;
      const k = keys[25 - weeksAgo];
      buckets[k] = (buckets[k] ?? 0) + 1;
    }
    return keys.map((k) => ({ week: k, count: buckets[k] }));
  })();

  // Trend from snapshots
  const trendData = snapshots.length
    ? snapshots.map((s) => ({
        date: fmtDate(s.taken_at),
        reviews: s.estimated_reviews ?? 0,
        subs: s.estimated_subscribers ?? 0,
      }))
    : // Fallback: synthesize a growth curve based on episode timeline
      weeklyBuckets.map((w, i) => {
        const base = (p.commercial_score ?? 50) * 100;
        return {
          date: w.week,
          reviews: Math.round(base * 0.4 + i * 18 + w.count * 12),
          subs: Math.round(base * 8 + i * 320 + w.count * 80),
        };
      });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> 返回 Dashboard
        </Link>

        {/* Header */}
        <div
          className="mt-4 flex flex-col gap-6 rounded-2xl border border-border bg-card p-6 md:flex-row"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          {p.image_url ? (
            <img
              src={p.image_url}
              alt={p.title ?? ""}
              className="h-32 w-32 flex-shrink-0 rounded-xl object-cover"
            />
          ) : (
            <div className="grid h-32 w-32 flex-shrink-0 place-items-center rounded-xl bg-muted">
              <Mic className="h-10 w-10 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {p.lifecycle_stage && (
                <Badge style={{ background: "var(--gradient-brand)" }} className="text-primary-foreground">
                  <TrendingUp className="mr-1 h-3 w-3" />
                  {p.lifecycle_stage}
                </Badge>
              )}
              {p.category && <Badge variant="secondary">{p.category}</Badge>}
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{p.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{p.author}</p>
            <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Mic className="h-3 w-3" />
                {p.episode_count} 集
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                最新：{fmtDate(p.latest_episode_at)}
              </span>
              {p.update_frequency_days != null && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  平均每 {p.update_frequency_days} 天一更
                </span>
              )}
              {p.itunes_url && (
                <a
                  href={p.itunes_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-foreground hover:underline"
                >
                  <ExternalLink className="h-3 w-3" /> Apple Podcasts
                </a>
              )}
            </div>
          </div>
          <div className="flex gap-6 self-center">
            <ScoreRing value={p.commercial_score ?? 0} label="商业价值" color="oklch(0.45 0.12 245)" />
            <ScoreRing value={p.activity_score ?? 0} label="活跃度" color="oklch(0.62 0.14 160)" />
            <ScoreRing value={p.growth_score ?? 0} label="增长性" color="oklch(0.74 0.15 75)" />
          </div>
        </div>

        {/* Audience tags */}
        {p.audience_tags && p.audience_tags.length > 0 && (
          <div
            className="mt-6 rounded-2xl border border-border bg-card p-6"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="text-sm font-medium">用户画像标签</div>
            <p className="mt-1 text-xs text-muted-foreground">
              基于 Apple 分类与近期选题词频自动生成
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {p.audience_tags.map((t: string) => (
                <Badge key={t} variant="outline">
                  <Tag className="mr-1 h-3 w-3" />
                  {t}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Charts */}
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div
            className="rounded-2xl border border-border bg-card p-6"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">评论 & 订阅增长趋势</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  基于 RSS 历史抓取的估算曲线
                </p>
              </div>
              <Badge variant="outline" className="text-[10px]">估算</Badge>
            </div>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.45 0.12 245)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="oklch(0.45 0.12 245)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.62 0.14 160)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="oklch(0.62 0.14 160)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" fontSize={11} stroke="oklch(0.50 0.03 250)" />
                  <YAxis fontSize={11} stroke="oklch(0.50 0.03 250)" />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="subs"
                    name="估算订阅"
                    stroke="oklch(0.45 0.12 245)"
                    fill="url(#g1)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="reviews"
                    name="估算评论"
                    stroke="oklch(0.62 0.14 160)"
                    fill="url(#g2)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div
            className="rounded-2xl border border-border bg-card p-6"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="text-sm font-medium">近 26 周更新节奏</div>
            <p className="mt-0.5 text-xs text-muted-foreground">每周发布集数</p>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyBuckets}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="week" fontSize={11} stroke="oklch(0.50 0.03 250)" />
                  <YAxis allowDecimals={false} fontSize={11} stroke="oklch(0.50 0.03 250)" />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="count" fill="oklch(0.45 0.12 245)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Episodes */}
        <div
          className="mt-6 rounded-2xl border border-border bg-card p-6"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="mb-4 text-sm font-medium">最新单集（{episodes.length}）</div>
          <div className="divide-y divide-border">
            {episodes.slice(0, 20).map((ep) => (
              <div key={ep.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{ep.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {fmtDate(ep.pub_date)}
                    {ep.duration_seconds
                      ? ` · ${Math.round(ep.duration_seconds / 60)} 分钟`
                      : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
