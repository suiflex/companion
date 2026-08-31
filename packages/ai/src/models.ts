import type { Settings } from '@meetcc/shared';
import { AIError, PROVIDER_PRESETS, resolveConfig } from './client';
import { fetchWithTimeout } from './providers';

/**
 * Model names the user can pick from for these settings.
 *
 * The Model field is free text and stays that way — Azure deployments and
 * custom gateways carry names no endpoint can enumerate. This only removes the
 * guessing: a provider that publishes its catalogue gets asked, and one that
 * does not falls back to the preset's hand-kept list.
 *
 * Pure: no `chrome.*`, no storage. The caller is responsible for having the
 * host permission before this reaches the network.
 */
export async function listModels(settings: Settings): Promise<string[]> {
  const cfg = resolveConfig(settings);
  const preset = PROVIDER_PRESETS[cfg.provider];
  const fallback = preset?.models ?? [];

  switch (cfg.provider) {
    // No public listing endpoint: the subscription backends serve completions
    // only, and an Azure deployment name is whatever the user typed in Azure.
    case 'builtin':
    case 'chatgpt':
    case 'google-codeassist':
    case 'azure':
      return fallback;

    case 'anthropic':
      return ids(
        await get(`${cfg.baseUrl}/v1/models`, {
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        }),
      );

    case 'gemini':
      return sorted(
        toArray(
          (await get(`${cfg.baseUrl}/models?pageSize=200`, { 'x-goog-api-key': cfg.apiKey })).models,
        )
          .filter((m) => methodsOf(m).includes('generateContent'))
          .map((m) => String(m.name ?? '').replace(/^models\//, '')),
      );

    // OpenAI wire format: openai, openrouter, ollama, lmstudio, custom.
    default:
      return ids(
        await get(
          `${cfg.baseUrl}/models`,
          cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {},
        ),
      );
  }
}

async function get(url: string, headers: Record<string, string>): Promise<any> {
  const res = await fetchWithTimeout(url, { method: 'GET', headers });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 200);
    throw new AIError(`HTTP ${res.status}: ${text}`, res.status === 429 || res.status >= 500);
  }
  return res.json();
}

function toArray(raw: unknown): Record<string, unknown>[] {
  return Array.isArray(raw) ? (raw.filter((m) => m && typeof m === 'object') as Record<string, unknown>[]) : [];
}

function methodsOf(m: Record<string, unknown>): string[] {
  const raw = m.supportedGenerationMethods;
  return Array.isArray(raw) ? raw.map(String) : [];
}

function ids(payload: any): string[] {
  return sorted(toArray(payload?.data).map((m) => String(m.id ?? '')));
}

/** ponytail: no filtering by name — the datalist narrows as the user types, and
 *  a hand-written "which of these is a chat model" rule would rot immediately. */
function sorted(names: string[]): string[] {
  return [...new Set(names.filter(Boolean))].sort();
}
