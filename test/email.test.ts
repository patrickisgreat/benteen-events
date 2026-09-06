import { describe, expect, it } from 'vitest'
import {
  buildAnnounceEmail,
  buildContactWelcomeEmail,
  buildEventInviteEmail,
  buildEventReminderEmail,
  buildHostReminderDigestEmail,
  escapeHtml,
  formatEmailDate,
  htmlToText,
  sanitizeEmailHtml,
  uniqueEmails,
  type Brand
} from '../shared/utils/email'
import { DEFAULT_INVITE_OPTIONS } from '../shared/types/invite-options'

const brand: Brand = { name: 'Wren Street Supper Club', tagline: 'Come hungry.' }

const inviteOpts = {
  eventTitle: 'Backyard cookout',
  eventDate: 'Saturday, July 4, 2026',
  hostName: 'Jordan',
  rsvpUrl: 'https://ev.test/rsvp?token=abc',
  brand
}

describe('escapeHtml', () => {
  it('neutralizes every character that could break out of an HTML context', () => {
    expect(escapeHtml(`<img src=x onerror="alert('h')">&`))
      .toBe('&lt;img src=x onerror=&quot;alert(&#39;h&#39;)&quot;&gt;&amp;')
  })
})

describe('htmlToText', () => {
  it('turns block tags into line breaks and decodes entities', () => {
    expect(htmlToText('<p>Bring a chair</p><p>and a &amp; blanket</p>')).toBe('Bring a chair\nand a & blanket')
  })

  it('collapses runs of blank lines so a pasted body does not sprawl', () => {
    expect(htmlToText('<p>a</p><br><br><br><p>b</p>')).toBe('a\n\nb')
  })
})

describe('sanitizeEmailHtml', () => {
  it('keeps the formatting tags the editor actually emits', () => {
    expect(sanitizeEmailHtml('<p><strong>Bold</strong> and <em>italic</em></p>'))
      .toBe('<p><strong>Bold</strong> and <em>italic</em></p>')
  })

  it('escapes a tag carrying ANY attribute, which is what makes it safe by construction', () => {
    const out = sanitizeEmailHtml('<p onclick="steal()">hi</p>')
    expect(out).toContain('&lt;p onclick=')
    expect(out).not.toContain('<p onclick')
  })

  it('escapes tags outside the allow-list entirely', () => {
    const out = sanitizeEmailHtml('<script>alert(1)</script>')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script&gt;')
  })

  it('turns raw newlines into breaks so a plain-text body still renders', () => {
    expect(sanitizeEmailHtml('one\ntwo')).toBe('one<br>two')
  })
})

describe('formatEmailDate', () => {
  it('returns an empty string for an unparseable date rather than "Invalid Date"', () => {
    expect(formatEmailDate('not-a-date')).toBe('')
  })
})

describe('uniqueEmails', () => {
  it('lowercases, trims, drops blanks, and de-duplicates', () => {
    expect(uniqueEmails([' A@x.com ', 'a@x.com', null, '', undefined, 'b@x.com'])).toEqual(['a@x.com', 'b@x.com'])
  })
})

describe('buildEventInviteEmail', () => {
  it('gives each RSVP answer its own one-click link carrying the token', () => {
    const { html } = buildEventInviteEmail(inviteOpts)
    expect(html).toContain('https://ev.test/rsvp?token=abc&amp;status=going')
    expect(html).toContain('https://ev.test/rsvp?token=abc&amp;status=maybe')
    expect(html).toContain('https://ev.test/rsvp?token=abc&amp;status=no')
  })

  it('lists all three links in the plain-text part too, for clients that strip HTML', () => {
    const { text } = buildEventInviteEmail(inviteOpts)
    expect(text).toContain('Going: https://ev.test/rsvp?token=abc&status=going')
    expect(text).toContain('Maybe: https://ev.test/rsvp?token=abc&status=maybe')
    expect(text).toContain('Can\'t make it: https://ev.test/rsvp?token=abc&status=no')
  })

  it('stamps the deployment brand rather than any hard-coded club name', () => {
    const { html } = buildEventInviteEmail(inviteOpts)
    expect(html).toContain('Wren Street Supper Club')
    expect(html).toContain('Come hungry.')
  })

  it('escapes a hostile event title instead of rendering it', () => {
    const { html } = buildEventInviteEmail({ ...inviteOpts, eventTitle: '<script>alert(1)</script>' })
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('shows the cover image when there is one and the option is on', () => {
    const { html } = buildEventInviteEmail({ ...inviteOpts, coverImageUrl: 'https://img.test/x.jpg' })
    expect(html).toContain('https://img.test/x.jpg')
  })

  it('omits the cover image when the host turned it off', () => {
    const { html } = buildEventInviteEmail({
      ...inviteOpts,
      coverImageUrl: 'https://img.test/x.jpg',
      options: { ...DEFAULT_INVITE_OPTIONS, showCover: false }
    })
    expect(html).not.toContain('https://img.test/x.jpg')
  })

  it('omits the date and location block when details are turned off', () => {
    const { html } = buildEventInviteEmail({
      ...inviteOpts,
      location: '123 Wren St',
      options: { ...DEFAULT_INVITE_OPTIONS, showDetails: false }
    })
    expect(html).not.toContain('123 Wren St')
    expect(html).not.toContain('Saturday, July 4, 2026')
  })

  it('links the location when a map URL is given', () => {
    const { html } = buildEventInviteEmail({ ...inviteOpts, location: '123 Wren St', locationUrl: 'https://maps.test/x' })
    expect(html).toContain('href="https://maps.test/x"')
  })

  it('renders the host note, with newlines as breaks', () => {
    const { html } = buildEventInviteEmail({
      ...inviteOpts,
      options: { ...DEFAULT_INVITE_OPTIONS, message: 'Bring a chair\nand a blanket' }
    })
    expect(html).toContain('Bring a chair<br>and a blanket')
  })

  it('escapes the host note — it is free text the guest never typed', () => {
    const { html } = buildEventInviteEmail({
      ...inviteOpts,
      options: { ...DEFAULT_INVITE_OPTIONS, message: '<img src=x onerror=alert(1)>' }
    })
    expect(html).not.toContain('<img src=x')
  })

  it('strips the description down to text rather than inlining its stored HTML', () => {
    const { html } = buildEventInviteEmail({ ...inviteOpts, description: '<p>Potluck<script>bad()</script></p>' })
    expect(html).not.toContain('<script>')
    expect(html).toContain('Potluck')
  })

  it('changes palette with the theme, so the three themes are actually distinct', () => {
    const marquee = buildEventInviteEmail({ ...inviteOpts, options: { ...DEFAULT_INVITE_OPTIONS, theme: 'marquee' } }).html
    const classic = buildEventInviteEmail({ ...inviteOpts, options: { ...DEFAULT_INVITE_OPTIONS, theme: 'classic' } }).html
    const neon = buildEventInviteEmail({ ...inviteOpts, options: { ...DEFAULT_INVITE_OPTIONS, theme: 'neon' } }).html
    expect(new Set([marquee, classic, neon]).size).toBe(3)
    // Classic is the light one.
    expect(classic).toContain('#ffffff')
  })

  it('paints the going button in the chosen accent', () => {
    const violet = buildEventInviteEmail({ ...inviteOpts, options: { ...DEFAULT_INVITE_OPTIONS, accent: 'violet' } }).html
    expect(violet).toContain('#7c3aed')
  })

  it('falls back to a neutral host label when the host has no name', () => {
    const { html } = buildEventInviteEmail({ ...inviteOpts, hostName: null })
    expect(html).toContain('Your host')
  })
})

describe('buildAnnounceEmail', () => {
  it('uses the host subject when given, and a derived one when not', () => {
    const base = { eventTitle: 'Cookout', eventDate: null, message: 'hi', link: 'https://ev.test/e/1', brand }
    expect(buildAnnounceEmail({ ...base, subject: 'Moved indoors' }).subject).toBe('Moved indoors')
    expect(buildAnnounceEmail(base).subject).toBe('Cookout — an update')
  })

  it('sanitizes the body rather than trusting the editor output', () => {
    const { html } = buildAnnounceEmail({
      eventTitle: 'Cookout',
      eventDate: null,
      message: '<p>Rain plan</p><script>bad()</script>',
      link: 'https://ev.test/e/1',
      brand
    })
    expect(html).toContain('<p>Rain plan</p>')
    expect(html).not.toContain('<script>')
  })
})

describe('buildEventReminderEmail', () => {
  const base = { eventTitle: 'Cookout', eventDate: null, rsvpUrl: 'https://ev.test/rsvp?token=t', brand }

  it('escalates to a last call inside a day', () => {
    expect(buildEventReminderEmail({ ...base, daysLeft: 1 }).subject).toBe('Last call: RSVP for Cookout')
    expect(buildEventReminderEmail({ ...base, daysLeft: 0 }).subject).toBe('Last call: RSVP for Cookout')
    expect(buildEventReminderEmail({ ...base, daysLeft: 3 }).subject).toBe('Reminder: RSVP for Cookout')
  })

  it('says how far out the event is in words', () => {
    expect(buildEventReminderEmail({ ...base, daysLeft: 0 }).html).toContain('today')
    expect(buildEventReminderEmail({ ...base, daysLeft: 1 }).html).toContain('tomorrow')
    expect(buildEventReminderEmail({ ...base, daysLeft: 5 }).html).toContain('in 5 days')
  })

  it('carries the same one-click token links as the e-vite', () => {
    const { html } = buildEventReminderEmail({ ...base, daysLeft: 2 })
    expect(html).toContain('https://ev.test/rsvp?token=t&amp;status=going')
  })
})

describe('buildHostReminderDigestEmail', () => {
  const items = [{ eventTitle: 'Cookout', eventDate: 'July 4', daysLeft: 3, remindedCount: 4 }]

  it('summarizes the run in the subject', () => {
    const { subject } = buildHostReminderDigestEmail({ items, totalReminded: 4, dashboardUrl: 'https://ev.test/events', brand })
    expect(subject).toBe('RSVP reminders sent — 4 people nudged')
  })

  it('uses the singular for a single person', () => {
    const { subject } = buildHostReminderDigestEmail({
      items: [{ ...items[0]!, remindedCount: 1 }],
      totalReminded: 1,
      dashboardUrl: 'https://ev.test/events',
      brand
    })
    expect(subject).toBe('RSVP reminders sent — 1 person nudged')
  })

  it('lists each event with its count and how far out it is', () => {
    const { html } = buildHostReminderDigestEmail({ items, totalReminded: 4, dashboardUrl: 'https://ev.test/events', brand })
    expect(html).toContain('Cookout')
    expect(html).toContain('reminded 4 people (in 3 days)')
  })
})

describe('buildContactWelcomeEmail', () => {
  it('names the host in the subject', () => {
    expect(buildContactWelcomeEmail({ hostName: 'Jordan', brand }).subject)
      .toBe('Jordan added you to their invite list')
  })

  it('promises no date, because there is no event yet', () => {
    const { text } = buildContactWelcomeEmail({ hostName: 'Jordan', brand })
    expect(text).toContain('Nothing is on the calendar yet')
  })

  it('includes the host note when one was written, escaped', () => {
    const { html } = buildContactWelcomeEmail({ hostName: 'Jordan', brand, note: '<b>hi</b>' })
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;')
  })

  it('falls back to a neutral label when the host has no name', () => {
    expect(buildContactWelcomeEmail({ hostName: null, brand }).subject)
      .toBe('Your host added you to their invite list')
  })
})
