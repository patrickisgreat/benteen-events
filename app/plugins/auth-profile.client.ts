import type { Database } from '~/types/database.types'
import type { Profile } from '#shared/types/user'

/**
 * Resolves the AUTHORITATIVE current user (via getUser(), which validates the
 * access token) into shared state, then loads their profile. Using getUser()
 * rather than the cached useSupabaseUser() id is deliberate: a stale or
 * mismatched cached id turns into RLS failures on every write.
 */
export default defineNuxtPlugin(() => {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  const myId = useMyId()
  const profile = useState<Profile | null>('profile', () => null)

  watch(user, async () => {
    if (!user.value) {
      myId.value = null
      profile.value = null
      return
    }
    const { data: { user: authUser }, error } = await supabase.auth.getUser()
    if (error) console.error('Failed to resolve the current user', error)
    myId.value = authUser?.id ?? null
    if (!myId.value) {
      profile.value = null
      return
    }
    const { data } = await supabase.from('profiles').select('*').eq('id', myId.value).single()
    profile.value = data ?? null
  }, { immediate: true })
})
