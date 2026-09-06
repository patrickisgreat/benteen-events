import type { Database } from '~/types/database.types'
import type { CommsTemplate } from '#shared/types/comms-template'

/**
 * Reusable announcement templates, scoped by RLS to the signed-in host. Loads
 * once on setup; mutations refresh the list (no realtime — templates change
 * rarely and only from this screen).
 */
export function useCommsTemplates(): {
  templates: Ref<CommsTemplate[]>
  error: Ref<string | null>
  refresh: () => Promise<void>
  saveTemplate: (name: string, subject: string | null, body: string) => Promise<void>
  removeTemplate: (template: CommsTemplate) => Promise<void>
} {
  const supabase = useSupabaseClient<Database>()
  const templates = ref<CommsTemplate[]>([])
  const error = ref<string | null>(null)

  async function refresh(): Promise<void> {
    const { data, error: loadError } = await supabase
      .from('comms_templates')
      .select('id, name, subject, body')
      .order('name')
    if (loadError) {
      error.value = 'Failed to load templates'
      return
    }
    error.value = null
    templates.value = data ?? []
  }

  // host_id is omitted (the DB defaults it to auth.uid()).
  async function saveTemplate(name: string, subject: string | null, body: string): Promise<void> {
    const trimmed = name.trim()
    // htmlToText, not trim: an empty editor emits markup like <p></p>.
    if (!trimmed || htmlToText(body).length === 0) return
    const { error: saveError } = await supabase
      .from('comms_templates')
      .insert({ name: trimmed, subject: subject?.trim() || null, body })
    if (saveError) throw saveError
    await refresh()
  }

  async function removeTemplate(template: CommsTemplate): Promise<void> {
    const { error: removeError } = await supabase.from('comms_templates').delete().eq('id', template.id)
    if (removeError) throw removeError
    await refresh()
  }

  void refresh()

  return { templates, error, refresh, saveTemplate, removeTemplate }
}
