import { serverSupabaseUser } from '#supabase/server'
import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~/types/database.types'
import { claimsUserId } from './userId'

// Shared server-route guards. `serverSupabaseUser` returns decoded JWT *claims*
// (see userId.ts), so the user id is `sub` — read it via `claimsUserId`.

type AuthUser = NonNullable<Awaited<ReturnType<typeof serverSupabaseUser>>>

/**
 * Resolves the signed-in user, throwing a 401 when there is no valid session.
 * Returns both the claims and the non-null user id so callers skip the
 * `!user || !userId` dance.
 */
export async function requireUser(event: H3Event): Promise<{ user: AuthUser, userId: string }> {
  const user = await serverSupabaseUser(event)
  const userId = claimsUserId(user)
  if (!user || !userId) throw createError({ statusCode: 401, statusMessage: 'Not authenticated' })
  return { user, userId }
}

/**
 * Asserts the caller hosts this event, and returns it. There is no global admin
 * role in this app — authority is ownership — so every event-scoped route funnels
 * through here.
 *
 * The query runs on the caller's own RLS-scoped client, so the `events: host all`
 * policy is doing the real work: a non-host gets zero rows back, not a filtered
 * view. The explicit `host_id` check is a second belt, and it means a genuine
 * lookup failure surfaces as a 500 rather than being silently read as "not yours".
 */
export async function requireEventHost(
  db: SupabaseClient<Database>,
  eventId: string,
  userId: string
): Promise<Database['public']['Tables']['events']['Row']> {
  const { data: ev, error } = await db.from('events').select('*').eq('id', eventId).maybeSingle()
  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Could not load the event',
      data: { cause: error.message, code: error.code }
    })
  }
  if (!ev) throw createError({ statusCode: 404, statusMessage: 'Event not found' })
  if (ev.host_id !== userId) throw createError({ statusCode: 403, statusMessage: 'You do not host this event' })
  return ev
}
