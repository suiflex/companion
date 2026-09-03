#!/usr/bin/env node
// Companion — terminal installer for Meet Companion.
//
// Runs in two modes:
//   * Standalone (COMPANION_HOME set, e.g. by the curl installer at
//     ~/.companion): the extension dist lives at $COMPANION_HOME/dist and can
//     be fetched / refreshed from the GitHub release. No node_modules needed.
//   * In-repo (run as `node scripts/companion.mjs`): builds apps/extension/dist
//     with npm if it is missing.
//
// Subcommands:
//   companion install                TTY-pick browser(s), launch in dedicated profiles
//   companion install --dir <path>   use an already-extracted release folder
//   companion install --profile <d>  override the dedicated profile dir
//   companion install --preview      show the TTY picker flow, do not launch
//   companion install --dry-run      detect + resolve dist, do not launch
//   companion update                 re-download the latest release dist (standalone)
//
// Installing also registers the desktop native-messaging host into the profile
// it launches, which is what lets the extension hand finished meetings to
// Companion Desktop. See scripts/nativeHost.mjs for why it has to be per-profile.
//   companion --help | -h            this help

import { existsSync, mkdirSync } from 'node:fs';
import { mkdir, rm, readdir, stat, copyFile } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { homedir, platform } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { extractZip } from './unzip.mjs';
import { pickerFrame } from './picker.mjs';
import { extensionIdFor, installHost } from './nativeHost.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPANION_HOME = process.env.COMPANION_HOME || null;

const REPO = 'suiflex/companion';
// Ask for the list and pick by tag rather than hitting `/releases/latest`. The
// two products now share one tag, so that endpoint would usually be right, but
// it is repository-wide: it answers with whatever released last, and this repo
// also publishes the rolling `companion-desktop-latest` pointer. Picking by tag
// shape cannot hand back a release with no extension zip on it.
const API_RELEASES = `https://api.github.com/repos/${REPO}/releases?per_page=30`;

/** The one tag both products ship from. */
export const RELEASE_TAG = /^v\d+\.\d+\.\d+/;

// Firefox installs from AMO, which also keeps the add-on updated. Addressed by
// add-on id rather than slug: AMO resolves either, and the slug can be renamed.
const AMO_URL = 'https://addons.mozilla.org/en-US/firefox/addon/companion%40suiflex.dev/';

const HELP = `Companion — terminal installer for Meet Companion

Loads the extension into a dedicated browser profile so your everyday browser
is never touched. Chromium browsers are loaded unpacked and start ready to use;
Firefox opens on the add-on's page, where one click installs it.

Usage:
  companion install                build/fetch dist, TTY-pick browser(s), launch
  companion install --dir <path>   use an already-extracted release folder
  companion install --profile <d>  override the dedicated profile dir
  companion install --preview      show the TTY picker flow, do not launch
  companion install --dry-run      detect + resolve dist, do not launch
  companion update                 re-download the latest release dist
  companion --help | -h            show this help

In a dedicated profile sign-ins (AI provider, trackers) persist across runs.`;

// --- argparse ---------------------------------------------------------------

function parseArgs() {
  const opts = { dir: null, profile: null, dryRun: false, preview: false, cmd: 'install' };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case 'install': opts.cmd = 'install'; break;
      case 'update': opts.cmd = 'update'; break;
      case '--dir': opts.dir = resolve(args[++i]); break;
      case '--profile': opts.profile = resolve(args[++i]); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--preview': opts.preview = true; break;
      case '--help':
      case '-h':
      case 'help':
        console.log(HELP);
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${args[i]}\n\n${HELP}`);
        process.exit(1);
    }
  }
  return opts;
}

// --- browser detection ------------------------------------------------------

// Chromium browsers take --load-extension; Firefox does not, and installs a
// signed .xpi instead. Everything downstream branches on this one field.
function detectBrowsers() {
  const p = platform();
  const found = [];

  if (p === 'darwin') {
    // the macOS .app binary is the display name (spaces and all), except Arc
    // and Opera which ship lowercase
    const apps = [
      ['Google Chrome', 'Google Chrome'],
      ['Google Chrome Canary', 'Google Chrome Canary'],
      ['Chromium', 'Chromium'],
      ['Microsoft Edge', 'Microsoft Edge'],
      ['Brave Browser', 'Brave Browser'],
      ['Arc', 'arc'],
      ['Vivaldi', 'Vivaldi'],
      ['Opera', 'Opera'],
      ['Firefox', 'firefox', 'gecko'],
    ];
    for (const [name, binName, engine = 'chromium'] of apps) {
      const bin = `/Applications/${name}.app/Contents/MacOS/${binName}`;
      if (existsSync(bin)) found.push({ name, binary: bin, tag: slug(name), engine });
    }
  } else if (p === 'linux') {
    for (const [name, cmds, tag, engine = 'chromium'] of [
      ['Google Chrome', ['google-chrome', 'google-chrome-stable'], 'chrome'],
      ['Chromium', ['chromium', 'chromium-browser'], 'chromium'],
      ['Microsoft Edge', ['microsoft-edge', 'microsoft-edge-stable'], 'edge'],
      ['Brave Browser', ['brave-browser', 'brave-browser-stable'], 'brave'],
      ['Vivaldi', ['vivaldi-stable', 'vivaldi'], 'vivaldi'],
      ['Opera', ['opera'], 'opera'],
      ['Firefox', ['firefox', 'firefox-esr'], 'firefox', 'gecko'],
    ]) {
      const bin = cmds.find((c) => commandExists(c));
      if (bin) found.push({ name, binary: bin, tag, engine });
    }
  } else if (p === 'win32') {
    // Chrome, Brave, Vivaldi and Opera all default to a *per-user* install, so
    // looking only under Program Files misses the common case entirely.
    const roots = [
      process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'),
      process.env.PROGRAMFILES || 'C:\\Program Files',
      process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)',
    ];
    for (const [name, rels, tag, engine = 'chromium'] of [
      ['Google Chrome', ['Google\\Chrome\\Application\\chrome.exe'], 'chrome'],
      ['Google Chrome Canary', ['Google\\Chrome SxS\\Application\\chrome.exe'], 'chrome-canary'],
      ['Chromium', ['Chromium\\Application\\chrome.exe'], 'chromium'],
      ['Microsoft Edge', ['Microsoft\\Edge\\Application\\msedge.exe'], 'edge'],
      ['Brave Browser', ['BraveSoftware\\Brave-Browser\\Application\\brave.exe'], 'brave'],
      ['Vivaldi', ['Vivaldi\\Application\\vivaldi.exe'], 'vivaldi'],
      ['Opera', ['Programs\\Opera\\opera.exe', 'Opera\\Application\\opera.exe'], 'opera'],
      ['Firefox', ['Mozilla Firefox\\firefox.exe'], 'firefox', 'gecko'],
    ]) {
      const bin = roots.flatMap((r) => rels.map((rel) => `${r}\\${rel}`)).find(existsSync);
      if (bin) found.push({ name, binary: bin, tag, engine });
    }
  }
  return found;
}

function commandExists(cmd) {
  return spawnSync(platform() === 'win32' ? 'where' : 'which', [cmd], { stdio: 'ignore' }).status === 0;
}

function slug(s) { return s.toLowerCase().replace(/ /g, '-'); }

// --- dist resolution --------------------------------------------------------

function hasManifest(dir) { return existsSync(join(dir, 'manifest.json')); }

async function recursiveCopy(src, dst) {
  const s = await stat(src);
  if (s.isDirectory()) {
    await mkdir(dst, { recursive: true });
    for (const e of await readdir(src)) await recursiveCopy(join(src, e), join(dst, e));
  } else {
    await mkdir(dirname(dst), { recursive: true });
    await copyFile(src, dst);
  }
}

/**
 * Newest published release for one product, or null.
 *
 * Drafts and prereleases are skipped, which is what /releases/latest did before
 * this took over from it. The list arrives newest-first, so the first match is
 * the answer.
 */
export function pickRelease(releases) {
  const hit = (releases || []).find(
    (r) => r && !r.draft && !r.prerelease && RELEASE_TAG.test(r.tag_name || ''),
  );
  return hit || null;
}

async function fetchLatestRelease() {
  console.log(`Fetching latest release (${REPO})…`);
  const res = await fetch(API_RELEASES, { headers: { 'User-Agent': 'companion-installer' } });
  if (!res.ok) throw new Error(`Could not reach GitHub releases (HTTP ${res.status}).`);
  const release = pickRelease(await res.json());
  if (!release) throw new Error(`No published release found in ${REPO}.`);
  return release;
}

async function downloadAsset(rel, match, what) {
  const asset = (rel.assets || []).find((a) => match.test(a.name));
  if (!asset) throw new Error(`No ${what} asset on the latest release (${rel.tag_name}).`);

  console.log(`Downloading ${asset.name} (${(asset.size / 1024 / 1024).toFixed(1)} MB)…`);
  const dl = await fetch(asset.browser_download_url, { headers: { 'User-Agent': 'companion-installer' } });
  if (!dl.ok) throw new Error(`Download failed (HTTP ${dl.status}).`);
  return Buffer.from(await dl.arrayBuffer());
}

async function downloadLatestDist(distDir, rel = null) {
  const release = rel || (await fetchLatestRelease());
  const buf = await downloadAsset(release, /^meetcc-extension-v.*\.zip$/, 'meetcc-extension-v*.zip');

  const tmp = `${distDir}.tmp-${process.pid}`;
  await mkdir(tmp, { recursive: true });
  await extractZip(buf, tmp);

  // release zip is flat (apps/extension/dist/* at root) -> move entries into distDir
  await mkdir(distDir, { recursive: true });
  for (const entry of await readdir(tmp)) {
    await recursiveCopy(join(tmp, entry), join(distDir, entry));
  }
  await rm(tmp, { recursive: true, force: true });
  if (!hasManifest(distDir)) throw new Error('Extracted release has no manifest.json — unexpected zip layout.');
  console.log(`Installed to ${distDir}\n`);
}

async function resolveChromiumDist(opts) {
  if (opts.dir) {
    if (!hasManifest(opts.dir)) throw new Error(`No unpacked extension at ${opts.dir} (missing manifest.json).`);
    return opts.dir;
  }

  if (COMPANION_HOME) {
    // standalone install
    const distDir = join(COMPANION_HOME, 'dist');
    if (!hasManifest(distDir)) {
      const yes = await confirm(`No extension dist at ${distDir} — download the latest release? (Y/n): `, true);
      if (!yes) throw new Error('Aborted — nothing to run.');
      await downloadLatestDist(distDir);
    }
    return distDir;
  }

  // in-repo: use the local build
  const distDir = join(HERE, '..', 'apps', 'extension', 'dist');
  if (hasManifest(distDir)) return distDir;
  console.log('No build found — building the extension first…');
  const r = spawnSync('npm', ['run', 'build', '-w', 'apps/extension'], {
    cwd: join(HERE, '..'), stdio: 'inherit', shell: platform() === 'win32',
  });
  if (r.status !== 0) throw new Error('Build failed — fix it, then re-run.');
  return distDir;
}

/**
 * The bundled native-messaging host, built if this is a repo checkout and
 * fetched from the release if it is not.
 *
 * The host is the desktop half of the bridge: without it registered, the
 * extension's sendNativeMessage lands nowhere and "Kirim rapat selesai ke
 * Companion Desktop" does nothing at all.
 */
async function resolveNativeHost() {
  if (COMPANION_HOME) {
    const hostPath = join(COMPANION_HOME, 'native-host.mjs');
    if (existsSync(hostPath)) return hostPath;
    const release = await fetchLatestRelease();
    const buf = await downloadAsset(release, /^companion-native-host-v.*\.mjs$/, 'companion-native-host-v*.mjs');
    await mkdir(COMPANION_HOME, { recursive: true });
    writeFileSync(hostPath, buf);
    return hostPath;
  }

  const hostPath = join(HERE, '..', 'apps', 'desktop', 'dist-native', 'native-host.mjs');
  if (existsSync(hostPath)) return hostPath;
  console.log('No native host build found — building it first...');
  const r = spawnSync('npm', ['run', 'build:host', '-w', 'apps/desktop'], {
    cwd: join(HERE, '..'), stdio: 'inherit', shell: platform() === 'win32',
  });
  if (r.status !== 0) throw new Error('Host build failed.');
  return hostPath;
}

/** The manifest the browser will actually load, for the extension id. */
function readExtensionManifest(sources) {
  const candidates = [
    sources.chromium && join(sources.chromium, 'manifest.json'),
    join(HERE, '..', 'apps', 'extension', 'public', 'manifest.json'),
    COMPANION_HOME && join(COMPANION_HOME, 'dist', 'manifest.json'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return JSON.parse(readFileSync(c, 'utf8'));
  }
  return null;
}

/**
 * Register the desktop bridge for one launched profile. Best-effort on
 * purpose: loading the extension is still worth doing when the desktop app is
 * not installed, so a failure here is reported and stepped over.
 */
async function registerNativeHost(browser, profileDir, extensionId, hostSource) {
  if (!extensionId) {
    console.log('    desktop bridge: skipped (could not determine the extension id)');
    return;
  }
  if (platform() === 'win32') {
    console.log('    desktop bridge: run apps/desktop/scripts/install-native-host.ps1 to register it on Windows');
    return;
  }
  try {
    const done = installHost({ browser, profileDir, hostSource: await hostSource(), extensionId });
    console.log(`    desktop bridge: registered (${done.manifestPath})`);
  } catch (e) {
    console.log(`    desktop bridge: not registered (${e.message})`);
  }
}

/** Resolve the local source Chromium needs. Firefox installs from AMO. */
export async function resolveSources(opts, browsers) {
  const sources = { chromium: null };
  if (browsers.some((b) => b.engine === 'chromium')) {
    sources.chromium = await resolveChromiumDist(opts);
  }
  return sources;
}

// --- TTY helpers ------------------------------------------------------------

async function confirm(question, def) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = (await rl.question(question)).trim().toLowerCase();
    if (ans === '') return def;
    return ['y', 'yes'].includes(ans);
  } finally {
    rl.close();
  }
}

async function pickBrowsers(browsers) {
  if (browsers.length === 1) {
    console.log(`\nOnly ${browsers[0].name} detected — using it.`);
    return [browsers[0]];
  }

  // Interactive multi-select: arrow keys move, Space toggles, Enter confirms.
  // Needs a raw TTY; when stdin is not a TTY (piped preview) fall back to
  // echoing the list and letting Enter select everything.
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log('\nWhich browsers should Companion run in? (non-interactive — all selected)');
    browsers.forEach((b, i) => console.log(`  ${i + 1}) ${b.name}`));
    await new Promise((r) => setTimeout(r, 0));
    return browsers;
  }

  const selected = new Set();
  let cursor = 0;

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write('\n');

  let painted = 0;
  const render = () => {
    const frame = pickerFrame({ browsers, cursor, selected, painted, highlight: fg1 });
    process.stdout.write(frame.out);
    painted = frame.rows;
  };

  const input = process.stdin;
  let buf = '';
  let resolvePicks;

  render();

  const done = () => {
    input.removeListener('data', onData);
    input.setRawMode(false);
    input.pause();
    process.stdout.write('\n'); // step off the frame's last row before anything else prints
    const picks = [...selected].sort((a, b) => a - b);
    resolvePicks(picks.map((i) => browsers[i]));
  };

  const onData = (chunk) => {
    buf += chunk.toString();
    // accumulate until we have one full key (a plain char, CR/LF, or a
    // complete 3-byte escape sequence) — arrow keys can arrive split
    while (buf.length > 0) {
      const code = buf[0];
      if (code === '\u001b') { // escape: need the full sequence
        if (buf.length < 3) break;
        const seq = buf.slice(0, 3);
        buf = buf.slice(3);
        if (seq === '\u001b[A') {
          cursor = (cursor - 1 + browsers.length) % browsers.length;
          render();
        } else if (seq === '\u001b[B') {
          cursor = (cursor + 1) % browsers.length;
          render();
        }
        continue;
      }
      const c = code;
      buf = buf.slice(1);
      if (c === '\u0003') { // Ctrl-C
        process.stdout.write('\n\n');
        input.setRawMode(false);
        input.pause();
        process.exit(130);
      } else if (c === '\r' || c === '\n') {
        done();
        return;
      } else if (c === ' ') {
        if (selected.has(cursor)) selected.delete(cursor);
        else selected.add(cursor);
        render();
      }
    }
  };

  input.on('data', onData);
  return await new Promise((r) => { resolvePicks = r; });
}

// --- branding ---------------------------------------------------------------

// Matches the terminal-side of the suiflex CLI family: a small boxed wordmark
// with an accent-colored icon, drawn with box-drawing chars (no figlet/image).
// Collapses to the plain word when stdout is not a TTY or NO_COLOR is set, so
// piped output stays clean. The bubble motif matches the logomark
// (assets/brand/logo-mark.svg) and the accent is its `#4ade80`.
const C = {
  reset: '\x1b[0m',
  accent: '\x1b[38;5;114m',
  fg1: '\x1b[1m\x1b[38;5;255m',
  fg3: '\x1b[38;5;247m',
  border: '\x1b[38;5;238m',
};

function colorEnabled(stream = process.stdout) {
  return Boolean(stream && stream.isTTY) && !process.env.NO_COLOR;
}
function paint(code) {
  return (text, stream = process.stdout) =>
    colorEnabled(stream) ? `${code}${text}${C.reset}` : text;
}

const accent = paint(C.accent);
const fg1 = paint(C.fg1);

// Speech-bubble badge next to the wordmark, matching the logomark
// (assets/brand/logo-mark.svg: a rounded caption bubble with a tail pointing
// down-left). Rounded corners + a ▾ tail so it reads as a chat bubble, not a
// box.
function banner(stream = process.stdout) {
  const bubble = ['╭────╮', '│    │', '╰────╯', '  ▾'];
  const word = 'M E E T   C O M P A N I O N';
  const rows = [bubble[0], `${bubble[1]}  ${word}`, bubble[2], bubble[3]];
  const width = Math.max(...rows.map((r) => r.length)) + 4;
  const top = `┌${'─'.repeat(width)}┐`;
  const mid = rows.map((r) => `│  ${r.padEnd(width - 4)}  │`);
  const bot = `└${'─'.repeat(width)}┘`;
  return [accent(top, stream), ...mid.map((r) => accent(r, stream)), accent(bot, stream)].join('\n');
}

// --- launch -----------------------------------------------------------------

// Firefox has no --load-extension. It opens on the AMO page instead, where one
// click installs the signed add-on into this profile — and AMO keeps it updated
// from then on, which Chromium cannot do for an unpacked extension.
export function launchArgs(browser, sources, profileDir) {
  if (browser.engine === 'gecko') {
    return ['-profile', profileDir, '-no-remote', AMO_URL];
  }
  return [
    `--user-data-dir=${profileDir}`,
    `--load-extension=${sources.chromium}`,
    `--disable-extensions-except=${sources.chromium}`,
    '--no-first-run',
    'https://meet.google.com/',
  ];
}

function launch(browser, sources, profileDir) {
  mkdirSync(profileDir, { recursive: true });
  const child = spawn(browser.binary, launchArgs(browser, sources, profileDir), {
    detached: true, stdio: 'ignore',
  });
  child.unref();
  return child.pid;
}
async function cmdInstall(opts) {
  console.log(`\n${banner()}\n`);

  const browsers = detectBrowsers();
  if (browsers.length === 0) {
    console.log('No supported browser detected (Chrome, Edge, Brave, Vivaldi, Opera or Firefox).');
    process.exit(1);
  }
  browsers.forEach((b) => console.log(`  found: ${b.name} (${b.binary})`));

  // preview: show the full TTY flow but do not resolve dist or launch anything
  if (opts.preview) {
    await pickBrowsers(browsers);
    console.log('\nPreview only — nothing was launched.\n');
    return;
  }

  // A dry run checks everything the real thing needs, so it resolves a source
  // for every engine that was detected rather than asking which to use.
  const selected = opts.dryRun ? browsers : await pickBrowsers(browsers);
  if (selected.length === 0) {
    console.log('\nNothing selected — nothing to launch.\n');
    return;
  }

  let sources;
  try {
    sources = await resolveSources(opts, selected);
  } catch (e) {
    console.log(`\n${e.message}`);
    process.exit(1);
  }
  if (sources.chromium) console.log(`Extension: ${sources.chromium}`);
  if (sources.gecko) console.log(`Firefox add-on: ${sources.gecko}`);

  if (opts.dryRun) {
    console.log('\nDry run — not launching. Browsers and sources look good.\n');
    return;
  }

  const extManifest = readExtensionManifest(sources);
  // Resolved lazily and once: a Firefox-only run still needs it, but a run that
  // registers nothing should not pay for a build or a download.
  let hostPromise = null;
  const hostSource = () => (hostPromise ??= resolveNativeHost());

  console.log(`\nLaunching ${selected.length} Companion instance(s)...`);
  for (const b of selected) {
    const profileDir = opts.profile || join(homedir(), '.meetcc', 'browser-profiles', b.tag);
    mkdirSync(profileDir, { recursive: true });
    await registerNativeHost(b, profileDir, extManifest && extensionIdFor(extManifest, b.engine), hostSource);
    const pid = launch(b, sources, profileDir);
    console.log(`  ${b.name} started (pid ${pid})`);
    console.log(`    profile: ${profileDir}`);
    if (b.engine === 'gecko') console.log('    click "Add to Firefox" on the page that opens.');
  }
  console.log('\nTip: sign in / pick your AI provider in each profile once — it persists there.');
  console.log('Capture works on meet.google.com and Microsoft Teams.');
}

async function cmdUpdate() {
  console.log(`\n${banner()}\n`);
  if (!COMPANION_HOME) {
    console.log('`update` only applies to a standalone curl install. Run `node scripts/companion.mjs install` in the repo instead.');
    return;
  }
  await downloadLatestDist(join(COMPANION_HOME, 'dist'));
  console.log('Done. Restart Companion to pick up the update.');
  console.log('(Firefox updates itself from addons.mozilla.org, and the desktop app');
  console.log(' updates itself in-app — this command is the extension\'s.)');
}

// --- main -------------------------------------------------------------------

async function main() {
  const opts = parseArgs();
  if (opts.cmd === 'update') return cmdUpdate();
  return cmdInstall(opts);
}

// Only install when run as a command — the test imports launchArgs.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`\n${e.message}`); process.exit(1); });
}
