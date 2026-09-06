import { describe, expect, it } from 'vitest'
import { commsStatus } from '../shared/utils/comms'

describe('commsStatus', () => {
  it('is "sent" when everything went out', () => {
    expect(commsStatus(5, 0)).toBe('sent')
  })

  it('is "partial" when some went out and some failed', () => {
    expect(commsStatus(3, 2)).toBe('partial')
  })

  it('is "failed" when nothing went out', () => {
    expect(commsStatus(0, 4)).toBe('failed')
  })

  it('treats a no-op (nothing attempted) as sent, not failed', () => {
    expect(commsStatus(0, 0)).toBe('sent')
  })
})
