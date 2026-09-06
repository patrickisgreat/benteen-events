import { serverSupabaseServiceRole } from '#supabase/server'
import { z } from 'zod'
import { MAX_PLUS_ONES } from '#shared/types/rsvp'
import type { Database } from '~/types/database.types'

const bodySchema = z.object({
  token: z.string().min(8).max(128),
  status: z.enum(['going', 'maybe', 'no']),
  // Additional guests the invitee is bringing. Only meaningful when going;
  // clamped to the shared cap (mirroring the CHECK constraint) so a crafted body
  // can't inflate a headcount.
  plusOnes: z.number().int().min(0).max(MAX_PLUS_ONES).optional().default(0)
})

/**
 * Public one-click RSVP from an e-vite. Authenticated by the opaque invite token
 * rather than a session — the guest has no account — so it runs via the service
 * role, below RLS. This and the Resend webhook are the only routes that do.
 *
 * The token IS the credential: knowing it proves you received the invitation, and
 * it only ever grants the right to answer that one invitation. The lookup is by
 * token alone, and every write is scoped to the row it returns.
 */
export default defineEventHandler(async (event) => {
  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid RSVP' })
  const { token, status } = parsed.data
  // Guests only count when going.
  const plusOnes = status === 'going' ? parsed.data.plusOnes : 0

  const admin = serverSupabaseServiceRole<Database>(event)
  const { data: invite } = await admin
    .from('event_invites')
    .select('id')
    .eq('token', token)
    .maybeSingle()
  if (!invite) throw createError({ statusCode: 404, statusMessage: 'Invitation not found' })

  const now = new Date().toISOString()
  const { error } = await admin
    .from('event_invites')
    .update({ rsvp: status, rsvp_at: now, clicked_at: now, plus_ones: plusOnes })
    .eq('id', invite.id)
  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Could not record your RSVP', data: { cause: error.message } })
  }

  return { ok: true, status, plusOnes }
})
