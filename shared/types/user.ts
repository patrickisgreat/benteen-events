/** A signed-in host (public.profiles), created by the handle_new_user trigger
 *  from the OAuth metadata on first sign-in. */
export interface Profile {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
}
