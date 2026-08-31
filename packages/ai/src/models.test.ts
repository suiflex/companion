import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '@meetcc/shared';
import { PROVIDER_PRESETS } from './client';
import { listModels } from './models';

const s = (over: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...over });

/** Stub fetch and hand back the URL + headers it was called with. */
function answer(payload: unknown, ok = true, status = 200) {
  const spy = vi.fn(async () => ({
    ok,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe('listModels', () => {
  it('reads data[].id from an OpenAI-compatible catalogue', async () => {
    const spy = answer({ data: [{ id: 'gpt-4o' }, { id: 'gpt-4o-mini' }, { id: '' }] });
    expect(await listModels(s({ provider: 'openai', apiKey: 'k' }))).toEqual([
      'gpt-4o',
      'gpt-4o-mini',
    ]);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/models');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
  });

  it('sends no Authorization when there is no key', async () => {
    const spy = answer({ data: [{ id: 'llama3.1' }] });
    await listModels(s({ provider: 'ollama', baseUrl: 'http://localhost:11434/v1' }));
    const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('uses the Anthropic key header and version', async () => {
    const spy = answer({ data: [{ id: 'claude-haiku-4-5-20251001' }] });
    expect(await listModels(s({ provider: 'anthropic', apiKey: 'k' }))).toEqual([
      'claude-haiku-4-5-20251001',
    ]);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/models');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('k');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('strips the models/ prefix and keeps only generateContent models', async () => {
    answer({
      models: [
        { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
        { name: 'models/gemini-1.5-pro', supportedGenerationMethods: ['generateContent'] },
      ],
    });
    expect(await listModels(s({ provider: 'gemini', apiKey: 'k' }))).toEqual([
      'gemini-1.5-pro',
      'gemini-2.0-flash',
    ]);
  });

  it('falls back to the preset list for providers with no catalogue endpoint', async () => {
    const spy = answer({ data: [{ id: 'should-not-be-asked' }] });
    expect(await listModels(s({ provider: 'google-codeassist' }))).toEqual(
      PROVIDER_PRESETS['google-codeassist'].models,
    );
    expect(await listModels(s({ provider: 'chatgpt' }))).toEqual(PROVIDER_PRESETS.chatgpt.models);
    expect(await listModels(s({ provider: 'azure', apiKey: 'k', baseUrl: 'https://x' }))).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('throws on an error response instead of pretending the catalogue is empty', async () => {
    answer({ error: 'bad key' }, false, 401);
    await expect(listModels(s({ provider: 'openai', apiKey: 'nope' }))).rejects.toThrow(/401/);
  });

  it('tolerates a malformed payload', async () => {
    answer({ data: 'nope' });
    expect(await listModels(s({ provider: 'openai', apiKey: 'k' }))).toEqual([]);
  });
});
