export type ClaimRole = "host" | "producer" | "business_manager" | "agency" | "other";
export type ClaimStatus = "pending" | "verified" | "rejected" | "needs_more_info";

export type CreatorClaimRequest = {
  id: string;
  podcastId: string;
  podcastName: string;
  claimantName: string;
  role: ClaimRole;
  contactEmail: string;
  phoneOrWechat?: string;
  linkedinOrWebsite?: string;
  officialPodcastUrl?: string;
  proofDescription?: string;
  proofFileUrl?: string;
  acceptsSponsorship: boolean;
  availableFormats: string[];
  preferredIndustries: string[];
  blockedIndustries: string[];
  hostReadPriceRange?: string;
  sponsorshipPriceRange?: string;
  interviewPriceRange?: string;
  packagePriceRange?: string;
  priceNote?: string;
  currency: "CNY" | "USD" | "EUR" | "GBP";
  audienceDescription?: string;
  previousSponsors?: string;
  caseStudyUrl?: string;
  additionalNote?: string;
  status: ClaimStatus;
  sourceType: "creator_submitted";
  submittedAt: string;
  updatedAt: string;
};

export type SponsorSourceType =
  | "public_info"
  | "manual_verified"
  | "ai_inferred"
  | "creator_authorized"
  | "brand_submitted";

export type SponsorIntelligenceItem = {
  id: string;
  brandName: string;
  brandWebsite?: string;
  industry: string;
  productCategory?: string;
  targetMarket: "china" | "north_america" | "europe" | "global" | "other";
  podcastName: string;
  podcastId?: string;
  podcastUrl?: string;
  campaignFormat:
    | "host_read"
    | "sponsorship"
    | "interview"
    | "branded_content"
    | "community"
    | "newsletter"
    | "other";
  observedDate?: string;
  estimatedBudgetRange?: string;
  campaignNote?: string;
  sourceType: SponsorSourceType;
  sourceLabel: string;
  sourceUrl?: string;
  confidence: number;
  evidenceNote?: string;
  aiStrategySummary?: string;
  aiAudienceInference?: string;
  aiBrandFit?: string;
  aiRiskNote?: string;
  status?: ClaimStatus;
  createdAt: string;
  updatedAt: string;
};
