import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

// P2.6 / P2.7 — the storage half of the sync endpoint.
//
// Every payload arriving here is already sealed with the user's passphrase
// (see @meetcc/meeting `runSync`), so this process only ever handles opaque
// strings: there is nothing to index, query or migrate. A file per meeting is
// therefore the whole design — no database, no dependency, and the data stays
// readable with `ls` and restorable with `cp`.

export interface StoredRecord {
  sessionId: string;
  updatedAt: string;
  payload: string;
}

/** Anything that could escape the workspace directory is rejected outright
 *  rather than sanitized, so a surprising id fails loudly instead of writing
 *  somewhere unexpected. */
const SAFE_ID = /^[A-Za-z0-9._#@-]{1,200}$/;

export function isSafeId(value: string): boolean {
  return SAFE_ID.test(value) && value !== '.' && value !== '..';
}

/**
 * Workspace '' is the personal namespace; everything else is a shared one.
 *
 * The workspace comes from the operator's token table rather than the network,
 * but it still ends up in a path, so it is checked here — the one place every
 * read and write goes through — instead of trusting each call site.
 */
function workspaceDir(root: string, workspace: string): string {
  if (workspace && !isSafeId(workspace)) throw new Error(`Workspace tidak valid: ${workspace}`);
  return join(root, workspace || '_personal');
}

/** `room#1000` is a legal session id but not a legal filename on every OS.
 *  Percent-encoding also removes every separator, so the name cannot walk. */
function fileFor(dir: string, sessionId: string): string {
  if (!isSafeId(sessionId)) throw new Error(`sessionId tidak valid: ${sessionId}`);
  return join(dir, `${encodeURIComponent(sessionId)}.json`);
}

export class SyncStore {
  private readonly base: string;

  constructor(root: string) {
    this.base = resolve(root);
    mkdirSync(this.base, { recursive: true });
  }

  /** Last line of defence: nothing is opened unless it resolves inside the
   *  data directory, whatever the id checks upstream did or did not catch. */
  private inside(path: string): string {
    const full = resolve(path);
    if (full !== this.base && !full.startsWith(this.base + sep)) {
      throw new Error('Path di luar direktori data.');
    }
    return full;
  }

  /**
   * Last-writer-wins by `updatedAt`, matching the client's conflict rule. An
   * older push is accepted as a no-op so a retry from a stale device cannot
   * roll the workspace back.
   */
  put(workspace: string, record: StoredRecord): { stored: boolean } {
    const dir = this.inside(workspaceDir(this.base, workspace));
    mkdirSync(dir, { recursive: true });
    const existing = this.get(workspace, record.sessionId);
    if (existing && existing.updatedAt >= record.updatedAt) return { stored: false };

    // write-then-rename: a crash mid-write leaves the previous version intact
    const target = this.inside(fileFor(dir, record.sessionId));
    const temp = `${target}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(record), 'utf8');
    renameSync(temp, target);
    return { stored: true };
  }

  get(workspace: string, sessionId: string): StoredRecord | null {
    if (!isSafeId(sessionId)) return null;
    try {
      const file = this.inside(fileFor(workspaceDir(this.base, workspace), sessionId));
      const raw = readFileSync(file, 'utf8');
      return JSON.parse(raw) as StoredRecord;
    } catch {
      return null; // missing or unreadable is "not there" to every caller
    }
  }

  /**
   * Records changed after `since`, oldest first so the client's cursor can
   * only ever move forward.
   *
   * ponytail: full-scans every file in the workspace on each poll — a
   * known, accepted limit, deliberately not fixed here. Measured p95
   * ~1.5 s at 105 records (~43 MB serialized per full poll; probe
   * 2026-08-28). Single-user archives stay well below that threshold, so
   * no index file gets built for the v1 bundle format: sync protocol v2
   * (ADR-005 — immutable operations + durable server cursor) removes
   * this scan outright.
   */
  since(workspace: string, cursor: string): StoredRecord[] {
    const dir = this.inside(workspaceDir(this.base, workspace));
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return []; // workspace has never been written to
    }
    const out: StoredRecord[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      try {
        const rec = JSON.parse(readFileSync(this.inside(join(dir, name)), 'utf8')) as StoredRecord;
        if (!cursor || rec.updatedAt > cursor) out.push(rec);
      } catch {
        continue; // a half-written or hand-edited file must not break a sync
      }
    }
    return out.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  }
}
