// UI gate mas-reza 2026-08-28 — input untuk verdict mbak-laras (jalur teknis).
// Fokus: double-submit concurrent yang diverifikasi dari sisi SERVER (koreksi
// mbak-dewi: asersinya "tepat satu stored:true + satu record di disk", server
// ini tidak mengenal 409/422), survival retry-after-delay, dan baseline LWW
// offset untuk kartu t_c00e6296. Server = dist build @ 3bfe144 + working tree.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPO = '/Users/badrusshoolehk/Documents/riset/suiflex/extension-meet';
const PORT = 8799;
const TOKEN = 'reza-gate-token';
const data = mkdtempSync(join(tmpdir(), 'reza-gate-'));
const base = `http://127.0.0.1:${PORT}`;
const H = { authorization: `Bearer ${TOKEN}` };

const child = spawn('node', [join(REPO, 'packages/sync-server/dist/server.js')], {
  stdio: ['ignore', 'pipe', 'inherit'],
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', COMPANION_TOKEN: TOKEN, COMPANION_DATA: data },
});

try {
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('server tidak start dalam 15s')), 15000);
    child.stdout.on('data', (d) => { if (String(d).includes('Companion sync')) { clearTimeout(t); res(); } });
  });
  console.log('SERVER_UP port', PORT);

  const put = (id, updatedAt, payload) =>
    fetch(`${base}/sessions/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { ...H, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: id, updatedAt, payload }),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

  const fileFor = (id) => join(data, '_personal', encodeURIComponent(id) + '.json');
  const diskFiles = () => readdirSync(join(data, '_personal')).filter((n) => n.endsWith('.json'));

  // ---------- G1: 10 pasangan PUT identik concurrent ----------
  let pairPass = 0;
  let pairSample = null;
  let pairNon200 = 0;
  for (let i = 0; i < 10; i++) {
    const id = `gate-pair-${i}`;
    const pair = await Promise.all([
      put(id, '2026-08-28T20:00:00.000Z', `"p${i}"`),
      put(id, '2026-08-28T20:00:00.000Z', `"p${i}"`),
    ]);
    const stored = pair.map((p) => p.body?.stored);
    const statuses = pair.map((p) => p.status);
    if (statuses.some((s) => s !== 200)) pairNon200++;
    const oneTrue = stored.filter(Boolean).length === 1;
    let oneFile = false;
    try {
      const f = JSON.parse(readFileSync(fileFor(id), 'utf8'));
      oneFile = f.payload === `"p${i}"` && f.sessionId === id;
    } catch { oneFile = false; }
    if (oneTrue && oneFile && statuses.every((s) => s === 200)) pairPass++;
    if (!pairSample) pairSample = { statuses, stored, oneFile };
  }
  console.log(`G1 pair-race: ${pairPass}/10 PASS | non-200=${pairNon200} | sample=${JSON.stringify(pairSample)}`);

  // ---------- G2: storm 25 concurrent satu id ----------
  const storm = await Promise.all(
    Array.from({ length: 25 }, () => put('gate-storm', '2026-08-28T20:30:00.000Z', '"storm"')),
  );
  const stormTrue = storm.filter((s) => s.body?.stored === true).length;
  const stormFile = JSON.parse(readFileSync(fileFor('gate-storm'), 'utf8'));
  console.log(
    `G2 storm25: stored=true=${stormTrue} statuses=${JSON.stringify([...new Set(storm.map((s) => s.status))])} fileIntact=${stormFile.payload === '"storm"'}`,
  );

  // ---------- G3: retry setelah delay (simulasi double-tap saat jaringan lambat) ----------
  await put('gate-retry', '2026-08-28T21:00:00.000Z', '"v1"');
  await new Promise((r) => setTimeout(r, 150));
  const again = await put('gate-retry', '2026-08-28T21:00:00.000Z', '"v1"');
  const retryFile = JSON.parse(readFileSync(fileFor('gate-retry'), 'utf8'));
  console.log(
    `G3 retry-delayed: second.stored=${again.body?.stored} status=${again.status} filePayload=${retryFile.payload} PASS=${again.body?.stored === false && retryFile.payload === '"v1"'}`,
  );

  // ---------- G4: baseline LWW offset (untuk t_c00e6296 — bukan FAIL gate UI) ----------
  await put('gate-tz', '2026-08-28T15:00:00+07:00', '"wib-earlier"'); // instan 08:00Z
  const newer = await put('gate-tz', '2026-08-28T09:00:00Z', '"utc-later"'); // instan 09:00Z, lebih BARU
  const tzFile = JSON.parse(readFileSync(fileFor('gate-tz'), 'utf8'));
  console.log(
    `G4 lww-offset-baseline: newerStored=${newer.body?.stored} (ideal true) final=${tzFile.updatedAt} bugReproduced=${newer.body?.stored === false}`,
  );

  // ---------- G5: integritas state akhir ----------
  const names = diskFiles();
  const tmps = readdirSync(join(data, '_personal')).filter((n) => n.endsWith('.tmp'));
  let parseFail = 0;
  for (const n of names) {
    try {
      const r = JSON.parse(readFileSync(join(data, '_personal', n), 'utf8'));
      if (!r.sessionId || !r.updatedAt || typeof r.payload !== 'string') parseFail++;
    } catch { parseFail++; }
  }
  const expected = 10 + 1 + 1 + 1; // pairs + storm + retry + tz
  console.log(
    `G5 integrity: files=${names.length} expected=${expected} tmpLeftover=${tmps.length} parseFail=${parseFail} PASS=${names.length === expected && tmps.length === 0 && parseFail === 0}`,
  );

  console.log('GATE_SCRIPT_COMPLETE');
} finally {
  child.kill('SIGTERM');
  try { rmSync(data, { recursive: true, force: true }); } catch {}
}
