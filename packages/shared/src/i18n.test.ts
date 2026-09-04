import { afterEach, describe, expect, it } from 'vitest';
import { en } from './messages/en';
import { id } from './messages/id';
import {
  asLangPref,
  formatDate,
  getLang,
  LANGS,
  resolveLang,
  setLang,
  t,
  tIn,
} from './i18n';

afterEach(() => setLang('en'));

describe('catalogues', () => {
  // The one check that actually protects the feature: a key translated in one
  // catalogue and forgotten in the other is invisible at runtime — it just
  // renders the other language — so it has to fail here instead.
  it('expose exactly the same keys', () => {
    expect(Object.keys(id).sort()).toEqual(Object.keys(en).sort());
  });

  it('has no empty strings', () => {
    for (const [key, value] of Object.entries({ ...en, ...id })) {
      expect(value.trim(), key).not.toBe('');
    }
  });

  it('uses the same placeholders on both sides of every entry', () => {
    // `{count} notes` translated without its `{count}` silently drops a number
    // out of the UI.
    const vars = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(vars(id[key]), key).toEqual(vars(en[key]));
    }
  });
});

describe('resolveLang', () => {
  it('honours an explicit choice whatever the system says', () => {
    expect(resolveLang('en', ['id-ID'])).toBe('en');
    expect(resolveLang('id', ['en-US'])).toBe('id');
  });

  it('matches the system on the primary subtag only', () => {
    expect(resolveLang('system', ['id'])).toBe('id');
    expect(resolveLang('system', ['id-ID'])).toBe('id');
    expect(resolveLang('system', ['id-Latn-ID'])).toBe('id');
    expect(resolveLang('system', ['ID-id'])).toBe('id');
  });

  it('takes the first language it recognises, not the first listed', () => {
    expect(resolveLang('system', ['fr-FR', 'id-ID', 'en-US'])).toBe('id');
  });

  it('falls back to English for anything unknown or absent', () => {
    expect(resolveLang('system', ['ja-JP'])).toBe('en');
    expect(resolveLang('system', [])).toBe('en');
    expect(resolveLang('system')).toBe('en');
  });

  it('covers every language the settings offer', () => {
    for (const lang of LANGS) expect(resolveLang(lang)).toBe(lang);
  });
});

describe('asLangPref', () => {
  it('accepts the three valid values and rejects everything else', () => {
    expect(asLangPref('en')).toBe('en');
    expect(asLangPref('id')).toBe('id');
    expect(asLangPref('system')).toBe('system');
    for (const bad of [undefined, null, '', 'fr', 42, {}]) {
      expect(asLangPref(bad)).toBe('system');
    }
  });
});

describe('t', () => {
  it('returns the current language', () => {
    setLang('id');
    expect(getLang()).toBe('id');
    expect(t('desktop.editor.save')).toBe('Simpan');
    setLang('en');
    expect(t('desktop.editor.save')).toBe('Save');
  });

  it('substitutes placeholders', () => {
    expect(t('desktop.vault.count', { count: 3 })).toBe('3 notes');
    expect(tIn('id', 'desktop.vault.count', { count: 3 })).toBe('3 nota');
  });

  it('leaves an unmatched placeholder visible rather than blanking it', () => {
    // A stray `{version}` on screen gets reported; an empty gap does not.
    expect(t('desktop.update.available', {})).toContain('{version}');
  });

  it('restores the previous language after tIn, even on the same key', () => {
    setLang('en');
    tIn('id', 'desktop.editor.save');
    expect(t('desktop.editor.save')).toBe('Save');
  });
});

describe('formatDate', () => {
  it('formats in the current locale', () => {
    setLang('en');
    const usa = formatDate('2026-09-04T10:00:00Z');
    setLang('id');
    const ind = formatDate('2026-09-04T10:00:00Z');
    expect(usa).not.toBe(ind);
    expect(usa).toContain('2026');
    expect(ind).toContain('2026');
  });

  it('returns an empty string for an unparseable date instead of "Invalid Date"', () => {
    expect(formatDate('not a date')).toBe('');
  });
});
