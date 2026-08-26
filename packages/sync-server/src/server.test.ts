import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, loadTokens } from './server';
import { SyncStore } from './store';

// Exercised over a real socket with real files: the parts most likely to break
// (auth, workspace isolation, path handling) all live in the HTTP layer, so a
// direct call to `handle` would test the least interesting half.

const root = mkdtempSync(join(tmpdir(), 'companion-sync-'));
const tokens = new Map([
  ['alice-secret', 'team-a'],
  ['bob-secret', 'team-b'],
  ['solo-secret', ''],
]);
const server = createServer({ store: new SyncStore(root), tokens });
let base = '';

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    }),
);

afterAll(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
});

const put = (token: string, workspace: string, id: string, body: unknown) =>
  fetch(`${base}/sessions/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Companion-Workspace': workspace,
    },
    body: JSON.stringify(body),
  });

const list = (token: string, workspace: string, since = '') =>
  fetch(`${base}/sessions?since=${encodeURIComponent(since)}`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Companion-Workspace': workspace },
  });

const bundle = (id: string, updatedAt: string, payload = 'sealed-blob') => ({
  sessionId: id,
  updatedAt,
  payload,
});

describe('sync endpoint', () => {
  it('stores a pushed bundle and hands it back after the cursor', async () => {
    expect((await put('alice-secret', 'team-a', 'room#1000', bundle('room#1000', '2026-08-24T07:00:00.000Z'))).status).toBe(200);

    const res = await list('alice-secret', 'team-a');
    expect(res.status).toBe(200);
    const { sessions } = (await res.json()) as { sessions: { sessionId: string; payload: string }[] };
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ sessionId: 'room#1000', payload: 'sealed-blob' });

    const empty = await list('alice-secret', 'team-a', '2026-08-24T07:00:00.000Z');
    expect((await empty.json()).sessions).toEqual([]);
  });

  it('keeps the newer copy when an older push arrives late', async () => {
    await put('alice-secret', 'team-a', 'room#2000', bundle('room#2000', '2026-08-24T09:00:00.000Z', 'new'));
    const stale = await put('alice-secret', 'team-a', 'room#2000', bundle('room#2000', '2026-08-24T08:00:00.000Z', 'old'));
    expect(await stale.json()).toEqual({ stored: false });

    const { sessions } = (await (await list('alice-secret', 'team-a', '2026-08-24T08:30:00.000Z')).json()) as {
      sessions: { payload: string }[];
    };
    expect(sessions.map((s) => s.payload)).toEqual(['new']);
  });

  it('never shows one workspace the contents of another', async () => {
    await put('bob-secret', 'team-b', 'room#3000', bundle('room#3000', '2026-08-24T10:00:00.000Z', 'bob-only'));
    const { sessions } = (await (await list('alice-secret', 'team-a')).json()) as {
      sessions: { sessionId: string }[];
    };
    expect(sessions.map((s) => s.sessionId)).not.toContain('room#3000');
  });

  it('refuses a token asking for a workspace it does not own', async () => {
    expect((await list('alice-secret', 'team-b')).status).toBe(403);
    expect((await put('alice-secret', 'team-b', 'room#4000', bundle('room#4000', '2026-08-24T10:00:00.000Z'))).status).toBe(403);
  });

  it('rejects a missing or wrong token', async () => {
    expect((await fetch(`${base}/sessions`)).status).toBe(401);
    expect((await list('not-a-token', 'team-a')).status).toBe(401);
    // a prefix of a real token must not be accepted
    expect((await list('alice-secre', 'team-a')).status).toBe(401);
  });

  it('rejects a session id that would escape the workspace directory', async () => {
    const res = await put('solo-secret', '', '../../escaped', bundle('../../escaped', '2026-08-24T10:00:00.000Z'));
    expect(res.status).toBe(400);
  });

  it('rejects a body that is not a valid record', async () => {
    expect((await put('solo-secret', '', 'room#5000', { payload: 'x' })).status).toBe(400);
    expect((await put('solo-secret', '', 'room#5000', { updatedAt: 'kemarin', payload: 'x' })).status).toBe(400);
    expect((await put('solo-secret', '', 'room#5000', { sessionId: 'other', updatedAt: '2026-08-24T10:00:00.000Z', payload: 'x' })).status).toBe(400);
  });

  it('refuses a body past the size limit instead of writing it', async () => {
    // the limit is set low on this one request path via a second server so the
    // test does not have to build a 32 MB string
    const small = createServer({ store: new SyncStore(root), tokens, maxBodyBytes: 200 });
    await new Promise<void>((r) => small.listen(0, '127.0.0.1', () => r()));
    const port = (small.address() as AddressInfo).port;
    const res = await fetch(`http://127.0.0.1:${port}/sessions/room%236000`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer solo-secret',
        'X-Companion-Workspace': '',
      },
      body: JSON.stringify({ updatedAt: '2026-08-24T10:00:00.000Z', payload: 'x'.repeat(500) }),
    });
    expect(res.status).toBe(413);
    small.close();
    expect(new SyncStore(root).get('', 'room#6000')).toBeNull();
  });

  it('answers 404 for anything outside the two routes', async () => {
    const res = await fetch(`${base}/admin`, {
      headers: { Authorization: 'Bearer solo-secret', 'X-Companion-Workspace': '' },
    });
    expect(res.status).toBe(404);
  });
});

describe('token table', () => {
  const read = (body: string) => () => body;

  it('takes a single token from the environment', () => {
    const tokens = loadTokens({ COMPANION_TOKEN: 'secret', COMPANION_WORKSPACE: 'team-a' }, read(''));
    expect([...tokens]).toEqual([['secret', 'team-a']]);
  });

  it('defaults a lone token to the personal workspace', () => {
    expect(loadTokens({ COMPANION_TOKEN: 'secret' }, read('')).get('secret')).toBe('');
  });

  it('reads several tokens from a file', () => {
    const tokens = loadTokens(
      { COMPANION_TOKENS_FILE: '/tokens.json' },
      read('{"alice":"team-a","bob":""}'),
    );
    expect(tokens.get('alice')).toBe('team-a');
    expect(tokens.get('bob')).toBe('');
  });

  // a typo here is the difference between "sync works" and "everything is 401",
  // so it has to say what is wrong instead of throwing a JSON.parse stack
  it('explains a malformed or wrongly shaped token file', () => {
    expect(() => loadTokens({ COMPANION_TOKENS_FILE: '/t.json' }, read('not json'))).toThrow(
      /Tidak bisa membaca \/t\.json/,
    );
    expect(() => loadTokens({ COMPANION_TOKENS_FILE: '/t.json' }, read('["a"]'))).toThrow(/harus berisi objek/);
    expect(() => loadTokens({ COMPANION_TOKENS_FILE: '/t.json' }, read('{"a":5}'))).toThrow(/bukan string/);
    expect(() => loadTokens({ COMPANION_TOKENS_FILE: '/t.json' }, read('{"":"w"}'))).toThrow(/token kosong/);
  });

  it('is empty when nothing is configured, so the bin can refuse to start', () => {
    expect(loadTokens({}, read('')).size).toBe(0);
  });
});
