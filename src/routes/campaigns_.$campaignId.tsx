import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Copy,
  Download,
  FileText,
  Mail,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SourceConfidence } from "@/components/source-confidence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CAMPAIGN_WORKSPACE_UPDATED,
  campaignWorkspaceId,
  deleteWorkspacePodcastItem,
  getWorkspaceCampaign,
  listWorkspaceAssets,
  listWorkspacePodcastItems,
  saveWorkspaceAssets,
  saveWorkspaceCampaign,
  saveWorkspacePodcastItem,
  updateWorkspacePodcastItem,
} from "@/lib/campaign-workspace.storage";
import type {
  Campaign,
  CampaignGeneratedAsset,
  CampaignPodcastItem,
} from "@/lib/campaign-workspace.types";
import { getSponsorItems } from "@/lib/marketplace.storage";

export const Route = createFileRoute("/campaigns_/$campaignId")({ component: CampaignDetailPage });

type InventoryPodcast = {
  id: string;
  title: string | null;
  category: string | null;
  commercial_score: number | null;
  activity_score: number | null;
  growth_score: number | null;
  subscriber_source: string | null;
  xiaoyuzhou_url?: string | null;
  ximalaya_url?: string | null;
  itunes_url?: string | null;
  podcast_ad_profiles?: {
    host_read_min_rmb: number | null;
    host_read_max_rmb: number | null;
    sponsorship_min_rmb: number | null;
    sponsorship_max_rmb: number | null;
    custom_episode_min_rmb: number | null;
    custom_episode_max_rmb: number | null;
    data_confidence: string | null;
    source_notes: string | null;
  } | null;
};

const CONTACT_LABELS: Record<CampaignPodcastItem["contactStatus"], string> = {
  candidate: "候选",
  to_contact: "待联系",
  contacted: "已联系",
  replied: "已回复",
  quoted: "已报价",
  negotiating: "谈判中",
  confirmed: "已确认",
  rejected: "已拒绝",
  live: "已上线",
  reviewed: "已复盘",
};
const STATUS_OPTIONS = Object.entries(CONTACT_LABELS) as Array<
  [CampaignPodcastItem["contactStatus"], string]
>;
const MARKET_LABELS: Record<Campaign["targetMarket"], string> = {
  china: "中国",
  north_america: "北美",
  europe: "欧洲",
  global: "全球",
  other: "其他",
};

function fmtMoney(value: number, currency: Campaign["currency"]) {
  return `${currency} ${value.toLocaleString()}`;
}
function range(profile: InventoryPodcast["podcast_ad_profiles"]) {
  if (!profile) return undefined;
  const values = [profile.host_read_min_rmb, profile.host_read_max_rmb].filter(
    (value): value is number => value != null,
  );
  if (!values.length) return undefined;
  return `¥${Math.min(...values).toLocaleString()}–${Math.max(...values).toLocaleString()}`;
}
function sourceMeta(
  profile: InventoryPodcast["podcast_ad_profiles"],
): Pick<CampaignPodcastItem, "sourceType" | "sourceLabel" | "confidence"> {
  if (profile?.data_confidence === "manual_confirmed")
    return {
      sourceType: "manual_verified",
      sourceLabel: profile.source_notes || "人工确认报价与播客库数据",
      confidence: 90,
    };
  if (profile?.data_confidence === "creator_authorized")
    return {
      sourceType: "creator_authorized",
      sourceLabel: profile.source_notes || "主播授权资料",
      confidence: 100,
    };
  if (profile?.data_confidence === "public_data")
    return {
      sourceType: "public_info",
      sourceLabel: profile.source_notes || "公开平台数据",
      confidence: 80,
    };
  return {
    sourceType: "ai_inferred",
    sourceLabel: "PodBridge 播客库 + AI 规则估算",
    confidence: 55,
  };
}
function matchScore(campaign: Campaign, podcast: InventoryPodcast) {
  const preferred = campaign.preferredCategories.toLocaleLowerCase();
  const category = (podcast.category ?? "").toLocaleLowerCase();
  const categoryFit =
    category &&
    (preferred.includes(category) ||
      category.split(/[\/、,，]/).some((part) => preferred.includes(part)))
      ? 18
      : 0;
  return Math.min(96, Math.round((podcast.commercial_score ?? 55) * 0.65 + 25 + categoryFit));
}
function buildOutreachAssets(
  campaign: Campaign,
  item: CampaignPodcastItem,
): CampaignGeneratedAsset[] {
  const now = new Date().toISOString();
  const price = item.estimatedPriceRange
    ? `，参考合作预算为 ${item.estimatedPriceRange}`
    : "，希望进一步了解贵节目的正式刊例";
  const cn = `主题：${campaign.brandName} ×《${item.podcastName}》品牌合作邀约\n\n你好，\n\n我是 ${campaign.brandName} 的合作负责人。我们正在为${campaign.productDescription}规划以“${campaign.objective}”为目标的播客投放，认为《${item.podcastName}》与目标人群“${campaign.targetAudience}”有较好的内容契合度。\n\n希望与你沟通一次${item.recommendedFormat}合作${price}。如有兴趣，烦请分享可合作档期、刊例及内容要求。\n\n谢谢，期待交流。`;
  const en = `Subject: ${campaign.brandName} × ${item.podcastName} sponsorship inquiry\n\nHello,\n\nI'm reaching out on behalf of ${campaign.brandName}. We are planning a podcast campaign for ${campaign.productDescription}, focused on ${campaign.objective}. We believe ${item.podcastName} is relevant to our target audience: ${campaign.targetAudience}.\n\nWe would like to explore a ${item.recommendedFormat} collaboration${item.estimatedPriceRange ? ` within the reference range ${item.estimatedPriceRange}` : " and learn more about your rate card"}. Please let us know your availability and partnership requirements.\n\nBest regards,\n${campaign.brandName}`;
  const wechat = `你好，我们是 ${campaign.brandName}，正在规划${campaign.objective}方向的播客投放。觉得《${item.podcastName}》和目标人群很匹配，想咨询${item.recommendedFormat}合作的档期与刊例，方便沟通吗？`;
  const invitation = `${campaign.brandName} 希望邀请《${item.podcastName}》参与${item.recommendedFormat}合作，核心目标为${campaign.objective}。合作内容会尊重节目表达方式，具体脚本、档期和预算可共同确认。`;
  const base = {
    campaignId: campaign.id,
    podcastId: item.podcastId,
    generatedAt: now,
    sourceNote: "AI 生成建议，仅供投放决策参考。请人工核对品牌信息、预算和称呼后使用。",
  };
  return [
    { ...base, id: campaignWorkspaceId("asset"), type: "outreach_email_cn", content: cn },
    { ...base, id: campaignWorkspaceId("asset"), type: "outreach_email_en", content: en },
    { ...base, id: campaignWorkspaceId("asset"), type: "wechat_message", content: wechat },
    { ...base, id: campaignWorkspaceId("asset"), type: "host_invitation", content: invitation },
  ];
}
function buildFinalPlan(campaign: Campaign, items: CampaignPodcastItem[], allocated: number) {
  const reach = Math.round(
    items.reduce((sum, item) => sum + (item.commercialScore ?? 50) * 180, 0),
  );
  const podcastLines = items
    .map(
      (item, index) =>
        `${index + 1}. ${item.podcastName}｜${item.recommendedFormat}｜${item.estimatedPriceRange || "报价待确认"}\n   推荐理由：${item.recommendationReason}\n   Brand Safety：${item.brandSafetyScore}/100｜来源：${item.sourceLabel}｜置信度：${item.confidence}%｜${item.sourceType === "ai_inferred" ? "AI 推断" : "非 AI 来源"}`,
    )
    .join("\n");
  return `# Campaign Summary\n${campaign.campaignName}，品牌 ${campaign.brandName}，目标为${campaign.objective}，目标市场为${MARKET_LABELS[campaign.targetMarket]}。\n\n## 品牌与产品背景\n${campaign.productDescription}\n\n## 目标人群\n${campaign.targetAudience}；${[campaign.audienceAgeRange, campaign.audienceGender, campaign.audienceLocation, campaign.audienceInterest].filter(Boolean).join("；")}\n\n## 推荐播客组合\n${podcastLines || "尚未添加候选播客。"}\n\n## 预算分配\n总预算：${fmtMoney(campaign.budget, campaign.currency)}\n已分配：${fmtMoney(allocated, campaign.currency)}\n剩余：${fmtMoney(campaign.budget - allocated, campaign.currency)}\n\n## 合作形式建议\n优先使用候选播客卡片中记录的合作形式，并在获得主播正式刊例后校正。\n\n## 建联策略\n先联系高匹配且报价处于预算范围内的节目，48 小时未回复可礼貌跟进一次。\n\n## 口播脚本方向\n以“${campaign.requiredMessage || campaign.productDescription}”为核心信息，保留主播个人表达，避免硬性销售话术。\n\n## KPI 预估\n预估触达约 ${reach.toLocaleString()}；该数字由候选节目商业评分规则估算，不代表平台官方数据。\n\n## Brand Safety 风险提醒\n投放前人工抽检近期单集，并复核禁投话题：${campaign.forbiddenTopics || "未填写"}。\n\n## 数据来源与置信度\n每档播客的来源和置信度已在推荐列表逐项列出。AI 推断不等于公开平台或主播确认数据。\n\n## 下一步行动\n确认 Shortlist、获取正式刊例、锁定排期、审核脚本、上线后记录数据并复盘。\n\n> AI 生成建议，仅供投放决策参考。`;
}

function CampaignDetailPage() {
  const { campaignId } = Route.useParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [items, setItems] = useState<CampaignPodcastItem[]>([]);
  const [assets, setAssets] = useState<CampaignGeneratedAsset[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [inventory, setInventory] = useState<InventoryPodcast[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("commercial");
  const [outreachFor, setOutreachFor] = useState<CampaignPodcastItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [similarSponsors, setSimilarSponsors] = useState<
    Awaited<ReturnType<typeof getSponsorItems>>
  >([]);
  const refresh = async () => {
    try {
      const [nextCampaign, nextItems, sponsors] = await Promise.all([
        getWorkspaceCampaign(campaignId),
        listWorkspacePodcastItems(campaignId),
        getSponsorItems(),
      ]);
      setCampaign(nextCampaign);
      setItems(nextItems);
      setSimilarSponsors(
        nextCampaign
          ? sponsors
              .filter(
                (item) =>
                  `${nextCampaign.productCategory ?? ""} ${nextCampaign.preferredCategories}`
                    .toLocaleLowerCase()
                    .includes(item.industry.toLocaleLowerCase()) ||
                  item.industry
                    .toLocaleLowerCase()
                    .includes((nextCampaign.productCategory ?? "__none__").toLocaleLowerCase()),
              )
              .slice(0, 3)
          : [],
      );
      setAssets(listWorkspaceAssets(campaignId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Campaign 加载失败");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    const listener = () => void refresh();
    window.addEventListener(CAMPAIGN_WORKSPACE_UPDATED, listener);
    return () => window.removeEventListener(CAMPAIGN_WORKSPACE_UPDATED, listener);
  }, [campaignId]);
  useEffect(() => {
    if (!addOpen || inventory.length) return;
    setInventoryLoading(true);
    fetch("/api/public/dashboard-podcasts")
      .then((response) => response.json())
      .then((data) => setInventory(data.podcasts ?? []))
      .catch(() => toast.error("播客库加载失败"))
      .finally(() => setInventoryLoading(false));
  }, [addOpen, inventory.length]);
  const categories = [
    ...new Set(
      inventory.map((item) => item.category).filter((value): value is string => Boolean(value)),
    ),
  ].sort();
  const visibleInventory = useMemo(
    () =>
      inventory
        .filter(
          (item) =>
            (!query.trim() ||
              (item.title ?? "").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) &&
            (category === "all" || item.category === category),
        )
        .sort((a, b) =>
          sort === "commercial"
            ? (b.commercial_score ?? 0) - (a.commercial_score ?? 0)
            : (a.title ?? "").localeCompare(b.title ?? "", "zh-CN"),
        )
        .slice(0, 80),
    [inventory, query, category, sort],
  );
  const allocated = items.reduce(
    (sum, item) => sum + (item.negotiatedPrice ?? item.quotedPrice ?? 0),
    0,
  );
  const latestPlan = assets
    .filter((asset) => asset.type === "final_plan")
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0];
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        正在加载 Campaign…
      </div>
    );
  if (!campaign)
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="mx-auto max-w-4xl px-6 py-20 text-center">
          <h1 className="text-2xl font-semibold">Campaign 不存在或无权访问</h1>
          <Button asChild className="mt-4">
            <Link to="/campaigns">返回投放项目</Link>
          </Button>
        </main>
      </div>
    );
  const generateOutreach = (item: CampaignPodcastItem) => {
    const generated = buildOutreachAssets(campaign, item);
    saveWorkspaceAssets(generated);
    setOutreachFor(item);
    toast.success("建联文案已生成");
  };
  const generatePlan = () => {
    const content = buildFinalPlan(campaign, items, allocated);
    saveWorkspaceAssets([
      {
        id: campaignWorkspaceId("asset"),
        campaignId,
        type: "final_plan",
        content,
        generatedAt: new Date().toISOString(),
        sourceNote: "AI 生成建议，仅供投放决策参考。",
      },
    ]);
    toast.success("最终投放方案已生成");
  };
  const exportMarkdown = () => {
    const plan = latestPlan?.content ?? buildFinalPlan(campaign, items, allocated);
    const outreach = assets
      .filter(
        (asset) =>
          asset.type.startsWith("outreach_") ||
          asset.type === "wechat_message" ||
          asset.type === "host_invitation",
      )
      .map((asset) => `## ${asset.type}\n${asset.content}`)
      .join("\n\n");
    const content = `${plan}\n\n# 建联文案\n${outreach || "暂无已生成建联文案。"}\n\n# 来源与置信度说明\n${items.map((item) => `- ${item.podcastName}: ${item.sourceLabel}, ${item.confidence}%, ${item.sourceType === "ai_inferred" ? "AI 推断" : "已标注非 AI 来源"}`).join("\n")}`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${campaign.campaignName.replace(/[^\w\u4e00-\u9fa5-]+/g, "-")}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Link
          to="/campaigns"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          返回投放项目
        </Link>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-bold">{campaign.campaignName}</h1>
              <Badge>{campaign.status}</Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {campaign.brandName} · {campaign.objective} · {MARKET_LABELS[campaign.targetMarket]}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportMarkdown}>
              <Download className="h-4 w-4" />
              导出 Markdown
            </Button>
            <Button variant="outline" disabled title="即将支持">
              导出 PDF（即将支持）
            </Button>
            <Button onClick={generatePlan}>
              <Sparkles className="h-4 w-4" />
              生成最终投放方案
            </Button>
          </div>
        </div>

        <section className="mt-6 rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Campaign Brief</h2>
            <select
              value={campaign.status}
              onChange={(event) => {
                void saveWorkspaceCampaign({
                  ...campaign,
                  status: event.target.value as Campaign["status"],
                  updatedAt: new Date().toISOString(),
                })
                  .then(() => toast.success("Campaign 状态已更新"))
                  .catch((error) => toast.error(error.message));
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="draft">草稿</option>
              <option value="planning">规划中</option>
              <option value="contacting">建联中</option>
              <option value="negotiating">谈判中</option>
              <option value="confirmed">已确认</option>
              <option value="live">已上线</option>
              <option value="completed">已复盘</option>
              <option value="paused">已暂停</option>
            </select>
          </div>
          <div className="mt-4 grid gap-4 text-sm md:grid-cols-2 lg:grid-cols-4">
            <div>
              <span className="text-muted-foreground">品牌：</span>
              {campaign.brandName}
            </div>
            <div>
              <span className="text-muted-foreground">产品：</span>
              {campaign.productCategory || "未填写"}
            </div>
            <div>
              <span className="text-muted-foreground">预算：</span>
              {fmtMoney(campaign.budget, campaign.currency)}
            </div>
            <div>
              <span className="text-muted-foreground">排期：</span>
              {campaign.campaignStartDate || "待定"} – {campaign.campaignEndDate || "待定"}
            </div>
            <div className="md:col-span-2">
              <span className="text-muted-foreground">目标人群：</span>
              {campaign.targetAudience}
            </div>
            <div className="md:col-span-2">
              <span className="text-muted-foreground">禁投内容：</span>
              {campaign.forbiddenTopics || "未填写"}
            </div>
            <div className="md:col-span-4">
              <span className="text-muted-foreground">产品描述：</span>
              {campaign.productDescription}
            </div>
          </div>
        </section>

        {similarSponsors.length > 0 && (
          <section className="mt-6 rounded-lg border border-border bg-card p-5">
            <h2 className="text-sm font-semibold">相似行业投放参考</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              存在相似行业播客投放案例，可作为参考。以下记录不代表品牌官方策略。
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {similarSponsors.map((item) => (
                <div key={item.id} className="rounded-md border border-border p-3">
                  <div className="text-sm font-medium">
                    {item.brandName} × {item.podcastName}
                  </div>
                  <div className="mt-2">
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
          </section>
        )}

        <section className="mt-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">总预算</div>
              <div className="mt-1 text-xl font-bold">
                {fmtMoney(campaign.budget, campaign.currency)}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">已分配预算</div>
              <div className="mt-1 text-xl font-bold">{fmtMoney(allocated, campaign.currency)}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">剩余预算</div>
              <div
                className={`mt-1 text-xl font-bold ${allocated > campaign.budget ? "text-destructive" : ""}`}
              >
                {fmtMoney(campaign.budget - allocated, campaign.currency)}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">候选播客</div>
              <div className="mt-1 text-xl font-bold">{items.length}</div>
            </div>
          </div>
          {allocated > campaign.budget && (
            <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              当前候选播客预算已超过 Campaign 总预算，请调整报价或删除部分候选播客。
            </div>
          )}
          {items.length > 0 && (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full ${allocated > campaign.budget ? "bg-destructive" : "bg-primary"}`}
                style={{
                  width: `${Math.min(100, campaign.budget ? (allocated / campaign.budget) * 100 : 0)}%`,
                }}
              />
            </div>
          )}
        </section>

        <section className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">候选播客 Shortlist</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                评分、报价和推荐理由均显示来源与置信度；AI 结论需要人工复核。
              </p>
            </div>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />
              添加候选播客
            </Button>
          </div>
          {!items.length ? (
            <div className="mt-4 rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              暂无候选播客。请从现有播客库添加 Shortlist。
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {items.map((item) => (
                <article key={item.id} className="rounded-lg border border-border bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to="/podcast/$id"
                          params={{ id: item.podcastId }}
                          className="font-semibold hover:text-primary"
                        >
                          {item.podcastName}
                        </Link>
                        <Badge variant="outline">{item.category || "未分类"}</Badge>
                        <Badge variant="secondary">{CONTACT_LABELS[item.contactStatus]}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>商业价值 {item.commercialScore ?? "—"}</span>
                        <span>品牌匹配 {item.matchScore}</span>
                        <span>Brand Safety {item.brandSafetyScore}</span>
                        <span>建议报价 {item.estimatedPriceRange || "待确认"}</span>
                        <span>合作形式 {item.recommendedFormat}</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => generateOutreach(item)}>
                        <Mail className="h-4 w-4" />
                        生成建联邮件
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title="删除候选"
                        onClick={() => {
                          void deleteWorkspacePodcastItem(item.id)
                            .then(() => toast.success("候选播客已删除"))
                            .catch((error) => toast.error(error.message));
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 rounded-md border border-amber-200 bg-amber-50/40 p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">AI 生成建议</Badge>
                      <span className="text-xs text-muted-foreground">
                        匹配分与 Brand Safety 均为 AI 推断，仅供投放决策参考
                      </span>
                    </div>
                    <p className="mt-2 text-sm">{item.recommendationReason}</p>
                  </div>
                  <div className="mt-3">
                    <SourceConfidence
                      sourceType={item.sourceType}
                      sourceLabel={item.sourceLabel}
                      sourceUrl={item.sourceUrl}
                      confidence={item.confidence}
                      timestamp={item.updatedAt}
                    />
                  </div>
                  <form
                    key={item.updatedAt}
                    className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      const num = (name: string) => {
                        const value = String(form.get(name) ?? "");
                        return value ? Number(value) : undefined;
                      };
                      void updateWorkspacePodcastItem(item.id, {
                        contactStatus: String(
                          form.get("contactStatus"),
                        ) as CampaignPodcastItem["contactStatus"],
                        contactPerson: String(form.get("contactPerson") ?? "").trim() || undefined,
                        contactInfo: String(form.get("contactInfo") ?? "").trim() || undefined,
                        quotedPrice: num("quotedPrice"),
                        negotiatedPrice: num("negotiatedPrice"),
                        recommendedFormat: String(form.get("recommendedFormat") ?? ""),
                        note: String(form.get("note") ?? "").trim() || undefined,
                        nextAction: String(form.get("nextAction") ?? "").trim() || undefined,
                        nextFollowUpDate: String(form.get("nextFollowUpDate") ?? "") || undefined,
                      })
                        .then(() => toast.success("候选播客记录已保存"))
                        .catch((error) => toast.error(error.message));
                    }}
                  >
                    <label className="text-xs text-muted-foreground">
                      联系状态
                      <select
                        name="contactStatus"
                        defaultValue={item.contactStatus}
                        className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                      >
                        {STATUS_OPTIONS.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-muted-foreground">
                      联系人
                      <Input
                        name="contactPerson"
                        className="mt-1"
                        defaultValue={item.contactPerson}
                      />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      联系方式
                      <Input name="contactInfo" className="mt-1" defaultValue={item.contactInfo} />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      合作形式
                      <Input
                        name="recommendedFormat"
                        className="mt-1"
                        defaultValue={item.recommendedFormat}
                      />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      初始报价
                      <Input
                        name="quotedPrice"
                        type="number"
                        className="mt-1"
                        defaultValue={item.quotedPrice}
                      />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      谈判后报价
                      <Input
                        name="negotiatedPrice"
                        type="number"
                        className="mt-1"
                        defaultValue={item.negotiatedPrice}
                      />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      下一步行动
                      <Input name="nextAction" className="mt-1" defaultValue={item.nextAction} />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      下次跟进日期
                      <Input
                        name="nextFollowUpDate"
                        type="date"
                        className="mt-1"
                        defaultValue={item.nextFollowUpDate}
                      />
                    </label>
                    <label className="text-xs text-muted-foreground md:col-span-2 lg:col-span-3">
                      备注
                      <Textarea name="note" rows={2} className="mt-1" defaultValue={item.note} />
                    </label>
                    <div className="flex items-end">
                      <Button type="submit" className="w-full">
                        保存候选记录
                      </Button>
                    </div>
                  </form>
                </article>
              ))}
            </div>
          )}
        </section>

        {latestPlan && (
          <section className="mt-8 rounded-lg border border-border bg-card p-6">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h2 className="font-semibold">最终投放方案</h2>
              <Badge variant="secondary">AI 生成建议</Badge>
            </div>
            <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed">
              {latestPlan.content}
            </pre>
            <p className="mt-4 text-xs text-muted-foreground">{latestPlan.sourceNote}</p>
          </section>
        )}

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>从播客库添加候选</DialogTitle>
              <DialogDescription>
                搜索现有播客数据并加入 Shortlist。匹配分和 Brand Safety 为 AI 规则估算，需人工确认。
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索播客名称"
                  className="pl-9"
                />
              </div>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">全部分类</option>
                {categories.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="commercial">商业价值从高到低</option>
                <option value="title">名称排序</option>
              </select>
            </div>
            {inventoryLoading ? (
              <div className="py-16 text-center text-sm text-muted-foreground">正在读取播客库…</div>
            ) : (
              <div className="mt-2 divide-y divide-border rounded-lg border border-border">
                {visibleInventory.map((podcast) => {
                  const meta = sourceMeta(podcast.podcast_ad_profiles);
                  const score = matchScore(campaign, podcast);
                  const sourceUrl =
                    podcast.xiaoyuzhou_url ??
                    podcast.ximalaya_url ??
                    podcast.itunes_url ??
                    undefined;
                  return (
                    <div
                      key={podcast.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3"
                    >
                      <div>
                        <div className="font-medium">{podcast.title || "未命名播客"}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {podcast.category || "未分类"} · 商业价值{" "}
                          {podcast.commercial_score ?? "—"} · 匹配 {score} · 报价{" "}
                          {range(podcast.podcast_ad_profiles) || "待确认"}
                        </div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          来源：{meta.sourceLabel} · 置信度 {meta.confidence}%
                          {meta.sourceType === "ai_inferred" ? " · AI 推断" : ""}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          const now = new Date().toISOString();
                          void saveWorkspacePodcastItem({
                            id: campaignWorkspaceId("campaign-podcast"),
                            campaignId,
                            podcastId: podcast.id,
                            podcastName: podcast.title || "未命名播客",
                            category: podcast.category ?? undefined,
                            platform: podcast.subscriber_source ?? undefined,
                            commercialScore: podcast.commercial_score ?? undefined,
                            matchScore: score,
                            brandSafetyScore: Math.min(
                              95,
                              Math.max(55, Math.round(70 + (podcast.activity_score ?? 50) * 0.2)),
                            ),
                            estimatedPriceRange: range(podcast.podcast_ad_profiles),
                            recommendedFormat: "口播广告",
                            recommendationReason: `${podcast.category || "当前内容分类"}与 Campaign 偏好“${campaign.preferredCategories}”进行规则匹配，商业价值评分为 ${podcast.commercial_score ?? "暂无"}；建议先获取正式刊例并人工复核受众。`,
                            confidence: meta.confidence,
                            sourceType: meta.sourceType,
                            sourceLabel: meta.sourceLabel,
                            sourceUrl,
                            contactStatus: "candidate",
                            createdAt: now,
                            updatedAt: now,
                          })
                            .then((result) =>
                              toast.success(
                                result.duplicated ? "该播客已在 Shortlist" : "已加入 Shortlist",
                              ),
                            )
                            .catch((error) => toast.error(error.message));
                        }}
                      >
                        加入 Shortlist
                      </Button>
                    </div>
                  );
                })}
                {!visibleInventory.length && (
                  <div className="p-10 text-center text-sm text-muted-foreground">
                    没有匹配的播客。
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={!!outreachFor} onOpenChange={(open) => !open && setOutreachFor(null)}>
          <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{outreachFor?.podcastName} · 建联文案</DialogTitle>
              <DialogDescription>
                AI 生成建议，仅供投放决策参考。不会自动发送，请人工核对后复制。
              </DialogDescription>
            </DialogHeader>
            {outreachFor && (
              <div className="space-y-4">
                {assets
                  .filter(
                    (asset) =>
                      asset.podcastId === outreachFor.podcastId &&
                      [
                        "outreach_email_cn",
                        "outreach_email_en",
                        "wechat_message",
                        "host_invitation",
                      ].includes(asset.type),
                  )
                  .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
                  .filter(
                    (asset, index, all) =>
                      all.findIndex((entry) => entry.type === asset.type) === index,
                  )
                  .map((asset) => (
                    <div key={asset.id} className="rounded-md border border-border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <Badge variant="secondary">{asset.type}</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            navigator.clipboard
                              .writeText(asset.content)
                              .then(() => toast.success("已复制"))
                          }
                        >
                          <Copy className="h-4 w-4" />
                          复制
                        </Button>
                      </div>
                      <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed">
                        {asset.content}
                      </pre>
                      <p className="mt-3 text-[10px] text-muted-foreground">{asset.sourceNote}</p>
                    </div>
                  ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
