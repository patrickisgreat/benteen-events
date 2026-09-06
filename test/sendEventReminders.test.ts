import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock Resend's batch endpoint (each reminder is a distinct token email → sendBatch).
const { batchSend } = vi.hoisted(() => ({ batchSend: vi.fn() }))
vi.mock('resend', () => ({
  Resend: class {
    batch = { send: batchSend }
  }
}))

const { sendEventReminders } = await import('../server/utils/email')

// Minimal db stub recording the reminded_at stamps.
const updates: Array<{ patch: Record<string, unknown>, ids: string[] }> = []
const db = {
  from() {
    return {
      update: (patch: Record<string, unknown>) => ({
        in: (_col: string, ids: string[]) => {
          updates.push({ patch, ids })
          return Promise.resolve({ error: null })
        }
      })
    }
  }
} as never

const invite = (id: string): { id: string, email: string, token: string } => ({ id, email: `${id}@x.com`, token: `tok-${id}` })
const brand = { name: 'Wren Street Supper Club', tagline: 'Come hungry.' }
const baseOpts = {
  apiKey: 'key', from: 'from@x', eventTitle: 'Cookout', eventDate: 'Friday',
  daysLeft: 3, origin: 'https://x', brand, interBatchMs: 0
}

beforeEach(() => {
  batchSend.mockReset()
  updates.length = 0
})

describe('sendEventReminders', () => {
  it('sends a distinct token reminder per invite and stamps reminded_at on the ones sent', async () => {
    batchSend.mockResolvedValue({ data: { data: [{ id: 're_1' }, { id: 're_2' }] }, error: null })
    const res = await sendEventReminders(db, { ...baseOpts, invites: [invite('a'), invite('b')] })
    expect(batchSend).toHaveBeenCalledTimes(1)
    const items = batchSend.mock.calls[0]![0] as Array<{ to: string, html: string }>
    expect(items[0]!.to).toBe('a@x.com')
    expect(items[0]!.html).toContain('https://x/rsvp?token=tok-a')
    expect(updates).toEqual([{ patch: expect.objectContaining({ reminded_at: expect.any(String) }), ids: ['a', 'b'] }])
    expect(res).toEqual({ sent: 2, failed: 0, error: null })
  })

  it('only stamps invites Resend accepted (a null id = not sent)', async () => {
    batchSend.mockResolvedValue({ data: { data: [{ id: 're_1' }, null] }, error: null })
    const res = await sendEventReminders(db, { ...baseOpts, invites: [invite('a'), invite('b')] })
    expect(updates[0]!.ids).toEqual(['a'])
    expect(res).toEqual({ sent: 1, failed: 1, error: null })
  })

  it('reports a failed batch without stamping, and keeps going', async () => {
    batchSend.mockRejectedValue(new Error('Unverified domain'))
    const res = await sendEventReminders(db, { ...baseOpts, invites: [invite('a')] })
    expect(updates).toHaveLength(0)
    expect(res).toEqual({ sent: 0, failed: 1, error: 'Unverified domain' })
  })

  it('does nothing when there are no non-responders', async () => {
    const res = await sendEventReminders(db, { ...baseOpts, invites: [] })
    expect(batchSend).not.toHaveBeenCalled()
    expect(res).toEqual({ sent: 0, failed: 0, error: null })
  })
})
