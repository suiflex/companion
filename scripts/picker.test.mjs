import { describe, expect, it } from 'vitest';
import { pickerFrame } from './picker.mjs';

const browsers = [{ name: 'Google Chrome' }, { name: 'Brave Browser' }, { name: 'Arc' }];
const frame = (over = {}) =>
  pickerFrame({ browsers, cursor: 0, selected: new Set(), ...over });

/** The rows as written, minus the move-up prepended to the first one. */
const body = (out) => {
  const rows = out.split('\n');
  rows[0] = rows[0].slice(rows[0].indexOf('\r')); // every row opens with \r
  return rows;
};

describe('pickerFrame', () => {
  it('counts every row it draws, so the next frame can move back over all of them', () => {
    const f = frame();
    // header + spacer + browsers + spacer + legend
    expect(f.rows).toBe(browsers.length + 4);
    expect(body(f.out)).toHaveLength(f.rows);
  });

  it('draws no row containing a newline of its own', () => {
    // the old frame hid two newlines inside single entries, so the row count
    // ran two short and every repaint started two rows further down
    for (const row of body(frame().out)) expect(row).not.toContain('\n');
  });

  it('moves up one less than the previous frame drew', () => {
    const first = frame();
    const second = frame({ painted: first.rows });
    expect(second.out.startsWith(`\x1b[${first.rows - 1}A`)).toBe(true);
  });

  it('does not move up on the first paint', () => {
    expect(frame({ painted: 0 }).out.startsWith('\x1b[')).toBe(false);
  });

  it('returns the column and clears the tail on every row', () => {
    // the tail matters most: a shorter row has to erase what a longer one from
    // the frame before left behind
    for (const row of body(frame().out)) {
      expect(row.startsWith('\r')).toBe(true);
      expect(row.endsWith('\x1b[K')).toBe(true);
    }
  });

  it('marks the cursor row and the selected rows independently', () => {
    const out = frame({ cursor: 2, selected: new Set([0]) }).out;
    expect(out).toContain('   ◉ Google Chrome');
    expect(out).toContain(' › ○ Arc');
  });

  it('highlights only the cursor row', () => {
    const out = frame({ cursor: 1, highlight: (s) => `<${s}>` }).out;
    expect(out).toContain('< › ○ Brave Browser>');
    expect(out).not.toContain('<   ○ Google Chrome>');
  });
});
