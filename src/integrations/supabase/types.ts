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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      application_forms: {
        Row: {
          created_at: string
          description: string
          id: string
          is_open: boolean
          questions: Json
          sort_order: number
          title: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          is_open?: boolean
          questions?: Json
          sort_order?: number
          title: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_open?: boolean
          questions?: Json
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      application_notes: {
        Row: {
          author_email: string
          author_id: string
          body: string
          created_at: string
          id: string
          submission_id: string
        }
        Insert: {
          author_email: string
          author_id: string
          body: string
          created_at?: string
          id?: string
          submission_id: string
        }
        Update: {
          author_email?: string
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_notes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "application_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      application_submissions: {
        Row: {
          answers: Json
          created_at: string
          discord_id: string
          discord_username: string
          form_id: string
          id: string
          status: string
        }
        Insert: {
          answers?: Json
          created_at?: string
          discord_id: string
          discord_username: string
          form_id: string
          id?: string
          status?: string
        }
        Update: {
          answers?: Json
          created_at?: string
          discord_id?: string
          discord_username?: string
          form_id?: string
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "application_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      apps: {
        Row: {
          category: string
          description: string
          icon: string
          id: string
          logo_url: string
          name: string
          published: boolean
          sort_order: number
          url: string
        }
        Insert: {
          category?: string
          description?: string
          icon?: string
          id?: string
          logo_url?: string
          name: string
          published?: boolean
          sort_order?: number
          url?: string
        }
        Update: {
          category?: string
          description?: string
          icon?: string
          id?: string
          logo_url?: string
          name?: string
          published?: boolean
          sort_order?: number
          url?: string
        }
        Relationships: []
      }
      discord_settings: {
        Row: {
          channel_id: string
          guild_id: string
          id: string
          ping_role_ids: string[]
        }
        Insert: {
          channel_id?: string
          guild_id?: string
          id?: string
          ping_role_ids?: string[]
        }
        Update: {
          channel_id?: string
          guild_id?: string
          id?: string
          ping_role_ids?: string[]
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          id: string
          notification_error: string
          notification_status: string
          proof_path: string
          reason: string
          reported_discord_id: string
          reported_name: string
          reporter_discord_id: string
          reporter_username: string
          reviewed_by: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          notification_error?: string
          notification_status?: string
          proof_path?: string
          reason: string
          reported_discord_id: string
          reported_name: string
          reporter_discord_id: string
          reporter_username: string
          reviewed_by?: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          notification_error?: string
          notification_status?: string
          proof_path?: string
          reason?: string
          reported_discord_id?: string
          reported_name?: string
          reporter_discord_id?: string
          reporter_username?: string
          reviewed_by?: string
          status?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          description: string
          discord_url: string
          eyebrow: string
          footer_text: string
          game_url: string
          id: string
          logo_url: string
          name: string
          tagline: string
        }
        Insert: {
          description?: string
          discord_url?: string
          eyebrow?: string
          footer_text?: string
          game_url?: string
          id?: string
          logo_url?: string
          name?: string
          tagline?: string
        }
        Update: {
          description?: string
          discord_url?: string
          eyebrow?: string
          footer_text?: string
          game_url?: string
          id?: string
          logo_url?: string
          name?: string
          tagline?: string
        }
        Relationships: []
      }
      supervision_members: {
        Row: {
          created_at: string
          discord_id: string
          id: string
          username: string
        }
        Insert: {
          created_at?: string
          discord_id: string
          id?: string
          username?: string
        }
        Update: {
          created_at?: string
          discord_id?: string
          id?: string
          username?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          avatar_url: string
          discord_id: string
          id: string
          sort_order: number
          title: string
          username: string
        }
        Insert: {
          avatar_url?: string
          discord_id: string
          id?: string
          sort_order?: number
          title?: string
          username: string
        }
        Update: {
          avatar_url?: string
          discord_id?: string
          id?: string
          sort_order?: number
          title?: string
          username?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          email: string
          id: string
          role: string
        }
        Insert: {
          email: string
          id?: string
          role?: string
        }
        Update: {
          email?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apex_role: { Args: never; Returns: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
