import { describe, expect, it } from 'vitest'
import { formatDate, isSameDay, isUpcoming, toDate, toInputDate } from '../app/utils/datetime'

describe('toDate', () => {
  it('returns null for nullish or invalid input', () => {
    expect(toDate(null)).toBeNull()
    expect(toDate(undefined)).toBeNull()
    expect(toDate('not-a-date')).toBeNull()
  })

  it('parses an ISO timestamp string', () => {
    expect(toDate('2026-05-04T00:00:00.000Z')?.toISOString()).toBe('2026-05-04T00:00:00.000Z')
  })

  it('passes a Date through unchanged', () => {
    const now = new Date()
    expect(toDate(now)).toBe(now)
  })
})

describe('isSameDay', () => {
  it('is true for two times on the same calendar day', () => {
    expect(isSameDay(new Date(2026, 5, 15, 9), new Date(2026, 5, 15, 23))).toBe(true)
  })
  it('is false across a day boundary', () => {
    expect(isSameDay(new Date(2026, 5, 15), new Date(2026, 5, 16))).toBe(false)
  })
})

describe('toInputDate', () => {
  it('formats a Date as zero-padded YYYY-MM-DD', () => {
    expect(toInputDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('formatDate', () => {
  it('returns an empty string for nullish input', () => {
    expect(formatDate(null)).toBe('')
  })
  it('formats a valid ISO date', () => {
    expect(formatDate('2026-05-04T00:00:00.000Z')).not.toBe('')
  })
})

describe('isUpcoming', () => {
  it('is true for a future date and false for a past one', () => {
    expect(isUpcoming(new Date(Date.now() + 86_400_000).toISOString())).toBe(true)
    expect(isUpcoming(new Date(Date.now() - 86_400_000).toISOString())).toBe(false)
  })
})
