import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '@meetcc/shared';
import { PROVIDER_PRESETS, resolveConfig, validateSettings } from './client';
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
