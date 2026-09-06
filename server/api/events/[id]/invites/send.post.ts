import { serverSupabaseClient } from '#supabase/server'
import type { Database } from '~/types/database.types'

/**
 * Sends (or re-sends) the tokenized e-vites for an event's guest list.
 *
 * Runs under the caller's own session (RLS), not the service role: the
 * `event_invites: host all` policy already scopes every read and write to events
 * this user hosts, so a misconfigured service-role key can't turn into a way to
 * mail someone else's guest list. This route owns auth, loading the event, and
 * building each guest's one-click RSVP email; it delegates the rate-limit-friendly
 * batch send and delivery recording to `sendEventInvites`.
 */
export default defineEventHandler(async (event) => {
  const { user, userId } = await requireUser(event)

  const eventId = getRouterParam(event, 'id')
  if (!eventId) throw createError({ statusCode: 400, statusMessage: 'Missing event id' })

  // RLS-scoped client: runs as the signed-in user via their session cookie.
  const db = await serverSupabaseClient<Database>(event)
  const ev = await requireEventHost(db, eventId, userId)
  const inviteOptions = normalizeInviteOptions(ev.invite_options)

  // Only guests who haven't been sent to yet — this is what makes the button
  // idempotent enough to press twice after adding a few more people.
  const { data: invites, error: queueError } = await db
    .from('event_invites')
    .select('id, email, display_name, token')
    .eq('event_id', eventId)
    .is('sent_at', null)
  if (queueError) {
    throw createError({ statusCode: 500, statusMessage: 'Could not load the guest list', data: { cause: queueError.message, code: queueError.code } })
  }
  const queue = invites ?? []
  if (!queue.length) return { ok: true, sent: 0, failed: 0, error: null }

  const { resendApiKey, resendFrom } = requireEmailConfig(event)
  const origin = resolveOrigin(event)
  const brand = resolveBrand(event)
  const hostName = hostNameFromClaims(user)

  // Build every guest's distinct one-click RSVP email up front. Each link differs,
  // so these are N distinct emails (not one email to N people) — exactly what the
  // batch sender fans out across Resend's batch endpoint.
  const recipients = queue.map((invite) => {
    const mail = buildEventInviteEmail({
      eventTitle: ev.title,
      eventDate: ev.event_date ? formatEmailDate(ev.event_date) : null,
      eventTime: ev.start_time,
      location: ev.location,
      locationUrl: ev.location_url,
      coverImageUrl: ev.cover_image_url,
      description: ev.description,
      hostName,
      rsvpUrl: `${origin}/rsvp?token=${invite.token}`,
      brand,
      options: inviteOptions
    })
    return {
      id: invite.id,
      email: invite.email,
      token: invite.token,
      displayName: invite.display_name,
      subject: mail.subject,
      html: mail.html,
      text: mail.text
    }
  })

  const result = await sendEventInvites(db, {
    apiKey: resendApiKey,
    from: resendFrom,
    replyTo: user.email ?? undefined,
    eventId,
    recipients
  })

  // Record the blast when at least one e-vite went out (best-effort — a logging
  // failure must not fail a send that already happened).
  if (result.sent > 0) {
    const { error: logError } = await db.from('comms_log').insert({
      event_id: eventId,
      kind: 'invite',
      subject: `E-vite — ${ev.title}`,
      recipient_count: result.sent,
      failed_count: result.failed,
      status: commsStatus(result.sent, result.failed),
      error: result.error,
      sent_by: userId
    })
    if (logError) console.error('[events/invites/send] comms_log insert failed -', logError.message)
  }

  return { ok: true, ...result }
})
