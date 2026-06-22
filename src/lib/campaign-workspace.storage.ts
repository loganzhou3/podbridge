import { supabase } from "@/integrations/supabase/client";
import type {
  Campaign,
  CampaignGeneratedAsset,
  CampaignPodcastItem,
} from "@/lib/campaign-workspace.types";

const ASSETS_KEY = "podbridge.campaign-workspace.assets.v1";
export const CAMPAIGN_WORKSPACE_UPDATED = "podbridge:campaign-workspace-updated";
const db = () => supabase as any;

function localRead<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
function localWrite<T>(key: string, value: T[]) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(CAMPAIGN_WORKSPACE_UPDATED));
}
function required<T>(data: T | null, error: { message: string } | null) {
  if (error) throw new Error(error.message);
  return data;
}

export function campaignWorkspaceId(_prefix?: string) {
  return crypto.randomUUID();
}

function campaignFromRow(row: any): Campaign {
  return {
    id: row.id,
    campaignName: row.campaign_name ?? row.name,
    brandName: row.brand_name ?? "",
    brandWebsite: row.brand_website ?? undefined,
    productDescription: row.product_description ?? "",
    productCategory: row.product_category ?? undefined,
    targetMarket: row.target_market ?? "china",
    budget: Number(row.budget ?? 0),
    currency: row.currency ?? "CNY",
    objective: row.objective ?? "",
    targetAudience: row.target_audience ?? "",
    audienceAgeRange: row.audience_age_range ?? undefined,
    audienceGender: row.audience_gender ?? undefined,
    audienceLocation: row.audience_location ?? undefined,
    audienceInterest: row.audience_interest ?? undefined,
    brandTone: row.brand_tone ?? "",
    preferredCategories: row.preferred_categories ?? "",
    forbiddenTopics: row.forbidden_topics ?? undefined,
    blockedIndustries: row.blocked_industries ?? undefined,
    requiredMessage: row.required_message ?? undefined,
    campaignStartDate: row.start_date ?? undefined,
    campaignEndDate: row.end_date ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function campaignRow(value: Campaign, ownerId: string) {
  return {
    id: value.id,
    owner_id: ownerId,
    name: value.campaignName,
    campaign_name: value.campaignName,
    brand_name: value.brandName,
    brand_website: value.brandWebsite ?? null,
    product_description: value.productDescription,
    product_category: value.productCategory ?? null,
    target_market: value.targetMarket,
    budget: value.budget,
    currency: value.currency,
    objective: value.objective,
    target_audience: value.targetAudience,
    audience_age_range: value.audienceAgeRange ?? null,
    audience_gender: value.audienceGender ?? null,
    audience_location: value.audienceLocation ?? null,
    audience_interest: value.audienceInterest ?? null,
    brand_tone: value.brandTone,
    preferred_categories: value.preferredCategories,
    forbidden_topics: value.forbiddenTopics ?? null,
    blocked_industries: value.blockedIndustries ?? null,
    required_message: value.requiredMessage ?? null,
    start_date: value.campaignStartDate ?? null,
    end_date: value.campaignEndDate ?? null,
    status: value.status,
    updated_at: value.updatedAt,
  };
}
function itemFromRow(row: any): CampaignPodcastItem {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    podcastId: row.podcast_id,
    podcastName: row.podcast_name,
    category: row.category ?? undefined,
    platform: row.platform ?? undefined,
    commercialScore: row.commercial_score == null ? undefined : Number(row.commercial_score),
    matchScore: row.match_score ?? 0,
    brandSafetyScore: row.brand_safety_score ?? 0,
    estimatedPriceRange: row.estimated_price_range ?? undefined,
    recommendedFormat: row.recommended_format ?? "",
    recommendationReason: row.recommendation_reason ?? "",
    confidence: row.confidence ?? 0,
    sourceType: row.source_type ?? "ai_inferred",
    sourceLabel: row.source_label ?? "未标注",
    sourceUrl: row.source_url ?? undefined,
    contactStatus: row.contact_status,
    contactPerson: row.contact_person ?? undefined,
    contactInfo: row.contact_info ?? undefined,
    quotedPrice: row.quoted_price == null ? undefined : Number(row.quoted_price),
    negotiatedPrice: row.negotiated_price == null ? undefined : Number(row.negotiated_price),
    note: row.note ?? undefined,
    nextAction: row.next_action ?? undefined,
    nextFollowUpDate: row.next_follow_up_date ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function itemRow(value: CampaignPodcastItem) {
  return {
    id: value.id,
    campaign_id: value.campaignId,
    podcast_id: value.podcastId,
    podcast_name: value.podcastName,
    category: value.category ?? null,
    platform: value.platform ?? null,
    commercial_score: value.commercialScore ?? null,
    match_score: value.matchScore,
    brand_safety_score: value.brandSafetyScore,
    estimated_price_range: value.estimatedPriceRange ?? null,
    recommended_format: value.recommendedFormat,
    recommendation_reason: value.recommendationReason,
    confidence: value.confidence,
    source_type: value.sourceType,
    source_label: value.sourceLabel,
    source_url: value.sourceUrl ?? null,
    contact_status: value.contactStatus,
    contact_person: value.contactPerson ?? null,
    contact_info: value.contactInfo ?? null,
    quoted_price: value.quotedPrice ?? null,
    negotiated_price: value.negotiatedPrice ?? null,
    note: value.note ?? null,
    next_action: value.nextAction ?? null,
    next_follow_up_date: value.nextFollowUpDate ?? null,
    updated_at: value.updatedAt,
  };
}

export async function listWorkspaceCampaigns() {
  const { data, error } = await db()
    .from("campaigns")
    .select("*")
    .order("updated_at", { ascending: false });
  return (required(data, error) ?? []).map(campaignFromRow);
}
export async function getWorkspaceCampaign(id: string) {
  const { data, error } = await db().from("campaigns").select("*").eq("id", id).maybeSingle();
  const row = required(data, error);
  return row ? campaignFromRow(row) : null;
}
export async function saveWorkspaceCampaign(campaign: Campaign) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("请先登录后再保存 Campaign");
  const { data, error } = await db()
    .from("campaigns")
    .upsert(campaignRow(campaign, auth.user.id))
    .select("*")
    .single();
  window.dispatchEvent(new CustomEvent(CAMPAIGN_WORKSPACE_UPDATED));
  return campaignFromRow(required(data, error));
}
export async function deleteWorkspaceCampaign(id: string) {
  const { error } = await db().from("campaigns").delete().eq("id", id);
  required(null, error);
  window.dispatchEvent(new CustomEvent(CAMPAIGN_WORKSPACE_UPDATED));
}
export async function listWorkspacePodcastItems(campaignId?: string) {
  let query = db()
    .from("campaign_podcast_items")
    .select("*")
    .order("updated_at", { ascending: false });
  if (campaignId) query = query.eq("campaign_id", campaignId);
  const { data, error } = await query;
  return (required(data, error) ?? []).map(itemFromRow);
}
export async function saveWorkspacePodcastItem(item: CampaignPodcastItem) {
  const { data: existing, error: existingError } = await db()
    .from("campaign_podcast_items")
    .select("id,created_at")
    .eq("campaign_id", item.campaignId)
    .eq("podcast_id", item.podcastId)
    .maybeSingle();
  required(existing, existingError);
  const saved = existing ? { ...item, id: existing.id, createdAt: existing.created_at } : item;
  const { data, error } = await db()
    .from("campaign_podcast_items")
    .upsert(itemRow(saved), { onConflict: "campaign_id,podcast_id" })
    .select("*")
    .single();
  window.dispatchEvent(new CustomEvent(CAMPAIGN_WORKSPACE_UPDATED));
  return { item: itemFromRow(required(data, error)), duplicated: Boolean(existing) };
}
export async function updateWorkspacePodcastItem(
  id: string,
  updates: Partial<CampaignPodcastItem>,
) {
  const current = await db().from("campaign_podcast_items").select("*").eq("id", id).single();
  const item = itemFromRow(required(current.data, current.error));
  const next = {
    ...item,
    ...updates,
    id: item.id,
    campaignId: item.campaignId,
    updatedAt: new Date().toISOString(),
  };
  const { error } = await db().from("campaign_podcast_items").update(itemRow(next)).eq("id", id);
  required(null, error);
  window.dispatchEvent(new CustomEvent(CAMPAIGN_WORKSPACE_UPDATED));
}
export async function deleteWorkspacePodcastItem(id: string) {
  const { error } = await db().from("campaign_podcast_items").delete().eq("id", id);
  required(null, error);
  window.dispatchEvent(new CustomEvent(CAMPAIGN_WORKSPACE_UPDATED));
}

export function listWorkspaceAssets(campaignId?: string) {
  const rows = localRead<CampaignGeneratedAsset>(ASSETS_KEY);
  return campaignId ? rows.filter((row) => row.campaignId === campaignId) : rows;
}
export function saveWorkspaceAssets(assets: CampaignGeneratedAsset[]) {
  const ids = new Set(assets.map((item) => item.id));
  localWrite(ASSETS_KEY, [...assets, ...listWorkspaceAssets().filter((item) => !ids.has(item.id))]);
}
