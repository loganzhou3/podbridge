export type ResearchPlatform = "喜马拉雅" | "小宇宙" | "Apple Podcast" | "Spotify" | "其他";

export type ResearchTaskStatus = "pending" | "collecting" | "completed" | "abandoned";

export type CaptureMethod = "manual" | "browser-assisted" | "imported";

export type ResearchTask = {
  id: string;
  platform: ResearchPlatform;
  keyword: string;
  target_category: string | null;
  notes: string | null;
  status: ResearchTaskStatus;
  created_at: string;
  updated_at: string;
};

export type ResearchCaptureRecord = {
  id: string;
  task_id: string | null;
  podcast_id: string | null;
  platform: ResearchPlatform;
  podcast_title: string;
  host_name: string | null;
  description: string | null;
  category: string | null;
  source_url: string;
  rss_url: string | null;
  visible_followers: number | null;
  visible_play_count: number | null;
  episode_count: number | null;
  latest_episode_date: string | null;
  update_frequency: string | null;
  comment_count: number | null;
  ranking_info: string | null;
  suitable_industries: string[];
  notes: string | null;
  captured_at: string;
  captured_by: string;
  capture_method: CaptureMethod;
  confidence: number;
  evidence_note: string;
  screenshot_url: string | null;
  ai_tags: string[];
  ai_brand_fit: string[];
  ai_brand_safety: {
    label: string;
    risks: string[];
    note: string;
  };
  ai_recommended_formats: string[];
  status: string;
  created_at: string;
  updated_at: string;
};

export type PodcastSourceEvidence = {
  id: string;
  podcast_id: string | null;
  record_id: string | null;
  claim: string;
  source_platform: ResearchPlatform | "RSS" | "AI推断" | "人工录入" | "主播授权" | "其他";
  source_label: string;
  source_url: string | null;
  confidence: number;
  captured_at: string;
  captured_by: string;
  capture_method: CaptureMethod;
  explanation: string;
  screenshot_url: string | null;
  created_at: string;
};
