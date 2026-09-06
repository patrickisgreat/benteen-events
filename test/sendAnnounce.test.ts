import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the Resend SDK's single-send endpoint (sendAnnounce → sendEmail → emails.send).
const { emailSend } = vi.hoisted(() => ({ emailSend: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: emailSend }
  }
}))

const { sendAnnounce } = await import('../server/utils/email')

const params = { subject: 's', html: '<p>h</p>', text: 't' }
const recipients = (n: number): string[] => Array.from({ length: n }, (_, i) => `u${i}@x.com`)
// Skip the inter-group delay so tests don't actually wait.
const opts = { interBatchMs: 0 }

beforeEach(() => {
  emailSend.mockReset()
  emailSend.mockResolvedValue({ data: { id: 're_1' }, error: null })
})

describe('sendAnnounce', () => {
  it('BCCs recipients in groups of 49 so every send stays within Resend\'s 50-recipient cap', async () => {
    const res = await sendAnnounce('key', 'from@x', params, recipients(120), opts)
    expect(emailSend).toHaveBeenCalledTimes(3)
    const sends = emailSend.mock.calls.map(c => c[0] as { to: string, bcc: string[] })
    expect(sends.map(s => s.bcc.length)).toEqual([49, 49, 22])
    // The `to` takes one slot, so to + bcc must never exceed 50 (the off-by-one that
    // made full groups fail and only delivered the leftover).
    for (const s of sends) expect(1 + s.bcc.length).toBeLessThanOrEqual(50)
    expect(res).toEqual({ sent: 120, failed: 0, error: null })
  })

  it('sends a single group untouched when under the cap', async () => {
    const res = await sendAnnounce('key', 'from@x', params, recipients(10), opts)
    expect(emailSend).toHaveBeenCalledTimes(1)
    expect(res.sent).toBe(10)
  })

  it('continues past a failed group and reports partial delivery (not a total failure)', async () => {
    emailSend
      .mockResolvedValueOnce({ data: { id: 're_1' }, error: null }) // group 1 (49) ok
      .mockRejectedValueOnce(new Error('Too many recipients')) // group 2 (49) fails
      .mockResolvedValueOnce({ data: { id: 're_3' }, error: null }) // group 3 (22) ok
    const res = await sendAnnounce('key', 'from@x', params, recipients(120), opts)
    expect(res).toEqual({ sent: 71, failed: 49, error: 'Too many recipients' })
  })

  it('sends nothing for an empty recipient list', async () => {
    const res = await sendAnnounce('key', 'from@x', params, [], opts)
    expect(emailSend).not.toHaveBeenCalled()
    expect(res).toEqual({ sent: 0, failed: 0, error: null })
  })
})
