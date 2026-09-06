import { serverSupabaseClient } from '#supabase/server'
import { z } from 'zod'
import type { Database } from '~/types/database.types'

const bodySchema = z.object({
  eventId: z.string().uuid(),
  subject: z.string().trim().max(200).optional(),
  // Rich HTML from the composer's editor (markup inflates length — hence 10k);
  // must have actual text, not just empty tags. Sanitized in buildAnnounceEmail.
  message: z.string().max(10000).refine(m => htmlToText(m).length > 0),
  scope: z.enum(['invited', 'going', 'noreply'])
})

/**
 * Host update blast about one event. Runs under the caller's own session (RLS),
 * so the guest list it reads can only ever be one they host. Recipients are BCC'd
 * so their addresses aren't leaked to each other. The Resend key stays server-only.
 *
 *  - invited: everyone on the guest list
 *  - going:   everyone who answered "going"
 *  - noreply: everyone who was sent an e-vite and hasn't answered
 */
export default defineEventHandler(async (event) => {
  const { user, userId } = await requireUser(event)

  // RLS-scoped client: runs as the signed-in user via their session cookie.
  const db = await serverSupabaseClient<Database>(event)

  const parsed = bodySchema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid announcement' })
  const { eventId, subject, message, scope } = parsed.data

  const ev = await requireEventHost(db, eventId, userId)

  let query = db.from('event_invites').select('email').eq('event_id', eventId)
  if (scope === 'going') query = query.eq('rsvp', 'going')
  if (scope === 'noreply') query = query.is('rsvp', null).not('sent_at', 'is', null)

  const { data: rows, error: listError } = await query
  if (listError) {
    throw createError({ statusCode: 500, statusMessage: 'Could not load the guest list', data: { cause: listError.message } })
  }
  const emails = uniqueEmails((rows ?? []).map(row => row.email))
  if (!emails.length) return { ok: true, count: 0, failed: 0, error: null }

  const { resendApiKey, resendFrom } = requireEmailConfig(event)

  const mail = buildAnnounceEmail({
    eventTitle: ev.title,
    eventDate: ev.event_date ? formatEmailDate(ev.event_date) : null,
    message,
    subject,
    brand: resolveBrand(event),
    link: `${resolveOrigin(event)}/events/${eventId}`
  })

  // Send in BCC groups of 49 (Resend's per-send cap). Continues past a failed
  // group, so a mid-blast error doesn't lose the groups that already delivered —
  // the result reports sent/failed for the UI to surface (no all-or-nothing 502).
  const { sent, failed, error } = await sendAnnounce(
    resendApiKey,
    resendFrom,
    { subject: mail.subject, html: mail.html, text: mail.text, replyTo: user.email ?? undefined },
    emails
  )

  // Record what actually went out (best-effort — a logging failure must not fail
  // the request; surface it in logs instead).
  if (sent > 0) {
    const { error: logError } = await db.from('comms_log').insert({
      event_id: eventId,
      kind: 'announcement',
      scope,
      subject: mail.subject,
      recipient_count: sent,
      failed_count: failed,
      status: commsStatus(sent, failed),
      error,
      sent_by: userId
    })
    if (logError) console.error('[events/announce] comms_log insert failed -', logError.message)
  }

  return { ok: true, count: sent, failed, error }
})
