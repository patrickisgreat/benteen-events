// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import RsvpPage from '../app/pages/rsvp.vue'

const calls: Array<{ url: string, body: Record<string, unknown> }> = []
let query: Record<string, string> = {}
let shouldFail = false

mockNuxtImport('useRoute', () => () => ({ query }))

beforeEach(() => {
  calls.length = 0
  shouldFail = false
  query = { token: 'abc', status: 'going' }
  vi.stubGlobal('$fetch', (url: string, opts: { body: Record<string, unknown> }) => {
    calls.push({ url, body: opts.body })
    if (shouldFail) return Promise.reject(new Error('nope'))
    return Promise.resolve({ ok: true, status: opts.body.status })
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('rsvp page', () => {
  it('records the answer from the emailed link on mount and confirms it', async () => {
    const w = await mountSuspended(RsvpPage)
    await flushPromises()

    expect(calls[0]).toMatchObject({ url: '/api/rsvp', body: { token: 'abc', status: 'going' } })
    expect(w.text()).toContain('You\'re going')
  })

  it('sends the token, which is the guest\'s only credential', async () => {
    await mountSuspended(RsvpPage)
    await flushPromises()

    expect(calls[0]!.body.token).toBe('abc')
  })

  it('offers to change the answer after recording it', async () => {
    const w = await mountSuspended(RsvpPage)
    await flushPromises()

    expect(w.text()).toContain('change your answer')
  })

  it('shows the guest stepper only while going', async () => {
    const w = await mountSuspended(RsvpPage)
    await flushPromises()
    expect(w.text()).toContain('Bringing guests?')

    query = { token: 'abc', status: 'no' }
    const declined = await mountSuspended(RsvpPage)
    await flushPromises()
    expect(declined.text()).not.toContain('Bringing guests?')
  })

  it('does not record anything when the link carries no status', async () => {
    query = { token: 'abc' }
    const w = await mountSuspended(RsvpPage)
    await flushPromises()

    expect(calls).toHaveLength(0)
    expect(w.text()).toContain('We couldn\'t record that')
  })

  it('does not record anything when the link carries a bogus status', async () => {
    query = { token: 'abc', status: 'definitely' }
    await mountSuspended(RsvpPage)
    await flushPromises()

    expect(calls).toHaveLength(0)
  })

  it('tells the guest when the token no longer works rather than claiming success', async () => {
    shouldFail = true
    const w = await mountSuspended(RsvpPage)
    await flushPromises()

    expect(w.text()).toContain('This link may have expired')
  })
})
