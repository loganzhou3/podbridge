import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Eye, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SourceConfidence } from "@/components/source-confidence";
import { EvidenceList } from "@/components/evidence-list";
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
  createLocalId,
  getSponsorItems,
  MARKETPLACE_UPDATED_EVENT,
  saveSponsorItem,
  updateSponsorItemStatus,
} from "@/lib/marketplace.storage";
import type { SponsorIntelligenceItem } from "@/lib/marketplace.types";
import { loginHref, useAuth } from "@/lib/auth";

export const Route = createFileRoute("/sponsors")({ component: SponsorsPage });

const MARKET_LABELS = {
  china: "中国",
  north_america: "北美",
  europe: "欧洲",
  global: "全球",
  other: "其他",
} as const;
const FORMAT_LABELS = {
  host_read: "口播",
  sponsorship: "冠名",
  interview: "访谈",
  branded_content: "联名内容",
  community: "社群",
  newsletter: "Newsletter",
  other: "其他",
} as const;
const SOURCE_LABELS = {
  public_info: "公开信息",
  manual_verified: "人工确认",
  ai_inferred: "AI 推断",
  creator_authorized: "主播授权",
  brand_submitted: "品牌提交",
} as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
function Select({
  name,
  children,
  value,
  onChange,
}: {
  name?: string;
  children: React.ReactNode;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <select
      name={name}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
    >
      {children}
    </select>
  );
}

function SponsorsPage() {
  const { user, profile } = useAuth();
  const [items, setItems] = useState<SponsorIntelligenceItem[]>([]);
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<SponsorIntelligenceItem | null>(null);
  const [query, setQuery] = useState("");
  const [industry, setIndustry] = useState("all");
  const [market, setMarket] = useState("all");
  const [format, setFormat] = useState("all");
  const [source, setSource] = useState("all");
  const [confidence, setConfidence] = useState("all");
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    try {
      setItems(await getSponsorItems());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "品牌投放情报加载失败");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    const listener = () => void refresh();
    window.addEventListener(MARKETPLACE_UPDATED_EVENT, listener);
    return () => window.removeEventListener(MARKETPLACE_UPDATED_EVENT, listener);
  }, []);
  const openAdd = () => {
    if (!user) {
      window.location.href = loginHref("/sponsors");
      return;
    }
    if (!profile || !["researcher", "admin"].includes(profile.role)) {
      toast.error("仅研究员或管理员可以录入品牌投放案例");
      return;
    }
    setAdding(true);
  };

  const industries = [...new Set(items.map((item) => item.industry).filter(Boolean))].sort();
  const filtered = useMemo(
    () =>
      items.filter((item) => {
        const term = query.trim().toLocaleLowerCase();
        const confidenceMatch =
          confidence === "all" ||
          (confidence === "high" && item.confidence >= 80) ||
          (confidence === "medium" && item.confidence >= 50 && item.confidence < 80) ||
          (confidence === "low" && item.confidence < 50);
        return (
          (!term || `${item.brandName} ${item.podcastName}`.toLocaleLowerCase().includes(term)) &&
          (industry === "all" || item.industry === industry) &&
          (market === "all" || item.targetMarket === market) &&
          (format === "all" || item.campaignFormat === format) &&
          (source === "all" || item.sourceType === source) &&
          confidenceMatch
        );
      }),
    [items, query, industry, market, format, source, confidence],
  );
  const thirtyDaysAgo = Date.now() - 30 * 86400000;
  const stats = {
    brands: new Set(items.map((item) => item.brandName)).size,
    cases: items.length,
    industries: new Set(items.map((item) => item.industry)).size,
    recent: items.filter((item) => new Date(item.createdAt).getTime() >= thirtyDaysAgo).length,
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">品牌投放情报</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              基于公开信息、人工确认与 AI
              分析，追踪品牌在播客渠道的投放案例、合作形式和预算区间，帮助市场人发现可参考的投放策略。
            </p>
          </div>
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" />
            新增品牌投放案例
          </Button>
        </div>

        {loading ? (
          <div className="mt-8 py-20 text-center text-sm text-muted-foreground">
            正在加载品牌投放情报…
          </div>
        ) : !items.length ? (
          <div className="mt-8 grid min-h-80 place-items-center rounded-lg border border-dashed border-border p-8 text-center">
            <div className="max-w-xl">
              <Building2 className="mx-auto h-10 w-10 text-muted-foreground" />
              <h2 className="mt-4 font-semibold">暂无已确认数据，可手动添加第一条品牌投放记录。</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                当前还没有已确认的品牌投放案例。你可以从公开播客节目
                shownotes、主播口播信息、品牌官网案例或人工访谈中录入第一条记录。
              </p>
              <Button className="mt-5" onClick={openAdd}>
                <Plus className="h-4 w-4" />
                新增品牌投放案例
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["已记录品牌数量", stats.brands],
                ["已记录投放案例数量", stats.cases],
                ["覆盖行业数量", stats.industries],
                ["最近 30 天新增案例", stats.recent],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-border bg-card p-4">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-6 grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-3 lg:grid-cols-6">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="品牌或播客"
                  className="pl-9"
                />
              </div>
              <Select value={industry} onChange={setIndustry}>
                <option value="all">全部行业</option>
                {industries.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </Select>
              <Select value={market} onChange={setMarket}>
                <option value="all">全部市场</option>
                {Object.entries(MARKET_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select value={format} onChange={setFormat}>
                <option value="all">全部形式</option>
                {Object.entries(FORMAT_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select value={source} onChange={setSource}>
                <option value="all">全部来源</option>
                {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select value={confidence} onChange={setConfidence}>
                <option value="all">全部置信度</option>
                <option value="high">高 80-100</option>
                <option value="medium">中 50-79</option>
                <option value="low">低 0-49</option>
              </Select>
            </div>
            <div className="mt-4 overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">品牌名称</th>
                    <th className="p-3">行业</th>
                    <th className="p-3">市场</th>
                    <th className="p-3">投放播客</th>
                    <th className="p-3">形式</th>
                    <th className="p-3">最近投放</th>
                    <th className="p-3">预估预算</th>
                    <th className="p-3">来源</th>
                    <th className="p-3">置信度</th>
                    <th className="p-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3 font-medium">{item.brandName}</td>
                      <td className="p-3">{item.industry}</td>
                      <td className="p-3">{MARKET_LABELS[item.targetMarket]}</td>
                      <td className="p-3">{item.podcastName}</td>
                      <td className="p-3">{FORMAT_LABELS[item.campaignFormat]}</td>
                      <td className="p-3">{item.observedDate || "未填写"}</td>
                      <td className="p-3">{item.estimatedBudgetRange || "暂无数据"}</td>
                      <td className="p-3">
                        <Badge
                          variant={item.sourceType === "ai_inferred" ? "secondary" : "outline"}
                        >
                          {SOURCE_LABELS[item.sourceType]}
                        </Badge>
                      </td>
                      <td className="p-3">{item.confidence}%</td>
                      <td className="p-3">
                        <Button size="sm" variant="outline" onClick={() => setSelected(item)}>
                          <Eye className="h-4 w-4" />
                          详情
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filtered.length && (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  没有符合当前筛选条件的记录。
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <Dialog open={adding && Boolean(user)} onOpenChange={setAdding}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>新增品牌投放案例</DialogTitle>
            <DialogDescription>仅录入有明确来源的公开、人工确认或授权投放信息。</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-6"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const now = new Date().toISOString();
              const sourceType = String(
                form.get("sourceType"),
              ) as SponsorIntelligenceItem["sourceType"];
              const item: SponsorIntelligenceItem = {
                id: createLocalId("sponsor"),
                brandName: String(form.get("brandName") ?? "").trim(),
                brandWebsite: String(form.get("brandWebsite") ?? "").trim() || undefined,
                industry: String(form.get("industry") ?? "").trim(),
                productCategory: String(form.get("productCategory") ?? "").trim() || undefined,
                targetMarket: String(
                  form.get("targetMarket"),
                ) as SponsorIntelligenceItem["targetMarket"],
                podcastName: String(form.get("podcastName") ?? "").trim(),
                podcastId: String(form.get("podcastId") ?? "").trim() || undefined,
                podcastUrl: String(form.get("podcastUrl") ?? "").trim() || undefined,
                campaignFormat: String(
                  form.get("campaignFormat"),
                ) as SponsorIntelligenceItem["campaignFormat"],
                observedDate: String(form.get("observedDate") ?? "") || undefined,
                estimatedBudgetRange:
                  String(form.get("estimatedBudgetRange") ?? "").trim() || undefined,
                campaignNote: String(form.get("campaignNote") ?? "").trim() || undefined,
                sourceType,
                sourceLabel: String(form.get("sourceLabel") ?? "").trim(),
                sourceUrl: String(form.get("sourceUrl") ?? "").trim() || undefined,
                confidence: Math.min(100, Math.max(0, Number(form.get("confidence")) || 0)),
                evidenceNote: String(form.get("evidenceNote") ?? "").trim() || undefined,
                aiStrategySummary: String(form.get("aiStrategySummary") ?? "").trim() || undefined,
                aiAudienceInference:
                  String(form.get("aiAudienceInference") ?? "").trim() || undefined,
                aiBrandFit: String(form.get("aiBrandFit") ?? "").trim() || undefined,
                aiRiskNote: String(form.get("aiRiskNote") ?? "").trim() || undefined,
                createdAt: now,
                updatedAt: now,
              };
              try {
                await saveSponsorItem(item);
                setAdding(false);
                event.currentTarget.reset();
                toast.success("品牌投放案例已提交审核");
                await refresh();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "保存失败");
              }
            }}
          >
            <section>
              <h3 className="text-sm font-semibold">品牌信息</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="品牌名称 *">
                  <Input name="brandName" required />
                </Field>
                <Field label="品牌官网">
                  <Input name="brandWebsite" type="url" />
                </Field>
                <Field label="行业 *">
                  <Input name="industry" required />
                </Field>
                <Field label="产品类型">
                  <Input name="productCategory" />
                </Field>
                <Field label="目标市场 *">
                  <Select name="targetMarket">
                    {Object.entries(MARKET_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </section>
            <section>
              <h3 className="text-sm font-semibold">投放信息</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="播客名称 *">
                  <Input name="podcastName" required />
                </Field>
                <Field label="播客 ID（用于关联已有播客）">
                  <Input name="podcastId" />
                </Field>
                <Field label="播客链接">
                  <Input name="podcastUrl" type="url" />
                </Field>
                <Field label="投放形式">
                  <Select name="campaignFormat">
                    {Object.entries(FORMAT_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="观察日期">
                  <Input name="observedDate" type="date" />
                </Field>
                <Field label="预估预算区间">
                  <Input name="estimatedBudgetRange" placeholder="如无法确认请留空" />
                </Field>
                <div className="md:col-span-2">
                  <Field label="投放备注">
                    <Textarea name="campaignNote" rows={2} />
                  </Field>
                </div>
              </div>
            </section>
            <section>
              <h3 className="text-sm font-semibold">来源与证据</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="来源类型">
                  <Select name="sourceType">
                    {Object.entries(SOURCE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="来源名称 *">
                  <Input name="sourceLabel" required placeholder="例如：节目 shownotes" />
                </Field>
                <Field label="来源链接">
                  <Input name="sourceUrl" type="url" />
                </Field>
                <Field label="置信度 0-100 *">
                  <Input name="confidence" type="number" min="0" max="100" required />
                </Field>
                <div className="md:col-span-2">
                  <Field label="证据说明">
                    <Textarea name="evidenceNote" rows={2} />
                  </Field>
                </div>
              </div>
            </section>
            <section className="rounded-md border border-amber-200 bg-amber-50/40 p-4">
              <h3 className="text-sm font-semibold">AI 分析字段（可选）</h3>
              <p className="mt-1 text-xs text-amber-800">
                以下内容均标注为“AI 推断，不代表品牌官方投放数据”。
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="策略总结">
                  <Textarea name="aiStrategySummary" rows={2} />
                </Field>
                <Field label="目标人群推断">
                  <Textarea name="aiAudienceInference" rows={2} />
                </Field>
                <Field label="品牌适配推断">
                  <Input name="aiBrandFit" />
                </Field>
                <Field label="风险提示">
                  <Input name="aiRiskNote" />
                </Field>
              </div>
            </section>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAdding(false)}>
                取消
              </Button>
              <Button type="submit">保存投放案例</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.brandName} · 投放案例</DialogTitle>
                <DialogDescription>
                  查看投放观察、证据来源、置信度及明确标注的 AI 推断。
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 text-sm md:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">行业：</span>
                  {selected.industry}
                </div>
                <div>
                  <span className="text-muted-foreground">产品：</span>
                  {selected.productCategory || "暂无数据"}
                </div>
                <div>
                  <span className="text-muted-foreground">目标市场：</span>
                  {MARKET_LABELS[selected.targetMarket]}
                </div>
                <div>
                  <span className="text-muted-foreground">播客：</span>
                  {selected.podcastName}
                </div>
                <div>
                  <span className="text-muted-foreground">形式：</span>
                  {FORMAT_LABELS[selected.campaignFormat]}
                </div>
                <div>
                  <span className="text-muted-foreground">预算：</span>
                  {selected.estimatedBudgetRange || "暂无数据"}
                </div>
                <div className="md:col-span-2">
                  <span className="text-muted-foreground">备注：</span>
                  {selected.campaignNote || "暂无数据"}
                </div>
              </div>
              <SourceConfidence
                sourceType={selected.sourceType}
                sourceLabel={selected.sourceLabel}
                sourceUrl={selected.sourceUrl}
                confidence={selected.confidence}
                timestamp={selected.updatedAt}
              />
              <section>
                <h3 className="mb-2 text-sm font-semibold">查看依据</h3>
                <EvidenceList entityType="sponsor_intelligence" entityId={selected.id} />
              </section>
              {profile?.role === "admin" && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      void updateSponsorItemStatus(selected.id, "verified")
                        .then(() => {
                          toast.success("案例已审核通过");
                          setSelected(null);
                          void refresh();
                        })
                        .catch((error) => toast.error(error.message));
                    }}
                  >
                    标记为 verified
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      void updateSponsorItemStatus(selected.id, "needs_more_info")
                        .then(() => {
                          toast.success("已标记需补充信息");
                          setSelected(null);
                          void refresh();
                        })
                        .catch((error) => toast.error(error.message));
                    }}
                  >
                    needs_more_info
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      void updateSponsorItemStatus(selected.id, "rejected")
                        .then(() => {
                          toast.success("案例已拒绝");
                          setSelected(null);
                          void refresh();
                        })
                        .catch((error) => toast.error(error.message));
                    }}
                  >
                    rejected
                  </Button>
                </div>
              )}
              {(selected.aiStrategySummary ||
                selected.aiAudienceInference ||
                selected.aiBrandFit ||
                selected.aiRiskNote) && (
                <div className="rounded-md border border-amber-200 bg-amber-50/40 p-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">AI 推断</Badge>
                    <span className="text-xs text-amber-800">不代表品牌官方投放数据</span>
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    {selected.aiStrategySummary && (
                      <p>
                        <span className="text-muted-foreground">策略总结：</span>
                        {selected.aiStrategySummary}
                      </p>
                    )}
                    {selected.aiAudienceInference && (
                      <p>
                        <span className="text-muted-foreground">目标人群：</span>
                        {selected.aiAudienceInference}
                      </p>
                    )}
                    {selected.aiBrandFit && (
                      <p>
                        <span className="text-muted-foreground">品牌适配：</span>
                        {selected.aiBrandFit}
                      </p>
                    )}
                    {selected.aiRiskNote && (
                      <p>
                        <span className="text-muted-foreground">风险：</span>
                        {selected.aiRiskNote}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
