import type { MaybeRefOrGetter } from 'vue'
import type { Database } from '~/types/database.types'
import type { InviteOptions } from '#shared/types/invite-options'

interface UseInviteOptions {
  save: (options: InviteOptions) => Promise<void>
}

/** Save an event's e-vite design. The `events: host all` policy is what stops a
 *  host from restyling somebody else's invitation. */
export function useInviteOptions(eventId: MaybeRefOrGetter<string | null>): UseInviteOptions {
  const supabase = useSupabaseClient<Database>()

  async function save(options: InviteOptions): Promise<void> {
    const id = toValue(eventId)
    if (!id) return
    const { error } = await supabase.from('events').update({ invite_options: { ...options } }).eq('id', id)
    if (error) throw error
  }

  return { save }
}
