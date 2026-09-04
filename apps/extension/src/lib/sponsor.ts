// Where the sponsor links point.
//
// Kept in step with apps/desktop/src/sponsor.ts by hand, for the reason the
// theme and language modules record: the two apps share no runtime.
//
// The message key travels with the link rather than being built from the id:
// a template-literal key cannot be checked against the catalogue, and an
// unchecked key is exactly what the catalogue guard exists to prevent.
//
// A blank URL hides its button rather than shipping a dead link.
import type { MessageKey } from '@meetcc/shared/i18n'

export interface SponsorLink {
  id: string
  url: string
  label: MessageKey
  /** One glyph per destination — two identical hearts name neither of them. */
  icon: string
}

export const SPONSOR_LINKS: SponsorLink[] = [
  { id: 'github', url: 'https://github.com/sponsors/suiflex', label: 'sponsor.github', icon: '♥' },
  { id: 'saweria', url: 'https://saweria.co/suiflex', label: 'sponsor.saweria', icon: '☕' },
]

export const activeSponsorLinks = (): SponsorLink[] => SPONSOR_LINKS.filter((l) => l.url)
