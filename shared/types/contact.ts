/** A saved contact (public.contacts) — a host's reusable address book, so a
 *  guest list can be pulled together without retyping addresses every time.
 *  Scoped to one host; there is no global allowlist in this app. */
export interface Contact {
  id: string
  host_id: string
  email: string
  display_name: string | null
  created_at: string
}
