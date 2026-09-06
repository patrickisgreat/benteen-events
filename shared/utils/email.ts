import { DEFAULT_INVITE_OPTIONS, type InviteAccent, type InviteOptions, type InviteTheme } from '#shared/types/invite-options'

/**
 * The deployment's identity, threaded through every builder instead of being
 * hard-coded. This app fronts any event, so the name in the eyebrow and the
 * line in the footer are configuration (runtimeConfig.public), not content.
 */
export interface Brand {
  readonly name: string
  readonly tagline: string
}

export const DEFAULT_BRAND: Brand = { name: 'Benteen Events', tagline: 'Good people, good times.' }

/** Escape user-supplied text before it goes into email HTML (no injection). */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Strip stored rich-text (HTML) down to plain text for email — emails render
 *  arbitrary HTML inconsistently and it's an injection risk, so we never inline it. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, '\'')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// The attribute-less tags the announce composer's editor (tiptap StarterKit)
// emits. Anything else — including any tag carrying an attribute — stays escaped.
const ANNOUNCE_RICH_TAGS = ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'strong', 'em', 's', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr'] as const

/**
 * Sanitize rich-text HTML for an email body: escape everything, then restore
 * only the exact literal tags above. Safe by construction — a tag with any
 * attribute (`onerror=`, `href=`, `style=`) never matches the exact escaped
 * form, so no markup we didn't explicitly re-allow can survive. Plain text
 * passes through unchanged apart from newlines becoming <br>.
 */
export function sanitizeEmailHtml(html: string): string {
  let out = escapeHtml(html)
  for (const tag of ANNOUNCE_RICH_TAGS) {
    out = out
      .replaceAll(`&lt;${tag}&gt;`, `<${tag}>`)
      .replaceAll(`&lt;/${tag}&gt;`, `</${tag}>`)
  }
  // The loop restores <br>; this handles the self-closing <br/> form tiptap
  // sometimes emits. Raw newlines (plain-text callers) become breaks too.
  return out.replaceAll('&lt;br/&gt;', '<br>').replace(/\n/g, '<br>')
}

export interface BuiltEmail {
  subject: string
  html: string
  text: string
}

/** Human-readable date for email bodies (server-side; no app auto-imports here). */
export function formatEmailDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

/** Normalize, lowercase, and de-duplicate a recipient list. */
export function uniqueEmails(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  for (const value of values) {
    const email = value?.trim().toLowerCase()
    if (email) seen.add(email)
  }
  return [...seen]
}

function shell(bodyHtml: string): string {
  return `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;line-height:1.5">${bodyHtml}</div>`
}

function ctaButton(label: string, link: string): string {
  return `<a href="${escapeHtml(link)}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">${escapeHtml(label)}</a>`
}

/** Small print naming the deployment, closing the plain `shell()` emails. */
function brandFooter(brand: Brand): string {
  return `<p style="font-size:13px;color:#6b7280;margin-top:24px">Sent by ${escapeHtml(brand.name)}. If you weren't expecting this, you can ignore it.</p>`
}

/**
 * Welcome mail for someone a host just added to their address book, outside of
 * any one event. Deliberately promises no date — the point is "you're on the
 * list, you'll hear from me when something's on the calendar."
 */
export function buildContactWelcomeEmail(opts: {
  hostName: string | null
  brand: Brand
  /** Optional note the host typed on the bulk-add form. */
  note?: string | null
}): BuiltEmail {
  const host = opts.hostName ? escapeHtml(opts.hostName) : 'Your host'
  const subject = `${opts.hostName ?? 'Your host'} added you to their invite list`
  const note = opts.note?.trim()
  const noteHtml = note
    ? `<div style="border-left:3px solid #16a34a;padding:2px 0 2px 14px;margin:16px 0">${escapeHtml(note).replace(/\n/g, '<br>')}</div>`
    : ''
  const html = shell(
    `<h1 style="font-size:20px;margin:0 0 12px">You're on the list 🎉</h1>`
    + `<p>${host} added you to their invite list${opts.brand.name ? ` on <strong>${escapeHtml(opts.brand.name)}</strong>` : ''}.</p>`
    + noteHtml
    + `<p>Nothing is on the calendar for you yet — but when ${host} schedules something, the invitation lands in this inbox and you can RSVP in one click. No account, no password.</p>`
    + brandFooter(opts.brand)
  )
  const text = `${opts.hostName ?? 'Your host'} added you to their invite list.`
    + (note ? `\n\n${note}` : '')
    + `\n\nNothing is on the calendar yet — when something is scheduled, the invitation lands in this inbox and you can RSVP in one click.`
  return { subject, html, text }
}

/** Host announcement / update blast about a specific event. */
export function buildAnnounceEmail(opts: {
  eventTitle: string
  eventDate: string | null
  message: string
  link: string
  brand: Brand
  subject?: string
}): BuiltEmail {
  const subject = opts.subject?.trim() || `${opts.eventTitle} — an update`
  // The host's message is rich text from the composer's editor; keep only its
  // known tags (plain text still works — newlines become <br>).
  const messageHtml = sanitizeEmailHtml(opts.message)
  const html = shell(
    `<h1 style="font-size:20px;margin:0 0 4px">${escapeHtml(opts.eventTitle)}</h1>`
    + (opts.eventDate ? `<p style="color:#6b7280;margin:0 0 16px">${escapeHtml(opts.eventDate)}</p>` : '')
    + `<div>${messageHtml}</div>`
    + `<p style="margin:20px 0">${ctaButton('View the event', opts.link)}</p>`
    + brandFooter(opts.brand)
  )
  const text = `${opts.eventTitle}${opts.eventDate ? ` — ${opts.eventDate}` : ''}\n\n${htmlToText(opts.message)}\n\n${opts.link}`
  return { subject, html, text }
}

/** Nudge an invitee who hasn't RSVP'd yet. Same one-click RSVP buttons as the
 *  e-vite (token in the query — no sign-in); `daysLeft` drives the urgency copy. */
export function buildEventReminderEmail(opts: {
  eventTitle: string
  eventDate: string | null
  daysLeft: number
  rsvpUrl: string // base: https://site/rsvp?token=abc
  brand: Brand
}): BuiltEmail {
  const last = opts.daysLeft <= 1
  const when = opts.daysLeft <= 0 ? 'today' : opts.daysLeft === 1 ? 'tomorrow' : `in ${opts.daysLeft} days`
  const heading = last ? 'Last call' : 'Don\'t forget to RSVP'
  const subject = last ? `Last call: RSVP for ${opts.eventTitle}` : `Reminder: RSVP for ${opts.eventTitle}`

  const rsvp = (status: string, label: string, bg: string): string =>
    `<a href="${escapeHtml(`${opts.rsvpUrl}&status=${status}`)}" style="display:inline-block;background:${bg};color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;font-size:15px;margin:0 8px 8px 0">${escapeHtml(label)}</a>`

  const html = shell(
    `<h1 style="font-size:20px;margin:0 0 4px">${heading}</h1>`
    + `<p style="color:#6b7280;margin:0 0 16px"><strong>${escapeHtml(opts.eventTitle)}</strong>${opts.eventDate ? ` — ${escapeHtml(opts.eventDate)}` : ''}</p>`
    + `<p>It's ${when} and we haven't heard from you yet. Are you in?</p>`
    + `<p style="margin:22px 0 4px">${rsvp('going', 'I\'m going', '#16a34a')}${rsvp('maybe', 'Maybe', '#6b7280')}${rsvp('no', 'Can\'t make it', '#374151')}</p>`
    + brandFooter(opts.brand)
  )
  const text = `${heading} — ${opts.eventTitle}${opts.eventDate ? ` (${opts.eventDate})` : ''}.`
    + `\n\nIt's ${when} and we haven't heard from you yet.`
    + `\n\nRSVP:\nGoing: ${opts.rsvpUrl}&status=going\nMaybe: ${opts.rsvpUrl}&status=maybe\nCan't make it: ${opts.rsvpUrl}&status=no`
  return { subject, html, text }
}

/** One event's line in the host reminder digest. `eventDate` is already
 *  formatted (or null); `remindedCount` is how many non-responders were nudged. */
export interface HostReminderDigestItem {
  readonly eventTitle: string
  readonly eventDate: string | null
  readonly daysLeft: number
  readonly remindedCount: number
}

/** How far out an event is, in the digest's words. */
function daysLeftPhrase(daysLeft: number): string {
  if (daysLeft <= 0) return 'today'
  if (daysLeft === 1) return 'tomorrow'
  return `in ${daysLeft} days`
}

/**
 * Host-facing digest sent after the daily reminder cron nudges non-responders —
 * one summary per run, so a host can see the automated sends they never trigger
 * by hand. Lists each event reminded and how many people it reached.
 */
export function buildHostReminderDigestEmail(opts: {
  items: readonly HostReminderDigestItem[]
  totalReminded: number
  dashboardUrl: string
  brand: Brand
}): BuiltEmail {
  const people = opts.totalReminded === 1 ? 'person' : 'people'
  const events = opts.items.length === 1 ? 'event' : 'events'
  const subject = `RSVP reminders sent — ${opts.totalReminded} ${people} nudged`

  const rowsHtml = opts.items
    .map((it) => {
      const date = it.eventDate ? ` &middot; ${escapeHtml(it.eventDate)}` : ''
      const n = it.remindedCount === 1 ? 'person' : 'people'
      return `<li style="margin:0 0 8px"><strong>${escapeHtml(it.eventTitle)}</strong>${date}`
        + ` — reminded ${it.remindedCount} ${n} (${daysLeftPhrase(it.daysLeft)})</li>`
    })
    .join('')
  const html = shell(
    `<h1 style="font-size:20px;margin:0 0 12px">RSVP reminders went out</h1>`
    + `<p>Today's run nudged <strong>${opts.totalReminded} ${people}</strong> who hadn't RSVP'd yet, across ${opts.items.length} ${events}:</p>`
    + `<ul style="padding-left:20px;margin:0 0 16px">${rowsHtml}</ul>`
    + `<p style="margin:20px 0">${ctaButton('Open your events', opts.dashboardUrl)}</p>`
    + brandFooter(opts.brand)
  )

  const rowsText = opts.items
    .map((it) => {
      const date = it.eventDate ? ` (${it.eventDate})` : ''
      return `- ${it.eventTitle}${date} — reminded ${it.remindedCount} (${daysLeftPhrase(it.daysLeft)})`
    })
    .join('\n')
  const text = `RSVP reminders went out.`
    + `\n\nNudged ${opts.totalReminded} ${people} across ${opts.items.length} ${events}:\n${rowsText}`
    + `\n\nYour events: ${opts.dashboardUrl}`

  return { subject, html, text }
}

// ---- Themeable per-event e-vite -------------------------------------------

interface Palette {
  bg: string
  card: string
  text: string
  muted: string
  border: string
  accent: string
  eyebrow: string
  titleColor: string
  titleFont: string
}

const ACCENT_HEX: Record<InviteAccent, string> = {
  green: '#16a34a',
  red: '#dc2626',
  amber: '#d97706',
  violet: '#7c3aed',
  sky: '#0284c7'
}

function palette(theme: InviteTheme, accent: InviteAccent): Palette {
  const a = ACCENT_HEX[accent]
  if (theme === 'classic') {
    return { bg: '#eef2f7', card: '#ffffff', text: '#1f2937', muted: '#6b7280', border: '#e5e7eb', accent: a, eyebrow: '#6b7280', titleColor: '#111827', titleFont: 'Georgia,\'Times New Roman\',serif' }
  }
  if (theme === 'neon') {
    return { bg: '#06060d', card: '#11111c', text: '#e5e7eb', muted: '#9ca3af', border: '#262640', accent: a, eyebrow: a, titleColor: '#ffffff', titleFont: '\'Bebas Neue\',\'Arial Narrow\',sans-serif' }
  }
  // marquee (default) — dark, high-contrast
  return { bg: '#0b0b0f', card: '#16161d', text: '#e5e7eb', muted: '#9ca3af', border: '#26262f', accent: a, eyebrow: '#9ca3af', titleColor: '#ffffff', titleFont: '\'Bebas Neue\',Impact,\'Arial Narrow\',sans-serif' }
}

/**
 * Evite-style per-event invitation: cover banner, event details, the host's
 * note, one-click RSVP buttons, and a themeable look. The buttons link to the
 * public /rsvp page (token in the query) — the guest needs no account.
 *
 * This is the one builder the client also calls, to render the live preview in
 * the design editor. Keeping it pure and in `shared/` is what guarantees the
 * preview is byte-identical to what actually gets sent.
 */
export function buildEventInviteEmail(opts: {
  eventTitle: string
  eventDate: string | null
  eventTime?: string | null
  location?: string | null
  locationUrl?: string | null
  coverImageUrl?: string | null
  description?: string | null
  hostName: string | null
  rsvpUrl: string // base: https://site/rsvp?token=abc
  brand: Brand
  options?: InviteOptions
}): BuiltEmail {
  const o = opts.options ?? DEFAULT_INVITE_OPTIONS
  const p = palette(o.theme, o.accent)
  const host = opts.hostName ? escapeHtml(opts.hostName) : 'Your host'
  const showCover = o.showCover && Boolean(opts.coverImageUrl)

  const rsvp = (status: string, label: string, bg: string): string =>
    `<a href="${escapeHtml(`${opts.rsvpUrl}&status=${status}`)}" style="display:inline-block;background:${bg};color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;font-size:15px;margin:0 8px 8px 0">${escapeHtml(label)}</a>`

  const detailBits: string[] = []
  if (o.showDetails) {
    if (opts.eventDate) detailBits.push(`📅 ${escapeHtml(opts.eventDate)}`)
    if (opts.eventTime) detailBits.push(`🕗 ${escapeHtml(opts.eventTime)}`)
    if (opts.location) {
      const loc = escapeHtml(opts.location)
      detailBits.push(opts.locationUrl
        ? `📍 <a href="${escapeHtml(opts.locationUrl)}" style="color:${p.accent};text-decoration:none">${loc}</a>`
        : `📍 ${loc}`)
    }
  }
  const detailsHtml = detailBits.length
    ? `<p style="color:${p.muted};font-size:14px;margin:0 0 16px">${detailBits.join(' &nbsp;·&nbsp; ')}</p>`
    : ''

  const note = o.message.trim()
  const noteHtml = note
    ? `<div style="border-left:3px solid ${p.accent};padding:2px 0 2px 14px;margin:0 0 18px;color:${p.text}">${escapeHtml(note).replace(/\n/g, '<br>')}</div>`
    : ''

  const descText = o.showDetails && opts.description ? htmlToText(opts.description) : ''
  const descHtml = descText
    ? `<p style="color:${p.muted};font-size:14px;margin:0 0 18px">${escapeHtml(descText).replace(/\n/g, '<br>')}</p>`
    : ''

  const coverHtml = showCover
    ? `<img src="${escapeHtml(opts.coverImageUrl ?? '')}" alt="${escapeHtml(opts.eventTitle)}" width="600" style="display:block;width:100%;height:auto">`
    : ''

  const subject = `You're invited: ${opts.eventTitle}`
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap" rel="stylesheet"></head>`
    + `<body style="margin:0;padding:0;background:${p.bg};-webkit-text-size-adjust:100%">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${p.bg}"><tr><td align="center" style="padding:24px 12px">`
    + `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${p.card};border:1px solid ${p.border};border-radius:14px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">`
    + (coverHtml ? `<tr><td style="line-height:0">${coverHtml}</td></tr>` : '')
    + `<tr><td style="padding:28px">`
    + `<p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${p.eyebrow}">${escapeHtml(opts.brand.name)}</p>`
    + `<h1 style="margin:0 0 14px;font-family:${p.titleFont};font-weight:700;font-size:42px;line-height:1.05;letter-spacing:0.5px;color:${p.titleColor}">${escapeHtml(opts.eventTitle)}</h1>`
    + detailsHtml
    + `<p style="margin:0 0 16px;color:${p.text};font-size:15px;line-height:1.5">${host} hopes you can make it. Will you be there?</p>`
    + noteHtml
    + descHtml
    + `<p style="margin:22px 0 4px">${rsvp('going', 'I\'m going', p.accent)}${rsvp('maybe', 'Maybe', '#6b7280')}${rsvp('no', 'Can\'t make it', '#374151')}</p>`
    + `</td></tr>`
    + `<tr><td style="padding:14px 28px;border-top:1px solid ${p.border};color:${p.muted};font-size:12px">${escapeHtml(opts.brand.tagline)}</td></tr>`
    + `</table></td></tr></table></body></html>`

  const textParts = [
    `You're invited: ${opts.eventTitle}`,
    o.showDetails ? [opts.eventDate, opts.eventTime, opts.location].filter(Boolean).join(' · ') : '',
    note,
    descText,
    `RSVP:\nGoing: ${opts.rsvpUrl}&status=going\nMaybe: ${opts.rsvpUrl}&status=maybe\nCan't make it: ${opts.rsvpUrl}&status=no`
  ].filter(Boolean)
  return { subject, html, text: textParts.join('\n\n') }
}
