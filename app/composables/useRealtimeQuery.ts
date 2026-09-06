import type { MaybeRefOrGetter, Ref } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'

/**
 * A table whose changes should re-run the query. By default only rows matching
 * `event_id=eq.<key>` trigger a refresh; set `global: true` to react to every
 * change on the table (e.g. a table with no event_id column).
 */
interface WatchedTable {
  table: string
  global?: boolean
}

interface RealtimeQueryOptions<T> {
  /** The key (an event id) this query is scoped to. Null/undefined → empty + idle. */
  key: MaybeRefOrGetter<string | null | undefined>
  /** Channel-name prefix; a random suffix makes each instance's channel unique. */
  channel: string
  /** Tables whose postgres_changes re-run `load`. */
  tables: WatchedTable[]
  /** Fetches and maps the data for the current key. Throw to surface an error. */
  load: (key: string) => Promise<T>
  /** Value held before a key is set or once it's cleared. */
  empty: T
  /** Fallback message when `load` throws a non-Error. */
  errorFallback?: string
}

/**
 * Shared realtime-query lifecycle keyed by an event id. Owns the data/pending/error
 * refs, runs `load` whenever the key changes, drops a stale response if the key
 * changed mid-flight, surfaces (rather than swallows) load errors, and
 * subscribes/tears down a Supabase channel per the watched tables. Each consumer
 * supplies only its `load` and which tables to watch.
 */
export function useRealtimeQuery<T>(opts: RealtimeQueryOptions<T>): {
  data: Ref<T>
  pending: Ref<boolean>
  error: Ref<string | null>
  refresh: () => Promise<void>
} {
  const supabase = useSupabaseClient<Database>()
  const data = shallowRef<T>(opts.empty)
  const pending = ref(false)
  const error = ref<string | null>(null)

  async function refresh(): Promise<void> {
    const key = toValue(opts.key)
    if (!key) {
      data.value = opts.empty
      error.value = null
      pending.value = false
      return
    }
    pending.value = true
    try {
      const result = await opts.load(key)
      // Stale-guard: drop the response if the key changed since this load began.
      // (A rapid A→B→A flip could still let the first A through while a newer A
      // load is in flight, but that triple-flip isn't reachable from the event
      // switcher, which only moves one step at a time.)
      if (toValue(opts.key) !== key) return
      data.value = result
      error.value = null
    } catch (e) {
      if (toValue(opts.key) !== key) return // stale error — ignore
      error.value = errorMessage(e, opts.errorFallback)
    } finally {
      if (toValue(opts.key) === key) pending.value = false
    }
  }

  let channel: RealtimeChannel | null = null
  watch(() => toValue(opts.key), (key) => {
    if (channel) {
      supabase.removeChannel(channel)
      channel = null
    }
    void refresh()
    if (!key) return
    let ch = supabase.channel(`${opts.channel}-${crypto.randomUUID()}`)
    for (const { table, global } of opts.tables) {
      const scope = global ? {} : { filter: `event_id=eq.${key}` }
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table, ...scope }, () => void refresh())
    }
    channel = ch.subscribe()
  }, { immediate: true })

  // onScopeDispose (not onUnmounted) so the channel is torn down even when this
  // composable runs inside a non-component effect scope.
  onScopeDispose(() => {
    if (channel) supabase.removeChannel(channel)
  })

  return { data, pending, error, refresh }
}
