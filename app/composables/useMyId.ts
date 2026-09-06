import type { Ref } from 'vue'

/**
 * The signed-in user's id as app-wide shared state. `auth-profile.client.ts` is
 * the writer (it resolves the authoritative id via `getUser()`); everything else
 * reads it. Centralizing the `'my-id'` key here means a typo can't silently fork
 * the state into a separate, always-null ref.
 */
export function useMyId(): Ref<string | null> {
  return useState<string | null>('my-id', () => null)
}
