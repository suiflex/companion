import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { SyncStore } from './store';

// The HTTP layer already rejects a bad session id, but the store is what
// actually touches the filesystem, so it refuses on its own too.

const root = mkdtempSync(join(tmpdir(), 'companion-store-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const record = (sessionId: string) => ({ sessionId, updatedAt: '2026-08-24T07:00:00.000Z', payload: 'x' });

describe('SyncStore path handling', () => {
  it('refuses a session id or workspace that could walk out of the root', () => {
    const store = new SyncStore(root);
    expect(() => store.put('', record('../../escaped'))).toThrow(/sessionId/);
    expect(() => store.put('../evil', record('room#1'))).toThrow(/Workspace/);
    expect(() => store.since('../evil', '')).toThrow(/Workspace/);
    expect(readdirSync(root)).not.toContain('escaped.json');
  });

  it('keeps a legal but filename-hostile id', () => {
    const store = new SyncStore(root);
    expect(store.put('team-a', record('room#1000'))).toEqual({ stored: true });
    expect(store.get('team-a', 'room#1000')?.payload).toBe('x');
  });
});
