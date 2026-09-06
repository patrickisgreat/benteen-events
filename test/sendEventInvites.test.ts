import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendEventInvites } from '../server/utils/email'

// Mock the Resend SDK so the real sendBatch runs without hitting the network — we
// drive what message ids (or errors) come back per batch and assert how the
// orchestration chunks, paces, and stamps.
const { batchSend } = vi.hoisted(() => ({ batchSend: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    batch = { send: batchSend }
  }
}))

type Row = Record<string, unknown>
interface UpsertCall { rows: Row[], opts: Record<string, unknown> }

// A test double for the RLS-scoped Supabase client: only the
// `.from('event_invites').upsert()` surface sendEventInvites touches.
function makeFakeDb(errors: { stampError?: string } = {}) {
  const calls = { stamp: [] as UpsertCall[] }
  const from = (table: string) => ({
    upsert: (rows: Row[], opts: Record<string, unknown>) => {
      if (table !== 'event_invites') throw new Error(`unexpected table ${table}`)
      calls.stamp.push({ rows, opts })
      return Promise.resolve({ error: errors.stampError ? { message: errors.stampError } : null })
    }
  })
  // Cast at this test boundary: sendEventInvites only uses `.from().upsert()`.
  return { db: { from } as unknown as Parameters<typeof sendEventInvites>[0], calls }
}

const recipient = (id: string, email: string) => ({
  id,
  email,
  token: `tok-${id}`,
  displayName: null,
  subject: 'You are invited',
  html: `<p>${email}</p>`,
  text: email
})

const baseOpts = {
  apiKey: 'key',
  from: 'events@host',
  replyTo: 'host@x',
  eventId: 'evt-1',
  interBatchMs: 0 // no real delay between batches in tests
}

const okWith = (...ids: string[]) => ({ data: { data: ids.map(id => ({ id })) }, error: null })

beforeEach(() => {
  batchSend.mockReset()
  // The failure paths log deliberately (never swallow) — quiet them here.
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('sendEventInvites', () => {
  it('sends one batch and stamps every row in a SINGLE upsert', async () => {
    batchSend.mockResolvedValue(okWith('re_a', 're_b'))
    const { db, calls } = makeFakeDb()

    const res = await sendEventInvites(db, { ...baseOpts, recipients: [recipient('1', 'a@x'), recipient('2', 'b@x')] })

    expect(batchSend).toHaveBeenCalledTimes(1)
    // One upsert carries both rows — not one update per recipient.
    expect(calls.stamp).toHaveLength(1)
    expect(calls.stamp[0]!.rows).toHaveLength(2)
    expect(calls.stamp[0]!.opts).toEqual({ onConflict: 'id' })
    expect(res).toEqual({ sent: 2, failed: 0, error: null })
  })

  it('sends one distinct email per guest, so each carries its own token link', async () => {
    batchSend.mockResolvedValue(okWith('re_a', 're_b'))
    const { db } = makeFakeDb()

    await sendEventInvites(db, { ...baseOpts, recipients: [recipient('1', 'a@x'), recipient('2', 'b@x')] })

    const items = batchSend.mock.calls[0]![0] as Array<{ to: string, html: string }>
    expect(items.map(i => i.to)).toEqual(['a@x', 'b@x'])
  })

  it('stamps each row with its positionally-aligned Resend id and one shared sent_at', async () => {
    batchSend.mockResolvedValue(okWith('re_a', 're_b'))
    const { db, calls } = makeFakeDb()

    await sendEventInvites(db, { ...baseOpts, recipients: [recipient('1', 'a@x'), recipient('2', 'b@x')] })

    expect(calls.stamp[0]!.rows[0]).toMatchObject({ id: '1', event_id: 'evt-1', email: 'a@x', token: 'tok-1', resend_id: 're_a' })
    expect(calls.stamp[0]!.rows[1]).toMatchObject({ id: '2', event_id: 'evt-1', email: 'b@x', token: 'tok-2', resend_id: 're_b' })
    expect(calls.stamp[0]!.rows[0]!.sent_at).toBe(calls.stamp[0]!.rows[1]!.sent_at)
  })

  it('stores a null resend_id when Resend returned no id for that recipient', async () => {
    batchSend.mockResolvedValue(okWith('re_a')) // one id for two recipients
    const { db, calls } = makeFakeDb()

    await sendEventInvites(db, { ...baseOpts, recipients: [recipient('1', 'a@x'), recipient('2', 'b@x')] })

    expect(calls.stamp[0]!.rows[0]!.resend_id).toBe('re_a')
    expect(calls.stamp[0]!.rows[1]!.resend_id).toBeNull()
  })

  it('splits a list larger than the batch size into multiple Resend requests', async () => {
    batchSend.mockResolvedValue(okWith('re'))
    const { db, calls } = makeFakeDb()

    const res = await sendEventInvites(db, {
      ...baseOpts,
      batchSize: 2,
      recipients: [recipient('1', 'a@x'), recipient('2', 'b@x'), recipient('3', 'c@x')]
    })

    expect(batchSend).toHaveBeenCalledTimes(2)
    expect(calls.stamp).toHaveLength(2)
    expect(calls.stamp[0]!.rows).toHaveLength(2)
    expect(calls.stamp[1]!.rows).toHaveLength(1)
    expect(res.sent).toBe(3)
  })

  it('counts a Resend-rejected batch as failed, surfaces the reason, and never stamps it', async () => {
    batchSend
      .mockResolvedValueOnce({ data: null, error: { message: 'domain not verified' } }) // batch 1 fails
      .mockResolvedValueOnce(okWith('re')) // batch 2 succeeds
    const { db, calls } = makeFakeDb()

    const res = await sendEventInvites(db, {
      ...baseOpts,
      batchSize: 1,
      recipients: [recipient('1', 'a@x'), recipient('2', 'b@x')]
    })

    expect(res).toEqual({ sent: 1, failed: 1, error: 'domain not verified' })
    // Only the surviving batch was stamped, so the failed one retries later.
    expect(calls.stamp).toHaveLength(1)
    expect(calls.stamp[0]!.rows[0]!.id).toBe('2')
  })

  it('flags a batch as failed when the email sent but the stamp failed (the at-least-once gap)', async () => {
    batchSend.mockResolvedValue(okWith('re_a'))
    const { db } = makeFakeDb({ stampError: 'db unavailable' })

    const res = await sendEventInvites(db, { ...baseOpts, recipients: [recipient('1', 'a@x')] })

    expect(res.sent).toBe(0)
    expect(res.failed).toBe(1)
    expect(res.error).toContain('could not record delivery')
  })

  it('does nothing for an empty recipient list', async () => {
    const { db, calls } = makeFakeDb()

    const res = await sendEventInvites(db, { ...baseOpts, recipients: [] })

    expect(batchSend).not.toHaveBeenCalled()
    expect(calls.stamp).toHaveLength(0)
    expect(res).toEqual({ sent: 0, failed: 0, error: null })
  })

  it('waits between batches so a multi-batch blast stays under the rate limit', async () => {
    vi.useFakeTimers()
    try {
      batchSend.mockResolvedValue(okWith('re'))
      const { db } = makeFakeDb()

      const pending = sendEventInvites(db, {
        ...baseOpts,
        batchSize: 1,
        interBatchMs: 250,
        recipients: [recipient('1', 'a@x'), recipient('2', 'b@x')]
      })

      await vi.advanceTimersByTimeAsync(0)
      expect(batchSend).toHaveBeenCalledTimes(1) // first batch out, second parked on the gap

      await vi.advanceTimersByTimeAsync(250)
      await pending
      expect(batchSend).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
