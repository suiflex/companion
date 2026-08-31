#!/usr/bin/env node
// Spike native host: speaks Chrome Native Messaging (4-byte LE length + JSON) over stdio.
// Throwaway — validates protocol + operation_id dedupe only. Logs to /tmp.
'use strict';
const fs = require('fs');

const LOG = '/tmp/meetcc-spike-host.log';
const STATE = '/tmp/meetcc-spike-host-state.json';

function log(obj) {
  try { fs.appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), ...obj }) + '\n'); } catch { /* spike: never fatal */ }
}

log({ event: 'start', argv: process.argv.slice(2) });

let buf = Buffer.alloc(0);
process.stdin.on('data', (d) => {
  buf = Buffer.concat([buf, d]);
  tryParse();
});
process.stdin.on('end', () => log({ event: 'stdin_end' }));
process.on('exit', () => log({ event: 'exit' }));

function tryParse() {
  while (buf.length >= 4) {
    const len = buf.readUInt32LE(0);
    if (buf.length < 4 + len) return;
    let msg;
    try { msg = JSON.parse(buf.slice(4, 4 + len).toString('utf8')); }
    catch (e) { log({ event: 'bad_json', error: String(e) }); buf = buf.slice(4 + len); continue; }
    buf = buf.slice(4 + len);
    handle(msg);
  }
}

function seenState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return {}; }
}

function handle(msg) {
  const opId = msg.operation_id;
  if (!opId) {
    respond({ status: 'error', error: 'missing operation_id' });
    return;
  }
  const state = seenState();
  if (state[opId]) {
    log({ event: 'duplicate_suppressed', operation_id: opId, first_seen: state[opId] });
    respond({ status: 'duplicate', operation_id: opId, applied: false });
    return;
  }
  state[opId] = new Date().toISOString();
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  log({ event: 'applied', operation_id: opId, payload: msg.payload });
  respond({ status: 'ok', operation_id: opId, applied: true, host_received_at: state[opId] });
}

function respond(obj) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8');
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  process.stdout.write(head);
  process.stdout.write(body);
}
