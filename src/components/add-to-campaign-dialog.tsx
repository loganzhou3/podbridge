import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FolderPlus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  CAMPAIGN_WORKSPACE_UPDATED,
  campaignWorkspaceId,
  listWorkspaceCampaigns,
  saveWorkspacePodcastItem,
} from "@/lib/campaign-workspace.storage";
import type { Campaign, CampaignPodcastItem } from "@/lib/campaign-workspace.types";
import { loginHref, useAuth } from "@/lib/auth";

export type CampaignPodcastDraft = {
  podcastId: string;
  podcastName: string;
  category?: string | null;
  platform?: string | null;
  commercialScore?: number | null;
  matchScore?: number;
  brandSafetyScore?: number;
  estimatedPriceRange?: string;
  recommendedFormat?: string;
  recommendationReason?: string;
  confidence?: number;
  sourceType?: CampaignPodcastItem["sourceType"];
  sourceLabel?: string;
  sourceUrl?: string;
};

export function AddToCampaignDialog({
  podcast,
  size = "sm",
  variant = "outline",
  label = "加入 Campaign",
}: {
  podcast: CampaignPodcastDraft;
  size?: "sm" | "default";
  variant?: "outline" | "default" | "ghost";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const refresh = async () => setCampaigns(user ? await listWorkspaceCampaigns() : []);
  useEffect(() => {
    void refresh();
    const listener = () => void refresh();
    window.addEventListener(CAMPAIGN_WORKSPACE_UPDATED, listener);
    return () => window.removeEventListener(CAMPAIGN_WORKSPACE_UPDATED, listener);
  }, [user]);
  const add = async () => {
    if (!campaignId) return;
    const now = new Date().toISOString();
    try {
      const result = await saveWorkspacePodcastItem({
        id: campaignWorkspaceId("campaign-podcast"),
        campaignId,
        podcastId: podcast.podcastId,
        podcastName: podcast.podcastName,
        category: podcast.category ?? undefined,
        platform: podcast.platform ?? undefined,
        commercialScore: podcast.commercialScore ?? undefined,
        matchScore: podcast.matchScore ?? Math.min(95, Math.max(45, podcast.commercialScore ?? 60)),
        brandSafetyScore: podcast.brandSafetyScore ?? 80,
        estimatedPriceRange: podcast.estimatedPriceRange,
        recommendedFormat: podcast.recommendedFormat ?? "口播广告",
        recommendationReason:
          podcast.recommendationReason ??
          "基于当前播客库数据与 Campaign Brief 的初步匹配，需人工确认。",
        confidence: podcast.confidence ?? 60,
        sourceType: podcast.sourceType ?? "ai_inferred",
        sourceLabel: podcast.sourceLabel ?? "PodBridge 播客库 + AI 规则估算",
        sourceUrl: podcast.sourceUrl,
        contactStatus: "candidate",
        createdAt: now,
        updatedAt: now,
      });
      toast.success(result.duplicated ? "该播客已在候选列表中" : "已加入 Campaign 候选列表");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加入 Campaign 失败");
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size={size}
          variant={variant}
          onClick={(event) => {
            event.stopPropagation();
            if (!user) {
              event.preventDefault();
              window.location.href = loginHref(window.location.pathname);
            }
          }}
        >
          <FolderPlus className="h-4 w-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>加入 Campaign</DialogTitle>
          <DialogDescription>选择已有投放项目，将该播客加入候选 Shortlist。</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <div className="font-medium">{podcast.podcastName}</div>
          <div className="mt-1 flex gap-2">
            <Badge variant="outline">{podcast.category || "未分类"}</Badge>
            <Badge variant="secondary">来源：{podcast.sourceLabel ?? "AI 规则估算"}</Badge>
          </div>
        </div>
        {campaigns.length ? (
          <>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">选择 Campaign</span>
              <select
                value={campaignId}
                onChange={(event) => setCampaignId(event.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">请选择</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.campaignName} · {campaign.brandName}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2">
              <Button asChild variant="outline">
                <Link to="/campaigns" search={{ create: true }}>
                  <Plus className="h-4 w-4" />
                  创建新 Campaign
                </Link>
              </Button>
              <Button onClick={() => void add()} disabled={!campaignId}>
                确认加入
              </Button>
            </div>
          </>
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">暂无投放项目，请先创建 Campaign。</p>
            <Button asChild className="mt-4">
              <Link to="/campaigns" search={{ create: true }}>
                <Plus className="h-4 w-4" />
                创建投放项目
              </Link>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
