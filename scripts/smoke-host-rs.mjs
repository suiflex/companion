// The Rust host answers over stdio, framed the way the browser speaks.
//
// The same shape as `make smoke` for the Node host, and for the same reason:
// framing bugs are invisible to unit tests on either side of the pipe, and the
// replacement does not ship until it passes the gate the original passes.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const bin = process.argv[2];
if (!bin) throw new Error('usage: smoke-host-rs.mjs <path to companion-desktop>');

const frame = (obj) => {
  const body = Buffer.from(JSON.stringify(obj));
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length);
  return Buffer.concat([head, body]);
};

/** Read framed replies out of the host's stdout. */
function unframe(buf) {
  const out = [];
  let i = 0;
  while (i + 4 <= buf.length) {
    const len = buf.readUInt32LE(i);
    if (i + 4 + len > buf.length) break;
    out.push(JSON.parse(buf.slice(i + 4, i + 4 + len).toString('utf8')));
    i += 4 + len;
  }
  return out;
}

const home = mkdtempSync(join(tmpdir(), 'companion-host-'));

// Deleted rather than set to undefined: an undefined value in an env object can
// reach the child as the string "undefined". A runner that sets either of these
// would otherwise send the spool outside the directory this test cleans up.
const childEnv = { ...process.env, HOME: home, USERPROFILE: home };
delete childEnv.XDG_CONFIG_HOME;
delete childEnv.APPDATA;
const batch = (id) => ({
  operationId: id,
  roomId: 'meet/abc-defg-hij',
  platform: 'google-meet',
  startedAt: '2026-09-04T14:00:00+07:00',
  participants: ['Andi'],
  entries: [{ speaker: 'Andi', text: 'halo', time: '2026-09-04T14:00:01Z' }],
});

// Two batches and a ping in ONE write: the browser coalesces messages, and a
// host that assumes one message per chunk passes every other test there is.
const res = spawnSync(bin, ['--native-host'], {
  input: Buffer.concat([frame(batch('op-1')), frame({ type: 'ping' }), frame(batch('op-2'))]),
  env: childEnv,
});

const replies = unframe(res.stdout);
const fail = (m) => {
  console.error(`HOST SMOKE FAIL: ${m}`);
  console.error(res.stderr.toString().slice(0, 500));
  process.exit(1);
};

if (replies.length !== 3) fail(`expected 3 replies, got ${replies.length}`);
if (!replies[0].spooled) fail('first batch was not spooled');
if (!replies[1].pong) fail('ping was not answered');
if (!replies[2].spooled) fail('second batch was not spooled');
console.log('HOST FRAMING OK');

// Where the host spools, mirroring `config_dir_from` in src-tauri/src/lib.rs.
// It was hardcoded to the macOS path and so passed locally while failing on the
// Linux runner — the host was fine, the assertion was not.
//
// It reads no environment: the child's is stripped below, so consulting the
// runner's here would put the two sides of this test on different paths.
function spoolDir(base) {
  if (process.platform === 'darwin') return join(base, 'Library/Application Support');
  if (process.platform === 'win32') return join(base, 'AppData/Roaming');
  return join(base, '.config');
}

// The ping must leave nothing behind: a ping that fell through to the vault
// writer once created a note in a real vault.
const spool = join(spoolDir(home), 'dev.suiflex.companion', 'spool');
// Named, not thrown: the first failure of this check on CI was a raw ENOENT
// stack, which says a directory is missing but not which one was expected or
// why. The path is the whole finding.
let files;
try {
  files = readdirSync(spool);
} catch (e) {
  fail(`no spool at ${spool} (${e.code ?? e.message})`);
}
if (files.length !== 2) fail(`expected 2 spooled batches in ${spool}, found ${files.length}: ${files}`);
console.log('HOST SPOOL OK');

rmSync(home, { recursive: true, force: true });
console.log('HOST SMOKE OK');
