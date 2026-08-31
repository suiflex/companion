import { describe, expect, it } from 'vitest';
import { switchProvider } from './provider';
import { DEFAULT_SETTINGS, type Settings } from './types';

const base: Settings = { ...DEFAULT_SETTINGS, provider: 'openai', model: 'gpt-4o', baseUrl: '' };

describe('switchProvider', () => {
  it('remembers the provider being left', () => {
    expect(switchProvider(base, 'anthropic').byProvider.openai).toEqual({
      model: 'gpt-4o',
      baseUrl: '',
    });
  });

  it('restores what the provider being entered had', () => {
    const withClaude: Settings = {
      ...base,
      byProvider: { anthropic: { model: 'claude-haiku-4-5-20251001', baseUrl: '' } },
    };
    const next = switchProvider(withClaude, 'anthropic');
    expect(next.provider).toBe('anthropic');
    expect(next.model).toBe('claude-haiku-4-5-20251001');
  });

  it('blanks the fields for a provider never configured, so the preset applies', () => {
    const next = switchProvider(base, 'ollama');
    expect(next.model).toBe('');
    expect(next.baseUrl).toBe('');
  });

  it('survives a round trip', () => {
    const there = switchProvider(base, 'ollama');
    const back = switchProvider({ ...there, baseUrl: 'http://localhost:11434/v1' }, 'openai');
    expect(back.model).toBe('gpt-4o');
    expect(back.byProvider.ollama).toEqual({ model: '', baseUrl: 'http://localhost:11434/v1' });
  });

  it('captures the current edit without restoring over it when the provider is unchanged', () => {
    const edited: Settings = { ...base, byProvider: { openai: { model: 'gpt-4o-mini', baseUrl: '' } } };
    const saved = switchProvider(edited, 'openai');
    expect(saved.model).toBe('gpt-4o');
    expect(saved.byProvider.openai).toEqual({ model: 'gpt-4o', baseUrl: '' });
  });
});
