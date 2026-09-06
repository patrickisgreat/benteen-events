import { serverSupabaseServiceRole } from '#supabase/server'
import type { Database } from '~/types/database.types'
import type { HostReminderDigestItem } from '#shared/utils/email'

/**
 * Daily RSVP-reminder cron. Vercel Cron hits this (GET) once a day and
 * authenticates with the CRON_SECRET bearer token. For every reminders-enabled
 * upcoming event whose days-until matches one of its host's configured
 * checkpoints (`host_settings.reminder_days`), it emails the invitees who haven't
 * answered — reusing their one-click token links — throttled to at most once per
 * checkpoint, then stamps `reminded_at` and logs the batch.
 *
 * Runs as the service role because there is no session here: it acts for every
 * host at once. That makes the per-host grouping below load-bearing rather than
 * cosmetic — it is what keeps one host's events, guests, and digest from ever
 * reaching another. The bearer secret keeps the route from being triggered by
 * anyone but the scheduler.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  if (!config.cronSecret || getHeader(event, 'authorization') !== `Bearer ${config.cronSecret}`) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const { resendApiKey, resendFrom } = requireEmailConfig(event)
  const admin = serverSupabaseServiceRole<Database>(event)

  // Checkpoints are per host, so the horizon is the furthest any host looks ahead.
  const { data: settingsRows, error: settingsError } = await admin
    .from('host_settings')
    .select('host_id, reminder_days')
  if (settingsError) {
    throw createError({ statusCode: 500, statusMessage: 'Could not load host settings', data: { cause: settingsError.message } })
  }
  const daysByHost = new Map((settingsRows ?? []).map(r => [r.host_id, r.reminder_days ?? []]))
  const allDays = [...daysByHost.values()].flat()
  if (!allDays.length) return { ok: true, events: 0, sent: 0, hostsNotified: 0, note: 'reminders disabled' }

  const now = new Date()
  const horizon = new Date(now.getTime() + (Math.max(...allDays) + 1) * 86_400_000)

  const { data: rows, error } = await admin
    .from('events')
    .select('id, host_id, title, event_date, reminders_enabled, event_invites(id, email, token, rsvp, sent_at, reminded_at)')
    .gte('event_date', now.toISOString().slice(0, 10))
    .lte('event_date', horizon.toISOString().slice(0, 10))
  if (error) throw createError({ statusCode: 500, statusMessage: 'Could not load events', data: { cause: error.message } })

  // The events→event_invites relationship isn't declared in the hand-written types
  // (Relationships are empty), so PostgREST's embed infers an error type — cast to
  // the real shape at this one boundary.
  type EventRow = {
    id: string
    host_id: string
    title: string
    event_date: string
    reminders_enabled: boolean
    event_invites: ReminderInvite[] | null
  }
  const events = (rows ?? []) as unknown as EventRow[]

  // Group by host so each host's own checkpoints apply, and so the digest below
  // only ever tells a host about their own events.
  const byHost = new Map<string, EventRow[]>()
  for (const e of events) {
    const list = byHost.get(e.host_id)
    if (list) list.push(e)
    else byHost.set(e.host_id, [e])
  }

  const origin = resolveOrigin(event)
  const brand = resolveBrand(event)
  let totalSent = 0
  let totalEvents = 0
  let hostsNotified = 0

  for (const [hostId, hostEvents] of byHost) {
    const reminderDays = daysByHost.get(hostId) ?? []
    if (!reminderDays.length) continue

    const due = selectDueReminders(
      hostEvents.map(e => ({
        id: e.id,
        title: e.title,
        event_date: e.event_date,
        reminders_enabled: e.reminders_enabled,
        invites: e.event_invites ?? []
      })),
      now,
      reminderDays
    )
    if (!due.length) continue
    totalEvents += due.length

    let hostSent = 0
    const digest: HostReminderDigestItem[] = []

    for (const d of due) {
      const eventDate = formatEmailDate(d.eventDate) || null
      const { sent, failed, error: sendError } = await sendEventReminders(admin, {
        apiKey: resendApiKey,
        from: resendFrom,
        eventTitle: d.eventTitle,
        eventDate,
        daysLeft: d.daysLeft,
        origin,
        brand,
        invites: d.invites
      })
      // Log the outcome of every attempt — including a total failure (sent = 0) —
      // so the host's comms log shows what the automated run actually did.
      const { error: logError } = await admin.from('comms_log').insert({
        event_id: d.eventId,
        kind: 'reminder',
        subject: `Reminder — ${d.eventTitle}`,
        recipient_count: sent,
        failed_count: failed,
        status: commsStatus(sent, failed),
        error: sendError
      })
      if (logError) console.error('[crons/reminders] comms_log insert failed -', logError.message)
      if (sent > 0) {
        hostSent += sent
        digest.push({ eventTitle: d.eventTitle, eventDate, daysLeft: d.daysLeft, remindedCount: sent })
      }
    }

    totalSent += hostSent
    if (hostSent === 0) continue

    // Tell the host about the automated send they don't otherwise see.
    // Best-effort: the reminders already went out, so a digest failure must not
    // fail the run for this host or any other.
    try {
      const { data: host } = await admin.from('profiles').select('email').eq('id', hostId).maybeSingle()
      if (host?.email) {
        const { notified } = await sendHostReminderDigest({
          apiKey: resendApiKey,
          from: resendFrom,
          hostEmail: host.email,
          items: digest,
          totalReminded: hostSent,
          dashboardUrl: `${origin}/events`,
          brand
        })
        hostsNotified += notified
      }
    } catch (e) {
      console.error('[crons/reminders] host digest failed -', e instanceof Error ? e.message : e)
    }
  }

  return { ok: true, events: totalEvents, sent: totalSent, hostsNotified }
})
