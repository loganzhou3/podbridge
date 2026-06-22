import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Save, BarChart3 } from "lucide-react";
import { updatePodcastMetrics } from "@/lib/podcast.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MetricTerm } from "@/components/metric-term";

type Props = {
  podcastId: string;
  initial: {
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
    last_synced_at?: string | null;
  };
};

function toNum(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtLocalDate(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export function MetricsForm({ podcastId, initial }: Props) {
  const fn = useServerFn(updatePodcastMetrics);
  const qc = useQueryClient();
  const [form, setForm] = useState({
    audience_persona: initial.audience_persona ?? "",
    audience_age_range: initial.audience_age_range ?? "",
    audience_gender_split: initial.audience_gender_split ?? "",
    audience_geo: initial.audience_geo ?? "",
    completion_rate: initial.completion_rate?.toString() ?? "",
    new_listener_retention: initial.new_listener_retention?.toString() ?? "",
    monthly_active_listeners: initial.monthly_active_listeners?.toString() ?? "",
    cpm_rate: initial.cpm_rate?.toString() ?? "",
    metrics_notes: initial.metrics_notes ?? "",
  });

  const mut = useMutation({
    mutationFn: () =>
      fn({
        data: {
          id: podcastId,
          audience_persona: form.audience_persona || null,
          audience_age_range: form.audience_age_range || null,
          audience_gender_split: form.audience_gender_split || null,
          audience_geo: form.audience_geo || null,
          completion_rate: toNum(form.completion_rate),
          new_listener_retention: toNum(form.new_listener_retention),
          monthly_active_listeners: (() => {
            const n = toNum(form.monthly_active_listeners);
            return n == null ? null : Math.round(n);
          })(),
          cpm_rate: toNum(form.cpm_rate),
          metrics_notes: form.metrics_notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("已保存核心指标");
      qc.invalidateQueries({ queryKey: ["podcast", podcastId] });
    },
    onError: (e: Error) => toast.error(e.message || "保存失败"),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div
      className="rounded-2xl border border-border bg-card p-6"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <BarChart3 className="h-4 w-4" />
            核心指标登记
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            手动登记用户画像、完播率、留存率等播客方提供的核心数据
            {initial.last_synced_at
              ? ` · 平台数据 ${fmtLocalDate(initial.last_synced_at)}`
              : initial.metrics_updated_at
                ? ` · 手动指标 ${fmtLocalDate(initial.metrics_updated_at)}`
              : ""}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="persona">用户画像描述</Label>
          <Textarea
            id="persona"
            rows={3}
            placeholder="例：一线城市 25-34 岁泛科技/职场人群，偏好深度访谈，决策力强"
            value={form.audience_persona}
            onChange={set("audience_persona")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="age">年龄段</Label>
          <Input id="age" placeholder="例：25-34 占 62%" value={form.audience_age_range} onChange={set("audience_age_range")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gender">性别比例</Label>
          <Input id="gender" placeholder="例：男 55% / 女 45%" value={form.audience_gender_split} onChange={set("audience_gender_split")} />
        </div>
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="geo">地域分布</Label>
          <Input id="geo" placeholder="例：北上广深 48%，新一线 27%" value={form.audience_geo} onChange={set("audience_geo")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="completion">完播率 (%)</Label>
          <Input id="completion" type="number" min="0" max="100" step="0.1" placeholder="例：68" value={form.completion_rate} onChange={set("completion_rate")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="retention">新客留存率 (%)</Label>
          <Input id="retention" type="number" min="0" max="100" step="0.1" placeholder="例：42" value={form.new_listener_retention} onChange={set("new_listener_retention")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mau">月活听众</Label>
          <Input id="mau" type="number" min="0" step="1" placeholder="例：120000" value={form.monthly_active_listeners} onChange={set("monthly_active_listeners")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cpm">
            <MetricTerm term="CPM" /> 报价 (元)
          </Label>
          <Input id="cpm" type="number" min="0" step="0.01" placeholder="例：180" value={form.cpm_rate} onChange={set("cpm_rate")} />
        </div>
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor="notes">备注</Label>
          <Textarea id="notes" rows={3} placeholder="补充信息，例如数据来源、口播时长、合作历史等" value={form.metrics_notes} onChange={set("metrics_notes")} />
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          <Save className="h-4 w-4" /> {mut.isPending ? "保存中…" : "保存指标"}
        </Button>
      </div>
    </div>
  );
}
