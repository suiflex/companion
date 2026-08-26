// Proves the built bin starts under plain `node`, reads its env config and
// serves a real round trip — the vitest suite imports the module through
// vite's resolver and so cannot catch a packaging mistake.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('./dist/server.js', import.meta.url));
const data = mkdtempSync(join(tmpdir(), 'companion-sync-smoke-'));
const base = 'http://127.0.0.1:8799';

const child = spawn('node', [bin], {
  stdio: ['ignore', 'pipe', 'inherit'],
  env: { ...process.env, PORT: '8799', HOST: '127.0.0.1', COMPANION_TOKEN: 'smoke-token', COMPANION_DATA: data },
});

const done = (code, why) => {
  child.kill();
  rmSync(data, { recursive: true, force: true });
  if (why) console.error(`sync-server smoke test failed: ${why}`);
  else console.log('sync-server smoke test ok: PUT /sessions/:id then GET /sessions?since=');
  process.exit(code);
};

const timer = setTimeout(() => done(1, 'server did not answer in 20s'), 20_000);

child.stdout.once('data', async () => {
  clearTimeout(timer);
  const auth = { Authorization: 'Bearer smoke-token', 'X-Companion-Workspace': '', 'Content-Type': 'application/json' };
  try {
    const put = await fetch(`${base}/sessions/room%231000`, {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify({ sessionId: 'room#1000', updatedAt: '2026-08-24T07:00:00.000Z', payload: 'sealed' }),
    });
    if (!put.ok) return done(1, `PUT answered ${put.status}`);

    const { sessions } = await (await fetch(`${base}/sessions?since=`, { headers: auth })).json();
    if (sessions?.[0]?.payload !== 'sealed') return done(1, `GET returned ${JSON.stringify(sessions)}`);

    const denied = await fetch(`${base}/sessions?since=`, { headers: { Authorization: 'Bearer wrong' } });
    if (denied.status !== 401) return done(1, `a wrong token got ${denied.status}, expected 401`);

    done(0);
  } catch (e) {
    done(1, e.message);
  }
});
