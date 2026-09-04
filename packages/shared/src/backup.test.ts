import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT,
  countMeetings,
  isPortableKey,
  makeBackup,
  planRestore,
  readBackup,
} from './backup';

/** A dump shaped like the real thing: two meetings, plus every secret. */
const dump = {
  'transcript:meet-abc': [{ t: 'hello' }],
  'transcript:meet-def': [{ t: 'world' }],
  'meta:meet-abc': { startedAt: 1 },
  'title:meet-abc': 'Standup',
  'analysis:meet-abc': { summary: 's' },
  settings: { apiKey: 'ENCRYPTED', provider: 'openai' },
  cryptoKey: { k: 'raw-aes-key-material' },
  audit: [{ at: 1, what: 'ask' }],
  'update:latest': { latest: '1.6.0' },
  'update:dismissed': '1.6.0',
};

describe('isPortableKey', () => {
  it('keeps meeting data', () => {
    expect(isPortableKey('transcript:meet-abc')).toBe(true);
    expect(isPortableKey('analysis:meet-abc')).toBe(true);
  });

  it('refuses every secret', () => {
    for (const k of ['settings', 'cryptoKey', 'audit']) expect(isPortableKey(k)).toBe(false);
  });

  it('refuses machine-local update state', () => {
    expect(isPortableKey('update:latest')).toBe(false);
    expect(isPortableKey('update:dismissed')).toBe(false);
  });

  it('keeps a kind of data that did not exist when this was written', () => {
    // the denylist must not need updating for every new prefix
    expect(isPortableKey('sentiment:meet-abc')).toBe(true);
  });
});

describe('makeBackup', () => {
  const backup = makeBackup(dump, '1.7.0', new Date('2026-09-01T00:00:00Z'));

  it('carries no secret, in any form', () => {
    const serialized = JSON.stringify(backup);
    expect(serialized).not.toContain('raw-aes-key-material');
    expect(serialized).not.toContain('ENCRYPTED');
    expect(backup.data.settings).toBeUndefined();
    expect(backup.data.cryptoKey).toBeUndefined();
    expect(backup.data.audit).toBeUndefined();
  });

  it('carries every meeting', () => {
    expect(backup.meetings).toBe(2);
    expect(backup.data['transcript:meet-abc']).toEqual([{ t: 'hello' }]);
    expect(backup.data['title:meet-abc']).toBe('Standup');
  });

  it('stamps the format and the version that wrote it', () => {
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.extensionVersion).toBe('1.7.0');
    expect(backup.createdAt).toBe('2026-09-01T00:00:00.000Z');
  });
});

describe('readBackup', () => {
  const text = JSON.stringify(makeBackup(dump, '1.7.0'));

  it('round-trips what makeBackup wrote', () => {
    const b = readBackup(text);
    expect(b.meetings).toBe(2);
    expect(b.data['transcript:meet-def']).toEqual([{ t: 'world' }]);
  });

  it('rejects a file that is not JSON', () => {
    expect(() => readBackup('not json at all')).toThrow(/bukan JSON/);
  });

  it('rejects some other extension’s export', () => {
    expect(() => readBackup(JSON.stringify({ format: 'something-else', data: {} }))).toThrow(
      /bukan backup Companion/,
    );
  });

  it('rejects a backup from a newer format than it understands', () => {
    expect(() =>
      readBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99, data: {} })),
    ).toThrow(/lebih baru/);
  });

  it('rejects a file with no data object', () => {
    expect(() => readBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1 }))).toThrow(
      /no data/,
    );
  });

  it('strips a secret a hand-edited file tries to smuggle in', () => {
    // restoring a `cryptoKey` from a file would swap the key the live profile
    // encrypts with, and make its own stored API key undecryptable
    const hostile = JSON.stringify({
      format: BACKUP_FORMAT,
      version: 1,
      data: { 'transcript:x': [], cryptoKey: { k: 'attacker' }, settings: { apiKey: 'theirs' } },
    });
    const b = readBackup(hostile);
    expect(b.data.cryptoKey).toBeUndefined();
    expect(b.data.settings).toBeUndefined();
    expect(b.data['transcript:x']).toEqual([]);
  });
});

describe('planRestore', () => {
  const backup = makeBackup(dump, '1.7.0');

  it('writes everything into an empty profile', () => {
    const plan = planRestore({}, backup);
    expect(plan.added).toBe(Object.keys(backup.data).length);
    expect(plan.skipped).toBe(0);
  });

  it('never overwrites a meeting that is already there', () => {
    const live = { 'transcript:meet-abc': [{ t: 'edited since the backup' }] };
    const plan = planRestore(live, backup);
    expect(plan.writes['transcript:meet-abc']).toBeUndefined();
    expect(plan.skipped).toBe(1);
    expect(plan.writes['transcript:meet-def']).toEqual([{ t: 'world' }]);
  });

  it('changes nothing when restoring the same backup twice', () => {
    const first = planRestore({}, backup);
    const second = planRestore(first.writes, backup);
    expect(second.added).toBe(0);
    expect(second.skipped).toBe(Object.keys(backup.data).length);
  });
});

describe('countMeetings', () => {
  it('counts transcripts, not every key belonging to a meeting', () => {
    expect(countMeetings(makeBackup(dump, '1.7.0').data)).toBe(2);
    expect(countMeetings({})).toBe(0);
  });
});
