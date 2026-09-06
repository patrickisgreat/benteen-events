import type { Database } from '~/types/database.types'
import type { Profile } from '#shared/types/user'

/**
 * Reactive auth state plus sign-in/out. `myId` is the authoritative current user
 * id (resolved via getUser() in the auth-profile plugin) — use it for "is this
 * mine?" checks rather than the cached Supabase user id.
 *
 * There is no role here to check. A host's authority is ownership of their own
 * rows, and RLS is what enforces it.
 */
export function useAuth() {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  const myId = useMyId()
  const profile = useState<Profile | null>('profile', () => null)

  const account = computed(() => {
    if (!user.value && !profile.value) return null
    const meta = (user.value?.user_metadata ?? {}) as Record<string, string | undefined>
    return {
      id: myId.value ?? user.value?.id ?? null,
      email: profile.value?.email ?? user.value?.email ?? null,
      displayName: profile.value?.display_name ?? meta.full_name ?? meta.name ?? user.value?.email ?? null,
      avatarUrl: profile.value?.avatar_url ?? meta.avatar_url ?? meta.picture ?? null
    }
  })

  // Google redirects away to the provider then back to /confirm; the page
  // unloads, so there's nothing to await beyond kicking it off.
  async function signInWithGoogle(): Promise<void> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/confirm` }
    })
    if (error) throw error
  }

  async function signOutUser(): Promise<void> {
    await supabase.auth.signOut()
    profile.value = null
    myId.value = null
  }

  return { user, myId, profile, account, signInWithGoogle, signOutUser }
}
