// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

// The one composable whose shape genuinely changed in the extraction: with no
// guest accounts there is a single RSVP store, so this is a grouping over
// event_invites rather than a merge of two tables.

interface InviteRow {
  email: string
  display_name: string | null
  rsvp: string | null
  plus_ones: number
  sent_at: string | null
}

let rows: InviteRow[] = []
let loadError: { message: string } | null = null

mockNuxtImport('useSupabaseClient', () => () => ({
  from: () => ({
    select: () => ({
      eq: () => Promise.resolve({ data: loadError ? null : rows, error: loadError })
    })
  }),
  channel: () => ({ on() { return this }, subscribe: () => ({}) }),
  removeChannel: vi.fn()
}))

const invite = (email: string, rsvp: string | null, plusOnes = 0, sent = '2026-01-01'): InviteRow => ({
  email,
  display_name: null,
  rsvp,
  plus_ones: plusOnes,
  sent_at: sent
})

beforeEach(() => {
  loadError = null
  rows = []
})

describe('useEventRsvps', () => {
  it('groups replies by answer', async () => {
    rows = [invite('a@x', 'going'), invite('b@x', 'maybe'), invite('c@x', 'no'), invite('d@x', 'going')]
    const { roster, refresh } = useEventRsvps(() => 'evt-1')
    await refresh()

    expect(roster.value.going.map(p => p.email)).toEqual(['a@x', 'd@x'])
    expect(roster.value.maybe.map(p => p.email)).toEqual(['b@x'])
    expect(roster.value.no.map(p => p.email)).toEqual(['c@x'])
    expect(roster.value.total).toBe(4)
  })

  it('counts the guests people are bringing in the headcount', async () => {
    rows = [invite('a@x', 'going', 2), invite('b@x', 'going', 0)]
    const { roster, refresh } = useEventRsvps(() => 'evt-1')
    await refresh()

    // 2 going + 2 extra guests = 4 bodies.
    expect(roster.value.headcount).toBe(4)
  })

  it('ignores plus-ones from anyone not going, so a stale count cannot inflate it', async () => {
    rows = [invite('a@x', 'maybe', 3)]
    const { roster, refresh } = useEventRsvps(() => 'evt-1')
    await refresh()

    expect(roster.value.maybe[0]!.plusOnes).toBe(0)
    expect(roster.value.headcount).toBe(0)
  })

  it('lists a guest as no-reply only once an e-vite has actually been sent to them', async () => {
    rows = [invite('sent@x', null, 0, '2026-01-01'), invite('never@x', null, 0, null)]
    const { roster, refresh } = useEventRsvps(() => 'evt-1')
    await refresh()

    // Someone added to the list but never mailed hasn't been asked yet.
    expect(roster.value.noReply.map(p => p.email)).toEqual(['sent@x'])
  })

  it('falls back to the email address when a guest has no name', async () => {
    rows = [invite('a@x', 'going')]
    const { roster, refresh } = useEventRsvps(() => 'evt-1')
    await refresh()

    expect(roster.value.going[0]!.name).toBe('a@x')
  })

  it('prefers the saved display name when there is one', async () => {
    rows = [{ ...invite('a@x', 'going'), display_name: 'Avery' }]
    const { roster, refresh } = useEventRsvps(() => 'evt-1')
    await refresh()

    expect(roster.value.going[0]!.name).toBe('Avery')
  })

  it('is empty with no event selected, without querying', async () => {
    rows = [invite('a@x', 'going')]
    const { roster } = useEventRsvps(() => null)
    await nextTick()

    expect(roster.value.total).toBe(0)
    expect(roster.value.headcount).toBe(0)
  })

  it('surfaces a load failure instead of showing an empty roster as if nobody replied', async () => {
    loadError = { message: 'permission denied' }
    const { roster, error, refresh } = useEventRsvps(() => 'evt-1')
    await refresh()

    expect(error.value).toBe('permission denied')
    expect(roster.value.total).toBe(0)
  })
})
