import { supabase } from "@/integrations/supabase/client";

export type EvidenceItem = {
  id: string;
  entityType: string;
  entityId: string;
  claim: string;
  sourceType: string;
  sourceLabel: string;
  sourceUrl?: string;
  confidence: number;
  explanation?: string;
  capturedAt: string;
  verifiedAt?: string;
};
const db = () => supabase as any;
export async function listEvidence(entityType: string, entityId: string): Promise<EvidenceItem[]> {
  const { data, error } = await db()
    .from("evidence_items")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    claim: row.claim,
    sourceType: row.source_type,
    sourceLabel: row.source_label,
    sourceUrl: row.source_url ?? undefined,
    confidence: row.confidence,
    explanation: row.explanation ?? undefined,
    capturedAt: row.captured_at,
    verifiedAt: row.verified_at ?? undefined,
  }));
}
