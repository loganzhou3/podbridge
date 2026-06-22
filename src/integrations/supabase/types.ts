export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      brand_contacts_cache: {
        Row: {
          brand_key: string
          brand_name: string
          contact_email: string | null
          fetched_at: string
          notes: string | null
          raw: Json | null
          website: string | null
        }
        Insert: {
          brand_key: string
          brand_name: string
          contact_email?: string | null
          fetched_at?: string
          notes?: string | null
          raw?: Json | null
          website?: string | null
        }
        Update: {
          brand_key?: string
          brand_name?: string
          contact_email?: string | null
          fetched_at?: string
          notes?: string | null
          raw?: Json | null
          website?: string | null
        }
        Relationships: []
      }
      brand_recommendations: {
        Row: {
          brand_name: string
          category: string | null
          contact_email: string | null
          contact_notes: string | null
          contacts_fetched_at: string | null
          created_at: string
          fit_score: number | null
          id: string
          podcast_id: string
          reason: string | null
          website: string | null
        }
        Insert: {
          brand_name: string
          category?: string | null
          contact_email?: string | null
          contact_notes?: string | null
          contacts_fetched_at?: string | null
          created_at?: string
          fit_score?: number | null
          id?: string
          podcast_id: string
          reason?: string | null
          website?: string | null
        }
        Update: {
          brand_name?: string
          category?: string | null
          contact_email?: string | null
          contact_notes?: string | null
          contacts_fetched_at?: string | null
          created_at?: string
          fit_score?: number | null
          id?: string
          podcast_id?: string
          reason?: string | null
          website?: string | null
        }
        Relationships: []
      }
      brand_briefs: {
        Row: {
          audience_notes: string | null
          brand_name: string
          budget_rmb: number
          created_at: string
          flight_end: string | null
          flight_start: string | null
          goal: string
          id: string
          product_description: string
          status: string
          target_tier: string
          updated_at: string
        }
        Insert: {
          audience_notes?: string | null
          brand_name: string
          budget_rmb: number
          created_at?: string
          flight_end?: string | null
          flight_start?: string | null
          goal: string
          id?: string
          product_description: string
          status?: string
          target_tier?: string
          updated_at?: string
        }
        Update: {
          audience_notes?: string | null
          brand_name?: string
          budget_rmb?: number
          created_at?: string
          flight_end?: string | null
          flight_start?: string | null
          goal?: string
          id?: string
          product_description?: string
          status?: string
          target_tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          actual_clicks: number | null
          actual_conversions: number | null
          actual_reach: number | null
          actual_spend_rmb: number | null
          brief_id: string | null
          created_at: string
          id: string
          name: string
          plan: Json | null
          review_notes: string | null
          review_summary: string | null
          status: string
          updated_at: string
        }
        Insert: {
          actual_clicks?: number | null
          actual_conversions?: number | null
          actual_reach?: number | null
          actual_spend_rmb?: number | null
          brief_id?: string | null
          created_at?: string
          id?: string
          name: string
          plan?: Json | null
          review_notes?: string | null
          review_summary?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          actual_clicks?: number | null
          actual_conversions?: number | null
          actual_reach?: number | null
          actual_spend_rmb?: number | null
          brief_id?: string | null
          created_at?: string
          id?: string
          name?: string
          plan?: Json | null
          review_notes?: string | null
          review_summary?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_refresh_runs: {
        Row: {
          discovered_count: number
          discovery_attempts: number
          error_message: string | null
          failed_count: number
          finished_at: string | null
          id: string
          refreshed_count: number
          result: Json
          seeds: string[]
          started_at: string
          status: string
          trigger_source: string
        }
        Insert: {
          discovered_count?: number
          discovery_attempts?: number
          error_message?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          refreshed_count?: number
          result?: Json
          seeds?: string[]
          started_at?: string
          status?: string
          trigger_source?: string
        }
        Update: {
          discovered_count?: number
          discovery_attempts?: number
          error_message?: string | null
          failed_count?: number
          finished_at?: string | null
          id?: string
          refreshed_count?: number
          result?: Json
          seeds?: string[]
          started_at?: string
          status?: string
          trigger_source?: string
        }
        Relationships: []
      }
      campaign_podcasts: {
        Row: {
          actual_clicks: number | null
          actual_conversions: number | null
          actual_reach: number | null
          actual_spend_rmb: number | null
          brand_safety_notes: string | null
          brand_safety_score: number | null
          brand_safety_tags: string[]
          campaign_id: string
          competitor_brands: string[]
          created_at: string
          data_confidence: string
          estimated_cpm_rmb: number | null
          estimated_episodes: number | null
          expected_reach: number | null
          fit_reason: string | null
          id: string
          match_explanation: string | null
          notes: string | null
          outreach_status: string
          pipeline_status: string
          plan_label: string | null
          podcast_id: string | null
          pricing_basis: string | null
          quoted_price_rmb: number | null
          scheduled_date: string | null
          suggested_price_max_rmb: number | null
          suggested_price_min_rmb: number | null
          sort_order: number | null
          suggested_format: string | null
          title: string
          updated_at: string
        }
        Insert: {
          actual_clicks?: number | null
          actual_conversions?: number | null
          actual_reach?: number | null
          actual_spend_rmb?: number | null
          brand_safety_notes?: string | null
          brand_safety_score?: number | null
          brand_safety_tags?: string[]
          campaign_id: string
          competitor_brands?: string[]
          created_at?: string
          data_confidence?: string
          estimated_cpm_rmb?: number | null
          estimated_episodes?: number | null
          expected_reach?: number | null
          fit_reason?: string | null
          id?: string
          match_explanation?: string | null
          notes?: string | null
          outreach_status?: string
          pipeline_status?: string
          plan_label?: string | null
          podcast_id?: string | null
          pricing_basis?: string | null
          quoted_price_rmb?: number | null
          scheduled_date?: string | null
          suggested_price_max_rmb?: number | null
          suggested_price_min_rmb?: number | null
          sort_order?: number | null
          suggested_format?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          actual_clicks?: number | null
          actual_conversions?: number | null
          actual_reach?: number | null
          actual_spend_rmb?: number | null
          brand_safety_notes?: string | null
          brand_safety_score?: number | null
          brand_safety_tags?: string[]
          campaign_id?: string
          competitor_brands?: string[]
          created_at?: string
          data_confidence?: string
          estimated_cpm_rmb?: number | null
          estimated_episodes?: number | null
          expected_reach?: number | null
          fit_reason?: string | null
          id?: string
          match_explanation?: string | null
          notes?: string | null
          outreach_status?: string
          pipeline_status?: string
          plan_label?: string | null
          podcast_id?: string | null
          pricing_basis?: string | null
          quoted_price_rmb?: number | null
          scheduled_date?: string | null
          suggested_price_max_rmb?: number | null
          suggested_price_min_rmb?: number | null
          sort_order?: number | null
          suggested_format?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      competitor_campaigns: {
        Row: {
          ad_format: string | null
          brand_category: string | null
          brand_name: string
          created_at: string
          data_confidence: string
          evidence_url: string | null
          first_seen_at: string | null
          id: string
          last_seen_at: string | null
          notes: string | null
          podcast_id: string | null
          updated_at: string
        }
        Insert: {
          ad_format?: string | null
          brand_category?: string | null
          brand_name: string
          created_at?: string
          data_confidence?: string
          evidence_url?: string | null
          first_seen_at?: string | null
          id?: string
          last_seen_at?: string | null
          notes?: string | null
          podcast_id?: string | null
          updated_at?: string
        }
        Update: {
          ad_format?: string | null
          brand_category?: string | null
          brand_name?: string
          created_at?: string
          data_confidence?: string
          evidence_url?: string | null
          first_seen_at?: string | null
          id?: string
          last_seen_at?: string | null
          notes?: string | null
          podcast_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      creator_contacts: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          created_at: string
          id: string
          last_contacted_at: string | null
          notes: string | null
          platform: string | null
          podcast_id: string | null
          profile_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          last_contacted_at?: string | null
          notes?: string | null
          platform?: string | null
          podcast_id?: string | null
          profile_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          last_contacted_at?: string | null
          notes?: string | null
          platform?: string | null
          podcast_id?: string | null
          profile_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      creator_submissions: {
        Row: {
          ad_categories: string[]
          authorized_metrics: Json
          contact_email: string | null
          contact_wechat: string | null
          created_at: string
          host_name: string | null
          id: string
          introduction: string | null
          notes: string | null
          podcast_name: string
          podcast_url: string | null
          quote_max_rmb: number | null
          quote_min_rmb: number | null
          status: string
          updated_at: string
        }
        Insert: {
          ad_categories?: string[]
          authorized_metrics?: Json
          contact_email?: string | null
          contact_wechat?: string | null
          created_at?: string
          host_name?: string | null
          id?: string
          introduction?: string | null
          notes?: string | null
          podcast_name: string
          podcast_url?: string | null
          quote_max_rmb?: number | null
          quote_min_rmb?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          ad_categories?: string[]
          authorized_metrics?: Json
          contact_email?: string | null
          contact_wechat?: string | null
          created_at?: string
          host_name?: string | null
          id?: string
          introduction?: string | null
          notes?: string | null
          podcast_name?: string
          podcast_url?: string | null
          quote_max_rmb?: number | null
          quote_min_rmb?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      episodes: {
        Row: {
          audio_url: string | null
          created_at: string
          description: string | null
          duration_seconds: number | null
          guid: string | null
          id: string
          podcast_id: string
          pub_date: string | null
          title: string | null
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          guid?: string | null
          id?: string
          podcast_id: string
          pub_date?: string | null
          title?: string | null
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          guid?: string | null
          id?: string
          podcast_id?: string
          pub_date?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "episodes_podcast_id_fkey"
            columns: ["podcast_id"]
            isOneToOne: false
            referencedRelation: "podcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      podcast_ad_profiles: {
        Row: {
          ad_categories: string[]
          brand_safety_notes: string | null
          brand_safety_score: number
          brand_safety_tags: string[]
          collaboration_status: string
          contact_email: string | null
          contact_method: string | null
          contact_wechat: string | null
          created_at: string
          data_confidence: string
          historical_brands: string[]
          host_read_max_rmb: number | null
          host_read_min_rmb: number | null
          id: string
          manually_confirmed_at: string | null
          notes: string | null
          podcast_id: string
          pricing_basis: string | null
          quote_max_rmb: number | null
          quote_min_rmb: number | null
          response_rate: number | null
          source_notes: string | null
          custom_episode_max_rmb: number | null
          custom_episode_min_rmb: number | null
          sponsorship_max_rmb: number | null
          sponsorship_min_rmb: number | null
          suggested_price_max_rmb: number | null
          suggested_price_min_rmb: number | null
          updated_at: string
        }
        Insert: {
          ad_categories?: string[]
          brand_safety_notes?: string | null
          brand_safety_score?: number
          brand_safety_tags?: string[]
          collaboration_status?: string
          contact_email?: string | null
          contact_method?: string | null
          contact_wechat?: string | null
          created_at?: string
          data_confidence?: string
          historical_brands?: string[]
          host_read_max_rmb?: number | null
          host_read_min_rmb?: number | null
          id?: string
          manually_confirmed_at?: string | null
          notes?: string | null
          podcast_id: string
          pricing_basis?: string | null
          quote_max_rmb?: number | null
          quote_min_rmb?: number | null
          response_rate?: number | null
          source_notes?: string | null
          custom_episode_max_rmb?: number | null
          custom_episode_min_rmb?: number | null
          sponsorship_max_rmb?: number | null
          sponsorship_min_rmb?: number | null
          suggested_price_max_rmb?: number | null
          suggested_price_min_rmb?: number | null
          updated_at?: string
        }
        Update: {
          ad_categories?: string[]
          brand_safety_notes?: string | null
          brand_safety_score?: number
          brand_safety_tags?: string[]
          collaboration_status?: string
          contact_email?: string | null
          contact_method?: string | null
          contact_wechat?: string | null
          created_at?: string
          data_confidence?: string
          historical_brands?: string[]
          host_read_max_rmb?: number | null
          host_read_min_rmb?: number | null
          id?: string
          manually_confirmed_at?: string | null
          notes?: string | null
          podcast_id?: string
          pricing_basis?: string | null
          quote_max_rmb?: number | null
          quote_min_rmb?: number | null
          response_rate?: number | null
          source_notes?: string | null
          custom_episode_max_rmb?: number | null
          custom_episode_min_rmb?: number | null
          sponsorship_max_rmb?: number | null
          sponsorship_min_rmb?: number | null
          suggested_price_max_rmb?: number | null
          suggested_price_min_rmb?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      podcasts: {
        Row: {
          activity_score: number | null
          ai_strategy: Json | null
          ai_strategy_at: string | null
          apple_reviews: number | null
          apple_subscribers: number | null
          audience_age_range: string | null
          audience_gender_split: string | null
          audience_geo: string | null
          audience_persona: string | null
          audience_tags: string[] | null
          author: string | null
          avg_duration_minutes: number | null
          category: string | null
          commercial_score: number | null
          completion_rate: number | null
          cpm_rate: number | null
          created_at: string
          description: string | null
          episode_count: number | null
          first_episode_at: string | null
          growth_score: number | null
          id: string
          image_url: string | null
          itunes_id: string | null
          itunes_url: string | null
          language: string | null
          last_synced_at: string | null
          latest_episode_at: string | null
          lifecycle_stage: string | null
          market: string
          metrics_notes: string | null
          metrics_updated_at: string | null
          monthly_active_listeners: number | null
          new_listener_retention: number | null
          rss_url: string | null
          title: string | null
          update_frequency_days: number | null
          updated_at: string
          xiaoyuzhou_comments: number | null
          xiaoyuzhou_episode_count: number | null
          xiaoyuzhou_subscribers: number | null
          xiaoyuzhou_url: string | null
          ximalaya_comments: number | null
          ximalaya_plays: number | null
          ximalaya_subscribers: number | null
          ximalaya_url: string | null
        }
        Insert: {
          activity_score?: number | null
          ai_strategy?: Json | null
          ai_strategy_at?: string | null
          apple_reviews?: number | null
          apple_subscribers?: number | null
          audience_age_range?: string | null
          audience_gender_split?: string | null
          audience_geo?: string | null
          audience_persona?: string | null
          audience_tags?: string[] | null
          author?: string | null
          avg_duration_minutes?: number | null
          category?: string | null
          commercial_score?: number | null
          completion_rate?: number | null
          cpm_rate?: number | null
          created_at?: string
          description?: string | null
          episode_count?: number | null
          first_episode_at?: string | null
          growth_score?: number | null
          id?: string
          image_url?: string | null
          itunes_id?: string | null
          itunes_url?: string | null
          language?: string | null
          last_synced_at?: string | null
          latest_episode_at?: string | null
          lifecycle_stage?: string | null
          market?: string
          metrics_notes?: string | null
          metrics_updated_at?: string | null
          monthly_active_listeners?: number | null
          new_listener_retention?: number | null
          rss_url?: string | null
          title?: string | null
          update_frequency_days?: number | null
          updated_at?: string
          xiaoyuzhou_comments?: number | null
          xiaoyuzhou_episode_count?: number | null
          xiaoyuzhou_subscribers?: number | null
          xiaoyuzhou_url?: string | null
          ximalaya_comments?: number | null
          ximalaya_plays?: number | null
          ximalaya_subscribers?: number | null
          ximalaya_url?: string | null
        }
        Update: {
          activity_score?: number | null
          ai_strategy?: Json | null
          ai_strategy_at?: string | null
          apple_reviews?: number | null
          apple_subscribers?: number | null
          audience_age_range?: string | null
          audience_gender_split?: string | null
          audience_geo?: string | null
          audience_persona?: string | null
          audience_tags?: string[] | null
          author?: string | null
          avg_duration_minutes?: number | null
          category?: string | null
          commercial_score?: number | null
          completion_rate?: number | null
          cpm_rate?: number | null
          created_at?: string
          description?: string | null
          episode_count?: number | null
          first_episode_at?: string | null
          growth_score?: number | null
          id?: string
          image_url?: string | null
          itunes_id?: string | null
          itunes_url?: string | null
          language?: string | null
          last_synced_at?: string | null
          latest_episode_at?: string | null
          lifecycle_stage?: string | null
          market?: string
          metrics_notes?: string | null
          metrics_updated_at?: string | null
          monthly_active_listeners?: number | null
          new_listener_retention?: number | null
          rss_url?: string | null
          title?: string | null
          update_frequency_days?: number | null
          updated_at?: string
          xiaoyuzhou_comments?: number | null
          xiaoyuzhou_episode_count?: number | null
          xiaoyuzhou_subscribers?: number | null
          xiaoyuzhou_url?: string | null
          ximalaya_comments?: number | null
          ximalaya_plays?: number | null
          ximalaya_subscribers?: number | null
          ximalaya_url?: string | null
        }
        Relationships: []
      }
      snapshots: {
        Row: {
          apple_rank: number | null
          daily_play_delta: number | null
          episode_count: number | null
          estimated_reviews: number | null
          estimated_subscribers: number | null
          id: string
          itunes_review_count: number | null
          podcast_id: string
          taken_at: string
          xiaoyuzhou_subscribers: number | null
          ximalaya_plays: number | null
        }
        Insert: {
          apple_rank?: number | null
          daily_play_delta?: number | null
          episode_count?: number | null
          estimated_reviews?: number | null
          estimated_subscribers?: number | null
          id?: string
          itunes_review_count?: number | null
          podcast_id: string
          taken_at?: string
          xiaoyuzhou_subscribers?: number | null
          ximalaya_plays?: number | null
        }
        Update: {
          apple_rank?: number | null
          daily_play_delta?: number | null
          episode_count?: number | null
          estimated_reviews?: number | null
          estimated_subscribers?: number | null
          id?: string
          itunes_review_count?: number | null
          podcast_id?: string
          taken_at?: string
          xiaoyuzhou_subscribers?: number | null
          ximalaya_plays?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "snapshots_podcast_id_fkey"
            columns: ["podcast_id"]
            isOneToOne: false
            referencedRelation: "podcasts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
