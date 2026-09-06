import { serverSupabaseClient } from '#supabase/server'
import { z } from 'zod'
import type { Database } from '~/types/database.types'
import { buildContactWelcomeEmail } from '#shared/utils/email'
import { parseRoster } from '#shared/utils/roster'

const bodySchema = z.object({
  /** The raw paste from the composer; parsed server-side with the same rules. */
  text: z.string().max(20_000),
  /** Optional note included in the welcome mail. */
  note: z.string().max(2000).optional(),
  /** Skip the welcome mail and just save the addresses. */
  silent: z.boolean().optional().default(false)
})

/**
 * Bulk-add people to the signed-in host's address book, optionally welcoming the
 * ones who are new.
 *
 * Runs under the caller's own session (RLS): `contacts: host all` scopes the
 * upsert to this host's rows, so `host_id` can't be spoofed into someone else's
 * book. Only rows the insert actually created are emailed, so re-pasting the same
 * list never re-spams anyone. The Resend key stays server-only.
 */
export default defineEventHandler(async (event) => {
  const { user, userId } = await requireUser(event)

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'A list of emails is required' })

  const db = await serverSupabaseClient<Database>(event)

  const { entries, invalid } = parseRoster(parsed.data.text)
  if (!entries.length) {
    throw createError({ statusCode: 400, statusMessage: 'No valid email addresses in that list' })
  }

  // ON CONFLICT DO NOTHING + RETURNING: `added` is exactly the people who weren't
  // already saved, which is precisely who should get a welcome email.
  const { data: added, error } = await db
    .from('contacts')
    .upsert(
      entries.map(e => ({ host_id: userId, email: e.email, display_name: e.name })),
      { onConflict: 'host_id,email', ignoreDuplicates: true }
    )
    .select('email')
  if (error) {
    throw createError({ statusCode: 400, statusMessage: error.message || 'Could not save those contacts' })
  }

  const recipients = (added ?? []).map(r => r.email)
  const base = { ok: true, added: recipients.length, skipped: entries.length - recipients.length, invalid: [...invalid] }

  const config = useRuntimeConfig(event)
  // Saving succeeded; the host asked for no mail, or it isn't configured here.
  if (parsed.data.silent || !config.resendApiKey || !recipients.length) {
    return { ...base, emailed: 0, failed: 0, error: null }
  }

  const { sent, failed, error: sendError } = await sendContactWelcomes({
    apiKey: config.resendApiKey,
    from: config.resendFrom,
    recipients,
    mail: buildContactWelcomeEmail({
      hostName: hostNameFromClaims(user),
      brand: resolveBrand(event),
      note: parsed.data.note
    }),
    replyTo: user.email ?? undefined
  })

  return { ...base, emailed: sent, failed, error: sendError }
})
