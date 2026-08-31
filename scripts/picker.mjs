// Frame builder for the browser picker.
//
// Split out of companion.mjs so the cursor arithmetic — the part that broke —
// can be tested without a TTY. companion.mjs runs its main() on import, so
// anything a test needs to reach has to live beside it rather than inside it.

/**
 * One repaint of the picker.
 *
 * `painted` is how many rows the previous frame drew, 0 for the first paint.
 * Returns the bytes to write and the row count to pass back as `painted`.
 *
 * What the previous version got wrong, and what each piece here is for:
 *
 *  - **Counting.** The old frame hid a newline inside its header and inside its
 *    legend, so it drew seven rows while moving back over five. Every repaint
 *    started a row lower than the last and the list marched down the screen.
 *    Rows are the unit to move by, so no entry may carry a newline of its own —
 *    hence the explicit '' spacers.
 *  - **Erasing.** Nothing covered a longer row from the frame before, so the
 *    tail of the header stayed on screen while shorter rows were drawn over its
 *    left half. Each row now clears its own tail.
 *  - **Column.** `\r` before each row so a row always starts at column 0,
 *    whatever the terminal does with ONLCR while stdin is in raw mode.
 */
export function pickerFrame({ browsers, cursor, selected, painted = 0, highlight = (s) => s }) {
  const rows = [
    'Which browsers should Companion run in?',
    '',
    ...browsers.map((b, i) => {
      const line = ` ${i === cursor ? '›' : ' '} ${selected.has(i) ? '◉' : '○'} ${b.name}`;
      return i === cursor ? highlight(line) : line;
    }),
    '',
    ' ↑↓ move · Space toggle · Enter confirm',
  ];

  // after a frame the cursor sits on its last row, so going back to the top is
  // one less than the row count — and on the first paint there is nothing drawn
  // to move back over, which the old code did anyway, into the banner
  const up = painted > 0 ? `\x1b[${painted - 1}A` : '';
  return { out: up + rows.map((r) => `\r${r}\x1b[K`).join('\n'), rows: rows.length };
}
