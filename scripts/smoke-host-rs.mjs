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
  env: { ...process.env, HOME: home },
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

// The ping must leave nothing behind: a ping that fell through to the vault
// writer once created a note in a real vault.
const spool = join(home, 'Library/Application Support/dev.suiflex.companion/spool');
const files = readdirSync(spool);
if (files.length !== 2) fail(`expected 2 spooled batches, found ${files.length}: ${files}`);
console.log('HOST SPOOL OK');

rmSync(home, { recursive: true, force: true });
console.log('HOST SMOKE OK');
