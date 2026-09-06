import DOMPurify from 'dompurify'

/**
 * Sanitize stored rich text (event descriptions) before rendering it with
 * v-html. Descriptions are host-authored, but rendering raw stored HTML is an
 * XSS foot-gun regardless of who typed it — never bypass this.
 *
 * The email path does NOT use this: `sanitizeEmailHtml` in shared/utils/email.ts
 * is stricter (allow-list of attribute-less tags), because a mail client's HTML
 * rules are not a browser's.
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html) return ''
  // The app is client-only (ssr: false); guard anyway so this is never a no-op trap.
  if (import.meta.server) return ''
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    ADD_ATTR: ['target']
  })
}
