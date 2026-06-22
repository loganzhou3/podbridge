import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, Inbox } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/site-header";
import { SourceConfidence } from "@/components/source-confidence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getCreatorClaims,
  MARKETPLACE_UPDATED_EVENT,
  updateCreatorClaimStatus,
} from "@/lib/marketplace.storage";
import type { ClaimStatus, CreatorClaimRequest } from "@/lib/marketplace.types";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/claims")({ component: ClaimsPage });

const STATUS_LABELS: Record<ClaimStatus, string> = {
  pending: "待审核",
  verified: "已验证",
  rejected: "已拒绝",
  needs_more_info: "需补充信息",
};

function ClaimsPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const [claims, setClaims] = useState<CreatorClaimRequest[]>([]);
  const [selected, setSelected] = useState<CreatorClaimRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    if (!user) {
      setClaims([]);
      setLoading(false);
      return;
    }
    try {
      setClaims(await getCreatorClaims());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "认领申请加载失败");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    const listener = () => void refresh();
    window.addEventListener(MARKETPLACE_UPDATED_EVENT, listener);
    return () => window.removeEventListener(MARKETPLACE_UPDATED_EVENT, listener);
  }, [user]);
  const setStatus = (claim: CreatorClaimRequest, status: ClaimStatus) => {
    void updateCreatorClaimStatus(claim.id, status)
      .then(() => {
        setSelected({ ...claim, status, updatedAt: new Date().toISOString() });
        toast.success("审核状态已更新");
        void refresh();
      })
      .catch((error) => toast.error(error.message));
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-3xl font-bold">主播认领管理</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          审核主播、制作人和商务负责人的认领申请。验证前不会公开商务信息。
        </p>
        {loading || authLoading ? (
          <div className="mt-8 py-20 text-center text-sm text-muted-foreground">
            正在加载认领申请…
          </div>
        ) : !user ? (
          <div className="mt-8 rounded-lg border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">登录后查看你提交的认领申请。</p>
            <Button asChild className="mt-4">
              <Link to="/login" search={{ next: "/claims" }}>
                登录
              </Link>
            </Button>
          </div>
        ) : !claims.length ? (
          <div className="mt-8 grid min-h-72 place-items-center rounded-lg border border-dashed border-border text-center">
            <div>
              <Inbox className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium">暂无认领申请</p>
              <p className="mt-1 text-xs text-muted-foreground">
                申请会在主播从播客详情页提交后显示在这里。
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-8 overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">播客名称</th>
                  <th className="p-3">认领人</th>
                  <th className="p-3">身份</th>
                  <th className="p-3">联系邮箱</th>
                  <th className="p-3">接受合作</th>
                  <th className="p-3">提交时间</th>
                  <th className="p-3">状态</th>
                  <th className="p-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {claims.map((claim) => (
                  <tr key={claim.id}>
                    <td className="p-3 font-medium">{claim.podcastName}</td>
                    <td className="p-3">{claim.claimantName}</td>
                    <td className="p-3">{claim.role}</td>
                    <td className="p-3">{claim.contactEmail}</td>
                    <td className="p-3">{claim.acceptsSponsorship ? "是" : "否"}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {new Date(claim.submittedAt).toLocaleString("zh-CN")}
                    </td>
                    <td className="p-3">
                      <Badge variant={claim.status === "verified" ? "default" : "secondary"}>
                        {STATUS_LABELS[claim.status]}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Button size="sm" variant="outline" onClick={() => setSelected(claim)}>
                        <Eye className="h-4 w-4" />
                        查看详情
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
            {selected && (
              <>
                <DialogHeader>
                  <DialogTitle>{selected.podcastName} · 认领申请</DialogTitle>
                  <DialogDescription>
                    审核认领人提交的身份、联系方式、合作偏好与报价资料。
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 text-sm md:grid-cols-2">
                  <div>
                    <span className="text-muted-foreground">认领人：</span>
                    {selected.claimantName}
                  </div>
                  <div>
                    <span className="text-muted-foreground">身份：</span>
                    {selected.role}
                  </div>
                  <div>
                    <span className="text-muted-foreground">邮箱：</span>
                    {selected.contactEmail}
                  </div>
                  <div>
                    <span className="text-muted-foreground">微信/电话：</span>
                    {selected.phoneOrWechat || "未填写"}
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-muted-foreground">身份说明：</span>
                    {selected.proofDescription || "未填写"}
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-muted-foreground">可合作形式：</span>
                    {selected.availableFormats.join("、") || "未填写"}
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-muted-foreground">偏好行业：</span>
                    {selected.preferredIndustries.join("、") || "未填写"}
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-muted-foreground">不接受行业：</span>
                    {selected.blockedIndustries.join("、") || "未填写"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">口播：</span>
                    {selected.hostReadPriceRange || "未填写"} {selected.currency}
                  </div>
                  <div>
                    <span className="text-muted-foreground">冠名：</span>
                    {selected.sponsorshipPriceRange || "未填写"} {selected.currency}
                  </div>
                </div>
                <SourceConfidence
                  sourceType="creator_submitted"
                  sourceLabel="认领表单"
                  confidence={selected.status === "verified" ? 100 : 60}
                  timestamp={selected.updatedAt}
                />
                {profile?.role === "admin" && (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setStatus(selected, "verified")}>标记为 verified</Button>
                    <Button
                      variant="outline"
                      onClick={() => setStatus(selected, "needs_more_info")}
                    >
                      标记为 needs_more_info
                    </Button>
                    <Button variant="destructive" onClick={() => setStatus(selected, "rejected")}>
                      标记为 rejected
                    </Button>
                    <Button asChild variant="ghost">
                      <Link to="/podcast/$id" params={{ id: selected.podcastId }}>
                        打开播客详情
                      </Link>
                    </Button>
                  </div>
                )}
              </>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
