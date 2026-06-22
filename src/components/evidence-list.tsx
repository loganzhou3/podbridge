import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { listEvidence, type EvidenceItem } from "@/lib/evidence.storage";

export function EvidenceList({ entityType, entityId }: { entityType: string; entityId: string }) {
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    void listEvidence(entityType, entityId)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [entityType, entityId]);
  if (loading) return <div className="text-xs text-muted-foreground">正在读取来源依据…</div>;
  if (!items.length)
    return (
      <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        暂无独立 Evidence 记录。
      </div>
    );
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="rounded-md border border-border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{item.claim}</span>
            <Badge variant={item.sourceType === "ai_inferred" ? "secondary" : "outline"}>
              {item.sourceType}
            </Badge>
            <span className="text-xs text-muted-foreground">置信度 {item.confidence}%</span>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            来源：{item.sourceLabel} · 采集时间：{new Date(item.capturedAt).toLocaleString("zh-CN")}
          </div>
          {item.explanation && <p className="mt-2 text-xs">{item.explanation}</p>}
          {item.sourceUrl && (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              打开来源
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {item.confidence < 50 && (
            <p className="mt-2 text-xs text-amber-700">该信息未经完全确认，仅供初步参考。</p>
          )}
        </div>
      ))}
    </div>
  );
}
