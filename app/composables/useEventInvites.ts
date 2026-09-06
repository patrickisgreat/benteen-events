import type { MaybeRefOrGetter } from 'vue'
import type { Database } from '~/types/database.types'
import type { EventInvite, InviteStats } from '#shared/types/event-invite'

/**
 * The guest list for one event (public.event_invites). Loads the invitees,
 * supports add/remove, seeds the list from a previous event or the host's
 * contacts, and exposes the Evite-style tracking stats.
 *
 * Sending is a server route (the Resend key is server-only); RSVPs and opens flow
 * back in over realtime, so the tracker updates itself while a blast is running.
 */
export function useEventInvites(eventId: MaybeRefOrGetter<string | null>) {
  const supabase = useSupabaseClient<Database>()
  const invites = ref<EventInvite[]>([])
  const pending = ref(false)

  async function refresh(): Promise<void> {
    const id = toValue(eventId)
    if (!id) {
      invites.value = []
      return
    }
    pending.value = true
    const { data } = await supabase
      .from('event_invites')
      .select('*')
      .eq('event_id', id)
      .order('created_at')
    invites.value = (data as EventInvite[] | null) ?? []
    pending.value = false
  }

  const stats = computed<InviteStats>(() => {
    const all = invites.value
    return {
      invited: all.length,
      sent: all.filter(i => i.sent_at).length,
      opened: all.filter(i => i.opened_at).length,
      clicked: all.filter(i => i.clicked_at).length,
      going: all.filter(i => i.rsvp === 'going').length,
      maybe: all.filter(i => i.rsvp === 'maybe').length,
      no: all.filter(i => i.rsvp === 'no').length,
      noReply: all.filter(i => !i.rsvp).length
    }
  })

  async function addInvite(email: string, displayName?: string): Promise<void> {
    const id = toValue(eventId)
    if (!id) return
    const { error } = await supabase
      .from('event_invites')
      .insert({ event_id: id, email, display_name: displayName ?? null })
    // 23505 = already on this event's list — harmless.
    if (error && error.code !== '23505') throw error
    await refresh()
  }

  async function removeInvite(inviteId: string): Promise<void> {
    const { error } = await supabase.from('event_invites').delete().eq('id', inviteId)
    if (error) throw error
    await refresh()
  }

  /** Remove several invites at once (multi-select delete). No-op for an empty list. */
  async function removeInvites(inviteIds: readonly string[]): Promise<void> {
    if (!inviteIds.length) return
    const { error } = await supabase.from('event_invites').delete().in('id', [...inviteIds])
    if (error) throw error
    await refresh()
  }

  /**
   * Build this event's guest list from the most recent OTHER event that has one
   * (newest-first, skipping empty events), falling back to the host's saved
   * contacts when no prior event has a list yet — so the very first event still
   * fills in. Anyone already on this list is skipped.
   *
   * RLS scopes both queries to the caller's own events and contacts, so "last
   * event" can only ever mean one of theirs.
   */
  async function seedFromLastEvent(): Promise<number> {
    const id = toValue(eventId)
    if (!id) return 0

    let candidates: Array<{ email: string, display_name: string | null }> = []
    const { data: others } = await supabase
      .from('events')
      .select('id')
      .neq('id', id)
      .order('event_date', { ascending: false })
    const otherIds = (others ?? []).map(e => e.id)
    if (otherIds.length) {
      const { data: pool } = await supabase
        .from('event_invites')
        .select('event_id, email, display_name')
        .in('event_id', otherIds)
      // otherIds is newest-first; take the first event that actually has invites.
      const sourceId = otherIds.find(eid => (pool ?? []).some(p => p.event_id === eid))
      if (sourceId) {
        candidates = (pool ?? [])
          .filter(p => p.event_id === sourceId)
          .map(p => ({ email: p.email, display_name: p.display_name }))
      }
    }
    // Fallback: no prior guest list → pull the host's whole address book.
    if (!candidates.length) {
      const { data: contacts } = await supabase.from('contacts').select('email, display_name')
      candidates = (contacts ?? []).map(c => ({ email: c.email, display_name: c.display_name }))
    }

    const existing = new Set(invites.value.map(i => i.email))
    const toAdd = candidates
      .filter(c => !existing.has(c.email))
      .map(c => ({ event_id: id, email: c.email, display_name: c.display_name }))
    if (!toAdd.length) return 0
    const { error } = await supabase.from('event_invites').insert(toAdd)
    if (error) throw error
    await refresh()
    return toAdd.length
  }

  /** Send (or re-send) the tokenized e-vites for this event via the server route.
   *  Returns how many sent/failed and the first failure reason (e.g. a Resend
   *  rejection) so the UI can show why instead of a misleading success. */
  async function sendInvites(): Promise<{ sent: number, failed: number, error: string | null }> {
    const id = toValue(eventId)
    if (!id) return { sent: 0, failed: 0, error: null }
    const result = await $fetch<{ ok: boolean, sent: number, failed: number, error: string | null }>(
      `/api/events/${id}/invites/send`,
      { method: 'POST' }
    )
    await refresh()
    return { sent: result.sent, failed: result.failed, error: result.error }
  }

  /** Manually email everyone who was e-vited but hasn't answered yet, now
   *  (bypassing the checkpoint schedule + throttle). Returns sent/failed + error. */
  async function remindNonResponders(): Promise<{ sent: number, failed: number, error: string | null }> {
    const id = toValue(eventId)
    if (!id) return { sent: 0, failed: 0, error: null }
    const result = await $fetch<{ ok: boolean, sent: number, failed: number, error: string | null }>(
      `/api/events/${id}/reminders/send`,
      { method: 'POST' }
    )
    await refresh()
    return { sent: result.sent, failed: result.failed, error: result.error }
  }

  // Live updates as RSVPs / opens land (event_invites is in the realtime publication).
  let channel: ReturnType<typeof supabase.channel> | null = null
  watch(() => toValue(eventId), (id) => {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
    void refresh()
    if (!id) return
    channel = supabase
      .channel(`event_invites:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_invites', filter: `event_id=eq.${id}` }, () => {
        void refresh()
      })
      .subscribe()
  }, { immediate: true })

  onScopeDispose(() => {
    if (channel) supabase.removeChannel(channel)
  })

  return { invites, pending, stats, refresh, addInvite, removeInvite, removeInvites, seedFromLastEvent, sendInvites, remindNonResponders }
}
