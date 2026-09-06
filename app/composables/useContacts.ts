import type { ComputedRef, Ref } from 'vue'
import type { Database } from '~/types/database.types'
import type { Contact } from '#shared/types/contact'

/** What a bulk add did: how many were saved, skipped as duplicates, welcomed,
 *  and which fragments didn't parse as addresses. */
export interface ContactAddResult {
  added: number
  skipped: number
  emailed: number
  failed: number
  invalid: string[]
  error: string | null
}

/**
 * The host's address book. Reads go straight to the table under RLS; the bulk add
 * goes through a server route because it also sends the welcome mail (and the
 * Resend key is server-only).
 */
export function useContacts(): {
  contacts: Ref<Contact[]>
  pending: Ref<boolean>
  loadError: Ref<string | null>
  existingEmails: ComputedRef<Set<string>>
  refresh: () => Promise<void>
  addContacts: (text: string, opts?: { note?: string, silent?: boolean }) => Promise<ContactAddResult>
  removeContact: (id: string) => Promise<void>
} {
  const supabase = useSupabaseClient<Database>()
  const contacts = ref<Contact[]>([])
  const pending = ref(false)
  const loadError = ref<string | null>(null)

  async function refresh(): Promise<void> {
    pending.value = true
    const { data, error } = await supabase.from('contacts').select('*').order('email')
    if (error) {
      loadError.value = errorMessage(error, 'Failed to load your contacts')
    } else {
      contacts.value = (data as Contact[] | null) ?? []
      loadError.value = null
    }
    pending.value = false
  }

  const existingEmails = computed(() => new Set(contacts.value.map(c => c.email)))

  async function addContacts(text: string, opts: { note?: string, silent?: boolean } = {}): Promise<ContactAddResult> {
    const result = await $fetch<ContactAddResult & { ok: boolean }>('/api/contacts/bulk', {
      method: 'POST',
      body: { text, note: opts.note, silent: opts.silent ?? false }
    })
    await refresh()
    return result
  }

  async function removeContact(id: string): Promise<void> {
    const { error } = await supabase.from('contacts').delete().eq('id', id)
    if (error) throw error
    await refresh()
  }

  onMounted(() => void refresh())

  return { contacts, pending, loadError, existingEmails, refresh, addContacts, removeContact }
}
