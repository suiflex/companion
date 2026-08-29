// Probe malam ini: probe teknis live terhadap sync-server (dist @ 3bfe144)
// Prebuilt server is spawned as-is, probes run against the real built artifact.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = '/Users/badrusshoolehk/Documents/riset/suiflex/extension-meet';
const PORT = 8798;
const TOKEN = 'dewi-probe-token';
const data = mkdtempSync(join(tmpdir(), 'dewi-probe-'));
const base = `http://127.0.0.1:${PORT}`;
const H = { authorization: `Bearer ${TOKEN}` };
const F = {};

const child = spawn('node', [join(REPO, 'packages/sync-server/dist/server.js')], {
  stdio: ['ignore', 'pipe', 'inherit'],
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', COMPANION_TOKEN: TOKEN, COMPANION_DATA: data },
});

await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('server tidak start dalam 15s')), 15000);
  child.stdout.on('data', (d) => { if (String(d).includes('Companion sync')) { clearTimeout(t); res(); } });
});
console.log('SERVER_UP port', PORT);

const pct = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor((a.length * p) / 100))]; };
const ms1 = (v) => Math.round(v * 10) / 10;

async function raw(method, path, headers, body) {
  const t0 = performance.now();
  const r = await fetch(base + path, { method, headers, body });
  const ms = performance.now() - t0;
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, j, ms };
}
const put = (id, updatedAt, payload, hdrs = H) =>
  raw('PUT', `/sessions/${id}`, { ...hdrs, 'content-type': 'application/json' },
      payload === null ? null : JSON.stringify({ sessionId: decodeURIComponent(id), updatedAt, payload }));

// ---------- A. auth & validation ----------
F.a_noauth = await raw('PUT', '/sessions/x1', { 'content-type': 'application/json' }, JSON.stringify({ payload: 'p', updatedAt: '2026-08-28T20:00:00Z' }));
F.a_wrongws = await put('x2', '2026-08-28T20:00:00Z', '"p"', { ...H, 'x-companion-workspace': 'other-ws' });
F.a_get_ok = await raw('GET', '/sessions', H, undefined);
F.a_badid = await put('..%2Fescape', '2026-08-28T20:00:00Z', '"p"');
F.a_slashid = await put('a/b', '2026-08-28T20:00:00Z', '"p"');
F.a_nopayload = await raw('PUT', '/sessions/x3', { ...H, 'content-type': 'application/json' }, JSON.stringify({ updatedAt: '2026-08-28T20:00:00Z' }));
F.a_baddate = await raw('PUT', '/sessions/x4', { ...H, 'content-type': 'application/json' }, JSON.stringify({ payload: 'p', updatedAt: 'not-a-date' }));
F.a_notjson = await raw('PUT', '/sessions/x5', { ...H, 'content-type': 'application/json' }, 'inibukanjson');
F.a_idmismatch = await raw('PUT', '/sessions/x6', { ...H, 'content-type': 'application/json' }, JSON.stringify({ sessionId: 'lain', payload: 'p', updatedAt: '2026-08-28T20:00:00Z' }));
console.log('A auth+validation:', JSON.stringify(Object.fromEntries(Object.entries(F).filter(([k]) => k.startsWith('a_')).map(([k, v]) => [k, v.status]))));

// ---------- B. double-submit canonical (dua request identik hampir bersamaan) ----------
const dual = await Promise.all([
  put('race-pair', '2026-08-28T21:00:00.000Z', '"same"'),
  put('race-pair', '2026-08-28T21:00:00.000Z', '"same"'),
]);
const storedPair = dual.map((d) => d.j?.stored);
console.log('B pair:', JSON.stringify(dual.map((d) => d.status)), 'stored flags:', JSON.stringify(storedPair));

// ---------- C. storm 50 concurrent, updatedAt identik ----------
let t0 = performance.now();
const storm = await Promise.all(Array.from({ length: 50 }, () => put('race-50same', '2026-08-28T21:30:00.000Z', '"storm"')));
const stormWall = performance.now() - t0;
const storedTrue = storm.filter((s) => s.j?.stored === true).length;
const storedFalse = storm.filter((s) => s.j?.stored === false).length;
const statuses = [...new Set(storm.map((s) => s.status))];
console.log(`C storm50: stored=true=${storedTrue} stored=false=${storedFalse} statuses=${JSON.stringify(statuses)} wall=${ms1(stormWall)}ms`);

// ---------- D. storm 50 concurrent, updatedAt campuran (LWW monotonicity) ----------
const stamps = Array.from({ length: 50 }, (_, i) => `2026-08-28T21:${String(40 + (i % 10)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`);
t0 = performance.now();
await Promise.all(stamps.map((s) => put('race-lww', s, '"lww"')));
const lwwWall = performance.now() - t0;
const lwwFile = JSON.parse(readFileSync(join(data, '_personal', encodeURIComponent('race-lww') + '.json'), 'utf8'));
const expectedMax = stamps.slice().sort()[stamps.length - 1];
console.log(`D lww: final=${lwwFile.updatedAt} expectedMax=${expectedMax} monotonic=${lwwFile.updatedAt === expectedMax} wall=${ms1(lwwWall)}ms`);

// ---------- E. timestamp format sensitivity (timezone/fraction ordering) ----------
// E1: instan sama, presisi beda -> LWW yang benar: no-op, file tidak berubah
await put('tz-1', '2026-08-28T22:00:00.000Z', '"v1"');
const e1 = await put('tz-1', '2026-08-28T22:00:00Z', '"v2"'); // instan sama
// E2: offset +07:00 lebih DULU instannya, tapi string-nya "lebih besar"
await put('tz-2', '2026-08-28T15:00:00+07:00', '"wib-earlier"'); // = 08:00Z
const e2 = await put('tz-2', '2026-08-28T09:00:00Z', '"utc-later"'); // = 09:00Z, lebih BARU
const tz2File = JSON.parse(readFileSync(join(data, '_personal', encodeURIComponent('tz-2') + '.json'), 'utf8'));
console.log(`E tz: E1 same-instant stored=${e1.j?.stored} (ideal false) | E2 newer-UTC accepted=${e2.j?.stored} (ideal true) finalFile=${tz2File.updatedAt}`);

// ---------- F. latency: 100 PUT berurutan 270KB + polling GET ----------
const bigPayload = JSON.stringify({
  meetings: Array.from({ length: 150 }, (_, i) => ({
    id: `m-${i}`, title: `Weekly sync ${i}`,
    lines: Array.from({ length: 20 }, (_, j) => ({ speaker: `S${j % 5}`, text: `Discussion point ${j} with enough body text to approximate a real transcript line weight for payload sizing.` })),
  })),
});
console.log('payload bytes =', Buffer.byteLength(bigPayload));
const putMs = [];
for (let i = 0; i < 100; i++) {
  const r = await put(`perf-${String(i).padStart(3, '0')}`, `2026-08-28T23:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.000Z`, bigPayload);
  if (r.status !== 200) { console.log('PUT fail at', i, r.status); break; }
  putMs.push(r.ms);
}
const sinceAll = [];
for (let i = 0; i < 20; i++) sinceAll.push(await raw('GET', '/sessions', H, undefined));
const cursor = '2026-08-28T23:00:50.000Z';
const sinceCur = [];
for (let i = 0; i < 20; i++) sinceCur.push(await raw('GET', `/sessions?since=${encodeURIComponent(cursor)}`, H, undefined));
const stat = (name, arr, extra = '') => {
  const sizes = arr.map((a) => Number(a.j ? JSON.stringify(a.j).length : 0));
  console.log(`F ${name}: n=${arr.length} p50=${ms1(pct(putMsStub(arr), 50))}ms p95=${ms1(pct(putMsStub(arr), 95))}ms p99=${ms1(pct(putMsStub(arr), 99))}ms max=${ms1(Math.max(...arr.map((a) => a.ms)))}ms respBytes~${Math.max(...sizes)} ${extra}`);
};
function putMsStub(arr) { return arr.map((a) => a.ms); }
stat('PUT-seq', storm.slice(0, 0).concat(putMs.map((ms) => ({ ms, j: {} }))));
stat('GET-full', sinceAll, `(records≈${sinceAll[0].j?.sessions?.length})`);
stat('GET-since', sinceCur, `(records≈${sinceCur[0].j?.sessions?.length})`);

// ---------- G. integritas state tersimpan ----------
const dir = join(data, '_personal');
const names = readdirSync(dir);
const jsons = names.filter((n) => n.endsWith('.json'));
const tmps = names.filter((n) => n.endsWith('.tmp'));
let parseFail = 0; let missingFields = 0;
for (const n of jsons) {
  try { const r = JSON.parse(readFileSync(join(dir, n), 'utf8')); if (!r.sessionId || !r.updatedAt || typeof r.payload !== 'string') missingFields++; }
  catch { parseFail++; }
}
const expectedSessions = 6 + 1 + 1 + 100 + 1; // a_* yg lolos + race-pair + race-50same + perf + race-lww(tz terpisah sudah masuk)
console.log(`G files: json=${jsons.length} tmp_leftover=${tmps.length} parseFail=${parseFail} missingFields=${missingFields}`);

console.log('PROBE_COMPLETE');
writeFileSync('/tmp/dewi-probe-results.json', JSON.stringify(F, (k, v) => (v instanceof Map ? undefined : v), 2));
child.kill('SIGTERM');
try { rmSync(data, { recursive: true, force: true }); } catch {}
process.exit(0);
