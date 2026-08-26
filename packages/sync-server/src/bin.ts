import { readFileSync } from 'node:fs';
import { createServer, loadTokens } from './server';
import { SyncStore } from './store';

// Runs on the user's own machine:
//
//   COMPANION_TOKEN=<secret> npm run start -w @meetcc/sync-server
//
// Binds 127.0.0.1 by default. That is deliberate: the extension will only sync
// to https:// or to localhost (browsers treat localhost as a secure context),
// so exposing this on a LAN address without TLS would put the bearer token on
// the wire in clear. To reach it from another machine, put it behind a TLS
// reverse proxy and point the extension at the https:// URL.

const env = (name: string, fallback = ''): string => process.env[name] ?? fallback;

let tokens: Map<string, string>;
try {
  tokens = loadTokens(process.env, (path) => readFileSync(path, 'utf8'));
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

if (!tokens.size) {
  console.error(
    'Tidak ada token. Set COMPANION_TOKEN=<secret> (opsional COMPANION_WORKSPACE=<id>),\n' +
      'atau COMPANION_TOKENS_FILE=<file.json> berisi {"<token>": "<workspace>"}.',
  );
  process.exit(1);
}

const port = Number(env('PORT', '8787'));
const host = env('HOST', '127.0.0.1');
const dataDir = env('COMPANION_DATA', './companion-sync-data');

createServer({ store: new SyncStore(dataDir), tokens }).listen(port, host, () => {
  console.log(`Companion sync di http://${host}:${port} — data di ${dataDir}`);
  console.log(`Token aktif: ${tokens.size}. Isi endpoint ini di Settings → Sync.`);
});
