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
}

export const SPONSOR_LINKS: SponsorLink[] = [
  { id: 'github', url: 'https://github.com/sponsors/suiflex', label: 'sponsor.github' },
  // Left empty deliberately: the URL is not known here, and a guessed one is
  // worse than an absent button. Fill it in and the button appears.
  { id: 'saweria', url: '', label: 'sponsor.saweria' },
]

export const activeSponsorLinks = (): SponsorLink[] => SPONSOR_LINKS.filter((l) => l.url)
