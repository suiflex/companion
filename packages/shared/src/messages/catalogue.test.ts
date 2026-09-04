// Checks the catalogue against the source tree, not just against itself.
//
// The hand sweep that produced this catalogue missed seven strings, because it
// grepped for a fixed list of Indonesian words and those strings happened not
// to contain any of them. These two checks do not depend on knowing the
// language: an unused key means a string was catalogued but never wired up,
// and a call site missing a placeholder renders a literal `{count}` on screen.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { en } from './en';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', '..');

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !entry.includes('.test.') && !full.includes('messages'))
      out.push(full);
  }
  return out;
}

const files = [join(ROOT, 'apps'), join(ROOT, 'packages')].flatMap((d) => sources(d));
const blob = files.map((f) => readFileSync(f, 'utf8')).join('\n');

/** Placeholders a message needs, e.g. `{count}` -> `count`. */
const placeholders = (s: string): Set<string> => new Set(s.match(/\{(\w+)\}/g)?.map((p) => p.slice(1, -1)) ?? []);

describe('catalogue against the source tree', () => {
  it('has no key the code never mentions', () => {
    // A key nobody references is a string still hardcoded somewhere, or one
    // superseded and left behind. Both are worth failing over.
    const orphans = Object.keys(en).filter((key) => !blob.includes(`'${key}'`));
    expect(orphans).toEqual([]);
  });

  it('passes every placeholder each message needs at its call sites', () => {
    // `t('x.y', {})` where the message says `{count}` renders a literal
    // "{count}" to the user — visible, but only if someone happens to look.
    const call = /\bt\(\s*'([^']+)'\s*(,\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\})?\s*\)/g;
    const bad: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(call)) {
        const key = m[1] as keyof typeof en;
        if (!(key in en)) continue;
        const args = m[3] ?? '';
        const passed = new Set([
          ...(args.match(/(\w+)\s*:/g) ?? []).map((a) => a.replace(/\s*:$/, '')),
          ...(args.match(/(?:^|,)\s*(\w+)\s*(?=,|$)/g) ?? []).map((a) => a.replace(/[,\s]/g, '')),
        ]);
        for (const need of placeholders(en[key])) {
          if (!passed.has(need)) bad.push(`${file.slice(ROOT.length + 1)} → ${key} missing {${need}}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

/**
 * JSX text that never became a message key.
 *
 * The two checks above compare the catalogue with itself and with its call
 * sites, so neither can see a string that was never catalogued at all — which
 * is exactly how "Disimpan terenkripsi…" and five others survived a sweep I
 * called complete. This one reads the JSX instead, and knows nothing about any
 * language.
 *
 * The allowlist is the point of the design: TypeScript generics look like JSX
 * text to a regex, and a handful of literals genuinely are not translatable
 * (brand names, code samples, a provider list). Adding to it is a decision
 * someone makes on purpose; the check fails until they do.
 */
const NOT_COPY = new Set([
  // generics the regex cannot tell from markup
  'Promise',
  'void db',
  // names, code and protocol text — the same in every language
  'CC',
  'Companion',
  'AI',
  'AI…',
  'Jira',
  'Linear',
  'Notion',
  'Model',
  'Edit',
  'Task',
  'Owner',
  'Due',
  'Authorization: Bearer',
  'companion install',
  'companion-mcp snapshot.json',
  '@meetcc/sync-server',
]);

describe('JSX text against the catalogue', () => {
  it('has no hardcoded copy left in the app UIs', () => {
    const tsx = files.filter((f) => f.endsWith('.tsx'));
    const found: string[] = [];
    for (const file of tsx) {
      const src = readFileSync(file, 'utf8');
      // Newline-free on purpose: allowing it lets a match run from one
      // generic to the next across half a file and report the code between.
      for (const [, text] of src.matchAll(/>([^<>{}\n]+)</g)) {
        const trimmed = text.trim();
        // Two consecutive letters is the cheapest test for "this is words":
        // it passes over glyphs, arrows, punctuation and numbers.
        if (!/[A-Za-z]{2,}/.test(trimmed)) continue;
        if (NOT_COPY.has(trimmed)) continue;
        found.push(`${file.slice(ROOT.length)}: ${trimmed}`);
      }
    }
    expect(found).toEqual([]);
  });
});
