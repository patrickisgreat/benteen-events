import type { MaybeRefOrGetter, Ref } from 'vue'
import type { Database } from '~/types/database.types'
import { toRsvpStatus, type RsvpStatus } from '#shared/types/rsvp'

/** One person's RSVP in the roster. */
export interface RsvpEntry {
  /** Lowercased email — guests have no account, so the address is the identity. */
  key: string
  name: string
  email: string
  status: RsvpStatus
  /** Additional guests this person is bringing (their "+1"s); 0 unless going. */
  plusOnes: number
}

/** The RSVP roster for an event, grouped by status. */
export interface EventRsvpRoster {
  going: RsvpEntry[]
  maybe: RsvpEntry[]
  no: RsvpEntry[]
  /** Guests who were sent an e-vite and haven't answered. */
  noReply: { key: string, name: string, email: string }[]
  /** Distinct people who replied (going + maybe + no). */
  total: number
  /** Total bodies expected = everyone going, plus the guests they're bringing. */
  headcount: number
}

const EMPTY: EventRsvpRoster = { going: [], maybe: [], no: [], noReply: [], total: 0, headcount: 0 }

/**
 * Who's coming, derived from `event_invites` alone.
 *
 * Guests here have no accounts, so there is exactly one place an RSVP can live
 * and nothing to reconcile — the source app had to merge a members table with the
 * e-vite table at read time and keep two triggers syncing them. Dropping accounts
 * for guests is what makes this a plain grouping.
 */
export function useEventRsvps(eventId: MaybeRefOrGetter<string | null | undefined>): {
  roster: Ref<EventRsvpRoster>
  error: Ref<string | null>
  refresh: () => Promise<void>
} {
  const supabase = useSupabaseClient<Database>()

  const { data: roster, error, refresh } = useRealtimeQuery<EventRsvpRoster>({
    key: eventId,
    channel: 'event-rsvps',
    tables: [{ table: 'event_invites' }],
    empty: EMPTY,
    errorFallback: 'Failed to load RSVPs',
    load: async (id) => {
      const { data, error: loadError } = await supabase
        .from('event_invites')
        .select('email, display_name, rsvp, plus_ones, sent_at')
        .eq('event_id', id)
      if (loadError) throw loadError

      const entries: RsvpEntry[] = []
      const noReply: EventRsvpRoster['noReply'] = []

      for (const invite of data ?? []) {
        const key = invite.email.toLowerCase()
        const name = invite.display_name ?? invite.email
        if (invite.rsvp) {
          const status = toRsvpStatus(invite.rsvp)
          entries.push({
            key,
            name,
            email: invite.email,
            status,
            plusOnes: status === 'going' ? (invite.plus_ones ?? 0) : 0
          })
        } else if (invite.sent_at) {
          // Only people who were actually sent an e-vite count as "no reply" —
          // someone added to the list but never mailed hasn't been asked yet.
          noReply.push({ key, name, email: invite.email })
        }
      }

      const going = entries.filter(e => e.status === 'going')
      return {
        going,
        maybe: entries.filter(e => e.status === 'maybe'),
        no: entries.filter(e => e.status === 'no'),
        noReply,
        total: entries.length,
        headcount: going.reduce((n, e) => n + 1 + e.plusOnes, 0)
      }
    }
  })

  return { roster, error, refresh }
}
