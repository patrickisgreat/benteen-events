// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

interface FetchCall { url: string, opts: { method?: string } }
const calls: FetchCall[] = []

type Row = Record<string, unknown>
let inviteRows: Row[] = []
let eventRows: Row[] = []
let poolRows: Row[] = []
let contactRows: Row[] = []
const inserted: Row[][] = []

// Only the query shapes useEventInvites actually builds.
mockNuxtImport('useSupabaseClient', () => () => ({
  from: (table: string) => {
    if (table === 'event_invites') {
      return {
        select: () => ({
          eq: () => ({ order: () => Promise.resolve({ data: inviteRows, error: null }) }),
          in: () => Promise.resolve({ data: poolRows, error: null })
        }),
        insert: (rows: Row[]) => {
          inserted.push(rows)
          return Promise.resolve({ error: null })
        },
        delete: () => ({
          eq: () => Promise.resolve({ error: null }),
          in: () => Promise.resolve({ error: null })
        })
      }
    }
    if (table === 'events') {
      return { select: () => ({ neq: () => ({ order: () => Promise.resolve({ data: eventRows, error: null }) }) }) }
    }
    if (table === 'contacts') {
      return { select: () => Promise.resolve({ data: contactRows, error: null }) }
    }
    throw new Error(`unexpected table ${table}`)
  },
  channel: () => ({ on() { return this }, subscribe: () => ({}) }),
  removeChannel: vi.fn()
}))

const invite = (over: Row = {}): Row => ({
  id: 'i1',
  event_id: 'evt-1',
  email: 'a@x',
  display_name: null,
  token: 't1',
  rsvp: null,
  sent_at: null,
  opened_at: null,
  clicked_at: null,
  reminded_at: null,
  created_at: '2026-01-01',
  ...over
})

beforeEach(() => {
  calls.length = 0
  inserted.length = 0
  inviteRows = []
  eventRows = []
  poolRows = []
  contactRows = []
  vi.stubGlobal('$fetch', (url: string, opts: { method?: string }) => {
    calls.push({ url, opts })
    return Promise.resolve({ ok: true, sent: 2, failed: 0, error: null })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('useEventInvites', () => {
  it('summarizes the funnel from the guest rows', async () => {
    inviteRows = [
      invite({ id: '1', sent_at: 'x', opened_at: 'x', rsvp: 'going' }),
      invite({ id: '2', sent_at: 'x', opened_at: 'x', clicked_at: 'x', rsvp: 'no' }),
      invite({ id: '3', sent_at: 'x' }),
      invite({ id: '4' })
    ]
    const { stats, refresh } = useEventInvites(() => 'evt-1')
    await refresh()

    expect(stats.value).toEqual({ invited: 4, sent: 3, opened: 2, clicked: 1, going: 1, maybe: 0, no: 1, noReply: 2 })
  })

  it('seeds from the most recent previous event that actually has a guest list', async () => {
    eventRows = [{ id: 'newer-empty' }, { id: 'older-with-guests' }]
    poolRows = [
      { event_id: 'older-with-guests', email: 'sam@x', display_name: 'Sam' },
      { event_id: 'older-with-guests', email: 'jo@x', display_name: null }
    ]
    const { seedFromLastEvent } = useEventInvites(() => 'evt-1')
    const added = await seedFromLastEvent()

    expect(added).toBe(2)
    expect(inserted[0]).toEqual([
      { event_id: 'evt-1', email: 'sam@x', display_name: 'Sam' },
      { event_id: 'evt-1', email: 'jo@x', display_name: null }
    ])
  })

  it('falls back to the address book when no previous event has a guest list', async () => {
    eventRows = []
    contactRows = [{ email: 'book@x', display_name: 'Book' }]
    const { seedFromLastEvent } = useEventInvites(() => 'evt-1')
    const added = await seedFromLastEvent()

    expect(added).toBe(1)
    expect(inserted[0]).toEqual([{ event_id: 'evt-1', email: 'book@x', display_name: 'Book' }])
  })

  it('skips anyone already on this event, so seeding twice adds nobody', async () => {
    inviteRows = [invite({ email: 'sam@x' })]
    eventRows = [{ id: 'prev' }]
    poolRows = [{ event_id: 'prev', email: 'sam@x', display_name: 'Sam' }]
    const { seedFromLastEvent, refresh } = useEventInvites(() => 'evt-1')
    await refresh()
    const added = await seedFromLastEvent()

    expect(added).toBe(0)
    expect(inserted).toHaveLength(0)
  })

  it('posts to the send route and reports what actually went out', async () => {
    const { sendInvites } = useEventInvites(() => 'evt-1')
    const result = await sendInvites()

    expect(calls[0]).toMatchObject({ url: '/api/events/evt-1/invites/send', opts: { method: 'POST' } })
    expect(result).toEqual({ sent: 2, failed: 0, error: null })
  })

  it('posts to the reminder route for a manual nudge', async () => {
    const { remindNonResponders } = useEventInvites(() => 'evt-1')
    await remindNonResponders()

    expect(calls[0]).toMatchObject({ url: '/api/events/evt-1/reminders/send', opts: { method: 'POST' } })
  })

  it('sends nothing when no event is selected', async () => {
    const { sendInvites } = useEventInvites(() => null)
    const result = await sendInvites()

    expect(calls).toHaveLength(0)
    expect(result).toEqual({ sent: 0, failed: 0, error: null })
  })
})
