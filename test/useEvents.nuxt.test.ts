// @vitest-environment nuxt
import { beforeEach, describe, expect, it } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

type Row = Record<string, unknown>
let rows: Row[] = []
let loadError: { message: string } | null = null
const inserted: Row[] = []
const updated: Array<{ patch: Row, id: string }> = []

mockNuxtImport('useSupabaseClient', () => () => ({
  from: () => ({
    select: (cols?: string) => {
      // The insert().select().single() chain returns the created row.
      if (cols === '*' && inserted.length) {
        return {
          single: () => Promise.resolve({ data: { ...inserted.at(-1), id: 'new-id' }, error: null }),
          order: () => Promise.resolve({ data: loadError ? null : rows, error: loadError })
        }
      }
      return { order: () => Promise.resolve({ data: loadError ? null : rows, error: loadError }) }
    },
    insert: (row: Row) => {
      inserted.push(row)
      return {
        select: () => ({ single: () => Promise.resolve({ data: { ...row, id: 'new-id' }, error: null }) })
      }
    },
    update: (patch: Row) => ({
      eq: (_col: string, id: string) => {
        updated.push({ patch, id })
        return Promise.resolve({ error: null })
      }
    }),
    delete: () => ({ eq: () => Promise.resolve({ error: null }) })
  })
}))

/** An ISO date `days` from today, so the upcoming/past split is tested relative
 *  to the clock rather than to a date that eventually goes stale. */
function isoDaysFromNow(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const event = (id: string, date: string): Row => ({
  id,
  host_id: 'me',
  title: id,
  description: null,
  event_date: date,
  start_time: null,
  location: null,
  location_url: null,
  cover_image_url: null,
  invite_options: null,
  reminders_enabled: true,
  created_at: '2026-01-01'
})

beforeEach(() => {
  rows = []
  loadError = null
  inserted.length = 0
  updated.length = 0
})

describe('useEvents', () => {
  it('splits events into what is still coming and what has passed', async () => {
    rows = [event('future', isoDaysFromNow(7)), event('past', isoDaysFromNow(-7))]
    const { upcoming, past, refresh } = useEvents()
    await refresh()

    expect(upcoming.value.map(e => e.id)).toEqual(['future'])
    expect(past.value.map(e => e.id)).toEqual(['past'])
  })

  it('counts an event happening today as upcoming, not past', async () => {
    rows = [event('today', isoDaysFromNow(0))]
    const { upcoming, refresh } = useEvents()
    await refresh()

    expect(upcoming.value.map(e => e.id)).toEqual(['today'])
  })

  it('orders what is coming up soonest-first, however the rows arrived', async () => {
    rows = [event('later', isoDaysFromNow(30)), event('sooner', isoDaysFromNow(2))]
    const { upcoming, refresh } = useEvents()
    await refresh()

    expect(upcoming.value.map(e => e.id)).toEqual(['sooner', 'later'])
  })

  it('never sends host_id — the database defaults it and RLS pins it', async () => {
    const { createEvent } = useEvents()
    await createEvent({
      title: 'Cookout',
      description: null,
      event_date: isoDaysFromNow(3),
      start_time: null,
      location: null,
      location_url: null,
      cover_image_url: null
    })

    expect(inserted[0]).not.toHaveProperty('host_id')
    expect(inserted[0]).toMatchObject({ title: 'Cookout' })
  })

  it('returns the created event so the caller can navigate to it', async () => {
    const { createEvent } = useEvents()
    const created = await createEvent({
      title: 'Cookout',
      description: null,
      event_date: isoDaysFromNow(3),
      start_time: null,
      location: null,
      location_url: null,
      cover_image_url: null
    })

    expect(created.id).toBe('new-id')
  })

  it('updates only the fields it was given', async () => {
    const { updateEvent } = useEvents()
    await updateEvent('evt-1', { title: 'Renamed' })

    expect(updated[0]).toEqual({ patch: { title: 'Renamed' }, id: 'evt-1' })
  })

  it('surfaces a load failure rather than showing an empty dashboard', async () => {
    loadError = { message: 'permission denied' }
    const { error, refresh } = useEvents()
    await refresh()

    expect(error.value).toBe('permission denied')
  })
})
