import { describe, expect, it } from 'vitest';
import { classifyBridgeError } from './bridgeError';

describe('classifyBridgeError', () => {
  it('recognizes the unregistered-host message (macOS/Linux Chromium)', () => {
    expect(classifyBridgeError('Specified native messaging host not found.')).toBe('not_found');
  });

  it('recognizes the forbidden-origin message (extension id mismatch)', () => {
    expect(classifyBridgeError('Access to the specified native messaging host is forbidden.')).toBe(
      'forbidden',
    );
  });

  it('recognizes the Windows-only wording', () => {
    expect(classifyBridgeError('Native messaging host dev.suiflex.companion is not registered.')).toBe(
      'not_registered',
    );
  });

  it('falls back to unknown for anything else', () => {
    expect(classifyBridgeError('Native host has exited.')).toBe('unknown');
    expect(classifyBridgeError(undefined)).toBe('unknown');
    expect(classifyBridgeError('')).toBe('unknown');
  });
});
