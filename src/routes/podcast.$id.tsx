import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPodcastDetail } from "@/lib/podcast.functions";
import { addCompetitorCampaign, updatePodcastAdProfile } from "@/lib/campaign.functions";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AdStrategyPanel, BrandPanel, PlatformLinksPanel } from "@/components/insights-panels";
import { MetricsForm } from "@/components/metrics-form";
import { SourceConfidence } from "@/components/source-confidence";
import { AddToCampaignDialog } from "@/components/add-to-campaign-dialog";
import { EvidenceList } from "@/components/evidence-list";
import {
  getSponsorItemsForPodcast,
  getVerifiedClaimForPodcast,
  MARKETPLACE_UPDATED_EVENT,
} from "@/lib/marketplace.storage";
import type { CreatorClaimRequest, SponsorIntelligenceItem } from "@/lib/marketplace.types";
import { toast } from "sonner";
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
  MessageCircle,
  PlayCircle,
  ExternalLink,
  Loader2,
  Mail,
  Mic,
  Tag,
  TrendingUp,
  UserRound,
  Wallet,
  ShieldCheck,
  Percent,
  FileSearch,
  BadgeCheck,
  Building2,
} from "lucide-react";

export const Route = createFileRoute("/podcast/$id")({
  component: PodcastDetail,
});

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

function fmtCount(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return n.toLocaleString();
}

function parseJsonObject(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parseEpisodeMetrics(description: string | null | undefined) {
  const marker = "---PODBRIDGE_PLATFORM_METRICS---";
  if (!description?.includes(marker)) return null;
  return parseJsonObject(description.split(marker).at(-1));
}

function metricNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cleanEpisodeDescription(description: string | null | undefined) {
  return (description ?? "").split("---PODBRIDGE_PLATFORM_METRICS---")[0].trim();
}

function readMetricContact(notes: string | null | undefined) {
  const parsed = parseJsonObject(notes);
  const value = typeof parsed?.contact === "string" ? parsed.contact.trim() : "";
  if (!value || /未找到|none|null|n\/a/i.test(value)) return null;
  return value;
}

type CreatorContact = {
  id: string;
  platform: string | null;
  profile_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  status: string | null;
  notes: string | null;
  updated_at: string | null;
};

type AdProfile = {
  id: string;
  podcast_id: string;
  contact_method: string | null;
  contact_email: string | null;
  contact_wechat: string | null;
  quote_min_rmb: number | null;
  quote_max_rmb: number | null;
  host_read_min_rmb: number | null;
  host_read_max_rmb: number | null;
  sponsorship_min_rmb: number | null;
  sponsorship_max_rmb: number | null;
  custom_episode_min_rmb: number | null;
  custom_episode_max_rmb: number | null;
  response_rate: number | null;
  collaboration_status: string;
  historical_brands: string[];
  ad_categories: string[];
  notes: string | null;
  brand_safety_score: number;
  brand_safety_tags: string[];
  brand_safety_notes: string | null;
  suggested_price_min_rmb: number | null;
  suggested_price_max_rmb: number | null;
  pricing_basis: string | null;
  data_confidence: string;
  updated_at: string;
};

type CompetitorCampaign = {
  id: string;
  brand_name: string;
  brand_category: string | null;
  ad_format: string | null;
  last_seen_at: string | null;
  data_confidence: string;
  notes: string | null;
};

type PodcastEvidence = {
  id: string;
  claim: string;
  source_platform: string;
  source_label: string;
  source_url: string | null;
  confidence: number;
  captured_at: string;
  captured_by: string;
  capture_method: string;
  explanation: string;
  screenshot_url: string | null;
};

const CONFIDENCE_LABELS: Record<string, string> = {
  public_data: "公开数据",
  ai_estimated: "AI 估算",
  creator_authorized: "主播授权",
  manual_confirmed: "人工确认",
};

function fmtMoney(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 10000) return `¥${(n / 10000).toFixed(1)}万`;
  return `¥${n.toLocaleString()}`;
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
  const saveAdProfile = useServerFn(updatePodcastAdProfile);
  const addCompetitor = useServerFn(addCompetitorCampaign);
  const [savingProfile, setSavingProfile] = useState(false);
  const [addingCompetitor, setAddingCompetitor] = useState(false);
  const [verifiedClaim, setVerifiedClaim] = useState<CreatorClaimRequest | null>(null);
  const [sponsorItems, setSponsorItems] = useState<SponsorIntelligenceItem[]>([]);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["podcast", id],
    queryFn: () => fn({ data: { id } }),
  });

  useEffect(() => {
    const refreshMarketplaceData = () => {
      void Promise.all([
        getVerifiedClaimForPodcast(id),
        getSponsorItemsForPodcast(id, data?.podcast.title),
      ])
        .then(([claim, sponsors]) => {
          setVerifiedClaim(claim);
          setSponsorItems(sponsors);
        })
        .catch(() => {
          setVerifiedClaim(null);
          setSponsorItems([]);
        });
    };
    refreshMarketplaceData();
    window.addEventListener(MARKETPLACE_UPDATED_EVENT, refreshMarketplaceData);
    return () => window.removeEventListener(MARKETPLACE_UPDATED_EVENT, refreshMarketplaceData);
  }, [id, data?.podcast.title]);

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
  const contacts = ((data as typeof data & { contacts?: CreatorContact[] }).contacts ??
    []) as CreatorContact[];
  const adProfile = ((data as typeof data & { adProfile?: AdProfile | null }).adProfile ??
    null) as AdProfile | null;
  const competitors = ((data as typeof data & { competitors?: CompetitorCampaign[] }).competitors ??
    []) as CompetitorCampaign[];
  const evidence = ((data as typeof data & { evidence?: PodcastEvidence[] }).evidence ??
    []) as PodcastEvidence[];
  const metrics = p as typeof p & {
    audience_persona: string | null;
    audience_age_range: string | null;
    audience_gender_split: string | null;
    audience_geo: string | null;
    completion_rate: number | null;
    new_listener_retention: number | null;
    monthly_active_listeners: number | null;
    cpm_rate: number | null;
    metrics_notes: string | null;
    metrics_updated_at: string | null;
    last_synced_at: string | null;
  };
  const enrichment = parseJsonObject(metrics.metrics_notes)?.platform_enrichment as
    | Record<string, unknown>
    | undefined;
  const weeklyTrend = Array.isArray(enrichment?.weekly_trend_26w)
    ? (enrichment.weekly_trend_26w as Array<{
        week?: string;
        episodes?: number;
        comments?: number;
        plays?: number;
      }>)
    : null;
  const metricContact = readMetricContact(metrics.metrics_notes);
  const visibleContacts =
    contacts.length || !metricContact
      ? contacts
      : [
          {
            id: "metrics-contact",
            platform: "历史识别",
            profile_url: p.xiaoyuzhou_url ?? p.ximalaya_url ?? p.itunes_url ?? null,
            contact_name: metricContact.includes("@") ? null : metricContact,
            contact_email: metricContact.includes("@") ? metricContact : null,
            status: "found",
            notes: "来自已导入数据中的公开联系方式字段",
            updated_at: metrics.metrics_updated_at,
          } satisfies CreatorContact,
        ];

  const saveProfileForm = async (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const numberValue = (name: string) => {
      const raw = String(fd.get(name) ?? "").trim();
      return raw ? Number(raw) : null;
    };
    setSavingProfile(true);
    try {
      await saveAdProfile({
        data: {
          podcastId: p.id,
          contactMethod: String(fd.get("contactMethod") ?? "").trim() || null,
          contactEmail: String(fd.get("contactEmail") ?? "").trim() || null,
          contactWechat: String(fd.get("contactWechat") ?? "").trim() || null,
          quoteMinRmb: numberValue("quoteMinRmb"),
          quoteMaxRmb: numberValue("quoteMaxRmb"),
          hostReadMinRmb: numberValue("hostReadMinRmb"),
          hostReadMaxRmb: numberValue("hostReadMaxRmb"),
          sponsorshipMinRmb: numberValue("sponsorshipMinRmb"),
          sponsorshipMaxRmb: numberValue("sponsorshipMaxRmb"),
          customEpisodeMinRmb: numberValue("customEpisodeMinRmb"),
          customEpisodeMaxRmb: numberValue("customEpisodeMaxRmb"),
          responseRate: numberValue("responseRate"),
          collaborationStatus: String(fd.get("collaborationStatus") ?? "").trim() || "unknown",
          historicalBrands: String(fd.get("historicalBrands") ?? "").trim() || null,
          adCategories: String(fd.get("adCategories") ?? "").trim() || null,
          notes: String(fd.get("notes") ?? "").trim() || null,
          brandSafetyScore: numberValue("brandSafetyScore"),
          brandSafetyTags: String(fd.get("brandSafetyTags") ?? "").trim() || null,
          brandSafetyNotes: String(fd.get("brandSafetyNotes") ?? "").trim() || null,
          suggestedPriceMinRmb: numberValue("suggestedPriceMinRmb"),
          suggestedPriceMaxRmb: numberValue("suggestedPriceMaxRmb"),
          pricingBasis: String(fd.get("pricingBasis") ?? "").trim() || null,
          dataConfidence: String(fd.get("dataConfidence") || "ai_estimated") as never,
        },
      });
      toast.success("商务档案已保存");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSavingProfile(false);
    }
  };

  const addCompetitorForm = async (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const brandName = String(fd.get("brandName") ?? "").trim();
    if (!brandName) {
      toast.error("请输入品牌名");
      return;
    }
    setAddingCompetitor(true);
    try {
      await addCompetitor({
        data: {
          podcastId: p.id,
          brandName,
          brandCategory: String(fd.get("brandCategory") ?? "").trim() || null,
          adFormat: String(fd.get("adFormat") ?? "").trim() || null,
          lastSeenAt: String(fd.get("lastSeenAt") ?? "").trim() || null,
          evidenceUrl: String(fd.get("evidenceUrl") ?? "").trim() || null,
          notes: String(fd.get("competitorNotes") ?? "").trim() || null,
          dataConfidence: String(fd.get("competitorConfidence") || "public_data") as never,
        },
      });
      form.reset();
      toast.success("竞品投放记录已添加");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "添加失败");
    } finally {
      setAddingCompetitor(false);
    }
  };

  // Episode publish timeline (weekly buckets, last 26 weeks)
  const weeklyBuckets = (() => {
    if (weeklyTrend?.length) {
      return weeklyTrend.map((w) => ({
        week: w.week ?? "",
        count: w.episodes ?? 0,
        comments: w.comments ?? 0,
        plays: w.plays ?? 0,
      }));
    }
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
    : weeklyBuckets.map((w) => ({
        date: w.week,
        reviews: w.comments ?? 0,
        subs: metricNumber(enrichment?.subscriber_current) ?? 0,
      }));

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> 返回播客库
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
                <Badge
                  style={{ background: "var(--gradient-brand)" }}
                  className="text-primary-foreground"
                >
                  <TrendingUp className="mr-1 h-3 w-3" />
                  {p.lifecycle_stage}
                </Badge>
              )}
              {p.category && <Badge variant="secondary">{p.category}</Badge>}
            </div>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{p.title}</h1>
              <div className="flex flex-wrap gap-2">
                <AddToCampaignDialog
                  podcast={{
                    podcastId: p.id,
                    podcastName: p.title ?? "未命名播客",
                    category: p.category,
                    platform: p.xiaoyuzhou_url
                      ? "小宇宙"
                      : p.ximalaya_url
                        ? "喜马拉雅"
                        : p.itunes_url
                          ? "Apple Podcasts"
                          : "播客库",
                    commercialScore: p.commercial_score,
                    brandSafetyScore: adProfile?.brand_safety_score ?? 80,
                    estimatedPriceRange:
                      adProfile?.host_read_min_rmb || adProfile?.host_read_max_rmb
                        ? `${fmtMoney(adProfile?.host_read_min_rmb)}–${fmtMoney(adProfile?.host_read_max_rmb)}`
                        : undefined,
                    recommendedFormat: "口播广告",
                    recommendationReason:
                      "来自播客详情页的人工候选选择；品牌匹配与合作形式需结合 Campaign Brief 继续确认。",
                    confidence:
                      adProfile?.data_confidence === "creator_authorized"
                        ? 100
                        : adProfile?.data_confidence === "manual_confirmed"
                          ? 90
                          : adProfile?.data_confidence === "public_data"
                            ? 80
                            : 55,
                    sourceType:
                      adProfile?.data_confidence === "creator_authorized"
                        ? "creator_authorized"
                        : adProfile?.data_confidence === "manual_confirmed"
                          ? "manual_verified"
                          : adProfile?.data_confidence === "public_data"
                            ? "public_info"
                            : "ai_inferred",
                    sourceLabel:
                      adProfile?.pricing_basis ||
                      CONFIDENCE_LABELS[adProfile?.data_confidence ?? ""] ||
                      "PodBridge 播客库",
                    sourceUrl: p.xiaoyuzhou_url ?? p.ximalaya_url ?? p.itunes_url ?? undefined,
                  }}
                />
                <Button asChild variant="outline" size="sm">
                  <Link to="/creator-claim/$podcastId" params={{ podcastId: p.id }}>
                    <BadgeCheck className="h-4 w-4" />
                    我是主播，认领这个播客
                  </Link>
                </Button>
              </div>
            </div>
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
            <ScoreRing
              value={p.commercial_score ?? 0}
              label="商业价值"
              color="oklch(0.45 0.12 245)"
            />
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

        {/* Platform links + scraped data */}
        <div className="mt-6">
          <PlatformLinksPanel
            podcastId={p.id}
            xiaoyuzhouUrl={p.xiaoyuzhou_url ?? null}
            ximalayaUrl={p.ximalaya_url ?? null}
            itunesUrl={p.itunes_url ?? null}
            xiaoyuzhouSubs={p.xiaoyuzhou_subscribers ?? null}
            xiaoyuzhouComments={p.xiaoyuzhou_comments ?? null}
            ximalayaPlays={p.ximalaya_plays ?? null}
            ximalayaSubs={p.ximalaya_subscribers ?? null}
            ximalayaComments={p.ximalaya_comments ?? null}
            appleReviews={p.apple_reviews ?? null}
          />
        </div>

        <div
          className="mt-6 rounded-2xl border border-border bg-card p-6"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">来源证据</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                来自数据采集工作台的人工确认 / 浏览器辅助记录；AI 推断不会被当作平台官方数据。
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/research">
                <FileSearch className="h-4 w-4" />
                去采集
              </Link>
            </Button>
          </div>
          {evidence.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {evidence.map((item) => (
                <div key={item.id} className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      来源：{item.source_label || item.source_platform}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      置信度：{item.confidence}%
                    </Badge>
                  </div>
                  <div className="mt-2 text-sm font-medium">{item.claim}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    采集时间：{fmtDate(item.captured_at)} · 采集方式：
                    {item.capture_method === "browser-assisted"
                      ? "浏览器辅助"
                      : item.capture_method === "imported"
                        ? "文件导入"
                        : "人工确认"}
                    · 采集人：{item.captured_by || "manual"}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {item.explanation}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.source_url && (
                      <a
                        href={item.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        打开来源
                      </a>
                    )}
                    {item.screenshot_url && (
                      <a
                        href={item.screenshot_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        截图
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              暂无来源证据。请在数据采集工作台录入公开页面信息后再查看。
            </div>
          )}
          <div className="mt-4">
            <EvidenceList entityType="podcast" entityId={p.id} />
          </div>
        </div>

        <div
          className="mt-6 rounded-2xl border border-border bg-card p-6"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <BadgeCheck className="h-4 w-4 text-primary" /> 主播授权商务信息
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                仅展示已完成人工确认的主播认领资料。
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/creator-claim/$podcastId" params={{ podcastId: p.id }}>
                我是主播，认领这个播客
              </Link>
            </Button>
          </div>
          {verifiedClaim ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 text-sm md:grid-cols-2 lg:grid-cols-3">
                <div>
                  <span className="text-muted-foreground">接受品牌合作：</span>
                  {verifiedClaim.acceptsSponsorship ? "是" : "否"}
                </div>
                <div>
                  <span className="text-muted-foreground">可合作形式：</span>
                  {verifiedClaim.availableFormats.join("、") || "未填写"}
                </div>
                <div>
                  <span className="text-muted-foreground">偏好行业：</span>
                  {verifiedClaim.preferredIndustries.join("、") || "未填写"}
                </div>
                <div>
                  <span className="text-muted-foreground">不接受行业：</span>
                  {verifiedClaim.blockedIndustries.join("、") || "未填写"}
                </div>
                <div>
                  <span className="text-muted-foreground">口播报价：</span>
                  {verifiedClaim.hostReadPriceRange || "未填写"} {verifiedClaim.currency}
                </div>
                <div>
                  <span className="text-muted-foreground">冠名报价：</span>
                  {verifiedClaim.sponsorshipPriceRange || "未填写"} {verifiedClaim.currency}
                </div>
                <div>
                  <span className="text-muted-foreground">访谈报价：</span>
                  {verifiedClaim.interviewPriceRange || "未填写"} {verifiedClaim.currency}
                </div>
                <div>
                  <span className="text-muted-foreground">套餐报价：</span>
                  {verifiedClaim.packagePriceRange || "未填写"} {verifiedClaim.currency}
                </div>
                <div>
                  <span className="text-muted-foreground">历史合作品牌：</span>
                  {verifiedClaim.previousSponsors || "暂无数据"}
                </div>
                <div className="md:col-span-2">
                  <span className="text-muted-foreground">听众画像：</span>
                  {verifiedClaim.audienceDescription || "暂无数据"}
                </div>
              </div>
              <SourceConfidence
                sourceType="creator_authorized"
                sourceLabel="主播提交 / 人工确认"
                confidence={100}
                timestamp={verifiedClaim.updatedAt}
              />
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              暂无主播授权商务信息。品牌方可基于公开数据和 AI 估算进行初步判断。
            </div>
          )}
        </div>

        <div
          className="mt-6 rounded-2xl border border-border bg-card p-6"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium">
                <Building2 className="h-4 w-4 text-primary" /> 历史品牌合作 / 观察到的投放案例
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                来自品牌投放情报库，按播客 ID 或节目名称关联。
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/sponsors">查看品牌投放情报</Link>
            </Button>
          </div>
          {sponsorItems.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {sponsorItems.map((item) => (
                <div key={item.id} className="rounded-lg border border-border bg-muted/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{item.brandName}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {item.industry} · {item.campaignFormat} ·{" "}
                        {item.observedDate || "观察时间未填写"}
                      </div>
                    </div>
                    <Badge variant="outline">{item.confidence}%</Badge>
                  </div>
                  <div className="mt-3">
                    <SourceConfidence
                      sourceType={item.sourceType}
                      sourceLabel={item.sourceLabel}
                      sourceUrl={item.sourceUrl}
                      confidence={item.confidence}
                      timestamp={item.updatedAt}
                      compact
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              暂无已确认品牌合作记录。
            </div>
          )}
        </div>

        <div
          className="mt-6 rounded-2xl border border-border bg-card p-6"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium">公开联系方式</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                来自小宇宙 / 喜马拉雅主页简介中公开写出的建联信息
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {visibleContacts.length ? `${visibleContacts.length} 条` : "待抓取"}
            </Badge>
          </div>
          {visibleContacts.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {visibleContacts.map((contact) => (
                <div key={contact.id} className="rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="text-[10px]">
                      {contact.platform ?? "平台主页"}
                    </Badge>
                    {contact.profile_url && (
                      <a
                        href={contact.profile_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        主页
                      </a>
                    )}
                  </div>
                  <div className="mt-2 space-y-1 text-sm">
                    {contact.contact_email && (
                      <a
                        href={`mailto:${contact.contact_email}`}
                        className="flex items-center gap-2 font-medium hover:underline"
                      >
                        <Mail className="h-4 w-4 text-primary" />
                        {contact.contact_email}
                      </a>
                    )}
                    {contact.contact_name && (
                      <div className="flex items-center gap-2 font-medium">
                        <UserRound className="h-4 w-4 text-primary" />
                        {contact.contact_name}
                      </div>
                    )}
                    {contact.notes && (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {contact.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              暂未在平台主页简介中识别到邮箱或微信。点击上方“同步平台数据”后会重新读取主页。
            </div>
          )}
        </div>

        <div
          className="mt-6 rounded-2xl border border-border bg-card p-6"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">主播商务 CRM</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                维护联系方式、报价、回复率、合作状态、历史品牌和备注
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {CONFIDENCE_LABELS[adProfile?.data_confidence ?? ""] ?? "AI 估算"}
            </Badge>
          </div>
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              saveProfileForm(e.currentTarget);
            }}
          >
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className="text-xs text-muted-foreground">联系邮箱</label>
                <Input
                  name="contactEmail"
                  defaultValue={adProfile?.contact_email ?? ""}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">微信 / 私域</label>
                <Input
                  name="contactWechat"
                  defaultValue={adProfile?.contact_wechat ?? ""}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">通用报价下限</label>
                <Input
                  name="quoteMinRmb"
                  type="number"
                  defaultValue={adProfile?.quote_min_rmb ?? ""}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">通用报价上限</label>
                <Input
                  name="quoteMaxRmb"
                  type="number"
                  defaultValue={adProfile?.quote_max_rmb ?? ""}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Wallet className="h-4 w-4 text-primary" />
                报价栏
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg bg-background p-3">
                  <div className="text-xs font-medium">口播</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Input
                      name="hostReadMinRmb"
                      type="number"
                      placeholder="下限 RMB"
                      defaultValue={adProfile?.host_read_min_rmb ?? ""}
                    />
                    <Input
                      name="hostReadMaxRmb"
                      type="number"
                      placeholder="上限 RMB"
                      defaultValue={adProfile?.host_read_max_rmb ?? ""}
                    />
                  </div>
                </div>
                <div className="rounded-lg bg-background p-3">
                  <div className="text-xs font-medium">冠名</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Input
                      name="sponsorshipMinRmb"
                      type="number"
                      placeholder="下限 RMB"
                      defaultValue={adProfile?.sponsorship_min_rmb ?? ""}
                    />
                    <Input
                      name="sponsorshipMaxRmb"
                      type="number"
                      placeholder="上限 RMB"
                      defaultValue={adProfile?.sponsorship_max_rmb ?? ""}
                    />
                  </div>
                </div>
                <div className="rounded-lg bg-background p-3">
                  <div className="text-xs font-medium">定制单集</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Input
                      name="customEpisodeMinRmb"
                      type="number"
                      placeholder="下限 RMB"
                      defaultValue={adProfile?.custom_episode_min_rmb ?? ""}
                    />
                    <Input
                      name="customEpisodeMaxRmb"
                      type="number"
                      placeholder="上限 RMB"
                      defaultValue={adProfile?.custom_episode_max_rmb ?? ""}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className="text-xs text-muted-foreground">回复率 %</label>
                <Input
                  name="responseRate"
                  type="number"
                  defaultValue={adProfile?.response_rate ?? ""}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">合作状态</label>
                <select
                  name="collaborationStatus"
                  defaultValue={adProfile?.collaboration_status ?? "unknown"}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="unknown">未知</option>
                  <option value="candidate">候选</option>
                  <option value="contacted">已联系</option>
                  <option value="available">可合作</option>
                  <option value="negotiating">沟通中</option>
                  <option value="partnered">已合作</option>
                  <option value="blacklist">暂不合作</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">建议报价下限</label>
                <Input
                  name="suggestedPriceMinRmb"
                  type="number"
                  defaultValue={adProfile?.suggested_price_min_rmb ?? ""}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">建议报价上限</label>
                <Input
                  name="suggestedPriceMaxRmb"
                  type="number"
                  defaultValue={adProfile?.suggested_price_max_rmb ?? ""}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="text-xs text-muted-foreground">历史品牌</label>
                <Input
                  name="historicalBrands"
                  defaultValue={adProfile?.historical_brands?.join("、") ?? ""}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">可接广告类型</label>
                <Input
                  name="adCategories"
                  defaultValue={adProfile?.ad_categories?.join("、") ?? ""}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">数据可信度</label>
                <select
                  name="dataConfidence"
                  defaultValue={adProfile?.data_confidence ?? "ai_estimated"}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="public_data">公开数据</option>
                  <option value="ai_estimated">AI 估算</option>
                  <option value="creator_authorized">主播授权</option>
                  <option value="manual_confirmed">人工确认</option>
                </select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-[160px_1fr]">
              <div>
                <label className="text-xs text-muted-foreground">品牌安全评分</label>
                <Input
                  name="brandSafetyScore"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue={adProfile?.brand_safety_score ?? 80}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">风险标签</label>
                <Input
                  name="brandSafetyTags"
                  defaultValue={adProfile?.brand_safety_tags?.join("、") ?? "未见明显风险"}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">联系方式补充</label>
                <Textarea
                  name="contactMethod"
                  defaultValue={adProfile?.contact_method ?? ""}
                  rows={3}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">备注</label>
                <Textarea
                  name="notes"
                  defaultValue={adProfile?.notes ?? ""}
                  rows={3}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">报价模型依据</label>
                <Textarea
                  name="pricingBasis"
                  defaultValue={adProfile?.pricing_basis ?? ""}
                  rows={3}
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">品牌安全备注</label>
                <Textarea
                  name="brandSafetyNotes"
                  defaultValue={adProfile?.brand_safety_notes ?? ""}
                  rows={3}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Wallet className="h-3.5 w-3.5" />
                  口播：
                  {fmtMoney(adProfile?.host_read_min_rmb ?? adProfile?.suggested_price_min_rmb)}–
                  {fmtMoney(adProfile?.host_read_max_rmb ?? adProfile?.suggested_price_max_rmb)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Wallet className="h-3.5 w-3.5" />
                  冠名：{fmtMoney(adProfile?.sponsorship_min_rmb)}–
                  {fmtMoney(adProfile?.sponsorship_max_rmb)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Wallet className="h-3.5 w-3.5" />
                  定制单集：{fmtMoney(adProfile?.custom_episode_min_rmb)}–
                  {fmtMoney(adProfile?.custom_episode_max_rmb)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  品牌安全：{adProfile?.brand_safety_score ?? 80}/100
                </span>
                <span className="inline-flex items-center gap-1">
                  <Percent className="h-3.5 w-3.5" />
                  回复率：
                  {adProfile?.response_rate == null ? "待记录" : `${adProfile.response_rate}%`}
                </span>
              </div>
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wallet className="h-4 w-4" />
                )}
                保存商务档案
              </Button>
            </div>
          </form>
        </div>

        <div
          className="mt-6 rounded-2xl border border-border bg-card p-6"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">竞品投放监控</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                记录哪些品牌投过这档节目，后续可用于分析品类投放路径
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {competitors.length} 条
            </Badge>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {competitors.map((item) => (
              <div key={item.id} className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{item.brand_name}</div>
                  <Badge variant="outline" className="text-[10px]">
                    {CONFIDENCE_LABELS[item.data_confidence] ?? item.data_confidence}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {[item.brand_category, item.ad_format, item.last_seen_at]
                    .filter(Boolean)
                    .join(" · ") || "待补充"}
                </div>
                {item.notes && (
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{item.notes}</p>
                )}
              </div>
            ))}
          </div>
          <form
            className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_1fr_140px]"
            onSubmit={(e) => {
              e.preventDefault();
              addCompetitorForm(e.currentTarget);
            }}
          >
            <Input name="brandName" placeholder="品牌名" />
            <Input name="brandCategory" placeholder="品类，例如 AI 工具" />
            <Input name="adFormat" placeholder="形式，例如 口播/冠名" />
            <Input name="lastSeenAt" type="date" />
            <Input name="evidenceUrl" placeholder="证据链接" className="md:col-span-2" />
            <select
              name="competitorConfidence"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="public_data">公开数据</option>
              <option value="ai_estimated">AI 估算</option>
              <option value="creator_authorized">主播授权</option>
              <option value="manual_confirmed">人工确认</option>
            </select>
            <Input name="competitorNotes" placeholder="备注" />
            <Button type="submit" disabled={addingCompetitor} className="md:col-span-4">
              {addingCompetitor ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Tag className="h-4 w-4" />
              )}
              添加竞品记录
            </Button>
          </form>
        </div>

        {/* AI ad strategy */}
        <div className="mt-6">
          <AdStrategyPanel podcastId={p.id} initialStrategy={(p.ai_strategy as never) ?? null} />
        </div>

        {/* Brand recommendations */}
        <div className="mt-6">
          <BrandPanel podcastId={p.id} />
        </div>

        {/* Core metrics registration */}
        <div className="mt-6">
          <MetricsForm
            podcastId={p.id}
            initial={{
              audience_persona: metrics.audience_persona ?? null,
              audience_age_range: metrics.audience_age_range ?? null,
              audience_gender_split: metrics.audience_gender_split ?? null,
              audience_geo: metrics.audience_geo ?? null,
              completion_rate: metrics.completion_rate ?? null,
              new_listener_retention: metrics.new_listener_retention ?? null,
              monthly_active_listeners: metrics.monthly_active_listeners ?? null,
              cpm_rate: metrics.cpm_rate ?? null,
              metrics_notes: metrics.metrics_notes ?? null,
              metrics_updated_at: metrics.metrics_updated_at ?? null,
              last_synced_at: metrics.last_synced_at ?? null,
            }}
          />
        </div>

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
                  订阅来自平台快照；评论来自最近单集聚合
                </p>
              </div>
              <Badge variant="outline" className="text-[10px]">
                平台读取
              </Badge>
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
                    name="评论"
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
            <p className="mt-0.5 text-xs text-muted-foreground">
              每周发布集数，来自平台最新单集日期
            </p>
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
            {episodes.slice(0, 20).map((ep) => {
              const epMetrics = parseEpisodeMetrics(ep.description);
              const playCount = metricNumber(epMetrics?.play_count);
              const commentCount = metricNumber(epMetrics?.comment_count);
              const platform = typeof epMetrics?.platform === "string" ? epMetrics.platform : null;
              return (
                <div key={ep.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{ep.title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {fmtDate(ep.pub_date)}
                      {ep.duration_seconds ? ` · ${Math.round(ep.duration_seconds / 60)} 分钟` : ""}
                      {platform ? ` · ${platform === "xiaoyuzhou" ? "小宇宙" : "喜马拉雅"}` : ""}
                    </div>
                    {cleanEpisodeDescription(ep.description) && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {cleanEpisodeDescription(ep.description)}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <PlayCircle className="h-3.5 w-3.5" />
                      {fmtCount(playCount)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageCircle className="h-3.5 w-3.5" />
                      {fmtCount(commentCount)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
