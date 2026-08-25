import {
  entryId,
  roomIdOf,
  type Analysis,
  type AnalysisRecord,
  type AskResult,
  type ChatMessage,
  type DocType,
  type Entry,
  type MeetingDocs,
  type StoredDoc,
} from '@meetcc/shared';
import { ftsQuery, placeholders, transact, type SqlDriver, type SqlValue } from './sql';
import { migrateSchema } from './schema';

// The local knowledge base. Everything the product asks of storage beyond
// "read one meeting" lives here: cross-meeting queries, full-text search over
// several indexes, and the structured memory (decisions / actions / questions)
// that Global Ask and continuity are built on.
//
// chrome.storage.local remains the capture write-path (the content script keeps
// writing there) and the rollback copy; this database is the queryable index
// built from it. Nothing here deletes legacy data.

export type TranscriptVariant = 'raw' | 'clean';

export interface SessionRow {
  id: string;
  roomId: string;
  title: string;
  agenda: string;
  platform: string;
  startedAt: string | null;
  endedAt: string | null;
  projectId: string | null;
  calendarEventId: string | null;
  entryCount: number;
  participants: string[];
  durationMs: number | null;
  source: 'capture' | 'remote';
}

export interface DecisionRow {
  id: number;
  sessionId: string;
  topic: string;
  decision: string;
  reason: string;
  rejected: string[];
  createdAt: string;
  supersededBy: number | null;
}

export interface ActionRow {
  id: number;
  sessionId: string;
  task: string;
  owner: string;
  dueAt: string;
  status: 'open' | 'done';
  createdAt: string;
  doneAt: string | null;
  externalRef: string | null;
}

export interface QuestionRow {
  id: number;
  sessionId: string;
  question: string;
  status: 'open' | 'resolved';
  resolvedIn: string | null;
  createdAt: string;
}

export interface SearchHit {
  kind: 'transcript' | 'decision' | 'action' | 'question' | 'document' | 'risk';
  sessionId: string;
  sessionTitle: string;
  entityId: number;
  text: string;
  speaker: string;
  time: string | null;
  /** BM25: lower is better in SQLite, so this is negated to "higher is better". */
  score: number;
}

/** group_concat separator: a control character can never appear in a name. */
const SPEAKER_SEP = '\u0001';

const nowIso = (): string => new Date().toISOString();
const s = (v: SqlValue): string => (typeof v === 'string' ? v : v === null ? '' : String(v));
const n = (v: SqlValue): number => (typeof v === 'number' ? v : Number(v) || 0);

/** Resolves the transcript lines that back a piece of extracted memory. Passed
 *  in by the caller so the store does not depend on the retrieval engine. */
export type EvidenceResolver = (text: string) => string[];

export class CompanionStore {
  constructor(private readonly db: SqlDriver) {}

  static open(db: SqlDriver): CompanionStore {
    migrateSchema(db);
    return new CompanionStore(db);
  }

  get driver(): SqlDriver {
    return this.db;
  }

  close(): void {
    this.db.close();
  }

  // -- sessions & rooms (P0.1 data model, P1.5 metadata) --

  upsertSession(input: {
    id: string;
    platform?: string;
    startedAt?: string | null;
    endedAt?: string | null;
    title?: string;
    agenda?: string;
    /** 'remote' = arrived by sync or share; it has no chrome.storage copy, so
     *  index pruning must leave it alone. */
    source?: 'capture' | 'remote';
  }): void {
    const roomId = roomIdOf(input.id);
    const platform = input.platform ?? (roomId.startsWith('tms-') ? 'teams' : 'google-meet');
    this.db.run(
      `INSERT INTO meeting_rooms(id, platform, external_room_id) VALUES(?,?,?)
       ON CONFLICT(id) DO UPDATE SET platform=excluded.platform`,
      [roomId, platform, roomId],
    );
    this.db.run(
      `INSERT INTO meeting_sessions(id, room_id, title, agenda, platform, started_at, ended_at, updated_at, source)
       VALUES(?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         title = COALESCE(NULLIF(excluded.title,''), meeting_sessions.title),
         agenda = COALESCE(NULLIF(excluded.agenda,''), meeting_sessions.agenda),
         platform = excluded.platform,
         started_at = COALESCE(meeting_sessions.started_at, excluded.started_at),
         ended_at = COALESCE(excluded.ended_at, meeting_sessions.ended_at),
         updated_at = excluded.updated_at`,
      [
        input.id,
        roomId,
        input.title ?? '',
        input.agenda ?? '',
        platform,
        input.startedAt ?? null,
        input.endedAt ?? null,
        nowIso(),
        input.source ?? 'capture',
      ],
    );
  }

  /**
   * Drop locally captured sessions that are no longer in chrome.storage — the
   * user deleted them, and a deleted meeting must stop showing up in search,
   * Global Ask, continuity and MCP snapshots. Sessions that came from sync or
   * a share bundle have no storage copy and are never touched here.
   */
  pruneMissing(keepIds: string[]): string[] {
    const keep = new Set(keepIds);
    const stale = this.db
      .all("SELECT id FROM meeting_sessions WHERE source = 'capture'")
      .map((r) => s(r.id))
      .filter((id) => !keep.has(id));
    for (const id of stale) this.deleteSession(id);
    return stale;
  }

  private rowToSession(r: Record<string, SqlValue>): SessionRow {
    const started = r.started_at ? s(r.started_at) : null;
    const ended = r.ended_at ? s(r.ended_at) : null;
    return {
      id: s(r.id),
      roomId: s(r.room_id),
      title: s(r.title),
      agenda: s(r.agenda),
      platform: s(r.platform),
      startedAt: started,
      endedAt: ended,
      projectId: r.project_id ? s(r.project_id) : null,
      source: s(r.source) === 'remote' ? 'remote' : 'capture',
      calendarEventId: r.calendar_event_id ? s(r.calendar_event_id) : null,
      entryCount: n(r.entry_count),
      participants: s(r.speakers) ? s(r.speakers).split(SPEAKER_SEP) : [],
      durationMs: started && ended ? Date.parse(ended) - Date.parse(started) : null,
    };
  }

  private readonly SESSION_SELECT = `
    SELECT ms.*,
      (SELECT COUNT(*) FROM transcript_entries te
        WHERE te.session_id = ms.id AND te.variant='raw') AS entry_count,
      (SELECT group_concat(p.name, char(1)) FROM participants p
        WHERE p.session_id = ms.id) AS speakers
    FROM meeting_sessions ms`;

  listSessions(opts: { projectId?: string; limit?: number } = {}): SessionRow[] {
    const where = opts.projectId ? 'WHERE ms.project_id = ?' : '';
    const params: SqlValue[] = opts.projectId ? [opts.projectId] : [];
    const rows = this.db.all(
      `${this.SESSION_SELECT} ${where} ORDER BY ms.started_at DESC, ms.id LIMIT ?`,
      [...params, opts.limit ?? 500],
    );
    return rows.map((r) => this.rowToSession(r));
  }

  getSession(id: string): SessionRow | null {
    const rows = this.db.all(`${this.SESSION_SELECT} WHERE ms.id = ?`, [id]);
    return rows.length ? this.rowToSession(rows[0]) : null;
  }

  setSessionField(id: string, field: 'title' | 'agenda' | 'project_id' | 'calendar_event_id', value: string | null): void {
    // field is a closed union, never user input -> safe to interpolate
    this.db.run(`UPDATE meeting_sessions SET ${field} = ?, updated_at = ? WHERE id = ?`, [
      value,
      nowIso(),
      id,
    ]);
  }

  deleteSession(id: string): void {
    transact(this.db, () => {
      for (const table of [
        'evidence_refs',
        'transcript_entries',
        'participants',
        'analyses',
        'decisions',
        'action_items',
        'open_questions',
        'risks',
        'documents',
        'chat_messages',
        'highlights',
      ]) {
        if (table === 'evidence_refs') {
          this.db.run(
            `DELETE FROM evidence_refs WHERE transcript_entry_id IN
              (SELECT id FROM transcript_entries WHERE session_id = ?)`,
            [id],
          );
        } else {
          this.db.run(`DELETE FROM ${table} WHERE session_id = ?`, [id]);
        }
      }
      this.db.run('DELETE FROM memory_fts WHERE session_id = ?', [id]);
      this.db.run('DELETE FROM meeting_sessions WHERE id = ?', [id]);
    });
  }

  // -- transcript --

  /** Replace a variant wholesale. Transcripts are append-only in practice, but
   *  re-ingesting the full array keeps the index exactly in step with the
   *  chrome.storage copy that remains the source of truth. */
  replaceEntries(sessionId: string, variant: TranscriptVariant, entries: Entry[]): void {
    transact(this.db, () => {
      this.db.run(
        `DELETE FROM evidence_refs WHERE transcript_entry_id IN
          (SELECT id FROM transcript_entries WHERE session_id = ? AND variant = ?)`,
        [sessionId, variant],
      );
      this.db.run('DELETE FROM transcript_entries WHERE session_id = ? AND variant = ?', [
        sessionId,
        variant,
      ]);
      entries.forEach((e, i) => {
        this.db.run(
          `INSERT INTO transcript_entries(session_id, variant, seq, entry_key, speaker, text, started_at)
           VALUES(?,?,?,?,?,?,?)`,
          [sessionId, variant, i, e.id ?? entryId(i), e.speaker, e.text, e.time],
        );
      });
      if (variant === 'raw') {
        this.db.run('DELETE FROM participants WHERE session_id = ?', [sessionId]);
        const counts = new Map<string, number>();
        for (const e of entries) counts.set(e.speaker, (counts.get(e.speaker) ?? 0) + 1);
        for (const [name, lines] of counts) {
          this.db.run('INSERT INTO participants(session_id, name, lines) VALUES(?,?,?)', [
            sessionId,
            name,
            lines,
          ]);
        }
        const first = entries[0]?.time ?? null;
        const last = entries[entries.length - 1]?.time ?? null;
        this.db.run(
          `UPDATE meeting_sessions
             SET started_at = COALESCE(started_at, ?), ended_at = ?, updated_at = ?
           WHERE id = ?`,
          [first, last, nowIso(), sessionId],
        );
      }
    });
  }

  getEntries(sessionId: string, variant: TranscriptVariant = 'raw'): Entry[] {
    return this.db
      .all(
        `SELECT entry_key, speaker, text, started_at FROM transcript_entries
         WHERE session_id = ? AND variant = ? ORDER BY seq`,
        [sessionId, variant],
      )
      .map((r) => ({
        id: s(r.entry_key),
        speaker: s(r.speaker),
        text: s(r.text),
        time: s(r.started_at),
      }));
  }

  countEntries(sessionId: string, variant: TranscriptVariant = 'raw'): number {
    const rows = this.db.all<{ c: number }>(
      'SELECT COUNT(*) AS c FROM transcript_entries WHERE session_id = ? AND variant = ?',
      [sessionId, variant],
    );
    return n(rows[0]?.c ?? 0);
  }

  // -- analysis + structured memory (§18) --

  setAnalysis(sessionId: string, record: AnalysisRecord): void {
    this.db.run(
      `INSERT INTO analyses(session_id, status, provider, generated_at, json) VALUES(?,?,?,?,?)
       ON CONFLICT(session_id) DO UPDATE SET
         status=excluded.status, provider=excluded.provider,
         generated_at=excluded.generated_at, json=excluded.json`,
      [
        sessionId,
        record.status,
        record.provider ?? '',
        record.status === 'done' ? record.generatedAt : null,
        JSON.stringify(record),
      ],
    );
  }

  getAnalysis(sessionId: string): AnalysisRecord | null {
    const rows = this.db.all('SELECT json FROM analyses WHERE session_id = ?', [sessionId]);
    if (!rows.length) return null;
    try {
      return JSON.parse(s(rows[0].json)) as AnalysisRecord;
    } catch {
      return null;
    }
  }

  private indexMemory(kind: string, sessionId: string, entityId: number, text: string): void {
    this.db.run('INSERT INTO memory_fts(kind, session_id, entity_id, text) VALUES(?,?,?,?)', [
      kind,
      sessionId,
      String(entityId),
      text,
    ]);
  }

  private linkEvidence(
    entityType: string,
    entityId: number,
    sessionId: string,
    entryKeys: string[],
  ): void {
    if (!entryKeys.length) return;
    const rows = this.db.all<{ id: number }>(
      `SELECT id FROM transcript_entries
       WHERE session_id = ? AND variant = 'raw' AND entry_key IN (${placeholders(entryKeys.length)})`,
      [sessionId, ...entryKeys],
    );
    for (const r of rows) {
      this.db.run(
        'INSERT INTO evidence_refs(entity_type, entity_id, transcript_entry_id) VALUES(?,?,?)',
        [entityType, entityId, n(r.id)],
      );
    }
  }

  private lastId(): number {
    const rows = this.db.all<{ id: number }>('SELECT last_insert_rowid() AS id');
    return n(rows[0]?.id ?? 0);
  }

  /**
   * Turn one meeting's analysis into queryable entities. Re-running replaces
   * that meeting's rows, so a regenerate never leaves duplicates behind.
   * Open questions already resolved in a later meeting keep that state.
   */
  indexAnalysis(
    sessionId: string,
    analysis: Analysis,
    findEvidence: EvidenceResolver = () => [],
  ): void {
    const created = nowIso();
    transact(this.db, () => {
      const resolved = this.db.all(
        `SELECT question, status, resolved_in FROM open_questions
         WHERE session_id = ? AND status = 'resolved'`,
        [sessionId],
      );
      for (const t of ['decisions', 'action_items', 'open_questions', 'risks']) {
        this.db.run(
          `DELETE FROM evidence_refs WHERE entity_type = ? AND entity_id IN
            (SELECT id FROM ${t} WHERE session_id = ?)`,
          [t, sessionId],
        );
        this.db.run(`DELETE FROM ${t} WHERE session_id = ?`, [sessionId]);
      }
      this.db.run("DELETE FROM memory_fts WHERE session_id = ? AND kind != 'document'", [sessionId]);

      for (const d of analysis.decisions) {
        this.db.run(
          `INSERT INTO decisions(session_id, topic, decision, reason, rejected, created_at)
           VALUES(?,?,?,?,?,?)`,
          [sessionId, d.topic, d.what, d.why, JSON.stringify(d.rejected ?? []), created],
        );
        const id = this.lastId();
        const text = [d.what, d.why, d.topic].filter(Boolean).join(' — ');
        this.indexMemory('decision', sessionId, id, text);
        this.linkEvidence('decisions', id, sessionId, findEvidence(`${d.what} ${d.why}`));
      }

      for (const a of analysis.actionItems) {
        this.db.run(
          `INSERT INTO action_items(session_id, task, owner, due_at, status, created_at)
           VALUES(?,?,?,?,'open',?)`,
          [sessionId, a.task, a.owner, a.due, created],
        );
        const id = this.lastId();
        this.indexMemory('action', sessionId, id, [a.task, a.owner].filter(Boolean).join(' — '));
        this.linkEvidence('action_items', id, sessionId, findEvidence(a.task));
      }

      const wasResolved = new Set(resolved.map((r) => s(r.question)));
      for (const q of analysis.openQuestions) {
        const prev = resolved.find((r) => s(r.question) === q);
        this.db.run(
          `INSERT INTO open_questions(session_id, question, status, resolved_in, created_at)
           VALUES(?,?,?,?,?)`,
          [
            sessionId,
            q,
            wasResolved.has(q) ? 'resolved' : 'open',
            prev?.resolved_in ? s(prev.resolved_in) : null,
            created,
          ],
        );
        const id = this.lastId();
        this.indexMemory('question', sessionId, id, q);
        this.linkEvidence('open_questions', id, sessionId, findEvidence(q));
      }

      this.relinkSupersessions(analysis.decisions.map((d) => d.topic));

      for (const r of analysis.risks) {
        this.db.run('INSERT INTO risks(session_id, risk, created_at) VALUES(?,?,?)', [
          sessionId,
          r,
          created,
        ]);
        this.indexMemory('risk', sessionId, this.lastId(), r);
      }
    });
  }

  /**
   * A decision on a topic that was already decided earlier supersedes it
   * (§18). Recomputed per topic rather than patched incrementally, so a
   * re-analysis that removes or rewrites a decision cannot leave a link
   * pointing at a row that no longer exists.
   */
  relinkSupersessions(topics: string[]): void {
    for (const topic of [...new Set(topics.map((t) => t.trim().toLowerCase()).filter(Boolean))]) {
      const rows = this.db.all(
        `SELECT d.id FROM decisions d JOIN meeting_sessions ms ON ms.id = d.session_id
         WHERE lower(trim(d.topic)) = ?
         ORDER BY ms.started_at, d.id`,
        [topic],
      );
      for (let i = 0; i < rows.length; i++) {
        // the last decision on a topic is the one that still stands
        const next = i + 1 < rows.length ? n(rows[i + 1].id) : null;
        this.db.run('UPDATE decisions SET superseded_by = ? WHERE id = ?', [next, n(rows[i].id)]);
      }
    }
  }

  // -- structured memory queries (P1.7, P1.9, P1.10) --

  decisions(opts: { sessionId?: string; topic?: string; since?: string; limit?: number } = {}): DecisionRow[] {
    const where: string[] = [];
    const params: SqlValue[] = [];
    if (opts.sessionId) (where.push('d.session_id = ?'), params.push(opts.sessionId));
    if (opts.topic) (where.push('d.topic = ?'), params.push(opts.topic));
    if (opts.since) (where.push('ms.started_at >= ?'), params.push(opts.since));
    const rows = this.db.all(
      `SELECT d.* FROM decisions d JOIN meeting_sessions ms ON ms.id = d.session_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY ms.started_at DESC, d.id DESC LIMIT ?`,
      [...params, opts.limit ?? 200],
    );
    return rows.map((r) => ({
      id: n(r.id),
      sessionId: s(r.session_id),
      topic: s(r.topic),
      decision: s(r.decision),
      reason: s(r.reason),
      rejected: JSON.parse(s(r.rejected) || '[]') as string[],
      createdAt: s(r.created_at),
      supersededBy: r.superseded_by ? n(r.superseded_by) : null,
    }));
  }

  actions(opts: { sessionId?: string; owner?: string; status?: 'open' | 'done'; limit?: number } = {}): ActionRow[] {
    const where: string[] = [];
    const params: SqlValue[] = [];
    if (opts.sessionId) (where.push('a.session_id = ?'), params.push(opts.sessionId));
    if (opts.owner) (where.push('a.owner = ?'), params.push(opts.owner));
    if (opts.status) (where.push('a.status = ?'), params.push(opts.status));
    const rows = this.db.all(
      `SELECT a.* FROM action_items a JOIN meeting_sessions ms ON ms.id = a.session_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY ms.started_at DESC, a.id LIMIT ?`,
      [...params, opts.limit ?? 300],
    );
    return rows.map((r) => ({
      id: n(r.id),
      sessionId: s(r.session_id),
      task: s(r.task),
      owner: s(r.owner),
      dueAt: s(r.due_at),
      status: s(r.status) === 'done' ? 'done' : 'open',
      createdAt: s(r.created_at),
      doneAt: r.done_at ? s(r.done_at) : null,
      externalRef: r.external_ref ? s(r.external_ref) : null,
    }));
  }

  setActionStatus(id: number, status: 'open' | 'done'): void {
    this.db.run('UPDATE action_items SET status = ?, done_at = ? WHERE id = ?', [
      status,
      status === 'done' ? nowIso() : null,
      id,
    ]);
  }

  setActionExternalRef(id: number, ref: string): void {
    this.db.run('UPDATE action_items SET external_ref = ? WHERE id = ?', [ref, id]);
  }

  questions(opts: { sessionId?: string; status?: 'open' | 'resolved'; limit?: number } = {}): QuestionRow[] {
    const where: string[] = [];
    const params: SqlValue[] = [];
    if (opts.sessionId) (where.push('q.session_id = ?'), params.push(opts.sessionId));
    if (opts.status) (where.push('q.status = ?'), params.push(opts.status));
    const rows = this.db.all(
      `SELECT q.* FROM open_questions q JOIN meeting_sessions ms ON ms.id = q.session_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY ms.started_at DESC, q.id LIMIT ?`,
      [...params, opts.limit ?? 300],
    );
    return rows.map((r) => ({
      id: n(r.id),
      sessionId: s(r.session_id),
      question: s(r.question),
      status: s(r.status) === 'resolved' ? 'resolved' : 'open',
      resolvedIn: r.resolved_in ? s(r.resolved_in) : null,
      createdAt: s(r.created_at),
    }));
  }

  resolveQuestion(id: number, resolvedIn: string | null): void {
    this.db.run('UPDATE open_questions SET status = ?, resolved_in = ? WHERE id = ?', [
      resolvedIn ? 'resolved' : 'open',
      resolvedIn,
      id,
    ]);
  }

  /** Transcript lines that back an extracted entity — the "why" behind a row. */
  evidenceFor(entityType: string, entityId: number): Entry[] {
    return this.db
      .all(
        `SELECT te.entry_key, te.speaker, te.text, te.started_at
         FROM evidence_refs er JOIN transcript_entries te ON te.id = er.transcript_entry_id
         WHERE er.entity_type = ? AND er.entity_id = ? ORDER BY te.seq`,
        [entityType, entityId],
      )
      .map((r) => ({
        id: s(r.entry_key),
        speaker: s(r.speaker),
        text: s(r.text),
        time: s(r.started_at),
      }));
  }

  // -- documents & chat --

  saveDoc(sessionId: string, type: DocType, doc: StoredDoc): void {
    this.db.run(
      `INSERT INTO documents(session_id, type, content, generated_at, provider) VALUES(?,?,?,?,?)
       ON CONFLICT(session_id, type) DO UPDATE SET
         content=excluded.content, generated_at=excluded.generated_at, provider=excluded.provider`,
      [sessionId, type, doc.content, doc.generatedAt, doc.provider],
    );
    this.db.run("DELETE FROM memory_fts WHERE kind='document' AND session_id=? AND entity_id=?", [
      sessionId,
      type,
    ]);
    this.db.run('INSERT INTO memory_fts(kind, session_id, entity_id, text) VALUES(?,?,?,?)', [
      'document',
      sessionId,
      type,
      doc.content.slice(0, 20_000),
    ]);
  }

  docs(sessionId: string): MeetingDocs {
    const out: MeetingDocs = {};
    for (const r of this.db.all('SELECT * FROM documents WHERE session_id = ?', [sessionId])) {
      out[s(r.type) as DocType] = {
        content: s(r.content),
        generatedAt: s(r.generated_at),
        provider: s(r.provider),
      };
    }
    return out;
  }

  appendChat(sessionId: string, message: ChatMessage): void {
    this.db.run(
      'INSERT INTO chat_messages(session_id, role, content, time, result_json) VALUES(?,?,?,?,?)',
      [sessionId, message.role, message.content, message.time, message.result ? JSON.stringify(message.result) : null],
    );
  }

  chat(sessionId: string, limit = 100): ChatMessage[] {
    const rows = this.db.all(
      'SELECT * FROM (SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id DESC LIMIT ?) ORDER BY id',
      [sessionId, limit],
    );
    return rows.map((r) => {
      const msg: ChatMessage = {
        role: s(r.role) === 'user' ? 'user' : 'assistant',
        content: s(r.content),
        time: s(r.time),
      };
      if (r.result_json) {
        try {
          msg.result = JSON.parse(s(r.result_json)) as AskResult;
        } catch {
          /* a corrupt result must not hide the answer text */
        }
      }
      return msg;
    });
  }

  clearChat(sessionId: string): void {
    this.db.run('DELETE FROM chat_messages WHERE session_id = ?', [sessionId]);
  }

  // -- search (P1.4 / P1.6 / §27) --

  /**
   * One query across every index: transcript lines and the structured memory.
   * Results are ranked by BM25 within each index and interleaved by score, so
   * an open question that phrases the topic better than any single caption
   * line can still come first.
   */
  search(query: string, opts: { limit?: number; sessionId?: string } = {}): SearchHit[] {
    const match = ftsQuery(query);
    if (!match) return [];
    const limit = opts.limit ?? 30;
    const titles = new Map<string, string>();
    for (const r of this.db.all('SELECT id, title FROM meeting_sessions')) {
      titles.set(s(r.id), s(r.title));
    }

    const hits: SearchHit[] = [];
    const sessionFilter = opts.sessionId ? 'AND te.session_id = ?' : '';
    const params: SqlValue[] = opts.sessionId ? [match, opts.sessionId, limit] : [match, limit];
    for (const r of this.db.all(
      `SELECT te.session_id, te.entry_key, te.speaker, te.text, te.started_at,
              bm25(transcript_fts) AS score
       FROM transcript_fts JOIN transcript_entries te ON te.id = transcript_fts.rowid
       WHERE transcript_fts MATCH ? AND te.variant = 'raw' ${sessionFilter}
       ORDER BY score LIMIT ?`,
      params,
    )) {
      hits.push({
        kind: 'transcript',
        sessionId: s(r.session_id),
        sessionTitle: titles.get(s(r.session_id)) ?? '',
        entityId: 0,
        text: s(r.text),
        speaker: s(r.speaker),
        time: s(r.started_at),
        score: -n(r.score),
      });
    }

    const memFilter = opts.sessionId ? 'AND session_id = ?' : '';
    const memParams: SqlValue[] = opts.sessionId ? [match, opts.sessionId, limit] : [match, limit];
    for (const r of this.db.all(
      `SELECT kind, session_id, entity_id, text, bm25(memory_fts) AS score
       FROM memory_fts WHERE memory_fts MATCH ? ${memFilter} ORDER BY score LIMIT ?`,
      memParams,
    )) {
      hits.push({
        kind: s(r.kind) as SearchHit['kind'],
        sessionId: s(r.session_id),
        sessionTitle: titles.get(s(r.session_id)) ?? '',
        entityId: Number(s(r.entity_id)) || 0,
        text: s(r.text),
        speaker: '',
        time: null,
        score: -n(r.score) + 0.5, // structured memory is a stronger signal
      });
    }

    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // -- projects (P2.3) --

  upsertProject(id: string, name: string): void {
    this.db.run(
      `INSERT INTO projects(id, name, created_at) VALUES(?,?,?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
      [id, name, nowIso()],
    );
  }

  projects(): { id: string; name: string }[] {
    return this.db
      .all('SELECT id, name FROM projects ORDER BY name')
      .map((r) => ({ id: s(r.id), name: s(r.name) }));
  }

  deleteProject(id: string): void {
    transact(this.db, () => {
      this.db.run('UPDATE meeting_sessions SET project_id = NULL WHERE project_id = ?', [id]);
      this.db.run('DELETE FROM projects WHERE id = ?', [id]);
    });
  }

  // -- highlights (P2.2) --

  addHighlight(sessionId: string, seq: number, kind: string, text: string): void {
    this.db.run(
      `INSERT INTO highlights(session_id, seq, kind, text, created_at) VALUES(?,?,?,?,?)
       ON CONFLICT(session_id, seq, kind) DO NOTHING`,
      [sessionId, seq, kind, text, nowIso()],
    );
  }

  highlights(sessionId: string): { id: number; seq: number; kind: string; text: string }[] {
    return this.db
      .all('SELECT * FROM highlights WHERE session_id = ? ORDER BY seq', [sessionId])
      .map((r) => ({ id: n(r.id), seq: n(r.seq), kind: s(r.kind), text: s(r.text) }));
  }

  // -- templates (P2.1) --

  saveTemplate(t: { id: string; name: string; kind: string; instructions: string; sections?: string[] }): void {
    this.db.run(
      `INSERT INTO templates(id, name, kind, instructions, sections, created_at) VALUES(?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, kind=excluded.kind,
         instructions=excluded.instructions, sections=excluded.sections`,
      [t.id, t.name, t.kind, t.instructions, JSON.stringify(t.sections ?? []), nowIso()],
    );
  }

  templates(kind?: string): { id: string; name: string; kind: string; instructions: string; sections: string[] }[] {
    const rows = kind
      ? this.db.all('SELECT * FROM templates WHERE kind = ? ORDER BY name', [kind])
      : this.db.all('SELECT * FROM templates ORDER BY name');
    return rows.map((r) => ({
      id: s(r.id),
      name: s(r.name),
      kind: s(r.kind),
      instructions: s(r.instructions),
      sections: JSON.parse(s(r.sections) || '[]') as string[],
    }));
  }

  deleteTemplate(id: string): void {
    this.db.run('DELETE FROM templates WHERE id = ?', [id]);
  }

  // -- key/value (migration flags, sync cursors) --

  get(key: string): string | null {
    const rows = this.db.all('SELECT value FROM kv WHERE key = ?', [key]);
    return rows.length ? s(rows[0].value) : null;
  }

  set(key: string, value: string): void {
    this.db.run(
      'INSERT INTO kv(key, value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [key, value],
    );
  }

  // -- sync outbox (P2.6-P2.8) --

  queueSync(sessionId: string, op: string): void {
    this.db.run('INSERT INTO sync_outbox(session_id, op, queued_at) VALUES(?,?,?)', [
      sessionId,
      op,
      nowIso(),
    ]);
  }

  pendingSync(limit = 50): { id: number; sessionId: string; op: string }[] {
    return this.db
      .all('SELECT * FROM sync_outbox WHERE sent_at IS NULL ORDER BY id LIMIT ?', [limit])
      .map((r) => ({ id: n(r.id), sessionId: s(r.session_id), op: s(r.op) }));
  }

  markSynced(ids: number[]): void {
    if (!ids.length) return;
    this.db.run(
      `UPDATE sync_outbox SET sent_at = ? WHERE id IN (${placeholders(ids.length)})`,
      [nowIso(), ...ids],
    );
  }
}
