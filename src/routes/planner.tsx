import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { MetricTerm } from "@/components/metric-term";
import { PlannerWorkspaceNav } from "@/components/planner-workspace-nav";
import { planCampaign } from "@/lib/insights.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { SourceConfidence } from "@/components/source-confidence";
import { getSponsorItems, MARKETPLACE_UPDATED_EVENT } from "@/lib/marketplace.storage";
import type { SponsorIntelligenceItem } from "@/lib/marketplace.types";
import { AddToCampaignDialog } from "@/components/add-to-campaign-dialog";
import {
  Loader2,
  Sparkles,
  Target,
  Wallet,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ListChecks,
} from "lucide-react";

export const Route = createFileRoute("/planner")({
  head: () => ({
    meta: [
      { title: "投放规划师 — PodBridge" },
      {
        name: "description",
        content: "输入品牌产品与预算，AI 自动生成中文播客投放方案。",
      },
    ],
  }),
  component: PlannerPage,
});

type Allocation = {
  bucket: string;
  amount_rmb: number;
  percentage: number;
  rationale: string;
};
type Selected = {
  podcast_id: string;
  title: string;
  suggested_format: string;
  estimated_cpm_rmb: number;
  estimated_episodes: number;
  expected_reach: number;
  fit_reason: string;
};
type Plan = {
  strategy_summary: string;
  recommended_format: string;
  brief_match_summary?: string;
  candidate_recommendation_basis?: CandidateBasis[];
  excluded_candidates?: ExcludedCandidate[];
  scenario_plans?: ScenarioPlan[];
  budget_allocation: Allocation[];
  selected_podcasts?: Selected[];
  kpi_forecast: {
    total_reach: number;
    estimated_clicks: number;
    estimated_conversions: number;
    estimated_cpa_rmb: number;
  };
  timeline_weeks: number;
  risk_warnings: string[];
  next_steps: string[];
};
type CandidateBasis = {
  podcast_id: string;
  title: string | null;
  tier: string;
  category: string | null;
  estimated_reach: number;
  estimated_cpm_rmb: number;
  reasons: string[];
  risks: string[];
  source_basis: string;
};
type ExcludedCandidate = {
  title: string | null;
  category: string | null;
  reason: string;
};
type ScenarioPlan = {
  plan_label: string;
  objective: string;
  expectation_level: "低预期" | "中预期" | "高预期" | string;
  expected_effect: string;
  recommended_format: string;
  budget_allocation: Allocation[];
  selected_podcasts?: Selected[];
  kpi_forecast: Plan["kpi_forecast"];
  timeline_weeks: number;
  decision_rule?: string;
  risk_warnings: string[];
  next_steps: string[];
};
type BudgetProfile = {
  maxSingleSpendPct: number;
  note: string;
};

const TIERS = ["头部", "腰部", "长尾", "混合"] as const;
const GOALS = ["品牌曝光", "新品种草", "电商转化", "App下载", "私域引流", "招聘/招商"];

function fmtMoney(n: number) {
  if (n >= 10000) return `¥${(n / 10000).toFixed(1)}万`;
  return `¥${Math.round(n).toLocaleString()}`;
}
function fmtNum(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return Math.round(n).toLocaleString();
}
function displayPlanLabel(label: string) {
  return label.replace(/^Plan\s*/i, "方案 ");
}

function PlannerPage() {
  const plan = useServerFn(planCampaign);

  const [brandName, setBrandName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [goal, setGoal] = useState(GOALS[0]);
  const [budget, setBudget] = useState("100000");
  const [tier, setTier] = useState<(typeof TIERS)[number]>("腰部");
  const [audienceNotes, setAudienceNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Plan | null>(null);
  const [inventorySize, setInventorySize] = useState(0);
  const [budgetProfile, setBudgetProfile] = useState<BudgetProfile | null>(null);
  const [sponsorIntelligence, setSponsorIntelligence] = useState<SponsorIntelligenceItem[]>([]);
  useEffect(() => {
    const refresh = () => {
      void getSponsorItems()
        .then(setSponsorIntelligence)
        .catch(() => setSponsorIntelligence([]));
    };
    refresh();
    window.addEventListener(MARKETPLACE_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(MARKETPLACE_UPDATED_EVENT, refresh);
  }, []);
  const scenarioPlans: ScenarioPlan[] = result?.scenario_plans?.length
    ? result.scenario_plans
    : result
      ? [
          {
            plan_label: "Plan B",
            objective: goal,
            expectation_level: "中预期",
            expected_effect: result.strategy_summary,
            recommended_format: result.recommended_format,
            budget_allocation: result.budget_allocation,
            selected_podcasts: result.selected_podcasts,
            kpi_forecast: result.kpi_forecast,
            timeline_weeks: result.timeline_weeks,
            risk_warnings: result.risk_warnings,
            next_steps: result.next_steps,
          },
        ]
      : [];

  const submit = async () => {
    const budgetNum = parseInt(budget, 10);
    if (!brandName.trim() || !productDescription.trim() || isNaN(budgetNum)) {
      toast.error("请填写品牌、产品描述和预算");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await plan({
        data: {
          brandName: brandName.trim(),
          productDescription: productDescription.trim(),
          goal,
          budgetRmb: budgetNum,
          targetTier: tier,
          audienceNotes: audienceNotes.trim() || null,
        },
      });
      setResult(res.plan as Plan);
      setInventorySize(res.inventorySize);
      setBudgetProfile(res.budgetProfile as BudgetProfile);
      toast.success("投放方案已生成");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <PlannerWorkspaceNav />
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">快速生成方案</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            用于临时试算与方向判断，不保存为投放项目；确认要执行后，到品牌建档生成正式项目
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
          {/* Form */}
          <div
            className="space-y-4 rounded-2xl border border-border bg-card p-6"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div>
              <label className="text-xs font-medium text-muted-foreground">品牌名称</label>
              <Input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="如：瑞幸咖啡"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">产品描述</label>
              <Textarea
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                placeholder="主推产品、卖点、目标人群、定价区间等"
                rows={4}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">投放目的</label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {GOALS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGoal(g)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                      goal === g
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">投放预算（¥）</label>
              <Input
                type="number"
                min={1000}
                step={10000}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                placeholder="100000"
                className="mt-1"
              />
              <div className="mt-1 text-[10px] text-muted-foreground">
                建议 ≥ ¥10,000；当前 ≈ {fmtMoney(parseInt(budget, 10) || 0)}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">目标播客层级</label>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                {TIERS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTier(t)}
                    className={`rounded-md border px-2 py-1.5 text-xs transition-colors ${
                      tier === t
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">人群补充（可选）</label>
              <Textarea
                value={audienceNotes}
                onChange={(e) => setAudienceNotes(e.target.value)}
                placeholder="如：一二线城市、25-35 岁白领女性"
                rows={2}
                className="mt-1"
              />
            </div>
            <Button className="w-full" onClick={submit} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              生成投放方案
            </Button>
            <p className="text-[10px] text-muted-foreground">
              模型：DeepSeek Chat（OpenAI-compatible API）
            </p>
          </div>

          {/* Result */}
          <div className="space-y-5">
            {!result && !loading && (
              <div className="grid h-full place-items-center rounded-2xl border border-dashed border-border p-16 text-center text-sm text-muted-foreground">
                填写左侧表单，AI 将自动从平台库存中匹配播客并生成完整投放方案
              </div>
            )}
            {loading && (
              <div className="grid h-full place-items-center rounded-2xl border border-border bg-card p-16">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm">AI 正在规划方案…通常需 10-30 秒</p>
                </div>
              </div>
            )}

            {result && (
              <>
                <div
                  className="rounded-2xl border border-border bg-card p-6"
                  style={{ boxShadow: "var(--shadow-card)" }}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Target className="h-4 w-4 text-primary" />
                    整体策略
                  </div>
                  <p className="mt-3 text-sm leading-relaxed">{result.strategy_summary}</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <div className="text-xs text-muted-foreground">推荐形式</div>
                      <div className="mt-1 text-sm font-medium">{result.recommended_format}</div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <div className="text-xs text-muted-foreground">建议周期</div>
                      <div className="mt-1 text-sm font-medium">
                        {result.timeline_weeks} 周｜库存 {inventorySize} 档
                      </div>
                    </div>
                  </div>
                  {budgetProfile && (
                    <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
                      <div className="text-xs text-muted-foreground">预算策略</div>
                      <div className="mt-1 text-sm font-medium">{budgetProfile.note}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        单档建议花费上限：总预算的{" "}
                        {Math.round(budgetProfile.maxSingleSpendPct * 100)}%
                      </div>
                    </div>
                  )}
                  {(result.brief_match_summary ||
                    result.candidate_recommendation_basis?.length ||
                    result.excluded_candidates?.length) && (
                    <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <ListChecks className="h-4 w-4 text-primary" />
                        Brief 匹配依据
                      </div>
                      {result.brief_match_summary && (
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                          {result.brief_match_summary}
                        </p>
                      )}
                      {!!result.candidate_recommendation_basis?.length && (
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {result.candidate_recommendation_basis.slice(0, 6).map((candidate) => (
                            <div
                              key={candidate.podcast_id}
                              className="rounded-md border border-border bg-background p-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate text-xs font-semibold">
                                    {candidate.title}
                                  </div>
                                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                                    {candidate.tier} · {candidate.category ?? "未分类"} · 触达{" "}
                                    {fmtNum(candidate.estimated_reach)} · CPM ¥
                                    {candidate.estimated_cpm_rmb}
                                  </div>
                                </div>
                                <Badge variant="outline" className="shrink-0 text-[10px]">
                                  候选
                                </Badge>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1">
                                {candidate.reasons.slice(0, 3).map((reason) => (
                                  <span
                                    key={reason}
                                    className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                                  >
                                    {reason}
                                  </span>
                                ))}
                                {candidate.risks.slice(0, 2).map((risk) => (
                                  <span
                                    key={risk}
                                    className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700"
                                  >
                                    {risk}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {!!result.excluded_candidates?.length && (
                        <div className="mt-3 border-t border-border pt-3">
                          <div className="text-xs font-medium">默认排除样本</div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {result.excluded_candidates.slice(0, 6).map((candidate, index) => (
                              <span
                                key={`${candidate.title}-${index}`}
                                className="rounded-full bg-background px-2 py-1 text-[10px] text-muted-foreground"
                                title={candidate.reason}
                              >
                                {candidate.title ?? "未命名"}：
                                {candidate.reason.replace(/^排除：/, "")}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {scenarioPlans.map((scenario) => (
                  <div
                    key={scenario.plan_label}
                    className="rounded-2xl border border-border bg-card p-6"
                    style={{ boxShadow: "var(--shadow-card)" }}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{displayPlanLabel(scenario.plan_label)}</Badge>
                          <Badge>{scenario.expectation_level}</Badge>
                        </div>
                        <h2 className="mt-3 text-lg font-semibold">{scenario.objective}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {scenario.expected_effect}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-right">
                        <div className="text-xs text-muted-foreground">建议周期</div>
                        <div className="text-sm font-medium">{scenario.timeline_weeks} 周</div>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <div className="text-xs text-muted-foreground">推荐形式</div>
                        <div className="mt-1 text-sm font-medium">
                          {scenario.recommended_format}
                        </div>
                      </div>
                      <div className="rounded-lg border border-border bg-muted/30 p-3">
                        <div className="text-xs text-muted-foreground">进入下一步判断</div>
                        <div className="mt-1 text-sm font-medium">
                          {scenario.decision_rule || "按曝光、点击、转化和询盘质量判断"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        KPI 预测
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                          { label: "总触达", value: fmtNum(scenario.kpi_forecast.total_reach) },
                          {
                            label: "预估点击",
                            value: fmtNum(scenario.kpi_forecast.estimated_clicks),
                          },
                          {
                            label: "预估转化",
                            value: fmtNum(scenario.kpi_forecast.estimated_conversions),
                          },
                          {
                            label: <MetricTerm term="CPA" />,
                            value: fmtMoney(scenario.kpi_forecast.estimated_cpa_rmb),
                          },
                        ].map((k) => (
                          <div
                            key={String(k.label)}
                            className="rounded-lg border border-border bg-muted/30 p-3"
                          >
                            <div className="text-xs text-muted-foreground">{k.label}</div>
                            <div className="mt-1 text-lg font-bold tabular-nums">{k.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Wallet className="h-4 w-4 text-primary" />
                        预算分配
                      </div>
                      <div className="mt-3 space-y-3">
                        {scenario.budget_allocation.map((a, i) => (
                          <div key={i} className="space-y-1">
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="font-medium">{a.bucket}</span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {fmtMoney(a.amount_rmb)}（{a.percentage}%）
                              </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(100, a.percentage)}%`,
                                  background: "var(--gradient-brand)",
                                }}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground">{a.rationale}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {scenario.selected_podcasts && scenario.selected_podcasts.length > 0 && (
                      <div className="mt-5">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                          推荐播客组合（{scenario.selected_podcasts.length} 档）
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {scenario.selected_podcasts.map((p, i) => (
                            <div
                              key={i}
                              className="rounded-lg border border-border bg-muted/30 p-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="text-sm font-semibold">{p.title}</div>
                                <Badge variant="outline" className="text-[10px]">
                                  {p.suggested_format}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">{p.fit_reason}</p>
                              {sponsorIntelligence
                                .filter(
                                  (item) =>
                                    item.podcastId === p.podcast_id ||
                                    item.podcastName.trim().toLocaleLowerCase() ===
                                      p.title.trim().toLocaleLowerCase(),
                                )
                                .slice(0, 1)
                                .map((item) => (
                                  <div
                                    key={item.id}
                                    className="mt-2 rounded-md border border-border bg-background p-2"
                                  >
                                    <p className="text-[11px] font-medium">
                                      该播客已有类似行业品牌投放记录，可作为参考：{item.brandName}（
                                      {item.industry}）
                                    </p>
                                    <div className="mt-1.5">
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
                              <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                                <div>
                                  <div className="text-muted-foreground">
                                    <MetricTerm term="CPM" />
                                  </div>
                                  <div className="font-medium">¥{p.estimated_cpm_rmb}</div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">集数</div>
                                  <div className="font-medium">{p.estimated_episodes}</div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">触达</div>
                                  <div className="font-medium">{fmtNum(p.expected_reach)}</div>
                                </div>
                              </div>
                              <div className="mt-3">
                                <AddToCampaignDialog
                                  podcast={{
                                    podcastId: p.podcast_id,
                                    podcastName: p.title,
                                    matchScore: 75,
                                    brandSafetyScore: 80,
                                    estimatedPriceRange: `CPM ¥${p.estimated_cpm_rmb}`,
                                    recommendedFormat: p.suggested_format,
                                    recommendationReason: p.fit_reason,
                                    confidence: 55,
                                    sourceType: "ai_inferred",
                                    sourceLabel: "AI Planner 推荐结果",
                                  }}
                                  label="加入 Campaign"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          风险提示
                        </div>
                        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
                          {scenario.risk_warnings.map((r, i) => (
                            <li key={i}>· {r}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          下一步动作
                        </div>
                        <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
                          {scenario.next_steps.map((s, i) => (
                            <li key={i}>· {s}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
