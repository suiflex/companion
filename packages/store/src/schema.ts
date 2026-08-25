import type { SqlDriver } from './sql';

// One migration step per array entry; `user_version` records how many have run,
// so an existing database is upgraded in place and a fresh one is built by
// replaying all of them. Never edit a shipped step — append a new one.

export const MIGRATIONS: string[] = [
  // 1 — rooms, sessions, transcript + full-text index
  `
  CREATE TABLE meeting_rooms (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL DEFAULT 'unknown',
    external_room_id TEXT NOT NULL
  );

  CREATE TABLE meeting_sessions (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES meeting_rooms(id),
    title TEXT,
    agenda TEXT,
    platform TEXT NOT NULL DEFAULT 'unknown',
    started_at TEXT,
    ended_at TEXT,
    project_id TEXT,
    calendar_event_id TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_sessions_started ON meeting_sessions(started_at DESC);
  CREATE INDEX idx_sessions_room ON meeting_sessions(room_id);
  CREATE INDEX idx_sessions_project ON meeting_sessions(project_id);

  CREATE TABLE participants (
    session_id TEXT NOT NULL REFERENCES meeting_sessions(id),
    name TEXT NOT NULL,
    lines INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, name)
  );

  -- variant keeps the AI-cleaned transcript beside the raw one (§26): the raw
  -- capture is never overwritten, so a bad cleanup is always recoverable.
  CREATE TABLE transcript_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES meeting_sessions(id),
    variant TEXT NOT NULL DEFAULT 'raw',
    seq INTEGER NOT NULL,
    entry_key TEXT NOT NULL,
    speaker TEXT NOT NULL,
    text TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    UNIQUE (session_id, variant, seq)
  );
  CREATE INDEX idx_entries_session ON transcript_entries(session_id, variant, seq);

  CREATE VIRTUAL TABLE transcript_fts USING fts5(
    text, speaker, content='transcript_entries', content_rowid='id'
  );
  CREATE TRIGGER transcript_ai AFTER INSERT ON transcript_entries BEGIN
    INSERT INTO transcript_fts(rowid, text, speaker) VALUES (new.id, new.text, new.speaker);
  END;
  CREATE TRIGGER transcript_ad AFTER DELETE ON transcript_entries BEGIN
    INSERT INTO transcript_fts(transcript_fts, rowid, text, speaker)
      VALUES ('delete', old.id, old.text, old.speaker);
  END;
  CREATE TRIGGER transcript_au AFTER UPDATE ON transcript_entries BEGIN
    INSERT INTO transcript_fts(transcript_fts, rowid, text, speaker)
      VALUES ('delete', old.id, old.text, old.speaker);
    INSERT INTO transcript_fts(rowid, text, speaker) VALUES (new.id, new.text, new.speaker);
  END;
  `,

  // 2 — structured meeting memory + its own search index (§18, §27)
  `
  CREATE TABLE analyses (
    session_id TEXT PRIMARY KEY REFERENCES meeting_sessions(id),
    status TEXT NOT NULL,
    provider TEXT,
    generated_at TEXT,
    json TEXT NOT NULL
  );

  CREATE TABLE decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES meeting_sessions(id),
    topic TEXT,
    decision TEXT NOT NULL,
    reason TEXT,
    rejected TEXT,
    confidence REAL,
    superseded_by INTEGER REFERENCES decisions(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_decisions_session ON decisions(session_id);
  CREATE INDEX idx_decisions_topic ON decisions(topic);

  CREATE TABLE action_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES meeting_sessions(id),
    task TEXT NOT NULL,
    owner TEXT,
    due_at TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    done_at TEXT,
    external_ref TEXT
  );
  CREATE INDEX idx_actions_session ON action_items(session_id);
  CREATE INDEX idx_actions_status ON action_items(status, owner);

  CREATE TABLE open_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES meeting_sessions(id),
    question TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    resolved_in TEXT REFERENCES meeting_sessions(id),
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_questions_session ON open_questions(session_id);

  CREATE TABLE risks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES meeting_sessions(id),
    risk TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  -- every extracted entity points back at the transcript lines it came from,
  -- so nothing important is un-traceable (§35.4)
  CREATE TABLE evidence_refs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    transcript_entry_id INTEGER NOT NULL REFERENCES transcript_entries(id)
  );
  CREATE INDEX idx_evidence_entity ON evidence_refs(entity_type, entity_id);

  -- one searchable surface over the structured memory; kept in sync by the
  -- repositories rather than triggers because rows come from several tables
  CREATE VIRTUAL TABLE memory_fts USING fts5(kind, session_id, entity_id, text);
  `,

  // 3 — documents, chat, projects, highlights, templates, key/value
  `
  CREATE TABLE documents (
    session_id TEXT NOT NULL REFERENCES meeting_sessions(id),
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    provider TEXT,
    PRIMARY KEY (session_id, type)
  );

  CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES meeting_sessions(id),
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    time TEXT NOT NULL,
    result_json TEXT
  );
  CREATE INDEX idx_chat_session ON chat_messages(session_id, id);

  CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE highlights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES meeting_sessions(id),
    seq INTEGER NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (session_id, seq, kind)
  );

  CREATE TABLE templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    instructions TEXT NOT NULL,
    sections TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,

  // 4 — sync outbox (cloud sync / workspace push, §P2.6-P2.8)
  `
  CREATE TABLE sync_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    op TEXT NOT NULL,
    queued_at TEXT NOT NULL,
    sent_at TEXT
  );
  CREATE INDEX idx_outbox_pending ON sync_outbox(sent_at, id);
  `,
  // 5 — where a session came from. Locally captured meetings are pruned from
  // the index when they disappear from chrome.storage (the user deleted them);
  // meetings that arrived by sync or share exist only here and must survive.
  `
  ALTER TABLE meeting_sessions ADD COLUMN source TEXT NOT NULL DEFAULT 'capture';
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export function schemaVersion(db: SqlDriver): number {
  const rows = db.all<{ user_version: number }>('PRAGMA user_version');
  return rows[0]?.user_version ?? 0;
}

/** Bring a database (new or existing) up to the current schema. */
export function migrateSchema(db: SqlDriver): { from: number; to: number } {
  const from = schemaVersion(db);
  for (let v = from; v < MIGRATIONS.length; v++) {
    db.exec(MIGRATIONS[v]);
    // PRAGMA does not take bound parameters; v is a loop index, never input
    db.exec(`PRAGMA user_version = ${v + 1}`);
  }
  return { from, to: MIGRATIONS.length };
}
