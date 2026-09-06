import type { MaybeRefOrGetter } from 'vue'
import type { CommsStatus } from '#shared/utils/comms'
import type { Database } from '~/types/database.types'

export type CommsLogKind = 'announcement' | 'invite' | 'reminder'

const KINDS: readonly CommsLogKind[] = ['announcement', 'invite', 'reminder']
const STATUSES: readonly CommsStatus[] = ['sent', 'partial', 'failed']

/** One sent communication (announcement, invite blast, or reminder) for an event. */
export interface CommsLogEntry {
  id: string
  kind: CommsLogKind
  scope: string | null
  subject: string | null
  /** Recipients the send reached (Resend accepted). */
  recipientCount: number
  /** Recipients Resend rejected (0 on a clean send). */
  failedCount: number
  status: CommsStatus
  /** First failure message when status is partial/failed; null otherwise. */
  error: string | null
  sentByName: string | null
  createdAt: string
}

/** Narrow a free-text DB value to a known member, falling back to `fallback`. */
function oneOf<T extends string>(values: readonly T[], value: string, fallback: T): T {
  return (values as readonly string[]).includes(value) ? value as T : fallback
}

/**
 * The log of every communication sent for an event — e-vite blasts,
 * announcements, and reminders — newest first. Scoped by RLS to events you host.
 * Live via realtime, so a fresh send (including one the nightly cron made)
 * appears without a manual refresh.
 */
export function useCommsLog(eventId: MaybeRefOrGetter<string | null | undefined>): {
  entries: Ref<CommsLogEntry[]>
  error: Ref<string | null>
  refresh: () => Promise<void>
} {
  const supabase = useSupabaseClient<Database>()

  const { data: entries, error, refresh } = useRealtimeQuery<CommsLogEntry[]>({
    key: eventId,
    channel: 'comms-log',
    tables: [{ table: 'comms_log' }],
    empty: [],
    errorFallback: 'Failed to load the comms log',
    load: async (id) => {
      const { data, error } = await supabase
        .from('comms_log')
        .select('id, kind, scope, subject, recipient_count, failed_count, status, error, sent_by, created_at')
        .eq('event_id', id)
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = data ?? []

      const senderIds = [...new Set(rows.map(r => r.sent_by).filter((x): x is string => Boolean(x)))]
      const { data: senders } = senderIds.length
        ? await supabase.from('profiles').select('id, display_name').in('id', senderIds)
        : { data: [] }
      const nameById = new Map((senders ?? []).map(s => [s.id, s.display_name]))

      return rows.map(r => ({
        id: r.id,
        // DB CHECK constrains kind/status to a known set; narrow at the boundary.
        kind: oneOf(KINDS, r.kind, 'announcement'),
        scope: r.scope,
        subject: r.subject,
        recipientCount: r.recipient_count,
        failedCount: r.failed_count ?? 0,
        status: oneOf(STATUSES, r.status ?? 'sent', 'sent'),
        error: r.error ?? null,
        sentByName: r.sent_by ? nameById.get(r.sent_by) ?? null : null,
        createdAt: r.created_at
      }))
    }
  })

  return { entries, error, refresh }
}
