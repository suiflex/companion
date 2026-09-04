// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LANGS, setLang, t, type LangPref } from '@meetcc/shared/i18n';
import { useState } from 'react';

// The switch is a few lines inside SettingsView, which pulls in the whole
// settings surface. This renders the same shape against the real catalogue,
// which is what the test is actually about: that switching re-labels the copy.
function Switcher() {
  const [pref, setPref] = useState<LangPref>('en');
  return (
    <div>
      <p>{t('ext.settings.language')}</p>
      <select
        aria-label="lang"
        value={pref}
        onChange={(e) => {
          const next = e.target.value as LangPref;
          setLang(next === 'system' ? 'en' : next);
          setPref(next);
        }}
      >
        {(['system', ...LANGS] as LangPref[]).map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

beforeEach(() => setLang('en'));
afterEach(() => {
  cleanup();
  setLang('en');
});

describe('language switching', () => {
  it('starts in English', () => {
    render(<Switcher />);
    expect(screen.getByText('Language')).toBeTruthy();
  });

  it('re-renders the surrounding copy in the other language', async () => {
    render(<Switcher />);
    await userEvent.selectOptions(screen.getByLabelText('lang'), 'id');
    expect(screen.getByText('Bahasa')).toBeTruthy();
    expect(screen.queryByText('Language')).toBeNull();
  });
});
