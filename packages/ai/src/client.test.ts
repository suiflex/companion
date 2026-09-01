import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '@meetcc/shared';
import { PROVIDER_PRESETS, resolveConfig, validateSettings } from './client';
import { originPattern, requiredOrigins } from './permissions';
import { createRateLimiter } from './ratelimit';

const s = (over: Partial<Settings>): Settings => ({ ...DEFAULT_SETTINGS, ...over });

describe('resolveConfig', () => {
  it('fills preset baseUrl and model, strips trailing slash', () => {
    const cfg = resolveConfig(s({ provider: 'openai', apiKey: 'k' }));
    expect(cfg.baseUrl).toBe('https://api.openai.com/v1');
    expect(cfg.model).toBe(PROVIDER_PRESETS.openai.model);
    expect(resolveConfig(s({ provider: 'custom', baseUrl: 'http://x/v1///' })).baseUrl).toBe(
      'http://x/v1',
    );
  });

  it('user values win over presets', () => {
    const cfg = resolveConfig(s({ provider: 'openai', model: 'gpt-4.1', baseUrl: 'https://proxy/v1' }));
    expect(cfg.model).toBe('gpt-4.1');
    expect(cfg.baseUrl).toBe('https://proxy/v1');
  });
});

describe('validateSettings', () => {
  it('builtin needs nothing', () => {
    expect(validateSettings(s({ provider: 'builtin' }))).toBeNull();
  });
  it('key-based providers need a key', () => {
    expect(validateSettings(s({ provider: 'openai' }))).toMatch(/API key/);
    expect(validateSettings(s({ provider: 'openai', apiKey: 'k' }))).toBeNull();
  });
  it('azure/custom need a base url; url must be http(s)', () => {
    expect(validateSettings(s({ provider: 'azure', apiKey: 'k' }))).toMatch(/Base URL/);
    expect(validateSettings(s({ provider: 'custom', baseUrl: 'ftp://x' }))).toMatch(/http/);
    expect(validateSettings(s({ provider: 'custom', baseUrl: 'http://localhost:1234/v1' }))).toBeNull();
  });
});

describe('rate limiter', () => {
  it('caps calls inside the window and frees after it', () => {
    const rl = createRateLimiter(2, 1000);
    expect(rl.take(0)).toBe(true);
    expect(rl.take(10)).toBe(true);
    expect(rl.take(20)).toBe(false);
    expect(rl.take(1011)).toBe(true); // first call aged out
  });
});

describe('requiredOrigins (§8.3)', () => {
  const base: Settings = {
    ...DEFAULT_SETTINGS,
    integrations: {
      ...DEFAULT_SETTINGS.integrations,
      tracker: { ...DEFAULT_SETTINGS.integrations.tracker },
      sync: { ...DEFAULT_SETTINGS.integrations.sync },
      transcription: { ...DEFAULT_SETTINGS.integrations.transcription },
    },
  };

  it('asks for nothing when everything is off', () => {
    expect(requiredOrigins(base)).toEqual([]);
  });

  it('asks only for the provider the user picked', () => {
    expect(requiredOrigins({ ...base, provider: 'openai' })).toEqual(['https://api.openai.com/*']);
    // the port never reaches the pattern: Firefox rejects match patterns with
    // a port, and Chromium treats a portless pattern as any-port
    expect(requiredOrigins({ ...base, provider: 'ollama', baseUrl: 'http://localhost:11434/v1' })).toEqual([
      'http://localhost/*',
    ]);
  });

  it('adds an integration origin only once it is actually configured', () => {
    const half = {
      ...base,
      integrations: { ...base.integrations, tracker: { ...base.integrations.tracker, token: 'a:b' } },
    };
    expect(requiredOrigins(half)).toEqual([]); // no project key yet

    const ready = {
      ...half,
      integrations: {
        ...half.integrations,
        tracker: { provider: 'linear' as const, baseUrl: '', token: 'k', target: 'team' },
      },
    };
    expect(requiredOrigins(ready)).toEqual(['https://api.linear.app/*']);
  });

  it('does not ask for a sync endpoint while sync is switched off', () => {
    const off = {
      ...base,
      integrations: { ...base.integrations, sync: { ...base.integrations.sync, endpoint: 'https://s.example.com' } },
    };
    expect(requiredOrigins(off)).toEqual([]);
    expect(
      requiredOrigins({
        ...off,
        integrations: { ...off.integrations, sync: { ...off.integrations.sync, enabled: true } },
      }),
    ).toEqual(['https://s.example.com/*']);
  });

  it('ignores junk instead of requesting a bogus pattern', () => {
    expect(originPattern('not a url')).toBe('');
    expect(originPattern('javascript:alert(1)')).toBe('');
    expect(originPattern('https://api.openai.com/v1/chat')).toBe('https://api.openai.com/*');
    // explicit and default ports both come out: Gecko forbids ports in match
    // patterns, Chromium reads a portless pattern as any-port
    expect(originPattern('http://127.0.0.1:45789/x')).toBe('http://127.0.0.1/*');
    expect(originPattern('https://api.openai.com:443/v1')).toBe('https://api.openai.com/*');
    expect(originPattern('http://api.openai.com:80/v1')).toBe('http://api.openai.com/*');
  });
});
