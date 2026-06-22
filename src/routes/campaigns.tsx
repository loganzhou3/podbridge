import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { PlannerWorkspaceNav } from "@/components/planner-workspace-nav";
import { CampaignFormDialog } from "@/components/campaign-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CAMPAIGN_WORKSPACE_UPDATED,
  deleteWorkspaceCampaign,
  listWorkspaceCampaigns,
  listWorkspacePodcastItems,
  saveWorkspaceCampaign,
} from "@/lib/campaign-workspace.storage";
import type { Campaign, CampaignStatus } from "@/lib/campaign-workspace.types";
import { loginHref, useAuth } from "@/lib/auth";

export const Route = createFileRoute("/campaigns")({
  validateSearch: (search: Record<string, unknown>) => ({
    create: search.create === true || search.create === "true",
  }),
  component: CampaignsPage,
});

const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "草稿",
  planning: "规划中",
  contacting: "建联中",
  negotiating: "谈判中",
  confirmed: "已确认",
  live: "已上线",
  completed: "已复盘",
  paused: "已暂停",
};
const MARKET_LABELS: Record<Campaign["targetMarket"], string> = {
  china: "中国",
  north_america: "北美",
  europe: "欧洲",
  global: "全球",
  other: "其他",
};

function money(campaign: Campaign) {
  return `${campaign.currency} ${campaign.budget.toLocaleString()}`;
}

function CampaignsPage() {
  const search = Route.useSearch();
  const { user, loading: authLoading } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [podcastCounts, setPodcastCounts] = useState<Record<string, number>>({});
  const [formOpen, setFormOpen] = useState(search.create);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [deleting, setDeleting] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    if (!user) {
      setCampaigns([]);
      setPodcastCounts({});
      setLoading(false);
      return;
    }
    try {
      const [next, podcastItems] = await Promise.all([
        listWorkspaceCampaigns(),
        listWorkspacePodcastItems(),
      ]);
      setCampaigns(next);
      const counts: Record<string, number> = {};
      for (const item of podcastItems) counts[item.campaignId] = (counts[item.campaignId] ?? 0) + 1;
      setPodcastCounts(counts);
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
  }, [user]);
  useEffect(() => {
    if (search.create) setFormOpen(true);
  }, [search.create]);
  const stats = useMemo(
    () => ({
      all: campaigns.length,
      active: campaigns.filter((item) =>
        ["planning", "contacting", "negotiating", "confirmed"].includes(item.status),
      ).length,
      live: campaigns.filter((item) => item.status === "live").length,
      reviewed: campaigns.filter((item) => item.status === "completed").length,
    }),
    [campaigns],
  );
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <PlannerWorkspaceNav />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">投放项目</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              从品牌 Brief、播客候选、主播建联到最终方案，集中管理投放执行。
            </p>
          </div>
          <Button
            onClick={() => {
              if (!user) return void (window.location.href = loginHref("/campaigns?create=true"));
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            创建投放项目
          </Button>
        </div>
        {loading || authLoading ? (
          <div className="mt-8 py-20 text-center text-sm text-muted-foreground">
            正在加载投放项目…
          </div>
        ) : !campaigns.length ? (
          <div className="mt-8 grid min-h-80 place-items-center rounded-lg border border-dashed border-border p-8 text-center">
            <div>
              <h2 className="font-semibold">
                {user
                  ? "暂无投放项目。创建第一个 Campaign，开始规划播客广告投放。"
                  : "登录后创建并管理你的 Campaign。"}
              </h2>
              <Button
                className="mt-5"
                onClick={() => {
                  if (!user) window.location.href = loginHref("/campaigns?create=true");
                  else setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                {user ? "创建投放项目" : "登录后创建"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["全部 Campaign", stats.all],
                ["进行中 Campaign", stats.active],
                ["已上线 Campaign", stats.live],
                ["已复盘 Campaign", stats.reviewed],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-border bg-card p-4">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-6 overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">Campaign 名称</th>
                    <th className="p-3">品牌名称</th>
                    <th className="p-3">目标市场</th>
                    <th className="p-3">预算</th>
                    <th className="p-3">投放目标</th>
                    <th className="p-3">候选播客</th>
                    <th className="p-3">状态</th>
                    <th className="p-3">创建时间</th>
                    <th className="p-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {campaigns.map((campaign) => (
                    <tr key={campaign.id}>
                      <td className="p-3 font-medium">{campaign.campaignName}</td>
                      <td className="p-3">{campaign.brandName}</td>
                      <td className="p-3">{MARKET_LABELS[campaign.targetMarket]}</td>
                      <td className="p-3 tabular-nums">{money(campaign)}</td>
                      <td className="p-3">{campaign.objective}</td>
                      <td className="p-3">{podcastCounts[campaign.id] ?? 0}</td>
                      <td className="p-3">
                        <Badge variant={campaign.status === "live" ? "default" : "secondary"}>
                          {STATUS_LABELS[campaign.status]}
                        </Badge>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">
                        {new Date(campaign.createdAt).toLocaleDateString("zh-CN")}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button asChild size="sm" variant="outline">
                            <Link to="/campaigns/$campaignId" params={{ campaignId: campaign.id }}>
                              <Eye className="h-4 w-4" />
                              详情
                            </Link>
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="编辑"
                            onClick={() => {
                              setEditing(campaign);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="删除"
                            onClick={() => setDeleting(campaign)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <CampaignFormDialog
          open={formOpen && Boolean(user)}
          onOpenChange={setFormOpen}
          campaign={editing}
          onSave={(campaign) => {
            void saveWorkspaceCampaign(campaign)
              .then(() => {
                toast.success("Campaign 已保存");
                void refresh();
              })
              .catch((error) => toast.error(error.message));
          }}
        />
        <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除投放项目？</AlertDialogTitle>
              <AlertDialogDescription>
                将同时删除该 Campaign 的候选播客和生成资产。此操作无法撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (deleting)
                    void deleteWorkspaceCampaign(deleting.id)
                      .then(() => {
                        toast.success("Campaign 已删除");
                        void refresh();
                      })
                      .catch((error) => toast.error(error.message));
                  setDeleting(null);
                }}
              >
                确认删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
