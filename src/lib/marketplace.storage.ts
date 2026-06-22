import { supabase } from "@/integrations/supabase/client";
import type {
  ClaimStatus,
  CreatorClaimRequest,
  SponsorIntelligenceItem,
} from "@/lib/marketplace.types";

export const MARKETPLACE_UPDATED_EVENT = "podbridge:marketplace-updated";
const db = () => supabase as any;
const emit = () => window.dispatchEvent(new CustomEvent(MARKETPLACE_UPDATED_EVENT));
const check = <T>(data: T, error: { message: string } | null) => {
  if (error) throw new Error(error.message);
  return data;
};
export function createLocalId(_prefix?: string) {
  return crypto.randomUUID();
}

function claimFromRow(row: any): CreatorClaimRequest {
  return {
    id: row.id,
    podcastId: row.podcast_id,
    podcastName: row.podcast_name,
    claimantName: row.claimant_name,
    role: row.role,
    contactEmail: row.contact_email,
    phoneOrWechat: row.phone_or_wechat ?? undefined,
    linkedinOrWebsite: row.linkedin_or_website ?? undefined,
    officialPodcastUrl: row.official_podcast_url ?? undefined,
    proofDescription: row.proof_description ?? undefined,
    proofFileUrl: row.proof_file_url ?? undefined,
    acceptsSponsorship: row.accepts_sponsorship,
    availableFormats: row.available_formats ?? [],
    preferredIndustries: row.preferred_industries ?? [],
    blockedIndustries: row.blocked_industries ?? [],
    hostReadPriceRange: row.host_read_price_range ?? undefined,
    sponsorshipPriceRange: row.sponsorship_price_range ?? undefined,
    interviewPriceRange: row.interview_price_range ?? undefined,
    packagePriceRange: row.package_price_range ?? undefined,
    priceNote: row.price_note ?? undefined,
    currency: row.currency,
    audienceDescription: row.audience_description ?? undefined,
    previousSponsors: row.previous_sponsors ?? undefined,
    caseStudyUrl: row.case_study_url ?? undefined,
    additionalNote: row.additional_note ?? undefined,
    status: row.status,
    sourceType: "creator_submitted",
    submittedAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function sponsorFromRow(row: any): SponsorIntelligenceItem {
  return {
    id: row.id,
    brandName: row.brand_name,
    brandWebsite: row.brand_website ?? undefined,
    industry: row.industry,
    productCategory: row.product_category ?? undefined,
    targetMarket: row.target_market,
    podcastName: row.podcast_name,
    podcastId: row.podcast_id ?? undefined,
    podcastUrl: row.podcast_url ?? undefined,
    campaignFormat: row.campaign_format,
    observedDate: row.observed_date ?? undefined,
    estimatedBudgetRange: row.estimated_budget_range ?? undefined,
    campaignNote: row.campaign_note ?? undefined,
    sourceType: row.source_type,
    sourceLabel: row.source_label,
    sourceUrl: row.source_url ?? undefined,
    confidence: row.confidence,
    evidenceNote: row.evidence_note ?? undefined,
    aiStrategySummary: row.ai_strategy_summary ?? undefined,
    aiAudienceInference: row.ai_audience_inference ?? undefined,
    aiBrandFit: row.ai_brand_fit ?? undefined,
    aiRiskNote: row.ai_risk_note ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getCreatorClaims() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data: profile } = await db()
    .from("profiles")
    .select("role")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  let query = db()
    .from("creator_claim_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (profile?.role !== "admin") query = query.eq("claimant_user_id", auth.user.id);
  const { data, error } = await query;
  return (check(data ?? [], error) as any[]).map(claimFromRow);
}
export async function saveCreatorClaim(claim: CreatorClaimRequest) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("请先登录后再提交认领申请");
  const row = {
    id: claim.id,
    podcast_id: claim.podcastId,
    podcast_name: claim.podcastName,
    claimant_user_id: auth.user.id,
    claimant_name: claim.claimantName,
    role: claim.role,
    contact_email: claim.contactEmail,
    phone_or_wechat: claim.phoneOrWechat ?? null,
    linkedin_or_website: claim.linkedinOrWebsite ?? null,
    official_podcast_url: claim.officialPodcastUrl ?? null,
    proof_description: claim.proofDescription ?? null,
    proof_file_url: claim.proofFileUrl ?? null,
    accepts_sponsorship: claim.acceptsSponsorship,
    available_formats: claim.availableFormats,
    preferred_industries: claim.preferredIndustries,
    blocked_industries: claim.blockedIndustries,
    host_read_price_range: claim.hostReadPriceRange ?? null,
    sponsorship_price_range: claim.sponsorshipPriceRange ?? null,
    interview_price_range: claim.interviewPriceRange ?? null,
    package_price_range: claim.packagePriceRange ?? null,
    price_note: claim.priceNote ?? null,
    currency: claim.currency,
    audience_description: claim.audienceDescription ?? null,
    previous_sponsors: claim.previousSponsors ?? null,
    case_study_url: claim.caseStudyUrl ?? null,
    additional_note: claim.additionalNote ?? null,
    status: "pending",
    updated_at: claim.updatedAt,
  };
  const { data, error } = await db()
    .from("creator_claim_requests")
    .insert(row)
    .select("*")
    .single();
  emit();
  return claimFromRow(check(data, error));
}
export async function updateCreatorClaimStatus(id: string, status: ClaimStatus) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("请先登录");
  const { error } = await db()
    .from("creator_claim_requests")
    .update({
      status,
      reviewed_by: auth.user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  check(null, error);
  emit();
}
export async function getVerifiedClaimForPodcast(podcastId: string) {
  const { data, error } = await db()
    .from("creator_claim_requests")
    .select("*")
    .eq("podcast_id", podcastId)
    .eq("status", "verified")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? claimFromRow(check(data, error)) : (check(data, error), null);
}

export async function getSponsorItems() {
  const { data, error } = await db()
    .from("sponsor_intelligence_items")
    .select("*")
    .order("created_at", { ascending: false });
  return (check(data ?? [], error) as any[]).map(sponsorFromRow);
}
export async function saveSponsorItem(item: SponsorIntelligenceItem) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("请先登录后再录入品牌投放案例");
  const row = {
    id: item.id,
    brand_name: item.brandName,
    brand_website: item.brandWebsite ?? null,
    industry: item.industry,
    product_category: item.productCategory ?? null,
    target_market: item.targetMarket,
    podcast_name: item.podcastName,
    podcast_id: item.podcastId ?? null,
    podcast_url: item.podcastUrl ?? null,
    campaign_format: item.campaignFormat,
    observed_date: item.observedDate ?? null,
    estimated_budget_range: item.estimatedBudgetRange ?? null,
    campaign_note: item.campaignNote ?? null,
    source_type: item.sourceType,
    source_label: item.sourceLabel,
    source_url: item.sourceUrl ?? null,
    confidence: item.confidence,
    evidence_note: item.evidenceNote ?? null,
    ai_strategy_summary: item.aiStrategySummary ?? null,
    ai_audience_inference: item.aiAudienceInference ?? null,
    ai_brand_fit: item.aiBrandFit ?? null,
    ai_risk_note: item.aiRiskNote ?? null,
    status: "pending",
    created_by: auth.user.id,
    updated_at: item.updatedAt,
  };
  const { data, error } = await db()
    .from("sponsor_intelligence_items")
    .insert(row)
    .select("*")
    .single();
  const saved = sponsorFromRow(check(data, error));
  if (item.sourceLabel)
    await db()
      .from("evidence_items")
      .insert({
        entity_type: "sponsor_intelligence",
        entity_id: saved.id,
        claim: `${item.brandName} 在 ${item.podcastName} 的投放观察`,
        source_type: item.sourceType,
        source_label: item.sourceLabel,
        source_url: item.sourceUrl ?? null,
        confidence: item.confidence,
        explanation: item.evidenceNote ?? null,
        captured_at: item.observedDate
          ? new Date(`${item.observedDate}T00:00:00Z`).toISOString()
          : new Date().toISOString(),
        created_by: auth.user.id,
      });
  emit();
  return saved;
}
export async function updateSponsorItemStatus(id: string, status: ClaimStatus) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("请先登录");
  const { error } = await db()
    .from("sponsor_intelligence_items")
    .update({
      status,
      reviewed_by: auth.user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  check(null, error);
  emit();
}
export async function getSponsorItemsForPodcast(podcastId: string, podcastName?: string | null) {
  const rows = await getSponsorItems();
  const normalized = podcastName?.trim().toLocaleLowerCase();
  return rows.filter(
    (item) =>
      item.podcastId === podcastId ||
      (normalized && item.podcastName.trim().toLocaleLowerCase() === normalized),
  );
}
