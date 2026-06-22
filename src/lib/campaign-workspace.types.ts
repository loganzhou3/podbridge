export type CampaignStatus =
  | "draft"
  | "planning"
  | "contacting"
  | "negotiating"
  | "confirmed"
  | "live"
  | "completed"
  | "paused";

export type Campaign = {
  id: string;
  campaignName: string;
  brandName: string;
  brandWebsite?: string;
  productDescription: string;
  productCategory?: string;
  targetMarket: "china" | "north_america" | "europe" | "global" | "other";
  budget: number;
  currency: "CNY" | "USD" | "EUR" | "GBP";
  objective: string;
  targetAudience: string;
  audienceAgeRange?: string;
  audienceGender?: string;
  audienceLocation?: string;
  audienceInterest?: string;
  brandTone: string;
  preferredCategories: string;
  forbiddenTopics?: string;
  blockedIndustries?: string;
  requiredMessage?: string;
  campaignStartDate?: string;
  campaignEndDate?: string;
  status: CampaignStatus;
  createdAt: string;
  updatedAt: string;
};
export type CampaignContactStatus =
  | "candidate"
  | "to_contact"
  | "contacted"
  | "replied"
  | "quoted"
  | "negotiating"
  | "confirmed"
  | "rejected"
  | "live"
  | "reviewed";

export type CampaignSourceType =
  | "public_info"
  | "manual_verified"
  | "ai_inferred"
  | "creator_authorized";

export type CampaignPodcastItem = {
  id: string;
  campaignId: string;
  podcastId: string;
  podcastName: string;
  category?: string;
  platform?: string;
  commercialScore?: number;
  matchScore: number;
  brandSafetyScore: number;
  estimatedPriceRange?: string;
  recommendedFormat: string;
  recommendationReason: string;
  confidence: number;
  sourceType: CampaignSourceType;
  sourceLabel: string;
  sourceUrl?: string;
  contactStatus: CampaignContactStatus;
  contactPerson?: string;
  contactInfo?: string;
  quotedPrice?: number;
  negotiatedPrice?: number;
  note?: string;
  nextAction?: string;
  nextFollowUpDate?: string;
  createdAt: string;
  updatedAt: string;
};

export type CampaignGeneratedAssetType =
  | "outreach_email_cn"
  | "outreach_email_en"
  | "wechat_message"
  | "host_invitation"
  | "final_plan"
  | "script_direction";

export type CampaignGeneratedAsset = {
  id: string;
  campaignId: string;
  podcastId?: string;
  type: CampaignGeneratedAssetType;
  content: string;
  generatedAt: string;
  sourceNote: string;
};
