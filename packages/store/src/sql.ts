// The only thing the rest of the store knows about SQLite. Keeping it this
// small is what lets the repositories run against an in-memory database in
// tests and against OPFS in the extension without a second dialect.

export type SqlValue = string | number | null;

export interface SqlDriver {
  /** Multi-statement DDL / batch. No parameters, no results. */
  exec(sql: string): void;
  all<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): T[];
  run(sql: string, params?: SqlValue[]): void;
  close(): void;
}

/** MV3 can suspend the service worker at any time, so nothing may hold a
 *  connection open across turns: callers go through a provider that opens
 *  lazily and can reopen after a suspend (roadmap §29). */
export type DriverFactory = () => Promise<SqlDriver>;

export function one<T>(rows: T[]): T | null {
  return rows.length ? rows[0] : null;
}

/** Run `fn` in a transaction, rolling back on any error. */
export function transact<T>(db: SqlDriver, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* the failure that matters is the original one */
    }
    throw e;
  }
}

/** `?,?,?` for an IN (...) clause. Empty lists must be handled by the caller. */
export function placeholders(n: number): string {
  return new Array(n).fill('?').join(',');
}

/**
 * FTS5 MATCH expression from free text. Every term is quoted, so punctuation,
 * FTS operators and SQL metacharacters in user input cannot change the query's
 * shape; terms are OR-ed and prefixed so partial words still match.
 */
export function ftsQuery(text: string, prefix = true): string {
  const terms = text
    .toLowerCase()
    .replace(/["'()*:^-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
  if (!terms.length) return '';
  return terms.map((t) => `"${t}"${prefix ? '*' : ''}`).join(' OR ');
}
