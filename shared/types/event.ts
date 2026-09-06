/** A generic event (public.events). Deliberately not tied to any one kind of
 *  gathering: a title, when and where, an optional cover image, and the e-vite
 *  design. Every event belongs to exactly one host. */
import type { InviteOptions } from './invite-options'

export interface AppEvent {
  id: string
  host_id: string
  title: string
  /** Rich text (sanitized before render and before it goes into an email). */
  description: string | null
  /** ISO date, `YYYY-MM-DD`. */
  event_date: string
  /** `HH:MM` local to the event, or null for an all-day / time-TBD event. */
  start_time: string | null
  location: string | null
  /** A maps/venue link rendered as the location's href. */
  location_url: string | null
  /** Hero image at the top of the e-vite. */
  cover_image_url: string | null
  invite_options: InviteOptions | null
  reminders_enabled: boolean
  created_at: string
}

/** The writable subset — what the event form submits. */
export interface EventDraft {
  title: string
  description: string | null
  event_date: string
  start_time: string | null
  location: string | null
  location_url: string | null
  cover_image_url: string | null
}
