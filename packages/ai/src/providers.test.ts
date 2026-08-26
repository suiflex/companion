import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '@meetcc/shared';
import { AIError } from './client';
import { createClient } from './providers';

const REQ = { system: 'sys', user: 'usr', json: true };

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: any;
}

function stubFetch(response: unknown, status = 200): Captured {
  const captured: Captured = { url: '', headers: {}, body: null };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      captured.url = url;
      captured.headers = init.headers as Record<string, string>;
      captured.body = JSON.parse(init.body as string);
      return new Response(JSON.stringify(response), { status });
    }),
  );
  return captured;
}

const s = (over: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...over });
const OPENAI_OK = { choices: [{ message: { content: 'halo' } }] };

afterEach(() => vi.unstubAllGlobals());

describe('openai-compatible wire format', () => {
  it('openai: bearer auth, /chat/completions, response_format json', async () => {
    const cap = stubFetch(OPENAI_OK);
    const out = await createClient(s({ provider: 'openai', apiKey: 'sk-x' })).complete(REQ);
    expect(out).toBe('halo');
    expect(cap.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(cap.headers.Authorization).toBe('Bearer sk-x');
    expect(cap.body.response_format).toEqual({ type: 'json_object' });
    expect(cap.body.messages[0]).toEqual({ role: 'system', content: 'sys' });
  });

  it('ollama: no auth header, no response_format, custom base url', async () => {
    const cap = stubFetch(OPENAI_OK);
    await createClient(s({ provider: 'ollama', model: 'llama3.1' })).complete(REQ);
    expect(cap.url).toBe('http://localhost:11434/v1/chat/completions');
    expect(cap.headers.Authorization).toBeUndefined();
    expect(cap.body.response_format).toBeUndefined();
  });

  it('azure: deployment path + api-key header + api-version', async () => {
    const cap = stubFetch(OPENAI_OK);
    await createClient(
      s({ provider: 'azure', apiKey: 'az', baseUrl: 'https://r.openai.azure.com', model: 'gpt4o' }),
    ).complete(REQ);
    expect(cap.url).toContain('https://r.openai.azure.com/openai/deployments/gpt4o/chat/completions');
    expect(cap.url).toContain('api-version=');
    expect(cap.headers['api-key']).toBe('az');
  });
});

describe('anthropic / gemini wire format', () => {
  it('anthropic: x-api-key, version, browser-access headers, system top-level', async () => {
    const cap = stubFetch({ content: [{ text: 'ok' }] });
    const out = await createClient(s({ provider: 'anthropic', apiKey: 'ak' })).complete(REQ);
    expect(out).toBe('ok');
    expect(cap.url).toBe('https://api.anthropic.com/v1/messages');
    expect(cap.headers['x-api-key']).toBe('ak');
    expect(cap.headers['anthropic-version']).toBeTruthy();
    expect(cap.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(cap.body.system).toBe('sys');
  });

  it('gemini: key header, generateContent path, json mime', async () => {
    const cap = stubFetch({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] });
    await createClient(s({ provider: 'gemini', apiKey: 'gk' })).complete(REQ);
    expect(cap.url).toContain(':generateContent');
    expect(cap.headers['x-goog-api-key']).toBe('gk');
    expect(cap.body.generationConfig.responseMimeType).toBe('application/json');
  });
});

describe('SSE-always proxies (e.g. custom gateway)', () => {
  it('joins delta chunks when server streams despite stream:false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          [
            'data: {"choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}',
            'data: {"choices":[{"index":0,"delta":{"content":"Hal"},"finish_reason":null}]}',
            ': keepalive-comment',
            'data: {"choices":[{"index":0,"delta":{"content":"o"},"finish_reason":"stop"}]}',
            'data: [DONE]',
            '',
          ].join('\n\n'),
          { status: 200, headers: { 'content-type': 'text/event-stream' } },
        ),
      ),
    );
    const out = await createClient(
      s({ provider: 'custom', baseUrl: 'https://gw.example/v1', model: 'ag/x' }),
    ).complete(REQ);
    expect(out).toBe('Halo');
  });

  it('sends stream:false and treats empty stream as retryable error', async () => {
    const cap = stubFetch(OPENAI_OK);
    await createClient(s({ provider: 'custom', baseUrl: 'https://gw.example/v1' })).complete(REQ);
    expect(cap.body.stream).toBe(false);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('data: [DONE]\n', {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
      ),
    );
    await expect(
      createClient(s({ provider: 'custom', baseUrl: 'https://gw.example/v1' })).complete(REQ),
    ).rejects.toMatchObject({ retryable: true });
  });
});

describe('error mapping', () => {
  it('429/5xx retryable, 401 not, network error retryable', async () => {
    const client = () => createClient(s({ provider: 'openai', apiKey: 'k' }));
    stubFetch({}, 429);
    await expect(client().complete(REQ)).rejects.toMatchObject({ retryable: true });
    stubFetch({}, 500);
    await expect(client().complete(REQ)).rejects.toMatchObject({ retryable: true });
    stubFetch({}, 401);
    await expect(client().complete(REQ)).rejects.toMatchObject({ retryable: false });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    await expect(client().complete(REQ)).rejects.toThrow(/Network error/);
  });

  it('empty completion is a retryable AIError', async () => {
    stubFetch({ choices: [] });
    await expect(
      createClient(s({ provider: 'openai', apiKey: 'k' })).complete(REQ),
    ).rejects.toBeInstanceOf(AIError);
  });

  it('builtin without browser support fails with clear non-retryable error', async () => {
    await expect(createClient(s({ provider: 'builtin' })).complete(REQ)).rejects.toMatchObject({
      retryable: false,
    });
  });
});

describe('subscription sign-ins', () => {
  const signedIn = (provider: 'chatgpt' | 'google-codeassist', over = {}) =>
    s({
      provider,
      oauth: { ...DEFAULT_SETTINGS.oauth, provider, accessToken: 'tok', ...over },
    });

  it('chatgpt: /responses with instructions and input items, not messages', async () => {
    const cap = stubFetch({
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'halo' }] }],
    });
    const out = await createClient(signedIn('chatgpt', { accountId: 'acc_1' })).complete(REQ);

    expect(out).toBe('halo');
    expect(cap.url).toBe('https://chatgpt.com/backend-api/codex/responses');
    expect(cap.headers.Authorization).toBe('Bearer tok');
    expect(cap.headers['chatgpt-account-id']).toBe('acc_1');
    expect(cap.body.instructions).toBe('sys');
    expect(cap.body.messages).toBeUndefined();
    expect(cap.body.input[0].content[0]).toEqual({ type: 'input_text', text: 'usr' });
  });

  it('chatgpt: reads a stream even though the request asked for one body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            'data: {"type":"response.output_text.delta","delta":"ha"}\n' +
              'data: {"type":"response.completed"}\n' +
              'data: {"type":"response.output_text.delta","delta":"lo"}\n',
            { status: 200 },
          ),
      ),
    );
    expect(await createClient(signedIn('chatgpt')).complete(REQ)).toBe('halo');
  });

  it('code assist: gemini request wrapped in the project envelope', async () => {
    const cap = stubFetch({
      response: { candidates: [{ content: { parts: [{ text: 'halo' }] } }] },
    });
    const out = await createClient(
      signedIn('google-codeassist', { projectId: 'proj-1' }),
    ).complete(REQ);

    expect(out).toBe('halo');
    expect(cap.url).toBe('https://cloudcode-pa.googleapis.com/v1internal:generateContent');
    expect(cap.body.project).toBe('proj-1');
    expect(cap.body.request.systemInstruction.parts[0].text).toBe('sys');
    expect(cap.body.request.generationConfig.responseMimeType).toBe('application/json');
  });

  it('code assist: accepts a body the backend already unwrapped', async () => {
    stubFetch({ candidates: [{ content: { parts: [{ text: 'halo' }] } }] });
    expect(await createClient(signedIn('google-codeassist')).complete(REQ)).toBe('halo');
  });
});
