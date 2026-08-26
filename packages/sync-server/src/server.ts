import { timingSafeEqual } from 'node:crypto';
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { isSafeId, SyncStore, type StoredRecord } from './store';

// P2.6 / P2.7 / P2.8 — the endpoint `runSync` talks to:
//
//   PUT /sessions/:id   { sessionId, updatedAt, payload }
//   GET /sessions?since=<iso>   -> { sessions: [...] }
//
// It runs on the user's own machine. There is no hosted Companion service, no
// account, and no plaintext here — the payload is sealed in the browser before
// it is sent, so a compromised server leaks metadata (which meeting ids exist,
// when they changed) and nothing else.

export interface ServerOptions {
  store: SyncStore;
  /** token -> workspace it may touch. An empty workspace means "personal". */
  tokens: Map<string, string>;
  /** Refuse bodies larger than this; a meeting bundle is well under it. */
  maxBodyBytes?: number;
}

const DEFAULT_MAX_BODY = 32 * 1024 * 1024;

/**
 * Read the token table from the environment.
 *
 * Lives here rather than in the bin so it can be tested without starting a
 * server: a typo in the operator's token file is the difference between "sync
 * works" and "every request is 401", and it used to surface as a raw
 * SyntaxError stack from JSON.parse.
 */
export function loadTokens(
  env: Record<string, string | undefined>,
  readFile: (path: string) => string,
): Map<string, string> {
  const tokens = new Map<string, string>();

  const path = env.COMPANION_TOKENS_FILE;
  if (path) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFile(path));
    } catch (e) {
      throw new Error(`Tidak bisa membaca ${path}: ${(e as Error).message}`);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(`${path} harus berisi objek {"<token>": "<workspace>"}.`);
    }
    for (const [token, workspace] of Object.entries(parsed as Record<string, unknown>)) {
      if (!token) throw new Error(`${path} memuat token kosong.`);
      if (workspace !== '' && typeof workspace !== 'string') {
        throw new Error(`${path}: workspace untuk satu token bukan string.`);
      }
      tokens.set(token, workspace as string);
    }
  }

  if (env.COMPANION_TOKEN) tokens.set(env.COMPANION_TOKEN, env.COMPANION_WORKSPACE ?? '');
  return tokens;
}

/** Constant-time so a wrong token cannot be found one character at a time. */
function tokenMatches(candidate: string, known: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(known);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function authorize(req: IncomingMessage, tokens: Map<string, string>): string | null {
  const header = req.headers.authorization ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!presented) return null;
  for (const [known, workspace] of tokens) {
    if (tokenMatches(presented, known)) return workspace;
  }
  return null;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        // stop reading but leave the socket alive: destroying it here loses the
        // 413 too, and the client just sees a connection reset
        req.pause();
        reject(new Error('too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseRecord(raw: string, sessionId: string): StoredRecord | string {
  let body: Partial<StoredRecord>;
  try {
    body = JSON.parse(raw) as Partial<StoredRecord>;
  } catch {
    return 'Body bukan JSON.';
  }
  if (typeof body.payload !== 'string' || !body.payload) return 'payload wajib diisi.';
  if (typeof body.updatedAt !== 'string' || Number.isNaN(Date.parse(body.updatedAt))) {
    return 'updatedAt harus ISO timestamp.';
  }
  if (body.sessionId && body.sessionId !== sessionId) return 'sessionId tidak cocok dengan path.';
  return { sessionId, updatedAt: body.updatedAt, payload: body.payload };
}

export async function handle(req: IncomingMessage, res: ServerResponse, opts: ServerOptions): Promise<void> {
  const workspace = authorize(req, opts.tokens);
  if (workspace === null) return send(res, 401, { error: 'Token tidak dikenal.' });

  // A token is bound to one workspace, so a client asking for another one is
  // told no rather than quietly served its own.
  const asked = String(req.headers['x-companion-workspace'] ?? '');
  if (asked !== workspace) return send(res, 403, { error: 'Workspace tidak diizinkan token ini.' });

  const url = new URL(req.url ?? '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/sessions') {
    return send(res, 200, { sessions: opts.store.since(workspace, url.searchParams.get('since') ?? '') });
  }

  if (req.method === 'PUT' && url.pathname.startsWith('/sessions/')) {
    const sessionId = decodeURIComponent(url.pathname.slice('/sessions/'.length));
    if (!isSafeId(sessionId)) return send(res, 400, { error: 'sessionId tidak valid.' });
    let raw: string;
    try {
      raw = await readBody(req, opts.maxBodyBytes ?? DEFAULT_MAX_BODY);
    } catch {
      // the rest of the upload is never read, so the connection has to go once
      // the refusal is on the wire
      res.setHeader('Connection', 'close');
      return send(res, 413, { error: 'Body terlalu besar.' });
    }
    const record = parseRecord(raw, sessionId);
    if (typeof record === 'string') return send(res, 400, { error: record });
    return send(res, 200, opts.store.put(workspace, record));
  }

  send(res, 404, { error: 'Rute tidak dikenal.' });
}

export function createServer(opts: ServerOptions) {
  return createHttpServer((req, res) => {
    handle(req, res, opts).catch(() => send(res, 500, { error: 'Kesalahan internal.' }));
  });
}
