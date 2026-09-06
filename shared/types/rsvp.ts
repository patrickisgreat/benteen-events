export const RSVP_STATUSES = ['going', 'maybe', 'no'] as const

export type RsvpStatus = (typeof RSVP_STATUSES)[number]

/** Max additional guests ("+1"s) an attendee can bring. Mirrored by the CHECK
 *  constraint on rsvps.plus_ones / event_invites.plus_ones — keep the two in sync. */
export const MAX_PLUS_ONES = 10

/** Clamp an arbitrary guest count into [0, MAX_PLUS_ONES] (floored). Guests only
 *  count when going, so callers pass 0 for maybe/no. */
export function clampPlusOnes(value: number | null | undefined): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(n, MAX_PLUS_ONES)
}

export function isRsvpStatus(value: string): value is RsvpStatus {
  return RSVP_STATUSES.some(s => s === value)
}

/**
 * Narrow a raw value from the data layer to RsvpStatus at the boundary. The
 * `rsvps.status` / `event_invites.rsvp` columns carry a CHECK constraint guaranteeing
 * this set, so a miss means schema drift — throw rather than silently coerce (which is
 * what an `as RsvpStatus` cast would do, hiding the drift behind a green type check).
 */
export function toRsvpStatus(value: string): RsvpStatus {
  if (isRsvpStatus(value)) return value
  throw new Error(`Unexpected RSVP status from the database: ${value}`)
}

export interface Rsvp {
  event_id: string
  user_id: string
  status: RsvpStatus
}
