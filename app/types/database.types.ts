/**
 * Hand-written Supabase `Database` type. Kept in step with
 * supabase/migrations/*.sql by hand — regenerate with `supabase gen types`
 * once the schema settles.
 *
 * `Relationships: []` throughout: the embedded-select in the reminder cron
 * casts its own result rather than relying on generated relationship types.
 */

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          display_name: string | null
          avatar_url: string | null
          created_at: string
        }
        Insert: {
          id: string
          email?: string | null
          display_name?: string | null
          avatar_url?: string | null
        }
        Update: {
          email?: string | null
          display_name?: string | null
          avatar_url?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          id: string
          host_id: string
          title: string
          description: string | null
          event_date: string
          start_time: string | null
          location: string | null
          location_url: string | null
          cover_image_url: string | null
          invite_options: unknown | null
          reminders_enabled: boolean
          created_at: string
        }
        Insert: {
          id?: string
          host_id?: string
          title: string
          description?: string | null
          event_date: string
          start_time?: string | null
          location?: string | null
          location_url?: string | null
          cover_image_url?: string | null
          invite_options?: unknown | null
          reminders_enabled?: boolean
        }
        Update: {
          title?: string
          description?: string | null
          event_date?: string
          start_time?: string | null
          location?: string | null
          location_url?: string | null
          cover_image_url?: string | null
          invite_options?: unknown | null
          reminders_enabled?: boolean
        }
        Relationships: []
      }
      contacts: {
        Row: {
          id: string
          host_id: string
          email: string
          display_name: string | null
          created_at: string
        }
        Insert: {
          id?: string
          host_id?: string
          email: string
          display_name?: string | null
        }
        Update: {
          email?: string
          display_name?: string | null
        }
        Relationships: []
      }
      event_invites: {
        Row: {
          id: string
          event_id: string
          email: string
          display_name: string | null
          token: string
          rsvp: string | null
          rsvp_at: string | null
          plus_ones: number
          invited_by: string | null
          resend_id: string | null
          sent_at: string | null
          delivered_at: string | null
          opened_at: string | null
          clicked_at: string | null
          bounced_at: string | null
          reminded_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          email: string
          display_name?: string | null
          token?: string
          rsvp?: string | null
          rsvp_at?: string | null
          plus_ones?: number
          invited_by?: string | null
          resend_id?: string | null
          sent_at?: string | null
          reminded_at?: string | null
        }
        Update: {
          display_name?: string | null
          rsvp?: string | null
          rsvp_at?: string | null
          plus_ones?: number
          resend_id?: string | null
          sent_at?: string | null
          delivered_at?: string | null
          opened_at?: string | null
          clicked_at?: string | null
          bounced_at?: string | null
          reminded_at?: string | null
        }
        Relationships: []
      }
      comms_log: {
        Row: {
          id: string
          event_id: string | null
          kind: string
          scope: string | null
          subject: string | null
          recipient_count: number
          failed_count: number
          status: string
          error: string | null
          sent_by: string | null
          created_at: string
        }
        Insert: {
          event_id?: string | null
          kind: string
          scope?: string | null
          subject?: string | null
          recipient_count?: number
          failed_count?: number
          status?: string
          error?: string | null
          sent_by?: string | null
        }
        Update: never
        Relationships: []
      }
      comms_templates: {
        Row: {
          id: string
          host_id: string
          name: string
          subject: string | null
          body: string
          created_at: string
        }
        Insert: {
          host_id?: string
          name: string
          subject?: string | null
          body: string
        }
        Update: {
          name?: string
          subject?: string | null
          body?: string
        }
        Relationships: []
      }
      host_settings: {
        Row: {
          host_id: string
          reminder_days: number[]
          updated_at: string
        }
        Insert: {
          host_id: string
          reminder_days?: number[]
        }
        Update: {
          reminder_days?: number[]
        }
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: {
      owns_event: {
        Args: { target_event_id: string }
        Returns: boolean
      }
    }
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}
