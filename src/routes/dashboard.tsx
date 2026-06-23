import { useEffect, useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { RssIngestForm } from "@/components/rss-ingest-form";
import { BulkIngestForm } from "@/components/bulk-ingest-form";
import { PodcastSearchForm } from "@/components/podcast-search-form";
import { PlatformIngestForm } from "@/components/platform-ingest-form";
import { listBrandCategories } from "@/lib/podcast.functions";
import { addPodcastToCampaign, listBriefsAndCampaigns } from "@/lib/campaign.functions";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Activity, ArrowRight, Banknote, Clock, Tag, TrendingUp, Loader2, Search, X, Folder, Users, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type SubTier = "all" | "lt1k" | "1k-1w" | "1w-10w" | "gt10w" | "unknown";
type QuoteAvailability = "all" | "priced" | "unpriced";
type QuoteFormat = "all" | "host" | "sponsor" | "custom";
type QuoteRange = "all" | "lt1w" | "1w-3w" | "3w-5w" | "gt5w";
const INITIAL_VISIBLE = 120;
type PodcastRateCard = {
  host_read_min_rmb: number | null;
  host_read_max_rmb: number | null;
  sponsorship_min_rmb: number | null;
  sponsorship_max_rmb: number | null;
  custom_episode_min_rmb: number | null;
  custom_episode_max_rmb: number | null;
  data_confidence: string | null;
  source_notes: string | null;
  manually_confirmed_at: string | null;
};
type PodcastListItem = {
  id?: string;
  title?: string | null;
  author?: string | null;
  image_url?: string | null;
  category?: string | null;
  episode_count?: number | null;
  latest_episode_at?: string | null;
  update_frequency_days?: number | null;
  commercial_score?: number | null;
  activity_score?: number | null;
  growth_score?: number | null;
  lifecycle_stage?: string | null;
  audience_tags?: string[] | null;
  market?: string | null;
  subscriber_count?: number | null;
  subscriber_source?: string | null;
  xiaoyuzhou_subscribers?: number | null;
  ximalaya_subscribers?: number | null;
  apple_subscribers?: number | null;
  monthly_active_listeners?: number | null;
  estimated_subscribers?: number | null;
  podcast_ad_profiles?: PodcastRateCard | null;
};
type OutreachOpportunity = {
  id: string;
  title: string | null;
  author: string | null;
  image_url: string | null;
  category: string | null;
  platform: string;
  platform_url: string | null;
  audience_tier: "头部" | "中腰部" | "长尾" | "未知";
  subscriber_count: number | null;
  ximalaya_plays: number | null;
  performance_score: number;
  momentum_score: number;
  outreach_priority: "高" | "中" | "观察";
  reason: string;
  suggested_action: string;
  windows: Array<{
    days: 7 | 14 | 30;
    subscriber_delta: number | null;
    subscriber_growth_pct: number | null;
    play_delta: number | null;
    episode_delta: number | null;
  }>;
  snapshot_count: number;
  last_snapshot_at: string | null;
  data_freshness_days: number | null;
  quality_score: number;
  signal_level: "强信号" | "中信号" | "观察信号";
  evidence: string[];
};

type DailyRefreshRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  trigger_source: string;
  discovered_count: number;
  discovery_attempts: number;
  refreshed_count: number;
  failed_count: number;
  error_message: string | null;
};

type CampaignListItem = {
  id: string;
  name: string;
  status: string;
  created_at: string;
};

const SUB_TIERS: { id: SubTier; label: string; test: (n: number | null) => boolean }[] = [
  { id: "all", label: "全部订阅量", test: () => true },
  { id: "gt10w", label: "10万+", test: (n) => n != null && n >= 100000 },
  { id: "1w-10w", label: "1万 – 10万", test: (n) => n != null && n >= 10000 && n < 100000 },
  { id: "1k-1w", label: "1千 – 1万", test: (n) => n != null && n >= 1000 && n < 10000 },
  { id: "lt1k", label: "< 1千", test: (n) => n != null && n < 1000 },
  { id: "unknown", label: "未知", test: (n) => n == null },
];
const QUOTE_AVAILABILITY: { id: QuoteAvailability; label: string }[] = [
  { id: "all", label: "全部报价" },
  { id: "priced", label: "已有报价" },
  { id: "unpriced", label: "待确认报价" },
];
const QUOTE_FORMATS: { id: QuoteFormat; label: string }[] = [
  { id: "all", label: "全部形式" },
  { id: "host", label: "口播" },
  { id: "sponsor", label: "冠名" },
  { id: "custom", label: "定制单集" },
];
const QUOTE_RANGES: { id: QuoteRange; label: string }[] = [
  { id: "all", label: "不限预算" },
  { id: "lt1w", label: "1万以内" },
  { id: "1w-3w", label: "1万–3万" },
  { id: "3w-5w", label: "3万–5万" },
  { id: "gt5w", label: "5万以上" },
];
const DASHBOARD_FILTERS_KEY = "podbridge.dashboard.filters";

type SavedDashboardFilters = {
  brandInput?: string;
  brand?: string;
  category?: string;
  podcastCategory?: string;
  subTier?: SubTier;
  quoteAvailability?: QuoteAvailability;
  quoteFormat?: QuoteFormat;
  quoteRange?: QuoteRange;
};

function readSavedDashboardFilters(): SavedDashboardFilters {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(DASHBOARD_FILTERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SavedDashboardFilters;
    return {
      brandInput: typeof parsed.brandInput === "string" ? parsed.brandInput : "",
      brand: typeof parsed.brand === "string" ? parsed.brand : "",
      category: typeof parsed.category === "string" ? parsed.category : "",
      podcastCategory:
        typeof parsed.podcastCategory === "string" ? parsed.podcastCategory : "",
      subTier: SUB_TIERS.some((t) => t.id === parsed.subTier) ? parsed.subTier : "all",
      quoteAvailability: QUOTE_AVAILABILITY.some((item) => item.id === parsed.quoteAvailability)
        ? parsed.quoteAvailability
        : "all",
      quoteFormat: QUOTE_FORMATS.some((item) => item.id === parsed.quoteFormat)
        ? parsed.quoteFormat
        : "all",
      quoteRange: QUOTE_RANGES.some((item) => item.id === parsed.quoteRange)
        ? parsed.quoteRange
        : "all",
    };
  } catch {
    return {};
  }
}

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "播客库 — PodBridge" },
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

function getSubscriberCount(p: PodcastListItem) {
  return (
    p.subscriber_count ??
    p.xiaoyuzhou_subscribers ??
    p.ximalaya_subscribers ??
    p.apple_subscribers ??
    p.monthly_active_listeners ??
    p.estimated_subscribers ??
    null
  );
}

function fmtCount(n: number | null) {
  if (n == null) return "未知";
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString();
}

function fmtMoney(n: number | null | undefined) {
  return n == null ? "待确认" : `¥${n.toLocaleString("zh-CN")}`;
}

function fmtMoneyRange(min: number | null | undefined, max: number | null | undefined) {
  if (min == null && max == null) return "待确认";
  if (min == null) return fmtMoney(max);
  if (max == null || min === max) return fmtMoney(min);
  return `${fmtMoney(min)}–${fmtMoney(max)}`;
}

function getQuoteValues(p: PodcastListItem, format: QuoteFormat = "all") {
  const profile = p.podcast_ad_profiles;
  if (!profile) return [];
  const values =
    format === "host"
      ? [profile.host_read_min_rmb]
      : format === "sponsor"
        ? [profile.sponsorship_min_rmb]
        : format === "custom"
          ? [profile.custom_episode_min_rmb]
          : [
              profile.host_read_min_rmb,
              profile.sponsorship_min_rmb,
              profile.custom_episode_min_rmb,
            ];
  return values.filter((value): value is number => value != null && Number.isFinite(value));
}

function matchesQuoteRange(value: number, range: QuoteRange) {
  if (range === "lt1w") return value < 10000;
  if (range === "1w-3w") return value >= 10000 && value < 30000;
  if (range === "3w-5w") return value >= 30000 && value < 50000;
  if (range === "gt5w") return value >= 50000;
  return true;
}

function quoteSourceLabel(confidence: string | null | undefined) {
  if (confidence === "manual_confirmed") return "人工确认";
  if (confidence === "creator_authorized") return "主播授权";
  if (confidence === "public_data") return "公开数据";
  return "AI 估算";
}

function latestWindow(p: OutreachOpportunity, days: 7 | 14 | 30) {
  return p.windows.find((w) => w.days === days);
}

function fmtRefreshStatus(status: string | null | undefined) {
  if (status === "success") return "成功";
  if (status === "partial") return "部分成功";
  if (status === "failed") return "失败";
  if (status === "running") return "运行中";
  return "未运行";
}

function ScoreBar({ value, label }: { value: number; label: string }) {
  const color = value >= 75 ? "var(--success)" : value >= 50 ? "var(--brand)" : "var(--warning)";
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

function PodcastRateSummary({ podcast }: { podcast: PodcastListItem }) {
  const profile = podcast.podcast_ad_profiles;
  const hasQuote = getQuoteValues(podcast).length > 0;
  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <Banknote className="h-3.5 w-3.5 text-primary" />
          公开报价
        </div>
        <Badge
          variant={hasQuote ? "secondary" : "outline"}
          className="text-[10px]"
          title={profile?.source_notes ?? undefined}
        >
          {hasQuote ? quoteSourceLabel(profile?.data_confidence) : "待人工确认"}
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="min-w-0">
          <div className="text-[10px] text-muted-foreground">口播</div>
          <div className="truncate text-xs font-semibold tabular-nums">
            {fmtMoneyRange(profile?.host_read_min_rmb, profile?.host_read_max_rmb)}
          </div>
        </div>
        <div className="min-w-0 border-l border-border pl-2">
          <div className="text-[10px] text-muted-foreground">冠名</div>
          <div className="truncate text-xs font-semibold tabular-nums">
            {fmtMoneyRange(profile?.sponsorship_min_rmb, profile?.sponsorship_max_rmb)}
          </div>
        </div>
        <div className="min-w-0 border-l border-border pl-2">
          <div className="text-[10px] text-muted-foreground">定制单集</div>
          <div className="truncate text-xs font-semibold tabular-nums">
            {fmtMoneyRange(profile?.custom_episode_min_rmb, profile?.custom_episode_max_rmb)}
          </div>
        </div>
      </div>
    </div>
  );
}

function OpportunityRow({
  item,
  rank,
  campaigns,
  selectedCampaignId,
  onSelectCampaign,
  onAddToCampaign,
  isAdding,
}: {
  item: OutreachOpportunity;
  rank: number;
  campaigns: CampaignListItem[];
  selectedCampaignId: string;
  onSelectCampaign: (value: string) => void;
  onAddToCampaign: () => void;
  isAdding: boolean;
}) {
  const w7 = latestWindow(item, 7);
  const w30 = latestWindow(item, 30);
  return (
    <div className="grid min-w-0 gap-3 rounded-lg border border-border bg-muted/30 p-3 transition-colors hover:bg-muted/50">
      <div className="flex min-w-0 items-start gap-3">
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-background text-xs font-semibold tabular-nums">
          {rank}
        </div>
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.title ?? ""}
            className="h-10 w-10 shrink-0 rounded-md object-cover"
            loading="lazy"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                to="/podcast/$id"
                params={{ id: item.id }}
                className="block truncate text-sm font-semibold hover:text-primary"
              >
                {item.title}
              </Link>
              <div className="truncate text-xs text-muted-foreground">
                {item.platform} · {item.category ?? "未分类"} · 订阅 {fmtCount(item.subscriber_count)}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Badge
                variant={item.audience_tier === "头部" ? "secondary" : "outline"}
                className="text-[10px]"
              >
                {item.audience_tier}
              </Badge>
              <Badge
                variant={item.outreach_priority === "高" ? "default" : "outline"}
                className="text-[10px]"
              >
                {item.outreach_priority}
              </Badge>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
            <div>
              <div className="text-muted-foreground">质量</div>
              <div className="font-medium">{item.quality_score}</div>
            </div>
            <div>
              <div className="text-muted-foreground">潜力</div>
              <div className="font-medium">{item.momentum_score}</div>
            </div>
            <div>
              <div className="text-muted-foreground">30天更新</div>
              <div className="font-medium">{w30?.episode_delta ?? "—"}</div>
            </div>
          </div>
          <div className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.reason}</div>
          <div className="mt-1 text-xs font-medium">{item.suggested_action}</div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
            <span>{item.signal_level}</span>
            {item.data_freshness_days != null && <span>数据 {item.data_freshness_days} 天前</span>}
            {w7?.subscriber_growth_pct != null && <span>7天订阅 +{w7.subscriber_growth_pct}%</span>}
            {w30?.subscriber_growth_pct != null && (
              <span>30天订阅 +{w30.subscriber_growth_pct}%</span>
            )}
            {w30?.play_delta != null && <span>30天播放 +{fmtCount(w30.play_delta)}</span>}
          </div>
          {item.evidence?.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {item.evidence.slice(0, 4).map((evidence) => (
                <span
                  key={evidence}
                  className="rounded-full bg-background px-2 py-0.5 text-[10px] text-muted-foreground"
                >
                  {evidence}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
            <select
              value={selectedCampaignId}
              onChange={(e) => onSelectCampaign(e.target.value)}
              className="min-w-0 rounded-md border border-input bg-background px-2 py-1.5 text-xs"
            >
              <option value="">选择投放项目</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={onAddToCampaign} disabled={!selectedCampaignId || isAdding}>
              {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
              加入
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OpportunityColumn({
  title,
  items,
  empty,
  campaigns,
  selectedCampaignByPodcast,
  addingPodcastId,
  onSelectCampaign,
  onAddToCampaign,
}: {
  title: string;
  items: OutreachOpportunity[];
  empty: string;
  campaigns: CampaignListItem[];
  selectedCampaignByPodcast: Record<string, string>;
  addingPodcastId: string | null;
  onSelectCampaign: (podcastId: string, campaignId: string) => void;
  onAddToCampaign: (podcast: OutreachOpportunity) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-3 text-sm font-medium">{title}</div>
      <div className="space-y-2">
        {items.length ? (
          items.slice(0, 6).map((item, index) => (
            <OpportunityRow
              key={item.id}
              item={item}
              rank={index + 1}
              campaigns={campaigns}
              selectedCampaignId={selectedCampaignByPodcast[item.id] ?? ""}
              onSelectCampaign={(campaignId) => onSelectCampaign(item.id, campaignId)}
              onAddToCampaign={() => onAddToCampaign(item)}
              isAdding={addingPodcastId === item.id}
            />
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            {empty}
          </div>
        )}
      </div>
    </div>
  );
}

function DashboardPage() {
  const listCats = useServerFn(listBrandCategories);
  const listCampaigns = useServerFn(listBriefsAndCampaigns);
  const addToCampaign = useServerFn(addPodcastToCampaign);
  const savedFilters = useMemo(readSavedDashboardFilters, []);

  const [brandInput, setBrandInput] = useState(savedFilters.brandInput ?? "");
  const [brand, setBrand] = useState(savedFilters.brand ?? "");
  const [category, setCategory] = useState(savedFilters.category ?? "");
  const [podcastCategory, setPodcastCategory] = useState<string>(
    savedFilters.podcastCategory ?? "",
  );
  const [subTier, setSubTier] = useState<SubTier>(savedFilters.subTier ?? "all");
  const [quoteAvailability, setQuoteAvailability] = useState<QuoteAvailability>(
    savedFilters.quoteAvailability ?? "all",
  );
  const [quoteFormat, setQuoteFormat] = useState<QuoteFormat>(
    savedFilters.quoteFormat ?? "all",
  );
  const [quoteRange, setQuoteRange] = useState<QuoteRange>(
    savedFilters.quoteRange ?? "all",
  );
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [isRefreshingDaily, setIsRefreshingDaily] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [selectedCampaignByPodcast, setSelectedCampaignByPodcast] = useState<Record<string, string>>({});
  const [addingPodcastId, setAddingPodcastId] = useState<string | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["podcasts", brand, category],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (brand) params.set("brand", brand);
      if (category) params.set("category", category);
      const res = await fetch(`/api/public/dashboard-podcasts?${params.toString()}`);
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "播客列表加载失败");
      return payload;
    },
    enabled: isClient,
  });

  const { data: catData } = useQuery({
    queryKey: ["brand-categories"],
    queryFn: () => listCats(),
  });

  const { data: campaignData, refetch: refetchCampaigns } = useQuery({
    queryKey: ["dashboard-campaigns"],
    queryFn: () => listCampaigns(),
    enabled: isClient,
  });

  const {
    data: opportunityData,
    isLoading: isLoadingOpportunities,
    error: opportunitiesError,
    refetch: refetchOpportunities,
  } = useQuery({
    queryKey: ["outreach-opportunities"],
    queryFn: async () => {
      const res = await fetch("/api/public/outreach-opportunities");
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "建联建议生成失败");
      return payload;
    },
    enabled: isClient,
  });

  const allPodcasts = useMemo(() => data?.podcasts ?? [], [data?.podcasts]);
  const cats = useMemo(() => catData?.categories ?? [], [catData?.categories]);
  const outreach = opportunityData?.suggestedOutreach ?? [];
  const midMarketOutreach = opportunityData?.midMarketOutreach ?? outreach;
  const topTierOutreach = opportunityData?.topTierOutreach ?? [];
  const longTailOutreach = opportunityData?.longTailOutreach ?? [];
  const topPerformance = opportunityData?.topPerformance ?? [];
  const promising = opportunityData?.promising ?? [];
  const latestRun = opportunityData?.latestRun as DailyRefreshRun | null | undefined;
  const campaigns = (campaignData?.campaigns ?? []) as CampaignListItem[];

  // Derive podcast-category facets (with counts) from the loaded list
  const podcastCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of allPodcasts) {
      const c = (p.category ?? "").trim();
      if (!c) continue;
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [allPodcasts]);

  // Derive subscriber-tier counts from the loaded list
  const tierCounts = useMemo(() => {
    const counts: Record<SubTier, number> = {
      all: allPodcasts.length,
      gt10w: 0,
      "1w-10w": 0,
      "1k-1w": 0,
      lt1k: 0,
      unknown: 0,
    };
    for (const p of allPodcasts) {
      const n = getSubscriberCount(p as PodcastListItem);
      for (const t of SUB_TIERS) {
        if (t.id !== "all" && t.test(n)) counts[t.id]++;
      }
    }
    return counts;
  }, [allPodcasts]);

  const tier = SUB_TIERS.find((t) => t.id === subTier)!;
  const tierFilteredPodcasts = useMemo(
    () =>
      allPodcasts.filter((p) => {
        if (podcastCategory && (p.category ?? "").trim() !== podcastCategory) return false;
        const n = getSubscriberCount(p as PodcastListItem);
        if (!tier.test(n)) return false;
        return true;
      }),
    [allPodcasts, podcastCategory, tier],
  );
  const quoteCounts = useMemo(
    () => ({
      all: tierFilteredPodcasts.length,
      priced: tierFilteredPodcasts.filter(
        (p) => getQuoteValues(p as PodcastListItem).length > 0,
      ).length,
      unpriced: tierFilteredPodcasts.filter(
        (p) => getQuoteValues(p as PodcastListItem).length === 0,
      ).length,
    }),
    [tierFilteredPodcasts],
  );
  const podcasts = useMemo(
    () =>
      tierFilteredPodcasts.filter((p) => {
        const podcast = p as PodcastListItem;
        const allQuoteValues = getQuoteValues(podcast);
        if (quoteAvailability === "priced" && allQuoteValues.length === 0) return false;
        if (quoteAvailability === "unpriced" && allQuoteValues.length > 0) return false;

        const formatValues = getQuoteValues(podcast, quoteFormat);
        if (quoteFormat !== "all" && formatValues.length === 0) return false;
        if (quoteRange !== "all") {
          if (formatValues.length === 0) return false;
          if (!matchesQuoteRange(Math.min(...formatValues), quoteRange)) return false;
        }
        return true;
      }),
    [quoteAvailability, quoteFormat, quoteRange, tierFilteredPodcasts],
  );
  const visiblePodcasts = useMemo(() => podcasts.slice(0, visibleCount), [podcasts, visibleCount]);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [brand, category, podcastCategory, quoteAvailability, quoteFormat, quoteRange, subTier]);

  useEffect(() => {
    window.sessionStorage.setItem(
      DASHBOARD_FILTERS_KEY,
      JSON.stringify({
        brandInput,
        brand,
        category,
        podcastCategory,
        subTier,
        quoteAvailability,
        quoteFormat,
        quoteRange,
      }),
    );
  }, [brandInput, brand, category, podcastCategory, quoteAvailability, quoteFormat, quoteRange, subTier]);

  const hasFilter = !!(
    brand ||
    category ||
    podcastCategory ||
    subTier !== "all" ||
    quoteAvailability !== "all" ||
    quoteFormat !== "all" ||
    quoteRange !== "all"
  );

  const applyBrand = () => setBrand(brandInput.trim());
  const clearFilters = () => {
    setBrand("");
    setBrandInput("");
    setCategory("");
    setPodcastCategory("");
    setSubTier("all");
    setQuoteAvailability("all");
    setQuoteFormat("all");
    setQuoteRange("all");
    window.sessionStorage.removeItem(DASHBOARD_FILTERS_KEY);
  };
  const refreshDailyData = async () => {
    setIsRefreshingDaily(true);
    try {
      const res = await fetch("/api/public/hooks/daily-refresh", { method: "POST" });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? "刷新失败");
      toast.success(`刷新完成：发现 ${payload.discovered ?? 0} 个，更新 ${payload.refreshed ?? 0} 个`);
      await Promise.all([refetch(), refetchOpportunities()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "刷新失败");
    } finally {
      setIsRefreshingDaily(false);
    }
  };
  const handleSelectCampaign = (podcastId: string, campaignId: string) => {
    setSelectedCampaignByPodcast((prev) => ({ ...prev, [podcastId]: campaignId }));
  };
  const handleAddToCampaign = async (podcast: OutreachOpportunity) => {
    const campaignId = selectedCampaignByPodcast[podcast.id];
    if (!campaignId) {
      toast.error("请先选择投放项目");
      return;
    }
    setAddingPodcastId(podcast.id);
    try {
      const res = await addToCampaign({
        data: {
          campaignId,
          podcastId: podcast.id,
          planLabel: podcast.audience_tier === "头部" ? "头部背书" : podcast.audience_tier === "长尾" ? "长尾测试" : "中腰部优先",
          suggestedFormat: podcast.audience_tier === "头部" ? "冠名/访谈" : "口播/中插",
          fitReason: `${podcast.reason}；${podcast.suggested_action}`,
        },
      });
      toast.success(res.duplicated ? "该播客已在项目中" : "已加入投放项目");
      await refetchCampaigns();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加入失败");
    } finally {
      setAddingPodcastId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">播客库</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              以小宇宙和喜马拉雅为核心库存，Apple/RSS 作为补充数据源
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              disabled={isRefreshingDaily}
              onClick={refreshDailyData}
            >
              {isRefreshingDaily ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              自动发现并追踪
            </Button>
            <div className="hidden text-right md:block">
              <div className="text-2xl font-bold tabular-nums">{podcasts.length}</div>
              <div className="text-xs text-muted-foreground">
                {hasFilter ? "符合筛选" : "已分析播客"}
              </div>
            </div>
          </div>
        </div>

        <div
          className="mb-6 rounded-xl border border-border bg-card p-4"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="mb-3 text-sm font-medium">按名称搜索小宇宙 / 喜马拉雅</div>
          <PodcastSearchForm market="cn" />
          <p className="mt-2 text-[11px] text-muted-foreground">
            优先匹配小宇宙和喜马拉雅；找不到时再用 Apple Podcasts / RSS 补充。
          </p>
          <div className="my-4 border-t border-border" />
          <div className="mb-3 text-sm font-medium">批量输入播客名（推荐）</div>
          <BulkIngestForm />
          <div className="my-4 border-t border-border" />
          <div className="mb-3 text-sm font-medium">补充：粘贴小宇宙 / 喜马拉雅主页</div>
          <PlatformIngestForm />
          <div className="my-4 border-t border-border" />
          <div className="mb-3 text-sm font-medium">补充 RSS 链接</div>
          <RssIngestForm />
        </div>

        <div
          className="mb-8 rounded-xl border border-border bg-card p-4"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <TrendingUp className="h-4 w-4 text-primary" />
                今日建议建联（中腰部优先）
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                默认优先推荐中腰部和增长型长尾；头部单独列为背书候选，避免预算和建联精力过度集中
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="text-right text-xs text-muted-foreground">
                <div>
                  {latestRun
                    ? `上次刷新：${fmtRefreshStatus(latestRun.status)} · ${new Date(latestRun.started_at).toLocaleString()}`
                    : opportunityData?.generatedAt
                      ? `建议生成于 ${new Date(opportunityData.generatedAt).toLocaleString()}`
                      : "等待生成"}
                </div>
                {latestRun && (
                  <div>
                    发现 {latestRun.discovered_count}/{latestRun.discovery_attempts} · 更新{" "}
                    {latestRun.refreshed_count} · 失败 {latestRun.failed_count}
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={refreshDailyData}
                disabled={isRefreshingDaily}
              >
                {isRefreshingDaily ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                刷新数据
              </Button>
            </div>
          </div>
          {opportunitiesError ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-xs text-muted-foreground">
              建联建议暂时无法生成：{opportunitiesError instanceof Error ? opportunitiesError.message : "未知错误"}
            </div>
          ) : !isClient || isLoadingOpportunities ? (
            <div className="grid place-items-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <div className="grid gap-5 xl:grid-cols-3">
              <OpportunityColumn
                title="中腰部优先建联"
                items={midMarketOutreach as OutreachOpportunity[]}
                empty="暂无中腰部候选，等待采集/刷新补充公开数据"
                campaigns={campaigns}
                selectedCampaignByPodcast={selectedCampaignByPodcast}
                addingPodcastId={addingPodcastId}
                onSelectCampaign={handleSelectCampaign}
                onAddToCampaign={handleAddToCampaign}
              />
              <OpportunityColumn
                title="头部背书候选"
                items={topTierOutreach as OutreachOpportunity[]}
                empty="暂无头部候选"
                campaigns={campaigns}
                selectedCampaignByPodcast={selectedCampaignByPodcast}
                addingPodcastId={addingPodcastId}
                onSelectCampaign={handleSelectCampaign}
                onAddToCampaign={handleAddToCampaign}
              />
              <OpportunityColumn
                title="增长型长尾测试"
                items={(longTailOutreach.length ? longTailOutreach : promising) as OutreachOpportunity[]}
                empty="暂无长尾潜力榜数据"
                campaigns={campaigns}
                selectedCampaignByPodcast={selectedCampaignByPodcast}
                addingPodcastId={addingPodcastId}
                onSelectCampaign={handleSelectCampaign}
                onAddToCampaign={handleAddToCampaign}
              />
            </div>
          )}
        </div>

        <div
          className="mb-8 rounded-xl border border-border bg-card p-4"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">按品牌候选筛选</div>
            {hasFilter && (
              <Button size="sm" variant="ghost" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" />
                清除
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-xs flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={brandInput}
                onChange={(e) => setBrandInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyBrand()}
                placeholder="搜索品牌名（如：瑞幸、京东）"
                className="pl-8"
              />
            </div>
            <Button size="sm" onClick={applyBrand}>
              搜索
            </Button>
          </div>
          {cats.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                onClick={() => setCategory("")}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  category === ""
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                }`}
              >
                全部品类
              </button>
              {cats.map((c) => (
                <button
                  key={c.name}
                  onClick={() => setCategory(c.name === category ? "" : c.name)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    category === c.name
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {c.name}
                  <span className="ml-1 opacity-60">{c.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div
          className="mb-8 rounded-xl border border-border bg-card p-4"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Folder className="h-4 w-4 text-primary" />
            播客分类
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setPodcastCategory("")}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                podcastCategory === ""
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
              }`}
            >
              全部分类
              <span className="ml-1 opacity-60">{allPodcasts.length}</span>
            </button>
            {podcastCategories.map((c) => (
              <button
                key={c.name}
                onClick={() => setPodcastCategory(c.name === podcastCategory ? "" : c.name)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  podcastCategory === c.name
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                }`}
              >
                {c.name}
                <span className="ml-1 opacity-60">{c.count}</span>
              </button>
            ))}
            {podcastCategories.length === 0 && (
              <span className="text-xs text-muted-foreground">暂无分类数据</span>
            )}
          </div>

          <div className="mt-4 mb-3 flex items-center gap-2 text-sm font-medium">
            <Users className="h-4 w-4 text-primary" />
            订阅数分级
          </div>
          <div className="flex flex-wrap gap-1.5">
            {SUB_TIERS.map((t) => (
              <button
                key={t.id}
                onClick={() => setSubTier(t.id)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  subTier === t.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                }`}
              >
                {t.label}
                <span className="ml-1 opacity-60">{tierCounts[t.id]}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Banknote className="h-4 w-4 text-primary" />
              报价筛选
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <div>
                <div className="mb-2 text-xs text-muted-foreground">报价状态</div>
                <div className="flex flex-wrap gap-1.5">
                  {QUOTE_AVAILABILITY.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setQuoteAvailability(item.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        quoteAvailability === item.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {item.label}
                      <span className="ml-1 opacity-60">{quoteCounts[item.id]}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs text-muted-foreground">合作形式</div>
                <div className="flex flex-wrap gap-1.5">
                  {QUOTE_FORMATS.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setQuoteFormat(item.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        quoteFormat === item.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs text-muted-foreground">单次合作起价</div>
                <div className="flex flex-wrap gap-1.5">
                  {QUOTE_RANGES.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setQuoteRange(item.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        quoteRange === item.id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="grid place-items-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {!isLoading && podcasts.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-16 text-center text-muted-foreground">
            {hasFilter
              ? "当前筛选条件下没有匹配的播客，尝试调整品牌或品类"
              : "还没有分析过的播客，上方粘贴小宇宙或喜马拉雅链接开始"}
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {visiblePodcasts.map((p) => (
            <Link
              key={p.id}
              to="/podcast/$id"
              params={{ id: p.id }}
              onClick={() => refetch()}
              className="group min-w-0 rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5"
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
                    <span>·</span>
                    <span>
                      订阅 {fmtCount(getSubscriberCount(p as PodcastListItem))}
                      {(p as PodcastListItem).subscriber_source
                        ? `（${(p as PodcastListItem).subscriber_source}）`
                        : ""}
                    </span>
                  </div>
                </div>
              </div>

              <PodcastRateSummary podcast={p as PodcastListItem} />

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

        {!isLoading && visiblePodcasts.length < podcasts.length && (
          <div className="mt-8 flex justify-center">
            <Button
              variant="outline"
              onClick={() => setVisibleCount((count) => count + INITIAL_VISIBLE)}
            >
              加载更多
              <span className="ml-1 text-muted-foreground">
                {visiblePodcasts.length} / {podcasts.length}
              </span>
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
