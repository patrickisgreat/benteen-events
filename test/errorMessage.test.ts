import { describe, expect, it } from 'vitest'
import { errorMessage } from '../shared/utils/errorMessage'

describe('errorMessage', () => {
  it('reads the message off an Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
  })

  it('reads the message off a Supabase/PostgREST-style error object', () => {
    expect(errorMessage({ message: 'row not found', code: 'PGRST116' })).toBe('row not found')
  })

  it('falls back when there is no usable message', () => {
    expect(errorMessage(null, 'nope')).toBe('nope')
    expect(errorMessage('a string', 'nope')).toBe('nope')
    expect(errorMessage({ message: '' }, 'nope')).toBe('nope')
    expect(errorMessage({ message: 42 }, 'nope')).toBe('nope')
  })

  it('uses a default fallback when none is given', () => {
    expect(errorMessage(undefined)).toBe('Something went wrong')
  })
})
