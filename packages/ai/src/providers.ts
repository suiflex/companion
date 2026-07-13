import type { Settings } from '@meetcc/shared';
import { AIError, resolveConfig, type AIClient, type CompletionRequest } from './client';

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new AIError(`Network error: ${(e as Error).message}`, true);
  }
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    // 429/5xx are transient; 4xx config errors are not
    throw new AIError(`HTTP ${res.status}: ${text}`, res.status === 429 || res.status >= 500);
  }
  return res.json();
}

/** Some proxies answer chat/completions with an SSE stream even when
 *  stream:false — join the delta chunks back into one string. */
export function parseSSEContent(text: string): string {
  let out = '';
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const payload = t.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const chunk = JSON.parse(payload);
      out +=
        chunk.choices?.[0]?.delta?.content ??
        chunk.choices?.[0]?.message?.content ??
        '';
    } catch {
      /* keepalive / comment line */
    }
  }
  return out;
}

/** chat/completions call tolerant to both JSON and SSE-stream responses. */
async function chatCompletions(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new AIError(`Network error: ${(e as Error).message}`, true);
  }
  const text = await res.text();
  if (!res.ok) {
    throw new AIError(
      `HTTP ${res.status}: ${text.slice(0, 300)}`,
      res.status === 429 || res.status >= 500,
    );
  }
  const isSSE =
    res.headers.get('content-type')?.includes('event-stream') ||
    text.trimStart().startsWith('data:');
  if (isSSE) {
    const joined = parseSSEContent(text);
    if (!joined) throw new AIError('Empty completion', true);
    return joined;
  }
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new AIError(`Respons bukan JSON: ${text.slice(0, 120)}`, true);
  }
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content) throw new AIError('Empty completion', true);
  return content;
}

/** OpenAI / Ollama / LM Studio / OpenRouter / Custom — one wire format. */
function openAICompatible(cfg: Settings): AIClient {
  return {
    provider: cfg.provider,
    complete: (req: CompletionRequest) =>
      chatCompletions(
        `${cfg.baseUrl}/chat/completions`,
        cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {},
        {
          model: cfg.model,
          temperature: 0.2,
          stream: false,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
          ...(req.json && (cfg.provider === 'openai' || cfg.provider === 'openrouter')
            ? { response_format: { type: 'json_object' } }
            : {}),
        },
      ),
  };
}

function azure(cfg: Settings): AIClient {
  return {
    provider: 'azure',
    complete: (req: CompletionRequest) =>
      chatCompletions(
        `${cfg.baseUrl}/openai/deployments/${encodeURIComponent(cfg.model)}` +
          `/chat/completions?api-version=2024-06-01`,
        { 'api-key': cfg.apiKey },
        {
          temperature: 0.2,
          stream: false,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
        },
      ),
  };
}

function anthropic(cfg: Settings): AIClient {
  return {
    provider: 'anthropic',
    async complete(req: CompletionRequest) {
      const data = await post(
        `${cfg.baseUrl}/v1/messages`,
        {
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        {
          model: cfg.model,
          max_tokens: 4096,
          system: req.system,
          messages: [{ role: 'user', content: req.user }],
        },
      );
      const text = data.content?.[0]?.text;
      if (typeof text !== 'string') throw new AIError('Empty completion', true);
      return text;
    },
  };
}

function gemini(cfg: Settings): AIClient {
  return {
    provider: 'gemini',
    async complete(req: CompletionRequest) {
      const data = await post(
        `${cfg.baseUrl}/models/${encodeURIComponent(cfg.model)}:generateContent`,
        { 'x-goog-api-key': cfg.apiKey },
        {
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: 'user', parts: [{ text: req.user }] }],
          generationConfig: {
            temperature: 0.2,
            ...(req.json ? { responseMimeType: 'application/json' } : {}),
          },
        },
      );
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof text !== 'string') throw new AIError('Empty completion', true);
      return text;
    },
  };
}

/** Chrome built-in AI (Gemini Nano, Prompt API). Default when unconfigured. */
function builtin(): AIClient {
  return {
    provider: 'builtin',
    async complete(req: CompletionRequest) {
      const LM = (globalThis as any).LanguageModel;
      if (!LM?.create) {
        throw new AIError(
          'AI bawaan browser tidak tersedia di browser ini. Pilih provider di Settings.',
          false,
        );
      }
      const session = await LM.create({
        initialPrompts: [{ role: 'system', content: req.system }],
      });
      try {
        return await session.prompt(req.user);
      } finally {
        session.destroy?.();
      }
    },
  };
}

export function createClient(settings: Settings): AIClient {
  const cfg = resolveConfig(settings);
  switch (cfg.provider) {
    case 'builtin':
      return builtin();
    case 'anthropic':
      return anthropic(cfg);
    case 'gemini':
      return gemini(cfg);
    case 'azure':
      return azure(cfg);
    default:
      // openai | ollama | lmstudio | openrouter | custom
      return openAICompatible(cfg);
  }
}
