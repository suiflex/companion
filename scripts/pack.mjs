#!/usr/bin/env node
// Packs the built extension into the release artifacts.
//
//   node scripts/pack.mjs            both targets
//   node scripts/pack.mjs chrome     Chromium zip only
//   node scripts/pack.mjs firefox    Firefox zip only
//
// One build, two manifests. Chromium loads apps/extension/dist as-is; Gecko
// needs an event page instead of a service worker and gets its identity from
// browser_specific_settings, so the `key` is stripped on the way out.
//
// Output lands at the repo root with the exact names the CI release step and
// `companion update` already look for:
//   meetcc-extension-v<version>.zip
//   meetcc-extension-firefox-v<version>.zip

import { readFile, writeFile, readdir, mkdir, rm, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeZip } from './zip.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'apps', 'extension', 'dist');

/** Every file under `dir`, as zip entries with forward-slash paths. */
async function collect(dir) {
  const entries = [];
  const walk = async (current) => {
    for (const e of await readdir(current, { withFileTypes: true })) {
      const full = join(current, e.name);
      if (e.isDirectory()) await walk(full);
      else entries.push({ name: relative(dir, full).split(sep).join('/'), data: await readFile(full) });
    }
  };
  await walk(dir);
  return entries.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** Gecko MV3 runs an event page and rejects `service_worker`. */
function firefoxManifest(manifest) {
  const m = { ...manifest };
  delete m.key;
  m.background = { scripts: ['background.js'], type: 'module' };
  m.host_permissions = (manifest.host_permissions || []).filter(
    (host) => host !== 'https://api.github.com/*',
  );
  return m;
}

async function main() {
  const targets = process.argv.slice(2);
  const want = (t) => targets.length === 0 || targets.includes(t);

  if (!existsSync(join(DIST, 'manifest.json'))) {
    console.error('No build at apps/extension/dist — run `npm run build` first.');
    process.exit(1);
  }

  const manifest = JSON.parse(await readFile(join(DIST, 'manifest.json'), 'utf8'));
  const { version } = manifest;
  const written = [];

  if (want('chrome')) {
    const out = join(ROOT, `meetcc-extension-v${version}.zip`);
    await writeFile(out, makeZip(await collect(DIST)));
    written.push(out);
  }

  if (want('firefox')) {
    // web-ext signs a directory, so the patched tree is kept next to dist
    // rather than living only inside the zip.
    const ffDir = join(ROOT, 'apps', 'extension', 'dist-firefox');
    await rm(ffDir, { recursive: true, force: true });
    await mkdir(ffDir, { recursive: true });
    await cp(DIST, ffDir, { recursive: true });
    await writeFile(
      join(ffDir, 'manifest.json'),
      `${JSON.stringify(firefoxManifest(manifest), null, 2)}\n`,
    );
    const out = join(ROOT, `meetcc-extension-firefox-v${version}.zip`);
    await writeFile(out, makeZip(await collect(ffDir)));
    written.push(out);
    console.log(`Firefox source tree: ${relative(ROOT, ffDir)}`);
  }

  for (const f of written) console.log(`Packed ${relative(ROOT, f)}`);
}

// Only pack when run as a command — the test imports firefoxManifest.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

export { firefoxManifest };
