import {
  DEFAULT_INVITE_OPTIONS,
  INVITE_ACCENTS,
  INVITE_THEMES,
  type InviteAccent,
  type InviteOptions,
  type InviteTheme
} from '#shared/types/invite-options'

/** Coerce a stored (untyped jsonb) value into valid InviteOptions, filling any
 *  missing/invalid field from the defaults. Never throws. */
export function normalizeInviteOptions(raw: unknown): InviteOptions {
  const o = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const theme = INVITE_THEMES.includes(o.theme as InviteTheme) ? o.theme as InviteTheme : DEFAULT_INVITE_OPTIONS.theme
  const accent = INVITE_ACCENTS.includes(o.accent as InviteAccent) ? o.accent as InviteAccent : DEFAULT_INVITE_OPTIONS.accent
  return {
    theme,
    accent,
    message: typeof o.message === 'string' ? o.message : '',
    showCover: typeof o.showCover === 'boolean' ? o.showCover : DEFAULT_INVITE_OPTIONS.showCover,
    showDetails: typeof o.showDetails === 'boolean' ? o.showDetails : DEFAULT_INVITE_OPTIONS.showDetails
  }
}
