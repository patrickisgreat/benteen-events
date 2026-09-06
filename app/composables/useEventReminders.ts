import type { MaybeRefOrGetter } from 'vue'
import type { Database } from '~/types/database.types'

/** Toggle the automatic RSVP reminders for a single event. RLS enforces that
 *  only the host can write; the UI switch is just the trigger. */
export function useEventReminders(eventId: MaybeRefOrGetter<string | null | undefined>) {
  const supabase = useSupabaseClient<Database>()

  async function setEnabled(enabled: boolean): Promise<void> {
    const id = toValue(eventId)
    if (!id) return
    const { error } = await supabase.from('events').update({ reminders_enabled: enabled }).eq('id', id)
    if (error) throw error
  }

  return { setEnabled }
}
