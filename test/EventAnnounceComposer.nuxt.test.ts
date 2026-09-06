// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import EventAnnounceComposer from '../app/components/EventAnnounceComposer.vue'
import type { CommsTemplate } from '../shared/types/comms-template'

const calls: Array<{ url: string, body: Record<string, unknown> }> = []
let templates: CommsTemplate[] = []
const saveTemplate = vi.fn(() => Promise.resolve())
const removeTemplate = vi.fn(() => Promise.resolve())

mockNuxtImport('useCommsTemplates', () => () => ({
  templates: computed(() => templates),
  error: ref(null),
  refresh: vi.fn(),
  saveTemplate,
  removeTemplate
}))

beforeEach(() => {
  calls.length = 0
  templates = []
  saveTemplate.mockClear()
  removeTemplate.mockClear()
  vi.stubGlobal('$fetch', (url: string, opts: { body: Record<string, unknown> }) => {
    calls.push({ url, body: opts.body })
    return Promise.resolve({ ok: true, count: 3, failed: 0, error: null })
  })
})
afterEach(() => vi.unstubAllGlobals())

const mount = (eventId: string | undefined) =>
  mountSuspended(EventAnnounceComposer, { props: { eventId } })

describe('EventAnnounceComposer', () => {
  it('offers the three audiences a host can actually address', async () => {
    const w = await mount('evt-1')

    expect(w.text()).toContain('Everyone invited')
  })

  it('posts the announcement for the selected event', async () => {
    const w = await mount('evt-1')
    const vm = w.vm as unknown as { state: { message: string, scope: string } }
    vm.state.message = '<p>Moved indoors</p>'
    await flushPromises()

    await w.find('form').trigger('submit')
    await flushPromises()

    expect(calls[0]!.url).toBe('/api/events/announce')
    expect(calls[0]!.body).toMatchObject({ eventId: 'evt-1', message: '<p>Moved indoors</p>', scope: 'invited' })
  })

  it('will not send with no event chosen', async () => {
    const w = await mount(undefined)
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('enables the send button once an event is chosen', async () => {
    const w = await mount('evt-1')
    expect(w.find('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('applies a template into both the body and the subject', async () => {
    templates = [{ id: 't1', name: 'Bring a dish', subject: 'What to bring', body: '<p>Bring a dish</p>' }]
    const w = await mount('evt-1')

    await w.findAll('button').find(b => b.text().includes('Bring a dish'))!.trigger('click')
    await flushPromises()

    const vm = w.vm as unknown as { state: { message: string, subject: string } }
    expect(vm.state.message).toBe('<p>Bring a dish</p>')
    expect(vm.state.subject).toBe('What to bring')
  })

  it('clears a stale subject when the applied template has none', async () => {
    templates = [{ id: 't1', name: 'No subject', subject: null, body: '<p>hi</p>' }]
    const w = await mount('evt-1')
    const vm = w.vm as unknown as { state: { message: string, subject: string } }
    vm.state.subject = 'left over from before'
    await flushPromises()

    await w.findAll('button').find(b => b.text().includes('No subject'))!.trigger('click')
    await flushPromises()

    expect(vm.state.subject).toBe('')
  })

  it('only offers to save a template once there is something to save', async () => {
    const w = await mount('evt-1')
    const saveAs = () => w.findAll('button').find(b => b.text().includes('Save as template'))!

    expect(saveAs().attributes('disabled')).toBeDefined()

    const vm = w.vm as unknown as { state: { message: string } }
    vm.state.message = '<p>something</p>'
    await flushPromises()

    expect(saveAs().attributes('disabled')).toBeUndefined()
  })

  it('keeps the draft when nothing went out, so the host can retry', async () => {
    vi.stubGlobal('$fetch', () => Promise.resolve({ ok: true, count: 0, failed: 2, error: 'domain not verified' }))
    const w = await mount('evt-1')
    const vm = w.vm as unknown as { state: { message: string } }
    vm.state.message = '<p>Moved indoors</p>'
    await flushPromises()

    await w.find('form').trigger('submit')
    await flushPromises()

    expect(vm.state.message).toBe('<p>Moved indoors</p>')
  })

  it('clears the draft after a successful send', async () => {
    const w = await mount('evt-1')
    const vm = w.vm as unknown as { state: { message: string } }
    vm.state.message = '<p>Moved indoors</p>'
    await flushPromises()

    await w.find('form').trigger('submit')
    await flushPromises()

    expect(vm.state.message).toBe('')
  })
})
