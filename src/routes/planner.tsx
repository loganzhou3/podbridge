import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { planCampaign } from "@/lib/insights.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  Sparkles,
  Target,
  Wallet,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">投放规划师</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            填写品牌信息与预算，由 GPT-5 基于平台真实播客库存生成投放方案
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
              <label className="text-xs font-medium text-muted-foreground">
                产品描述
              </label>
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
              <label className="text-xs font-medium text-muted-foreground">
                投放预算（¥）
              </label>
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
              <label className="text-xs font-medium text-muted-foreground">
                目标播客层级
              </label>
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
              <label className="text-xs font-medium text-muted-foreground">
                人群补充（可选）
              </label>
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
              模型：OpenAI GPT-5（通过 Lovable AI Gateway）
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
                  <p className="text-sm">GPT-5 正在规划方案…通常需 10-30 秒</p>
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
                  <p className="mt-3 text-sm leading-relaxed">
                    {result.strategy_summary}
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <div className="text-xs text-muted-foreground">推荐形式</div>
                      <div className="mt-1 text-sm font-medium">
                        {result.recommended_format}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <div className="text-xs text-muted-foreground">建议周期</div>
                      <div className="mt-1 text-sm font-medium">
                        {result.timeline_weeks} 周｜库存 {inventorySize} 档
                      </div>
                    </div>
                  </div>
                </div>

                {/* KPI Forecast */}
                <div
                  className="rounded-2xl border border-border bg-card p-6"
                  style={{ boxShadow: "var(--shadow-card)" }}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    KPI 预测
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: "总触达", value: fmtNum(result.kpi_forecast.total_reach) },
                      {
                        label: "预估点击",
                        value: fmtNum(result.kpi_forecast.estimated_clicks),
                      },
                      {
                        label: "预估转化",
                        value: fmtNum(result.kpi_forecast.estimated_conversions),
                      },
                      {
                        label: "CPA",
                        value: fmtMoney(result.kpi_forecast.estimated_cpa_rmb),
                      },
                    ].map((k) => (
                      <div
                        key={k.label}
                        className="rounded-lg border border-border bg-muted/30 p-3"
                      >
                        <div className="text-xs text-muted-foreground">{k.label}</div>
                        <div className="mt-1 text-lg font-bold tabular-nums">
                          {k.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Budget allocation */}
                <div
                  className="rounded-2xl border border-border bg-card p-6"
                  style={{ boxShadow: "var(--shadow-card)" }}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Wallet className="h-4 w-4 text-primary" />
                    预算分配
                  </div>
                  <div className="mt-4 space-y-3">
                    {result.budget_allocation.map((a, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{a.bucket}</span>
                          <span className="tabular-nums text-muted-foreground">
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

                {/* Selected podcasts */}
                {result.selected_podcasts && result.selected_podcasts.length > 0 && (
                  <div
                    className="rounded-2xl border border-border bg-card p-6"
                    style={{ boxShadow: "var(--shadow-card)" }}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      推荐播客组合（{result.selected_podcasts.length} 档）
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {result.selected_podcasts.map((p, i) => (
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
                          <p className="mt-1 text-xs text-muted-foreground">
                            {p.fit_reason}
                          </p>
                          <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                            <div>
                              <div className="text-muted-foreground">CPM</div>
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
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      风险提示
                    </div>
                    <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
                      {result.risk_warnings.map((r, i) => (
                        <li key={i}>· {r}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      下一步动作
                    </div>
                    <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
                      {result.next_steps.map((s, i) => (
                        <li key={i}>· {s}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
