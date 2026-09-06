import type { Ref } from 'vue'
import type { Database } from '~/types/database.types'
import type { AppEvent, EventDraft } from '#shared/types/event'

/**
 * The signed-in host's events. RLS (`events: host all`) scopes every query to
 * them, so this composable never has to filter by host itself — and can't be
 * tricked into showing someone else's.
 */
export function useEvents(): {
  events: Ref<AppEvent[]>
  pending: Ref<boolean>
  error: Ref<string | null>
  upcoming: ComputedRef<AppEvent[]>
  past: ComputedRef<AppEvent[]>
  refresh: () => Promise<void>
  createEvent: (draft: EventDraft) => Promise<AppEvent>
  updateEvent: (id: string, draft: Partial<EventDraft>) => Promise<void>
  deleteEvent: (id: string) => Promise<void>
} {
  const supabase = useSupabaseClient<Database>()
  const events = ref<AppEvent[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function refresh(): Promise<void> {
    pending.value = true
    const { data, error: loadError } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: false })
    if (loadError) {
      error.value = errorMessage(loadError, 'Failed to load your events')
    } else {
      events.value = (data as AppEvent[] | null) ?? []
      error.value = null
    }
    pending.value = false
  }

  /** Today in the viewer's local timezone, as `YYYY-MM-DD` — comparable to the
   *  `date` column without dragging UTC into it and shifting the boundary. */
  function today(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }

  const upcoming = computed(() =>
    events.value.filter(e => e.event_date >= today()).sort((a, b) => a.event_date.localeCompare(b.event_date))
  )
  const past = computed(() => events.value.filter(e => e.event_date < today()))

  async function createEvent(draft: EventDraft): Promise<AppEvent> {
    // host_id defaults to auth.uid() in the schema, and the RLS check pins it
    // there, so the client never sends it.
    const { data, error: insertError } = await supabase.from('events').insert(draft).select('*').single()
    if (insertError) throw insertError
    await refresh()
    return data as AppEvent
  }

  async function updateEvent(id: string, draft: Partial<EventDraft>): Promise<void> {
    const { error: updateError } = await supabase.from('events').update(draft).eq('id', id)
    if (updateError) throw updateError
    await refresh()
  }

  async function deleteEvent(id: string): Promise<void> {
    const { error: deleteError } = await supabase.from('events').delete().eq('id', id)
    if (deleteError) throw deleteError
    await refresh()
  }

  onMounted(() => void refresh())

  return { events, pending, error, upcoming, past, refresh, createEvent, updateEvent, deleteEvent }
}
