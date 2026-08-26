import type { Settings } from '@meetcc/shared';
import { PROVIDER_PRESETS } from './client';
import { CHATGPT_ISSUER, CLOUDCODE_ENDPOINT } from './oauth';

/** Google's token endpoint host, where a refresh is spent. */
const GOOGLE_TOKEN_HOST = 'https://oauth2.googleapis.com';

// Roadmap §8.3 — an extension that can read every https site is a much bigger
// promise than this product needs. Capture is limited to the meeting hosts in
// the manifest; every other host (the AI provider, the issue tracker, the sync
// endpoint, speech-to-text, Google Calendar) is requested at runtime, only
// after the user has chosen it, and only for that exact origin.
//
// This lives next to the provider presets so there is one source of truth for
// where a given provider is reached.

/** `https://host/*` for a URL, or '' when the URL is unusable as a pattern. */
export function originPattern(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return '';
    return `${parsed.protocol}//${parsed.host}/*`;
  } catch {
    return '';
  }
}

/**
 * Every origin the current settings actually need. Nothing speculative: a
 * provider the user did not pick, or an integration they left blank, does not
 * appear here.
 */
export function requiredOrigins(settings: Settings): string[] {
  const urls: string[] = [];

  if (settings.provider !== 'builtin') {
    urls.push(settings.baseUrl || PROVIDER_PRESETS[settings.provider]?.baseUrl || '');
  }
  // A sign-in reaches its issuer as well as the completion host: the token has
  // to be refreshable in the background, not only at the moment the user
  // pressed the button.
  if (settings.oauth.provider === 'chatgpt') urls.push(CHATGPT_ISSUER);
  if (settings.oauth.provider === 'google-codeassist') {
    urls.push(GOOGLE_TOKEN_HOST, CLOUDCODE_ENDPOINT);
  }

  const { tracker, sync, transcription, calendarClientId } = settings.integrations;
  if (tracker.token && tracker.target) {
    urls.push(
      tracker.provider === 'jira'
        ? tracker.baseUrl
        : tracker.provider === 'linear'
          ? 'https://api.linear.app'
          : 'https://api.notion.com',
    );
  }
  if (sync.enabled) urls.push(sync.endpoint);
  if (transcription.endpoint) urls.push(transcription.endpoint);
  if (calendarClientId.trim()) urls.push('https://www.googleapis.com');

  return [...new Set(urls.map(originPattern).filter(Boolean))];
}
