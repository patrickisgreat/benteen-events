import type { JwtPayload } from '@supabase/supabase-js'

/**
 * The signed-in user's id from Supabase JWT claims.
 *
 * `serverSupabaseUser` returns the decoded JWT *claims* (a `JwtPayload`), not a
 * `User` object — so the user id is `sub`, not `id`. Reading `.id` yields
 * `undefined`, which then reaches PostgREST as `id=eq.undefined` and blows up with
 * `22P02 invalid input syntax for type uuid: "undefined"`. Centralizing the read
 * here keeps every server route from re-introducing that bug.
 */
export function claimsUserId(user: JwtPayload | null): string | null {
  return typeof user?.sub === 'string' && user.sub ? user.sub : null
}

/** The subset of JWT claims we read to label an host in an e-vite. */
interface HostClaims {
  user_metadata?: { full_name?: string | null, name?: string | null } | null
  email?: string | null
}

/** A human name for the host, derived from the same claims: full name → name → email → null. */
export function hostNameFromClaims(user: HostClaims): string | null {
  const meta = user.user_metadata
  return meta?.full_name ?? meta?.name ?? user.email ?? null
}
