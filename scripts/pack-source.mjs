#!/usr/bin/env node
// Builds the source archive AMO requires whenever the reviewed files are
// minified — ours are, because apps/extension/dist is a vite bundle.
//
//   node scripts/pack-source.mjs   ->  meetcc-source-v<version>.zip
//
// Contents are taken from `git ls-files`, so the archive is exactly the tracked
// tree: no node_modules, no dist, no .env, nothing gitignored. A reviewer runs
// the steps in REVIEWERS.md and must land on the same bundle.

import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeZip } from './zip.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const { version } = JSON.parse(await readFile(join(ROOT, 'apps/extension/public/manifest.json'), 'utf8'));

  // -z/NUL-separated so a path with a space or a quote cannot split a name.
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 64 << 20 })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);

  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT }).toString().trim();
  if (dirty) {
    console.error('Working tree is dirty — commit first, or the archive will not match the build.');
    console.error(dirty);
    process.exit(1);
  }

  const entries = [];
  for (const name of tracked) {
    entries.push({ name, data: await readFile(join(ROOT, name)) });
  }

  const out = join(ROOT, `meetcc-source-v${version}.zip`);
  await writeFile(out, makeZip(entries));
  console.log(`Packed meetcc-source-v${version}.zip (${entries.length} files)`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
