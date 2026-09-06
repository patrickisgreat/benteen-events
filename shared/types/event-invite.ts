import type { RsvpStatus } from './rsvp'

/** A per-event invitation (public.event_invites): the admin-curated guest list
 *  for one event, with its one-click RSVP token and engagement tracking. */
export interface EventInvite {
  id: string
  event_id: string
  email: string
  display_name: string | null
  token: string
  rsvp: RsvpStatus | null
  rsvp_at: string | null
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

/** Aggregate tracking for an event's guest list. */
export interface InviteStats {
  invited: number
  sent: number
  opened: number
  clicked: number
  going: number
  maybe: number
  no: number
  noReply: number
}
