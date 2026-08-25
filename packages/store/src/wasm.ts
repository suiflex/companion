import type { SqlDriver, SqlValue } from './sql';

// SQLite compiled to WebAssembly, bundled with the extension — no CDN, no
// native module, no database server, no open port (§7.1). Persistence is OPFS
// inside the extension origin's own storage sandbox; in Node (tests) the same
// build runs against an in-memory database, so repositories are exercised on
// the real engine and the real SQL dialect.

/** Minimal shape of the sqlite3 oo1 API we depend on. */
interface Oo1Db {
  exec(opts: string | { sql: string; bind?: SqlValue[]; rowMode?: string; callback?: (row: unknown) => void }): unknown;
  close(): void;
}

interface Sqlite3 {
  oo1: {
    DB: new (filename: string, flags?: string) => Oo1Db;
    OpfsDb?: new (filename: string, flags?: string) => Oo1Db;
  };
  installOpfsSAHPoolVfs?: (opts: { name?: string }) => Promise<{ OpfsSAHPoolDb: new (f: string) => Oo1Db }>;
  capi?: unknown;
}

function wrap(db: Oo1Db): SqlDriver {
  return {
    exec(sql) {
      db.exec(sql);
    },
    all<T>(sql: string, params: SqlValue[] = []): T[] {
      const rows: T[] = [];
      db.exec({ sql, bind: params, rowMode: 'object', callback: (r) => rows.push(r as T) });
      return rows;
    },
    run(sql, params = []) {
      db.exec({ sql, bind: params });
    },
    close() {
      db.close();
    },
  };
}

/** Loaded once per context; the wasm module is expensive to instantiate. */
let modulePromise: Promise<Sqlite3> | null = null;

async function loadSqlite(): Promise<Sqlite3> {
  if (!modulePromise) {
    modulePromise = (async () => {
      const mod = await import('@sqlite.org/sqlite-wasm');
      const init = (mod.default ?? mod) as (opts?: unknown) => Promise<Sqlite3>;
      return init({ print: () => {}, printErr: () => {} });
    })().catch((e) => {
      modulePromise = null; // a failed load must not poison later attempts
      throw e;
    });
  }
  return modulePromise;
}

export const DB_FILENAME = 'companion.db';

/**
 * Open the database.
 *
 * Browser: the OPFS SAHPool VFS, which needs no COOP/COEP headers and no
 * SharedArrayBuffer — it does need exclusive access to its files, which is why
 * only the service worker opens the database and every other context goes
 * through it by message (§29).
 *
 * Node / no OPFS: an in-memory database. Callers that need durability check
 * `persistent`.
 */
export async function openDatabase(
  filename = DB_FILENAME,
): Promise<{ driver: SqlDriver; persistent: boolean }> {
  const sqlite3 = await loadSqlite();
  if (sqlite3.installOpfsSAHPoolVfs && typeof navigator !== 'undefined' && navigator.storage) {
    try {
      const pool = await sqlite3.installOpfsSAHPoolVfs({ name: 'companion-opfs' });
      return { driver: wrap(new pool.OpfsSAHPoolDb('/' + filename)), persistent: true };
    } catch (e) {
      // OPFS can be unavailable (private mode, policy, another context holding
      // the pool). Falling back keeps the feature working for this session
      // instead of taking the whole extension down with it.
      console.warn('[MeetCC] OPFS unavailable, using in-memory database:', e);
    }
  }
  return { driver: wrap(new sqlite3.oo1.DB(':memory:', 'c')), persistent: false };
}
