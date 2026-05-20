import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { SiteHeader } from "@/components/site-header";
import { planCrossBorderCampaign } from "@/lib/insights.functions";
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
  Globe2,
  Languages,
} from "lucide-react";

export const Route = createFileRoute("/global/planner")({
  head: () => ({
    meta: [
      { title: "Cross-Border Planner — PodBridge" },
      {
        name: "description",
        content:
          "AI-powered cross-border podcast advertising plan for Chinese brands entering North America.",
      },
    ],
  }),
  component: GlobalPlanner,
});

type Allocation = {
  bucket: string;
  amount_usd: number;
  percentage: number;
  rationale: string;
};
type Selected = {
  podcast_id: string;
  title: string;
  suggested_format: string;
  estimated_cpm_usd: number;
  estimated_episodes: number;
  expected_reach: number;
  fit_reason: string;
};
type Plan = {
  strategy_summary: string;
  recommended_format: string;
  cultural_localization_tips: string[];
  budget_allocation: Allocation[];
  selected_podcasts?: Selected[];
  kpi_forecast: {
    total_reach: number;
    estimated_clicks: number;
    estimated_conversions: number;
    estimated_cpa_usd: number;
  };
  timeline_weeks: number;
  risk_warnings: string[];
  next_steps: string[];
};

const TIERS = [
  { v: "top", label: "Top" },
  { v: "mid", label: "Mid" },
  { v: "long-tail", label: "Long-tail" },
  { v: "mixed", label: "Mixed" },
] as const;
const GOALS = [
  "Brand awareness",
  "Product launch",
  "E-commerce conversion",
  "App install",
  "DTC subscription",
  "Lead generation",
];

function fmtMoney(n: number) {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Math.round(n).toLocaleString();
}

function GlobalPlanner() {
  const plan = useServerFn(planCrossBorderCampaign);
  const [brandName, setBrandName] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [goal, setGoal] = useState(GOALS[0]);
  const [budget, setBudget] = useState("50000");
  const [tier, setTier] = useState<(typeof TIERS)[number]["v"]>("mid");
  const [region, setRegion] = useState("US + Canada");
  const [audienceNotes, setAudienceNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Plan | null>(null);
  const [inventorySize, setInventorySize] = useState(0);

  const submit = async () => {
    const budgetNum = parseInt(budget, 10);
    if (!brandName.trim() || !productDescription.trim() || isNaN(budgetNum)) {
      toast.error("Please fill brand, product and budget");
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
          budgetUsd: budgetNum,
          targetTier: tier,
          targetRegion: region.trim() || null,
          audienceNotes: audienceNotes.trim() || null,
        },
      });
      setResult(res.plan as Plan);
      setInventorySize(res.inventorySize);
      toast.success("Plan generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-8">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1 text-xs text-muted-foreground">
            <Globe2 className="h-3 w-3" />
            China → North America
          </div>
          <h1 className="text-3xl font-bold tracking-tight">出海播客投放规划师</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Powered by GPT-5 · 输入跨境品牌与预算（USD），自动从北美英文播客库存中匹配最优组合
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
          <div
            className="space-y-4 rounded-2xl border border-border bg-card p-6"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div>
              <label className="text-xs font-medium text-muted-foreground">Brand</label>
              <Input
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="e.g. Anker / SHEIN / DJI"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Product description
              </label>
              <Textarea
                value={productDescription}
                onChange={(e) => setProductDescription(e.target.value)}
                placeholder="What you sell, key USP, target NA audience, price range"
                rows={4}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Goal</label>
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
                Budget (USD)
              </label>
              <Input
                type="number"
                min={500}
                step={5000}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="mt-1"
              />
              <div className="mt-1 text-[10px] text-muted-foreground">
                ≈ {fmtMoney(parseInt(budget, 10) || 0)}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Tier</label>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                {TIERS.map((t) => (
                  <button
                    key={t.v}
                    type="button"
                    onClick={() => setTier(t.v)}
                    className={`rounded-md border px-2 py-1.5 text-xs transition-colors ${
                      tier === t.v
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-muted/30 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Target region
              </label>
              <Input
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="US + Canada"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                Audience notes (optional)
              </label>
              <Textarea
                value={audienceNotes}
                onChange={(e) => setAudienceNotes(e.target.value)}
                placeholder="e.g. tech-curious millennials in coastal US cities"
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
              Generate cross-border plan
            </Button>
            <p className="text-[10px] text-muted-foreground">
              Model: OpenAI GPT-5 via Lovable AI Gateway
            </p>
          </div>

          <div className="space-y-5">
            {!result && !loading && (
              <div className="grid h-full place-items-center rounded-2xl border border-dashed border-border p-16 text-center text-sm text-muted-foreground">
                Fill the form on the left. AI matches NA podcasts from the inventory and
                produces a localization-ready plan.
              </div>
            )}
            {loading && (
              <div className="grid h-full place-items-center rounded-2xl border border-border bg-card p-16">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm">GPT-5 planning… usually 10–30 sec</p>
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
                    Strategy
                  </div>
                  <p className="mt-3 text-sm leading-relaxed">{result.strategy_summary}</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <div className="text-xs text-muted-foreground">Recommended format</div>
                      <div className="mt-1 text-sm font-medium">
                        {result.recommended_format}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      <div className="text-xs text-muted-foreground">Timeline · Inventory</div>
                      <div className="mt-1 text-sm font-medium">
                        {result.timeline_weeks}w · {inventorySize} shows
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className="rounded-2xl border border-border bg-card p-6"
                  style={{ boxShadow: "var(--shadow-card)" }}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Languages className="h-4 w-4 text-primary" />
                    Cultural localization tips
                  </div>
                  <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                    {result.cultural_localization_tips.map((t, i) => (
                      <li key={i}>· {t}</li>
                    ))}
                  </ul>
                </div>

                <div
                  className="rounded-2xl border border-border bg-card p-6"
                  style={{ boxShadow: "var(--shadow-card)" }}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    KPI forecast
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: "Reach", value: fmtNum(result.kpi_forecast.total_reach) },
                      { label: "Clicks", value: fmtNum(result.kpi_forecast.estimated_clicks) },
                      {
                        label: "Conversions",
                        value: fmtNum(result.kpi_forecast.estimated_conversions),
                      },
                      {
                        label: "CPA",
                        value: fmtMoney(result.kpi_forecast.estimated_cpa_usd),
                      },
                    ].map((k) => (
                      <div
                        key={k.label}
                        className="rounded-lg border border-border bg-muted/30 p-3"
                      >
                        <div className="text-xs text-muted-foreground">{k.label}</div>
                        <div className="mt-1 text-lg font-bold tabular-nums">{k.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  className="rounded-2xl border border-border bg-card p-6"
                  style={{ boxShadow: "var(--shadow-card)" }}
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Wallet className="h-4 w-4 text-primary" />
                    Budget allocation
                  </div>
                  <div className="mt-4 space-y-3">
                    {result.budget_allocation.map((a, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{a.bucket}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {fmtMoney(a.amount_usd)} ({a.percentage}%)
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

                {result.selected_podcasts && result.selected_podcasts.length > 0 && (
                  <div
                    className="rounded-2xl border border-border bg-card p-6"
                    style={{ boxShadow: "var(--shadow-card)" }}
                  >
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      Recommended shows ({result.selected_podcasts.length})
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
                          <p className="mt-1 text-xs text-muted-foreground">{p.fit_reason}</p>
                          <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
                            <div>
                              <div className="text-muted-foreground">CPM</div>
                              <div className="font-medium">${p.estimated_cpm_usd}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Eps</div>
                              <div className="font-medium">{p.estimated_episodes}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">Reach</div>
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
                      Risk warnings
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
                      Next steps
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
