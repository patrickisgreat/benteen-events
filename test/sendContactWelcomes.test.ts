import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendContactWelcomes } from '../server/utils/email'

// Mock the Resend SDK so the real sendBatch runs without hitting the network — we
// drive what comes back per batch and assert how the welcome blast chunks and reports.
const { batchSend } = vi.hoisted(() => ({ batchSend: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    batch = { send: batchSend }
  }
}))

const mail = { subject: 'You\'re on the list', html: '<p>hi</p>', text: 'hi' }
const ok = (n: number) => ({ data: { data: Array.from({ length: n }, (_, i) => ({ id: `id-${i}` })) }, error: null })

const send = (recipients: string[], batchSize = 2) =>
  sendContactWelcomes({ apiKey: 'key', from: 'a@b.com', recipients, mail, batchSize, interBatchMs: 0 })

beforeEach(() => {
  batchSend.mockReset()
})

describe('sendContactWelcomes', () => {
  it('sends nothing and reports nothing when no one was newly added', async () => {
    expect(await send([])).toEqual({ sent: 0, failed: 0, error: null })
    expect(batchSend).not.toHaveBeenCalled()
  })

  it('sends the same welcome to every recipient in one batched request', async () => {
    batchSend.mockResolvedValue(ok(2))
    const result = await send(['a@x.com', 'b@x.com'])
    expect(result).toEqual({ sent: 2, failed: 0, error: null })
    expect(batchSend).toHaveBeenCalledTimes(1)
    expect(batchSend.mock.calls[0]![0]).toEqual([
      { from: 'a@b.com', to: 'a@x.com', bcc: undefined, subject: mail.subject, html: mail.html, text: mail.text, replyTo: undefined },
      { from: 'a@b.com', to: 'b@x.com', bcc: undefined, subject: mail.subject, html: mail.html, text: mail.text, replyTo: undefined }
    ])
  })

  it('chunks a large add into batches rather than one giant request', async () => {
    batchSend.mockResolvedValue(ok(2))
    const result = await send(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com'])
    expect(batchSend).toHaveBeenCalledTimes(3)
    expect(result.sent).toBe(5)
  })

  it('reports a failed batch instead of swallowing it', async () => {
    batchSend.mockResolvedValue({ data: null, error: { message: 'domain not verified' } })
    const result = await send(['a@x.com', 'b@x.com'])
    expect(result).toEqual({ sent: 0, failed: 2, error: 'domain not verified' })
  })

  it('keeps sending the remaining batches after one fails, and counts the partial', async () => {
    batchSend
      .mockResolvedValueOnce({ data: null, error: { message: 'rate limited' } })
      .mockResolvedValueOnce(ok(2))
    const result = await send(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'])
    expect(result).toEqual({ sent: 2, failed: 2, error: 'rate limited' })
  })

  it('sets the host\'s address as reply-to so replies reach a human', async () => {
    batchSend.mockResolvedValue(ok(1))
    await sendContactWelcomes({ apiKey: 'k', from: 'a@b.com', recipients: ['a@x.com'], mail, replyTo: 'host@x.com', interBatchMs: 0 })
    expect(batchSend.mock.calls[0]![0][0].replyTo).toBe('host@x.com')
  })
})
