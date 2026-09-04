// Derived SQLite/FTS5 index over the vault's .md files.
//
// The .md files are canonical; this index is disposable. `rebuild()` scans the
// vault and repopulates the tables, so deleting the index file lets a user
// rebuild it from source (roadmap Stage 1 "integrity scanner", mockup "4 ·
// Indeks"). No chrome.* — the desktop builds this on the same `SqlDriver` the
// extension uses, run against native SQLite (Tauri) vs wasm/OPFS (extension/tests).
import { ftsQuery, type SqlDriver } from '@meetcc/store'
import type { Vault } from './vault'
import type { VaultNote } from './note'

export interface VaultIndexRow {
  id: string
  sessionKey: string
  title: string
  updatedAt: string
  /** Relative .md path under the vault (e.g. `Rapat/2026-08-28/room.md`). */
  path: string
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS vault_notes (
  id TEXT PRIMARY KEY,
  session_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  path TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vault_updated ON vault_notes(updated_at DESC);
CREATE VIRTUAL TABLE IF NOT EXISTS vault_fts USING fts5(
  title, body, content='vault_notes', content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS vault_ai AFTER INSERT ON vault_notes BEGIN
  INSERT INTO vault_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS vault_ad AFTER DELETE ON vault_notes BEGIN
  INSERT INTO vault_fts(vault_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
END;
CREATE TRIGGER IF NOT EXISTS vault_au AFTER UPDATE ON vault_notes BEGIN
  INSERT INTO vault_fts(vault_fts, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
  INSERT INTO vault_fts(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;
`

/**
 * Create the derived tables and populate them from the vault.
 *
 * `notes` lets a caller that has just read the vault hand those notes over
 * instead of paying for a second full read — which, in the desktop app, is a
 * second round of IPC per note on every save.
 */
export async function createIndex(
  db: SqlDriver,
  vault: Vault,
  notes?: VaultNote[],
  paths?: readonly string[],
): Promise<void> {
  db.exec(SCHEMA)
  await rebuild(db, vault, notes, paths)
}

/** Repopulate the index from the vault's current .md files. */
export async function rebuild(
  db: SqlDriver,
  vault: Vault,
  notes?: VaultNote[],
  /**
   * Where each note actually is, positionally matched to `notes`.
   *
   * Without it the path is derived from the session key, which is only correct
   * while a note sits where it was first written. A moved note would be
   * indexed at a path that holds nothing — and two notes deriving the same
   * path collide on `session_key`, which surfaces as a UNIQUE constraint error
   * on save rather than as anything a reader could interpret.
   */
  paths?: readonly string[],
): Promise<void> {
  db.exec('DELETE FROM vault_notes')
  const rows = notes ?? (await vault.readAll())
  for (const [i, note] of rows.entries()) {
    const path = paths?.[i] ?? vault.relPath(note)
    db.run(
      'INSERT INTO vault_notes(id, session_key, title, body, platform, updated_at, path) VALUES (?,?,?,?,?,?,?)',
      [note.id, note.sessionKey, note.title, note.body, note.platform, note.updatedAt, path],
    )
  }
}

interface JoinedRow extends VaultIndexRow {
  rowid: number
}

/** Full-text search across notes; returns notes whose title/body match. */
export function search(db: SqlDriver, query: string): VaultIndexRow[] {
  const match = ftsQuery(query)
  // ftsQuery drops terms of one character, so a query like "a" reduces to an
  // empty string — and `MATCH ''` is a syntax error in FTS5. The sidebar calls
  // this during render, so an exception here is a blank window, not a bad
  // result set. Same guard the meeting store uses.
  if (!match) return []
  const rows = db.all<JoinedRow>(
    `SELECT n.id, n.session_key AS sessionKey, n.title, n.updated_at AS updatedAt, n.path, n.rowid
       FROM vault_fts f JOIN vault_notes n ON n.rowid = f.rowid
      WHERE vault_fts MATCH ? ORDER BY rank`,
    [match],
  )
  return rows.map(({ rowid: _rowid, ...row }) => row)
}
