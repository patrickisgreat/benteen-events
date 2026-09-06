/** Customization for an event's e-vite email (the Evite-style editor). Stored as
 *  jsonb on `events.invite_options`; always read through `normalizeInviteOptions`
 *  so missing/old values fall back to the defaults. */

export const INVITE_THEMES = ['marquee', 'neon', 'classic'] as const
export type InviteTheme = (typeof INVITE_THEMES)[number]

export const INVITE_ACCENTS = ['green', 'red', 'amber', 'violet', 'sky'] as const
export type InviteAccent = (typeof INVITE_ACCENTS)[number]

export interface InviteOptions {
  theme: InviteTheme
  accent: InviteAccent
  /** A personal note from the host, shown in the e-vite body. */
  message: string
  /** Show the event's cover image as the e-vite hero. */
  showCover: boolean
  /** Show the when/where detail block. */
  showDetails: boolean
}

export const DEFAULT_INVITE_OPTIONS: InviteOptions = {
  theme: 'marquee',
  accent: 'green',
  message: '',
  showCover: true,
  showDetails: true
}
