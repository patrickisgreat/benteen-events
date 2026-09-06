import type { Ref } from 'vue'
import type { Database } from '~/types/database.types'

/**
 * The signed-in host's preferences. Right now that's just the reminder
 * checkpoints — the "days before the event" the nightly cron fires on. An empty
 * list turns automatic reminders off for all of their events.
 */
export function useHostSettings(): {
  reminderDays: Ref<number[]>
  pending: Ref<boolean>
  error: Ref<string | null>
  refresh: () => Promise<void>
  setReminderDays: (days: number[]) => Promise<void>
} {
  const supabase = useSupabaseClient<Database>()
  const myId = useMyId()
  const reminderDays = ref<number[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function refresh(): Promise<void> {
    if (!myId.value) return
    pending.value = true
    const { data, error: loadError } = await supabase
      .from('host_settings')
      .select('reminder_days')
      .eq('host_id', myId.value)
      .maybeSingle()
    if (loadError) {
      error.value = errorMessage(loadError, 'Failed to load your settings')
    } else {
      reminderDays.value = data?.reminder_days ?? []
      error.value = null
    }
    pending.value = false
  }

  async function setReminderDays(days: number[]): Promise<void> {
    if (!myId.value) return
    // Upsert rather than update: the profile trigger seeds a row for every new
    // host, but upserting means a host whose row predates that still works.
    const { error: saveError } = await supabase
      .from('host_settings')
      .upsert({ host_id: myId.value, reminder_days: days }, { onConflict: 'host_id' })
    if (saveError) throw saveError
    reminderDays.value = days
  }

  watch(myId, () => void refresh(), { immediate: true })

  return { reminderDays, pending, error, refresh, setReminderDays }
}
