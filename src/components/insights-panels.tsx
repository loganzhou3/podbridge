import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  generateAdStrategy,
  listBrandRecommendations,
  findBrandContact,
  updatePodcastPlatforms,
  scrapePodcastPlatforms,
} from "@/lib/insights.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  Mail,
  Globe,
  Building2,
  RefreshCw,
  Link2,
} from "lucide-react";

type Strategy = {
  summary: string;
  audience_persona: string;
  best_ad_format: string;
  recommended_cpm_rmb: { min: number; max: number };
  best_episode_slot: string;
  do_list: string[];
  dont_list: string[];
};

export function AdStrategyPanel({
  podcastId,
  initialStrategy,
}: {
  podcastId: string;
  initialStrategy: Strategy | null;
}) {
  const generate = useServerFn(generateAdStrategy);
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [strategy, setStrategy] = useState<Strategy | null>(initialStrategy);

  const onGenerate = async () => {
    setLoading(true);
    try {
      const res = await generate({ data: { podcastId } });
      setStrategy(res.strategy);
      toast.success("AI 策略已生成");
      qc.invalidateQueries({ queryKey: ["brand-recs", podcastId] });
      qc.invalidateQueries({ queryKey: ["podcast", podcastId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="rounded-2xl border border-border bg-card p-6"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            AI 投放策略
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            基于播客数据自动生成的广告位、CPM、口播形式与品牌建议
          </p>
        </div>
        <Button
          size="sm"
          variant={strategy ? "outline" : "default"}
          onClick={onGenerate}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {strategy ? "重新生成" : "生成策略"}
        </Button>
      </div>

      {!strategy && !loading && (
        <div className="mt-6 grid place-items-center rounded-lg border border-dashed border-border py-10 text-sm text-muted-foreground">
          点击右上角"生成策略"获取 AI 投放建议
        </div>
      )}

      {strategy && (
        <div className="mt-5 space-y-4">
          <p className="text-sm leading-relaxed">{strategy.summary}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="目标听众画像" value={strategy.audience_persona} />
            <Stat label="最佳广告形式" value={strategy.best_ad_format} />
            <Stat
              label="建议 CPM (¥)"
              value={`¥${strategy.recommended_cpm_rmb.min} – ¥${strategy.recommended_cpm_rmb.max}`}
            />
            <Stat label="最佳投放位" value={strategy.best_episode_slot} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <List title="✅ 建议" items={strategy.do_list} tone="ok" />
            <List title="⛔ 避免" items={strategy.dont_list} tone="warn" />
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium leading-snug">{value}</div>
    </div>
  );
}

function List({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "ok" | "warn";
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        tone === "ok" ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50"
      }`}
    >
      <div className="text-xs font-medium">{title}</div>
      <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-muted-foreground">
        {items.map((t, i) => (
          <li key={i}>· {t}</li>
        ))}
      </ul>
    </div>
  );
}

export function BrandPanel({ podcastId }: { podcastId: string }) {
  const list = useServerFn(listBrandRecommendations);
  const find = useServerFn(findBrandContact);
  const { data, refetch, isLoading } = useQuery({
    queryKey: ["brand-recs", podcastId],
    queryFn: () => list({ data: { podcastId } }),
  });
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const onFind = async (id: string) => {
    setLoadingId(id);
    try {
      await find({ data: { brandRecommendationId: id } });
      toast.success("联系方式已更新");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "查询失败");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div
      className="rounded-2xl border border-border bg-card p-6"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <Building2 className="h-4 w-4 text-primary" />
        推荐品牌
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        AI 根据播客内容匹配的广告主候选，点击"查询联系方式"通过 Firecrawl 抓取官网
      </p>

      {isLoading && (
        <div className="mt-4 grid place-items-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {!isLoading && (!data || data.brands.length === 0) && (
        <div className="mt-4 grid place-items-center rounded-lg border border-dashed border-border py-10 text-sm text-muted-foreground">
          先生成 AI 投放策略，品牌候选会出现在这里
        </div>
      )}

      {data && data.brands.length > 0 && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {data.brands.map((b, idx) => (
            <div
              key={b.id}
              className="relative rounded-lg border border-border bg-muted/30 p-4"
            >
              <div
                className={`absolute -left-2 -top-2 grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-primary-foreground ${
                  idx === 0
                    ? "bg-amber-500"
                    : idx === 1
                      ? "bg-zinc-400"
                      : idx === 2
                        ? "bg-orange-600"
                        : "bg-muted-foreground"
                }`}
              >
                {idx + 1}
              </div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{b.brand_name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {b.category}
                  </div>
                </div>
                {b.fit_score != null && (
                  <Badge
                    style={{ background: "var(--gradient-brand)" }}
                    className="text-primary-foreground"
                  >
                    {b.fit_score}
                  </Badge>
                )}
              </div>
              {b.reason && (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {b.reason}
                </p>
              )}

              <div className="mt-3 space-y-1 text-xs">
                {b.website && (
                  <a
                    href={b.website}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-foreground hover:underline"
                  >
                    <Globe className="h-3 w-3" />
                    {new URL(b.website).hostname}
                  </a>
                )}
                {b.contact_email && (
                  <a
                    href={`mailto:${b.contact_email}`}
                    className="flex items-center gap-1 text-foreground hover:underline"
                  >
                    <Mail className="h-3 w-3" />
                    {b.contact_email}
                  </a>
                )}
                {b.contact_notes && (
                  <p className="text-[10px] italic text-muted-foreground">
                    {b.contact_notes}
                  </p>
                )}
              </div>

              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full"
                onClick={() => onFind(b.id)}
                disabled={loadingId === b.id}
              >
                {loadingId === b.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Mail className="h-3 w-3" />
                )}
                {b.contact_email ? "重新查询" : "查询联系方式"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PlatformLinksPanel({
  podcastId,
  xiaoyuzhouUrl,
  ximalayaUrl,
  itunesUrl,
  xiaoyuzhouSubs,
  xiaoyuzhouComments,
  ximalayaPlays,
  ximalayaSubs,
  ximalayaComments,
  appleReviews,
}: {
  podcastId: string;
  xiaoyuzhouUrl: string | null;
  ximalayaUrl: string | null;
  itunesUrl: string | null;
  xiaoyuzhouSubs: number | null;
  xiaoyuzhouComments: number | null;
  ximalayaPlays: number | null;
  ximalayaSubs: number | null;
  ximalayaComments: number | null;
  appleReviews: number | null;
}) {
  const update = useServerFn(updatePodcastPlatforms);
  const scrape = useServerFn(scrapePodcastPlatforms);
  const qc = useQueryClient();
  const [xyz, setXyz] = useState(xiaoyuzhouUrl ?? "");
  const [xmly, setXmly] = useState(ximalayaUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [scraping, setScraping] = useState(false);

  const onSave = async () => {
    setSaving(true);
    try {
      await update({
        data: {
          podcastId,
          xiaoyuzhouUrl: xyz.trim() || null,
          ximalayaUrl: xmly.trim() || null,
        },
      });
      toast.success("链接已保存");
      qc.invalidateQueries({ queryKey: ["podcast", podcastId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const onScrape = async () => {
    setScraping(true);
    try {
      await scrape({ data: { podcastId } });
      toast.success("抓取完成");
      qc.invalidateQueries({ queryKey: ["podcast", podcastId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "抓取失败");
    } finally {
      setScraping(false);
    }
  };

  const fmt = (n: number | null) => {
    if (n == null) return "—";
    if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
    return n.toLocaleString();
  };

  return (
    <div
      className="rounded-2xl border border-border bg-card p-6"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Link2 className="h-4 w-4 text-primary" />
          多平台数据（小宇宙 · 喜马拉雅 · Apple Podcasts）
        </div>
        <Button size="sm" variant="outline" onClick={onScrape} disabled={scraping}>
          {scraping ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          抓取最新数据
        </Button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border p-3">
          <div className="text-xs font-medium text-muted-foreground">小宇宙</div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-muted-foreground">订阅数</div>
              <div className="font-semibold text-foreground">{fmt(xiaoyuzhouSubs)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">评论数</div>
              <div className="font-semibold text-foreground">{fmt(xiaoyuzhouComments)}</div>
            </div>
          </div>
          {xiaoyuzhouUrl && (
            <a
              href={xiaoyuzhouUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block truncate text-[10px] text-muted-foreground hover:text-foreground"
            >
              {xiaoyuzhouUrl}
            </a>
          )}
        </div>

        <div className="rounded-lg border border-border p-3">
          <div className="text-xs font-medium text-muted-foreground">喜马拉雅</div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-muted-foreground">订阅</div>
              <div className="font-semibold text-foreground">{fmt(ximalayaSubs)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">播放</div>
              <div className="font-semibold text-foreground">{fmt(ximalayaPlays)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">评论</div>
              <div className="font-semibold text-foreground">{fmt(ximalayaComments)}</div>
            </div>
          </div>
          {ximalayaUrl && (
            <a
              href={ximalayaUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block truncate text-[10px] text-muted-foreground hover:text-foreground"
            >
              {ximalayaUrl}
            </a>
          )}
        </div>

        <div className="rounded-lg border border-border p-3">
          <div className="text-xs font-medium text-muted-foreground">Apple Podcasts</div>
          <div className="mt-2 text-xs">
            <div className="text-muted-foreground">评论数</div>
            <div className="font-semibold text-foreground">{fmt(appleReviews)}</div>
          </div>
          {itunesUrl && (
            <a
              href={itunesUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block truncate text-[10px] text-muted-foreground hover:text-foreground"
            >
              {itunesUrl}
            </a>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground">小宇宙链接</label>
          <Input
            value={xyz}
            onChange={(e) => setXyz(e.target.value)}
            placeholder="https://www.xiaoyuzhoufm.com/podcast/..."
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">喜马拉雅链接</label>
          <Input
            value={xmly}
            onChange={(e) => setXmly(e.target.value)}
            placeholder="https://www.ximalaya.com/album/..."
            className="mt-1"
          />
        </div>
      </div>
      <Button size="sm" className="mt-3" onClick={onSave} disabled={saving}>
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        保存链接
      </Button>
    </div>
  );
}
