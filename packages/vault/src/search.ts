// Derived SQLite/FTS5 index over the vault's .md files.
//
// The .md files are canonical; this index is disposable. `rebuild()` scans the
// vault and repopulates the tables, so deleting the index file lets a user
// rebuild it from source (roadmap Stage 1 "integrity scanner", mockup "4 ·
// Indeks"). No chrome.* — the desktop builds this on the same `SqlDriver` the
// extension uses, run against native SQLite (Tauri) vs wasm/OPFS (extension/tests).
import { ftsQuery, type SqlDriver } from '@meetcc/store'
import type { Vault } from './vault'

export interface VaultIndexRow {
  id: string
  sessionKey: string
  title: string
  updatedAt: string
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
/** Create the derived tables and populate them from the vault. */
export async function createIndex(db: SqlDriver, vault: Vault): Promise<void> {
  db.exec(SCHEMA)
  await rebuild(db, vault)
}

/** Repopulate the index from the vault's current .md files. */
export async function rebuild(db: SqlDriver, vault: Vault): Promise<void> {
  db.exec('DELETE FROM vault_notes')
  for (const note of await vault.readAll()) {
    const path = notePathOf(note.sessionKey, note.startedAt)
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
  const rows = db.all<JoinedRow>(
    `SELECT n.id, n.session_key AS sessionKey, n.title, n.updated_at AS updatedAt, n.rowid
       FROM vault_fts f JOIN vault_notes n ON n.rowid = f.rowid
      WHERE vault_fts MATCH ? ORDER BY rank`,
    [match],
  )
  return rows.map(({ rowid: _rowid, ...row }) => row)
}

function notePathOf(sessionKey: string, startedAt?: string): string {
  const room = sessionKey.split('#')[0]
  const day = startedAt?.slice(0, 10) ?? 'undated'
  return `${day}/${room}`
}
