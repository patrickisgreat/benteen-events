/** A reusable announcement template for the admin Comms tab. */
export interface CommsTemplate {
  id: string
  name: string
  /** Optional prefilled email subject; null keeps whatever the admin typed. */
  subject: string | null
  /** Rich HTML for the composer's editor (re-sanitized server-side at send time). */
  body: string
}
