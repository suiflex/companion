import type { ProviderId, Settings } from '@meetcc/shared';
import { CHATGPT_API_BASE, CLOUDCODE_ENDPOINT } from './oauth';

export interface CompletionRequest {
  system: string;
  user: string;
  /** ask the provider for JSON output when it supports enforcement */
  json?: boolean;
}

export interface AIClient {
  readonly provider: ProviderId;
  complete(req: CompletionRequest): Promise<string>;
}

export class AIError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'AIError';
  }
}

export interface ProviderPreset {
  label: string;
  baseUrl: string;
  model: string;
  needsKey: boolean;
  needsBaseUrl: boolean;
  /** Spends a subscription the user signs in to, so there is no key to paste. */
  needsSignIn?: boolean;
}

export const PROVIDER_PRESETS: Record<ProviderId, ProviderPreset> = {
  builtin: { label: 'Built-in (Chrome AI)', baseUrl: '', model: '', needsKey: false, needsBaseUrl: false },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', needsKey: true, needsBaseUrl: false },
  chatgpt: { label: 'ChatGPT (masuk dengan akun)', baseUrl: CHATGPT_API_BASE, model: 'gpt-5', needsKey: false, needsBaseUrl: false, needsSignIn: true },
  gemini: { label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.0-flash', needsKey: true, needsBaseUrl: false },
  'google-codeassist': { label: 'Google (masuk dengan akun)', baseUrl: CLOUDCODE_ENDPOINT, model: 'gemini-2.5-pro', needsKey: false, needsBaseUrl: false, needsSignIn: true },
  anthropic: { label: 'Claude (Anthropic)', baseUrl: 'https://api.anthropic.com', model: 'claude-haiku-4-5-20251001', needsKey: true, needsBaseUrl: false },
  ollama: { label: 'Ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.1', needsKey: false, needsBaseUrl: true },
  lmstudio: { label: 'LM Studio', baseUrl: 'http://localhost:1234/v1', model: '', needsKey: false, needsBaseUrl: true },
  azure: { label: 'Azure OpenAI', baseUrl: '', model: '', needsKey: true, needsBaseUrl: true },
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'anthropic/claude-haiku-4.5', needsKey: true, needsBaseUrl: false },
  custom: { label: 'Custom (OpenAI-compatible)', baseUrl: '', model: '', needsKey: false, needsBaseUrl: true },
};

export function resolveConfig(s: Settings): Settings {
  const preset = PROVIDER_PRESETS[s.provider];
  return {
    ...s,
    baseUrl: (s.baseUrl || preset.baseUrl).replace(/\/+$/, ''),
    model: s.model || preset.model,
  };
}

/** Validate settings before use; returns a human-readable problem or null. */
export function validateSettings(s: Settings): string | null {
  const preset = PROVIDER_PRESETS[s.provider];
  if (!preset) return `Provider tidak dikenal: ${s.provider}`;
  if (preset.needsKey && !s.apiKey.trim()) return `${preset.label} butuh API key.`;
  if (preset.needsSignIn && s.oauth.provider !== s.provider) {
    return `${preset.label} belum tersambung. Masuk dulu di Settings.`;
  }
  if (preset.needsBaseUrl && !s.baseUrl.trim() && !preset.baseUrl) {
    return `${preset.label} butuh Base URL.`;
  }
  const url = s.baseUrl || preset.baseUrl;
  if (url && !/^https?:\/\//.test(url)) return 'Base URL harus http(s)://';
  return null;
}
