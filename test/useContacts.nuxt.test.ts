// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'

interface FetchCall { url: string, opts: { method?: string, body?: Record<string, unknown> } }
const calls: FetchCall[] = []

let rows: Array<Record<string, unknown>> = []
let loadError: { message: string } | null = null

mockNuxtImport('useSupabaseClient', () => () => ({
  from: () => ({
    select: () => ({ order: () => Promise.resolve({ data: loadError ? null : rows, error: loadError }) }),
    delete: () => ({ eq: () => Promise.resolve({ error: null }) })
  })
}))

const contact = (email: string, name: string | null = null) => ({
  id: `id-${email}`,
  host_id: 'me',
  email,
  display_name: name,
  created_at: '2026-01-01'
})

beforeEach(() => {
  calls.length = 0
  loadError = null
  rows = [contact('sam@x.com', 'Sam'), contact('jo@x.com')]
  vi.stubGlobal('$fetch', (url: string, opts: FetchCall['opts']) => {
    calls.push({ url, opts })
    return Promise.resolve({ ok: true, added: 1, skipped: 0, emailed: 1, failed: 0, invalid: [], error: null })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('useContacts', () => {
  it('loads the address book', async () => {
    const { contacts, refresh } = useContacts()
    await refresh()

    expect(contacts.value.map(c => c.email)).toEqual(['sam@x.com', 'jo@x.com'])
  })

  it('exposes the saved addresses as a set, so the composer can mark duplicates', async () => {
    const { existingEmails, refresh } = useContacts()
    await refresh()

    expect(existingEmails.value.has('sam@x.com')).toBe(true)
    expect(existingEmails.value.has('nobody@x.com')).toBe(false)
  })

  it('POSTs the raw paste to the server route, which owns the parse and the welcome mail', async () => {
    const { addContacts } = useContacts()
    await addContacts('a@x.com\nb@x.com', { note: 'hi' })

    expect(calls[0]!.url).toBe('/api/contacts/bulk')
    expect(calls[0]!.opts.method).toBe('POST')
    expect(calls[0]!.opts.body).toEqual({ text: 'a@x.com\nb@x.com', note: 'hi', silent: false })
  })

  it('passes the silent flag through so a host can save without emailing', async () => {
    const { addContacts } = useContacts()
    await addContacts('a@x.com', { silent: true })

    expect(calls[0]!.opts.body).toMatchObject({ silent: true })
  })

  it('re-reads the book after adding, so the list reflects the new people', async () => {
    const { contacts, addContacts } = useContacts()
    rows = [contact('new@x.com')]
    await addContacts('new@x.com')

    expect(contacts.value.map(c => c.email)).toEqual(['new@x.com'])
  })

  it('surfaces a load failure rather than showing an empty book', async () => {
    loadError = { message: 'permission denied' }
    const { loadError: err, refresh } = useContacts()
    await refresh()

    expect(err.value).toBe('permission denied')
  })
})
