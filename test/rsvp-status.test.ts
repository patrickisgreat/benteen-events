import { describe, expect, it } from 'vitest'
import { RSVP_STATUSES, isRsvpStatus, toRsvpStatus } from '../shared/types/rsvp'

describe('isRsvpStatus', () => {
  it('accepts every value in the canonical set', () => {
    for (const status of RSVP_STATUSES) expect(isRsvpStatus(status)).toBe(true)
  })

  it('rejects anything outside the set', () => {
    expect(isRsvpStatus('attending')).toBe(false)
    expect(isRsvpStatus('Going')).toBe(false) // case-sensitive: DB stores the lowercase enum
    expect(isRsvpStatus('')).toBe(false)
  })
})

describe('toRsvpStatus', () => {
  it('narrows a valid DB value to RsvpStatus', () => {
    expect(toRsvpStatus('going')).toBe('going')
    expect(toRsvpStatus('maybe')).toBe('maybe')
    expect(toRsvpStatus('no')).toBe('no')
  })

  it('throws on schema drift rather than silently coercing (what `as` would hide)', () => {
    expect(() => toRsvpStatus('definitely')).toThrowError(/Unexpected RSVP status/)
  })
})
