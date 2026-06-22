import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { PlannerWorkspaceNav } from "@/components/planner-workspace-nav";
import {
  createBrandBrief,
  generateCampaignFromBrief,
  listBriefsAndCampaigns,
} from "@/lib/campaign.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { BriefDatePicker } from "@/components/brief-date-picker";
import { Loader2, Sparkles, FileText, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/briefs")({
  head: () => ({
    meta: [{ title: "品牌建档 — PodBridge" }],
  }),
  component: BriefsPage,
});

const GOALS = ["品牌曝光", "新品种草", "电商转化", "App下载", "私域引流", "招聘/招商"];
const TIERS = ["头部", "腰部", "长尾", "混合"] as const;

function BriefsPage() {
  const createBrief = useServerFn(createBrandBrief);
  const generate = useServerFn(generateCampaignFromBrief);
  const list = useServerFn(listBriefsAndCampaigns);
  const navigate = useNavigate();

  const [brandName, setBrandName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [goal, setGoal] = useState(GOALS[0]);
  const [budget, setBudget] = useState("100000");
  const [targetTier, setTargetTier] = useState<(typeof TIERS)[number]>("混合");
  const [audienceNotes, setAudienceNotes] = useState("");
  const [flightStart, setFlightStart] = useState("");
  const [flightEnd, setFlightEnd] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["briefs-campaigns"],
    queryFn: () => list(),
  });

  const submit = async () => {
    const budgetRmb = parseInt(budget, 10);
    if (!brandName.trim() || !productDescription.trim() || Number.isNaN(budgetRmb)) {
      toast.error("请填写品牌、产品描述和预算");
      return;
    }
    setSubmitting(true);
    try {
      const brief = await createBrief({
        data: {
          brandName: brandName.trim(),
          productDescription: productDescription.trim(),
          goal,
          budgetRmb,
          targetTier,
          audienceNotes: audienceNotes.trim() || null,
          flightStart: flightStart || null,
          flightEnd: flightEnd || null,
        },
      });
      toast.success("品牌需求已创建，正在生成投放项目");
      const campaign = await generate({ data: { briefId: brief.brief.id } });
      toast.success("投放项目已生成");
      navigate({ to: "/campaigns", search: { campaignId: campaign.campaignId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setSubmitting(false);
      refetch();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <PlannerWorkspaceNav />
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">品牌建档</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              用于正式保存品牌需求、投放周期和节点，一键生成方案 A/B/C、建联列表和投放项目
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to="/campaigns">
              投放管理
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
          <div
            className="space-y-4 rounded-2xl border border-border bg-card p-6"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div>
              <label className="text-xs font-medium text-muted-foreground">品牌名称</label>
              <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">产品描述</label>
              <Textarea
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                rows={5}
                className="mt-1"
                placeholder="产品卖点、价格、目标人群、转化链路、禁忌等"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">投放目的</label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {GOALS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setGoal(item)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      goal === item
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">预算 RMB</label>
                <Input value={budget} onChange={(e) => setBudget(e.target.value)} type="number" className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">目标层级</label>
                <div className="mt-1 grid grid-cols-4 gap-1">
                  {TIERS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setTargetTier(item)}
                      className={`rounded-md border px-2 py-2 text-xs ${
                        targetTier === item
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <BriefDatePicker label="开始日期" value={flightStart} onChange={setFlightStart} />
              <BriefDatePicker label="结束日期" value={flightEnd} onChange={setFlightEnd} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">人群补充</label>
              <Textarea value={audienceNotes} onChange={(e) => setAudienceNotes(e.target.value)} rows={3} className="mt-1" />
            </div>
            <Button className="w-full" onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              创建品牌需求并生成投放项目
            </Button>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-6" style={{ boxShadow: "var(--shadow-card)" }}>
              <div className="mb-4 flex items-center gap-2 text-sm font-medium">
                <FileText className="h-4 w-4 text-primary" />
                最近品牌需求
              </div>
              {isLoading ? (
                <div className="grid place-items-center py-12 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <div className="space-y-3">
                  {(data?.briefs ?? []).map((brief) => (
                    <div key={brief.id} className="rounded-lg border border-border bg-muted/30 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{brief.brand_name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {brief.goal} · ¥{brief.budget_rmb.toLocaleString()} · {brief.target_tier}
                          </div>
                        </div>
                        <Badge variant="outline">{brief.status}</Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{brief.product_description}</p>
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          setSubmitting(true);
                          try {
                            const campaign = await generate({ data: { briefId: brief.id } });
                            toast.success("投放项目已生成");
                            navigate({ to: "/campaigns", search: { campaignId: campaign.campaignId } });
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "生成失败");
                          } finally {
                            setSubmitting(false);
                          }
                        }}
                        disabled={submitting}
                      >
                        生成投放项目
                      </Button>
                    </div>
                  ))}
                  {!data?.briefs?.length && (
                    <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                      还没有品牌需求
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
