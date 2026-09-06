import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Verifies a Svix-style webhook signature (the scheme Resend uses). The signed
 * content is `${id}.${timestamp}.${body}`, HMAC-SHA256'd with the secret (the
 * base64 portion after the `whsec_` prefix) and base64-encoded. The signature
 * header is a space-separated list of `v1,<sig>` entries; any match passes.
 */
export function verifySvixSignature(opts: {
  secret: string
  id: string
  timestamp: string
  body: string
  signatureHeader: string
}): boolean {
  if (!opts.secret || !opts.id || !opts.timestamp || !opts.signatureHeader) return false
  const key = Buffer.from(opts.secret.replace(/^whsec_/, ''), 'base64')
  const expected = Buffer.from(
    createHmac('sha256', key).update(`${opts.id}.${opts.timestamp}.${opts.body}`).digest('base64')
  )
  return opts.signatureHeader.split(' ').some((part) => {
    const sig = part.split(',')[1]
    if (!sig) return false
    const sigBuf = Buffer.from(sig)
    return sigBuf.length === expected.length && timingSafeEqual(sigBuf, expected)
  })
}

/** Maps a Resend webhook event type to the event_invites column it stamps. */
export const RESEND_EVENT_COLUMN: Record<string, 'delivered_at' | 'opened_at' | 'clicked_at' | 'bounced_at'> = {
  'email.delivered': 'delivered_at',
  'email.opened': 'opened_at',
  'email.clicked': 'clicked_at',
  'email.bounced': 'bounced_at'
}
