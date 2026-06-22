import { AlertTriangle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { SponsorSourceType } from "@/lib/marketplace.types";

type UnifiedSourceType = SponsorSourceType | "creator_submitted" | "manual_confirmed";

const SOURCE_LABELS: Record<UnifiedSourceType, string> = {
  creator_submitted: "主播提交",
  creator_authorized: "主播授权",
  manual_confirmed: "人工确认",
  manual_verified: "人工确认",
  public_info: "公开信息",
  ai_inferred: "AI 推断",
  brand_submitted: "品牌提交",
};

export function confidenceLevel(confidence: number) {
  if (confidence >= 80) return "高";
  if (confidence >= 50) return "中";
  return "低";
}
export function SourceConfidence({
  sourceType,
  sourceLabel,
  sourceUrl,
  confidence,
  timestamp,
  compact = false,
}: {
  sourceType: UnifiedSourceType;
  sourceLabel: string;
  sourceUrl?: string;
  confidence: number;
  timestamp: string;
  compact?: boolean;
}) {
  const isAi = sourceType === "ai_inferred";
  const isLow = confidence < 50;
  return (
    <div className={compact ? "space-y-1" : "rounded-md border border-border bg-muted/30 p-3"}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={isAi ? "secondary" : "outline"} className="text-[10px]">
          {SOURCE_LABELS[sourceType]}
        </Badge>
        <span className="text-[10px] text-muted-foreground">{sourceLabel}</span>
        <Badge variant="outline" className="text-[10px]">
          置信度：{confidence}%（{confidenceLevel(confidence)}）
        </Badge>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> 来源
          </a>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground">
        更新时间：{new Date(timestamp).toLocaleDateString("zh-CN")}
        {isAi ? " · AI 推断，不代表官方数据" : ""}
      </div>
      {isLow && (
        <div className="flex items-center gap-1 text-[10px] text-amber-700">
          <AlertTriangle className="h-3 w-3" /> 该信息未经完全确认，仅供初步参考。
        </div>
      )}
    </div>
  );
}
