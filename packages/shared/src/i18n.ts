// UI language: English by default, Indonesian by choice.
//
// Deliberately hand-rolled and dependency-free, like `theme.ts` in each app.
// A library would buy plural rules and ICU syntax this product does not use,
// and would add a runtime to an extension bundle that is privacy-audited.
//
// Framework-free on purpose (CLAUDE.md): no React, no DOM, no `chrome.*`.
// `resolveLang` is handed the system languages rather than reading them, so
// this module can run in the service worker, the MCP server and Node tests.
//
// NOT exported from the package barrel: `index.ts` re-exports modules that
// touch `chrome.*`, and the desktop app must be able to import this without
// dragging those in. Import the deep path `@meetcc/shared/i18n`.
import { en } from './messages/en';
import { id } from './messages/id';

export type Lang = 'en' | 'id';
export type LangPref = 'system' | Lang;

/** The order the settings controls list them in. */
export const LANGS: readonly Lang[] = ['en', 'id'];

/** English is the source of truth; every other catalogue must match its keys. */
export type MessageKey = keyof typeof en;

const CATALOGUES: Record<Lang, Record<MessageKey, string>> = { en, id };

/** BCP-47 tags for date and number formatting. */
const LOCALES: Record<Lang, string> = { en: 'en-US', id: 'id-ID' };

/**
 * Which language to actually use.
 *
 * `system` matches on the primary subtag only: `id`, `id-ID` and `id-Latn-ID`
 * all mean Indonesian. Anything unrecognised — including an empty list — is
 * English, which is the default the product ships with.
 */
export function resolveLang(pref: LangPref, systemLangs: readonly string[] = []): Lang {
  if (pref !== 'system') return pref;
  for (const tag of systemLangs) {
    const primary = tag.toLowerCase().split('-')[0];
    if ((LANGS as readonly string[]).includes(primary)) return primary as Lang;
  }
  return 'en';
}

/** Narrow an unvalidated stored value back to a preference. */
export function asLangPref(value: unknown): LangPref {
  return value === 'en' || value === 'id' || value === 'system' ? value : 'system';
}

// ponytail: one module-level language rather than a `lang` parameter threaded
// through every function in every package that can produce a user-facing
// string. There is exactly one user per process and one language at a time, so
// the parameter would be the same value at every call site. If this ever has to
// serve two languages at once — a server rendering for many users — this is the
// thing to replace, and `t()` is the only place that reads it.
let current: Lang = 'en';

export function setLang(lang: Lang): void {
  current = lang;
}

export function getLang(): Lang {
  return current;
}

/**
 * Look up a message and substitute `{name}` placeholders.
 *
 * A placeholder with no matching variable is left as written rather than
 * blanked: a visible `{count}` in the UI is a bug report, an empty space is a
 * mystery.
 */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const template = CATALOGUES[current][key] ?? en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/** `t` for a language other than the current one — used by tests and previews. */
export function tIn(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  const before = current;
  current = lang;
  try {
    return t(key, vars);
  } finally {
    current = before;
  }
}

export function locale(): string {
  return LOCALES[current];
}

/** Date only, e.g. `4 Sep 2026` / `Sep 4, 2026`. */
export function formatDate(
  iso: string | number | Date,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale(), opts);
}

/** Date and time, for timestamps shown next to content. */
export function formatDateTime(iso: string | number | Date): string {
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(locale());
}
