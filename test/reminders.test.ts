import { describe, expect, it } from 'vitest'
import { daysUntil, formatReminderDays, parseReminderDays, selectDueReminders, type ReminderEvent } from '../shared/utils/reminders'

const NOW = new Date('2026-06-29T15:00:00Z')
const inDays = (n: number): string => new Date(NOW.getTime() + n * 86_400_000).toISOString()

const invite = (over: Partial<ReminderEvent['invites'][number]> = {}): ReminderEvent['invites'][number] => ({
  id: 'i1', email: 'a@x.com', token: 'tok', rsvp: null, sent_at: inDays(-10), reminded_at: null, ...over
})
const event = (over: Partial<ReminderEvent> = {}): ReminderEvent => ({
  id: 'e1', title: 'Movie Night', event_date: inDays(7), reminders_enabled: true, invites: [invite()], ...over
})

describe('parseReminderDays / formatReminderDays', () => {
  it('parses, sorts desc, de-dupes, and drops junk / non-positive', () => {
    expect(parseReminderDays('1, 3, 7')).toEqual([7, 3, 1])
    expect(parseReminderDays('7 7 3')).toEqual([7, 3])
    expect(parseReminderDays('7, abc, 0, -2, 3')).toEqual([7, 3])
    expect(parseReminderDays('')).toEqual([])
  })
  it('formats back to a sorted-desc list', () => {
    expect(formatReminderDays([1, 7, 3])).toBe('7, 3, 1')
    expect(formatReminderDays([])).toBe('')
  })
})

describe('daysUntil', () => {
  it('floors the whole-day gap (an event 7d later from 15:00 is 7)', () => {
    expect(daysUntil(NOW, inDays(7))).toBe(7)
    expect(daysUntil(NOW, new Date(NOW.getTime() + 7 * 86_400_000 + 4 * 3_600_000).toISOString())).toBe(7)
  })
  it('is 0 today and negative for the past', () => {
    expect(daysUntil(NOW, new Date(NOW.getTime() + 3 * 3_600_000).toISOString())).toBe(0)
    expect(daysUntil(NOW, inDays(-1))).toBe(-1)
  })
})

describe('selectDueReminders', () => {
  it('selects non-responders when days-until hits a checkpoint', () => {
    const due = selectDueReminders([event({ event_date: inDays(7) })], NOW, [7, 3, 1])
    expect(due).toHaveLength(1)
    expect(due[0]!.daysLeft).toBe(7)
    expect(due[0]!.invites.map(i => i.id)).toEqual(['i1'])
  })

  it('skips events whose days-until is not a checkpoint', () => {
    expect(selectDueReminders([event({ event_date: inDays(5) })], NOW, [7, 3, 1])).toEqual([])
  })

  it('skips events with reminders disabled', () => {
    expect(selectDueReminders([event({ reminders_enabled: false })], NOW, [7, 3, 1])).toEqual([])
  })

  it('excludes invitees who already responded', () => {
    const e = event({ invites: [invite({ rsvp: 'going' }), invite({ id: 'i2', rsvp: null })] })
    const due = selectDueReminders([e], NOW, [7, 3, 1])
    expect(due[0]!.invites.map(i => i.id)).toEqual(['i2'])
  })

  it('excludes invitees who were never e-vited (no sent_at)', () => {
    const e = event({ invites: [invite({ sent_at: null })] })
    expect(selectDueReminders([e], NOW, [7, 3, 1])).toEqual([])
  })

  it('throttles invitees reminded within the window, but re-includes stale ones', () => {
    const e = event({ invites: [
      invite({ id: 'fresh', reminded_at: new Date(NOW.getTime() - 2 * 3_600_000).toISOString() }), // 2h ago → skip
      invite({ id: 'stale', reminded_at: new Date(NOW.getTime() - 26 * 3_600_000).toISOString() }) // 26h ago → send
    ] })
    const due = selectDueReminders([e], NOW, [7, 3, 1])
    expect(due[0]!.invites.map(i => i.id)).toEqual(['stale'])
  })

  it('skips past events even if 0 is not a checkpoint', () => {
    expect(selectDueReminders([event({ event_date: inDays(-1) })], NOW, [7, 3, 1])).toEqual([])
  })
})
