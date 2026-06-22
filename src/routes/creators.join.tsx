import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { submitCreatorApplication } from "@/lib/campaign.functions";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, Mic2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/creators/join")({
  head: () => ({
    meta: [{ title: "主播入驻 — PodBridge" }],
  }),
  component: CreatorJoinPage,
});

function numberFromForm(fd: FormData, name: string) {
  const raw = String(fd.get(name) ?? "").trim();
  return raw ? Number(raw) : null;
}

function CreatorJoinPage() {
  const submit = useServerFn(submitCreatorApplication);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (form: HTMLFormElement) => {
    const fd = new FormData(form);
    setSaving(true);
    try {
      await submit({
        data: {
          podcastName: String(fd.get("podcastName") ?? "").trim(),
          hostName: String(fd.get("hostName") ?? "").trim() || null,
          podcastUrl: String(fd.get("podcastUrl") ?? "").trim() || null,
          contactEmail: String(fd.get("contactEmail") ?? "").trim() || null,
          contactWechat: String(fd.get("contactWechat") ?? "").trim() || null,
          introduction: String(fd.get("introduction") ?? "").trim() || null,
          quoteMinRmb: numberFromForm(fd, "quoteMinRmb"),
          quoteMaxRmb: numberFromForm(fd, "quoteMaxRmb"),
          adCategories: String(fd.get("adCategories") ?? "").trim() || null,
          authorizedMetrics: {
            monthlyListeners: numberFromForm(fd, "monthlyListeners"),
            completionRate: numberFromForm(fd, "completionRate"),
            audienceProfile: String(fd.get("audienceProfile") ?? "").trim() || null,
          },
        },
      });
      form.reset();
      setDone(true);
      toast.success("已提交入驻资料");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Badge variant="outline" className="mb-3">
              主播入驻
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight">提交节目商务资料</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              主播可提交节目介绍、报价、联系方式、可接广告类型和授权数据，进入品牌投放资源池。
            </p>
          </div>
          {done && (
            <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              已收到资料
            </div>
          )}
        </div>

        <form
          className="rounded-2xl border border-border bg-card p-6"
          style={{ boxShadow: "var(--shadow-card)" }}
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(e.currentTarget);
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">节目名称</label>
              <Input name="podcastName" required className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">主播 / 商务联系人</label>
              <Input name="hostName" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">节目主页链接</label>
              <Input name="podcastUrl" placeholder="小宇宙 / 喜马拉雅 / RSS / 官网" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">联系邮箱</label>
              <Input name="contactEmail" type="email" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">微信 / 私域联系方式</label>
              <Input name="contactWechat" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">可接广告类型</label>
              <Input name="adCategories" placeholder="口播、冠名、访谈、社群活动" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">报价下限 RMB</label>
              <Input name="quoteMinRmb" type="number" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">报价上限 RMB</label>
              <Input name="quoteMaxRmb" type="number" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">月活听众</label>
              <Input name="monthlyListeners" type="number" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">完播率 %</label>
              <Input name="completionRate" type="number" className="mt-1" />
            </div>
          </div>
          <div className="mt-4">
            <label className="text-xs text-muted-foreground">节目介绍</label>
            <Textarea name="introduction" rows={5} className="mt-1" />
          </div>
          <div className="mt-4">
            <label className="text-xs text-muted-foreground">听众画像 / 授权补充数据</label>
            <Textarea name="audienceProfile" rows={4} className="mt-1" />
          </div>
          <Button type="submit" disabled={saving} className="mt-5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic2 className="h-4 w-4" />}
            提交入驻资料
          </Button>
        </form>
      </main>
    </div>
  );
}
