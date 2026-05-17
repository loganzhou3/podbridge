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
      podcasts: {
        Row: {
          activity_score: number | null
          audience_tags: string[] | null
          author: string | null
          avg_duration_minutes: number | null
          category: string | null
          commercial_score: number | null
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
          rss_url: string
          title: string | null
          update_frequency_days: number | null
          updated_at: string
        }
        Insert: {
          activity_score?: number | null
          audience_tags?: string[] | null
          author?: string | null
          avg_duration_minutes?: number | null
          category?: string | null
          commercial_score?: number | null
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
          rss_url: string
          title?: string | null
          update_frequency_days?: number | null
          updated_at?: string
        }
        Update: {
          activity_score?: number | null
          audience_tags?: string[] | null
          author?: string | null
          avg_duration_minutes?: number | null
          category?: string | null
          commercial_score?: number | null
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
          rss_url?: string
          title?: string | null
          update_frequency_days?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      snapshots: {
        Row: {
          apple_rank: number | null
          episode_count: number | null
          estimated_reviews: number | null
          estimated_subscribers: number | null
          id: string
          podcast_id: string
          taken_at: string
        }
        Insert: {
          apple_rank?: number | null
          episode_count?: number | null
          estimated_reviews?: number | null
          estimated_subscribers?: number | null
          id?: string
          podcast_id: string
          taken_at?: string
        }
        Update: {
          apple_rank?: number | null
          episode_count?: number | null
          estimated_reviews?: number | null
          estimated_subscribers?: number | null
          id?: string
          podcast_id?: string
          taken_at?: string
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
