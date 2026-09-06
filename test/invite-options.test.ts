import { describe, expect, it } from 'vitest'
import { normalizeInviteOptions } from '../shared/utils/invite-options'
import { DEFAULT_INVITE_OPTIONS } from '../shared/types/invite-options'

describe('normalizeInviteOptions', () => {
  it('falls back to the defaults for null (an event that was never designed)', () => {
    expect(normalizeInviteOptions(null)).toEqual(DEFAULT_INVITE_OPTIONS)
  })

  it('never throws on junk from the untyped jsonb column', () => {
    expect(normalizeInviteOptions('nonsense')).toEqual(DEFAULT_INVITE_OPTIONS)
    expect(normalizeInviteOptions(42)).toEqual(DEFAULT_INVITE_OPTIONS)
    expect(normalizeInviteOptions([])).toEqual(DEFAULT_INVITE_OPTIONS)
  })

  it('keeps valid values', () => {
    expect(normalizeInviteOptions({ theme: 'neon', accent: 'violet', message: 'hi', showCover: false, showDetails: false }))
      .toEqual({ theme: 'neon', accent: 'violet', message: 'hi', showCover: false, showDetails: false })
  })

  it('replaces an unknown theme or accent with the default, keeping the rest', () => {
    expect(normalizeInviteOptions({ theme: 'hologram', accent: 'chartreuse', message: 'keep me' }))
      .toEqual({ ...DEFAULT_INVITE_OPTIONS, message: 'keep me' })
  })

  it('fills each missing field independently rather than discarding the whole object', () => {
    expect(normalizeInviteOptions({ theme: 'classic' }))
      .toEqual({ ...DEFAULT_INVITE_OPTIONS, theme: 'classic' })
  })

  it('treats a non-boolean toggle as unset, so a stale string cannot force it on', () => {
    expect(normalizeInviteOptions({ showCover: 'false' }).showCover).toBe(DEFAULT_INVITE_OPTIONS.showCover)
  })
})
