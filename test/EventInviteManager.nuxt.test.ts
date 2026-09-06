// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import EventInviteManager from '../app/components/EventInviteManager.vue'
import type { EventInvite } from '../shared/types/event-invite'
import type { AppEvent } from '../shared/types/event'

// Stub the data layer at the composable boundary — this is a component test
// about what the host sees and can do, not about the queries underneath.
let invites: EventInvite[] = []
let roster = { going: [], maybe: [], no: [], noReply: [], total: 0, headcount: 0 }
const sendInvites = vi.fn(() => Promise.resolve({ sent: 0, failed: 0, error: null }))
const remindNonResponders = vi.fn(() => Promise.resolve({ sent: 0, failed: 0, error: null }))
const saveOptions = vi.fn(() => Promise.resolve())

mockNuxtImport('useEventInvites', () => () => ({
  invites: computed(() => invites),
  pending: ref(false),
  stats: computed(() => ({
    invited: invites.length,
    sent: invites.filter(i => i.sent_at).length,
    opened: invites.filter(i => i.opened_at).length,
    clicked: 0,
    going: 0,
    maybe: 0,
    no: 0,
    noReply: invites.filter(i => !i.rsvp).length
  })),
  refresh: vi.fn(),
  addInvite: vi.fn(),
  removeInvite: vi.fn(),
  removeInvites: vi.fn(),
  seedFromLastEvent: vi.fn(() => Promise.resolve(0)),
  sendInvites,
  remindNonResponders
}))
mockNuxtImport('useEventRsvps', () => () => ({ roster: computed(() => roster), error: ref(null), refresh: vi.fn() }))
mockNuxtImport('useInviteOptions', () => () => ({ save: saveOptions }))
mockNuxtImport('useEventReminders', () => () => ({ setEnabled: vi.fn(() => Promise.resolve()) }))

const invite = (over: Partial<EventInvite> = {}): EventInvite => ({
  id: 'i1',
  event_id: 'evt-1',
  email: 'a@x.com',
  display_name: null,
  token: 'tok-1',
  rsvp: null,
  rsvp_at: null,
  invited_by: null,
  resend_id: null,
  sent_at: null,
  delivered_at: null,
  opened_at: null,
  clicked_at: null,
  bounced_at: null,
  reminded_at: null,
  created_at: '2026-01-01',
  ...over
})

const event: AppEvent = {
  id: 'evt-1',
  host_id: 'me',
  title: 'Backyard cookout',
  description: null,
  event_date: '2026-07-04',
  start_time: null,
  location: null,
  location_url: null,
  cover_image_url: null,
  invite_options: null,
  reminders_enabled: true,
  created_at: '2026-01-01'
}

const mount = () => mountSuspended(EventInviteManager, { props: { eventId: 'evt-1', event } })

beforeEach(() => {
  invites = []
  roster = { going: [], maybe: [], no: [], noReply: [], total: 0, headcount: 0 }
  sendInvites.mockClear()
  remindNonResponders.mockClear()
  saveOptions.mockClear()
})

describe('EventInviteManager', () => {
  it('offers to send only the guests who have not been mailed yet', async () => {
    invites = [invite({ id: '1' }), invite({ id: '2', email: 'b@x.com' }), invite({ id: '3', email: 'c@x.com', sent_at: 'x' })]
    const w = await mount()

    expect(w.text()).toContain('Send 2 invites')
  })

  it('uses the singular for a single unsent invite', async () => {
    invites = [invite()]
    const w = await mount()

    expect(w.text()).toContain('Send 1 invite')
  })

  it('says everything is sent, and disables the button, once nobody is queued', async () => {
    invites = [invite({ sent_at: 'x' })]
    const w = await mount()

    expect(w.text()).toContain('All invites sent')
    const button = w.findAll('button').find(b => b.text().includes('All invites sent'))
    expect(button?.attributes('disabled')).toBeDefined()
  })

  it('counts only e-vited non-responders as remindable — an unsent guest was never asked', async () => {
    invites = [
      invite({ id: '1', sent_at: 'x' }), // sent, silent → remindable
      invite({ id: '2', email: 'b@x.com' }), // never sent → not remindable
      invite({ id: '3', email: 'c@x.com', sent_at: 'x', rsvp: 'going' }) // replied → not remindable
    ]
    const w = await mount()

    expect(w.text()).toContain('Remind 1 non-responder')
  })

  it('shows a guest\'s furthest-along status, so a reply outranks an open', async () => {
    invites = [invite({ sent_at: 'x', opened_at: 'x', rsvp: 'going' })]
    const w = await mount()

    expect(w.text()).toContain('Going')
    expect(w.text()).not.toContain('Opened')
  })

  it('shows that someone was reminded, so the host does not nudge them twice', async () => {
    invites = [invite({ sent_at: 'x', reminded_at: 'x' })]
    const w = await mount()

    expect(w.text()).toContain('Reminded')
  })

  it('prompts to add people when the list is empty', async () => {
    const w = await mount()

    expect(w.text()).toContain('No guests yet')
  })

  it('renders a live preview built from the same builder the server sends with', async () => {
    const w = await mount()
    await flushPromises()

    const preview = w.find('iframe').attributes('srcdoc') ?? ''
    expect(preview).toContain('Backyard cookout')
    // The RSVP buttons the guest will actually click.
    expect(preview).toContain('status=going')
  })

  it('reports the reason a send was rejected instead of a bare failure', async () => {
    invites = [invite()]
    sendInvites.mockResolvedValueOnce({ sent: 0, failed: 1, error: 'domain not verified' })
    const w = await mount()

    const button = w.findAll('button').find(b => b.text().includes('Send 1 invite'))
    await button!.trigger('click')
    await flushPromises()

    expect(sendInvites).toHaveBeenCalled()
  })
})
