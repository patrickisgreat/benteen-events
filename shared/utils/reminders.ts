// Pure RSVP-reminder selection — given events + their e-vite rows and the
// configured checkpoint days, decide who gets reminded today and how many days
// out the event is. Kept pure so the cron route stays a thin I/O shell and this
// logic is unit-testable without a database or clock.

export interface ReminderInvite {
  id: string
  email: string
  token: string
  rsvp: string | null
  sent_at: string | null
  reminded_at: string | null
}

export interface ReminderEvent {
  id: string
  title: string
  event_date: string
  reminders_enabled: boolean
  invites: ReminderInvite[]
}

export interface DueReminder {
  eventId: string
  eventTitle: string
  eventDate: string
  daysLeft: number
  invites: ReminderInvite[]
}

/** Parse an admin's free-text checkpoint list ("7, 3, 1") into a sorted-desc,
 *  de-duplicated array of positive whole days. Junk and non-positive values drop. */
export function parseReminderDays(input: string): number[] {
  const days = input
    .split(/[\s,]+/)
    .map(s => Math.floor(Number(s)))
    .filter(n => Number.isFinite(n) && n > 0)
  return [...new Set(days)].sort((a, b) => b - a)
}

/** Render checkpoints back to "7, 3, 1" for the input field. */
export function formatReminderDays(days: ReadonlyArray<number>): string {
  return [...days].sort((a, b) => b - a).join(', ')
}

/** Whole days from `now` until the event (floored: an event 7d4h away is 7). */
export function daysUntil(now: Date, eventIso: string): number {
  return Math.floor((new Date(eventIso).getTime() - now.getTime()) / 86_400_000)
}

/**
 * Pick the reminders due right now: for each reminders-enabled event whose
 * days-until matches a configured checkpoint, the invitees who were e-vited
 * (`sent_at`), haven't responded (`rsvp` null), and weren't reminded within
 * `throttleHours` (so a daily cron sends at most once per checkpoint).
 */
export function selectDueReminders(
  events: ReadonlyArray<ReminderEvent>,
  now: Date,
  reminderDays: ReadonlyArray<number>,
  throttleHours = 20
): DueReminder[] {
  const checkpoints = new Set(reminderDays)
  const cutoff = now.getTime() - throttleHours * 3_600_000
  const due: DueReminder[] = []
  for (const ev of events) {
    if (!ev.reminders_enabled) continue
    const daysLeft = daysUntil(now, ev.event_date)
    if (daysLeft < 0 || !checkpoints.has(daysLeft)) continue
    const invites = ev.invites.filter(i =>
      i.sent_at != null
      && i.rsvp == null
      && (i.reminded_at == null || new Date(i.reminded_at).getTime() < cutoff)
    )
    if (invites.length) due.push({ eventId: ev.id, eventTitle: ev.title, eventDate: ev.event_date, daysLeft, invites })
  }
  return due
}
