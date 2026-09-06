// @vitest-environment nuxt
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import ContactsComposer from '../app/components/ContactsComposer.vue'
import type { Contact } from '../shared/types/contact'

let contacts: Contact[] = []
let saved = new Set<string>()
const addContacts = vi.fn(() => Promise.resolve({ added: 1, skipped: 0, emailed: 1, failed: 0, invalid: [], error: null }))

mockNuxtImport('useContacts', () => () => ({
  contacts: computed(() => contacts),
  pending: ref(false),
  loadError: ref(null),
  existingEmails: computed(() => saved),
  refresh: vi.fn(),
  addContacts,
  removeContact: vi.fn()
}))

const typeInto = async (w: Awaited<ReturnType<typeof mountSuspended>>, text: string): Promise<void> => {
  await w.find('[data-testid="contacts-emails"]').setValue(text)
  await flushPromises()
}

beforeEach(() => {
  contacts = []
  saved = new Set()
  addContacts.mockClear()
})

describe('ContactsComposer', () => {
  it('previews who will actually be added as you type', async () => {
    const w = await mountSuspended(ContactsComposer)
    await typeInto(w, 'Sam Riley <sam@x.com>\njo@x.com')

    expect(w.text()).toContain('Sam Riley')
    expect(w.text()).toContain('jo@x.com')
    expect(w.text()).toContain('Save 2')
  })

  it('flags people already in the book as skipped, so nobody is emailed twice', async () => {
    saved = new Set(['sam@x.com'])
    const w = await mountSuspended(ContactsComposer)
    await typeInto(w, 'sam@x.com\njo@x.com')

    expect(w.text()).toContain('1 already saved')
    expect(w.text()).toContain('Save 1')
  })

  it('shows fragments that could not be read as an address rather than dropping them silently', async () => {
    const w = await mountSuspended(ContactsComposer)
    await typeInto(w, 'jo@x.com, not-an-email')

    expect(w.text()).toContain('couldn\'t be read as an email')
    expect(w.text()).toContain('not-an-email')
  })

  it('disables the button until there is somebody new to save', async () => {
    const w = await mountSuspended(ContactsComposer)
    const button = () => w.findAll('button').find(b => b.text().startsWith('Save contacts'))

    expect(button()?.attributes('disabled')).toBeDefined()
  })

  it('submits the raw paste — the server re-parses it with the same rules', async () => {
    const w = await mountSuspended(ContactsComposer)
    await typeInto(w, 'jo@x.com')
    await w.find('[data-testid="contacts-submit"]').trigger('click')
    await flushPromises()

    expect(addContacts).toHaveBeenCalledWith('jo@x.com', { note: undefined, silent: false })
  })

  it('offers to save without a welcome email, and says so on the button', async () => {
    const w = await mountSuspended(ContactsComposer)
    await typeInto(w, 'jo@x.com')
    expect(w.text()).toContain('Save 1 & send welcome')

    // USwitch renders a role="switch" button, not a checkbox input.
    await w.find('[role="switch"]').trigger('click')
    await flushPromises()

    expect(w.text()).toContain('Save 1')
    expect(w.text()).not.toContain('send welcome')
  })

  it('lists the address book', async () => {
    contacts = [{ id: '1', host_id: 'me', email: 'sam@x.com', display_name: 'Sam', created_at: '2026-01-01' }]
    const w = await mountSuspended(ContactsComposer)

    expect(w.text()).toContain('Sam')
    expect(w.text()).toContain('sam@x.com')
  })

  it('says the book is empty when it is', async () => {
    const w = await mountSuspended(ContactsComposer)

    expect(w.text()).toContain('Nobody saved yet')
  })
})
