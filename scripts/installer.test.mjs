import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CLI_MODULES } from './companion.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(HERE, name), 'utf8');

/** The `for f in a.mjs b.mjs; do` list the curl installer copies. */
function installedModules(sh) {
  const m = /^for f in ([^;]+); do$/m.exec(sh);
  if (!m) throw new Error('install.sh no longer has a `for f in …; do` module list');
  return m[1].trim().split(/\s+/);
}

/** Every sibling module the CLI imports at load time. */
function importedModules(mjs) {
  return [...mjs.matchAll(/^import [^;]*? from '\.\/([\w.]+\.mjs)';$/gm)].map((m) => m[1]);
}

describe('standalone install', () => {
  // This is not hypothetical: the CLI gained an import of nativeHost.mjs while
  // the installer's list stayed as it was, and a fresh curl install produced a
  // `companion` that died with ERR_MODULE_NOT_FOUND on every invocation. The
  // repo's own gate never runs the standalone path, so nothing caught it.
  it('copies every module the CLI imports', () => {
    const installed = installedModules(read('install.sh'));
    const imported = importedModules(read('companion.mjs'));
    expect(imported.length).toBeGreaterThan(0);
    expect(imported.filter((f) => !installed.includes(f))).toEqual([]);
  });

  it('agrees with the CLI_MODULES the updater refreshes', () => {
    // Three lists have to say the same thing: what the installer writes, what
    // the updater replaces, and what the CLI imports. Two of them drifting is
    // what broke it.
    expect([...CLI_MODULES].sort()).toEqual([...installedModules(read('install.sh'))].sort());
  });

  it('copies nothing the CLI does not import', () => {
    // The other direction is cheap and keeps the list honest as modules go.
    const installed = installedModules(read('install.sh'));
    const imported = importedModules(read('companion.mjs'));
    expect(installed.filter((f) => f !== 'companion.mjs' && !imported.includes(f))).toEqual([]);
  });

  it('updates the CLI, not just the extension dist', () => {
    // A fix shipped in the CLI reaches an existing install only if `update`
    // refreshes it; otherwise the user keeps the CLI they first installed and
    // never gains anything added to it.
    const mjs = read('companion.mjs');
    const update = /async function cmdUpdate\(\)[\s\S]*?\n}/.exec(mjs);
    expect(update, 'cmdUpdate not found').toBeTruthy();
    // A call, not a mention: the function already prints a message containing
    // the words "companion.mjs", which would satisfy a looser check.
    expect(update[0]).toMatch(/\brefreshCli\s*\(/);
  });
});
