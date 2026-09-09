import type { Entry } from '@meetcc/shared';

// Loader for the Ask v2 eval suite fixtures (docs/ask-v2-spec.md §11). Every
// fixture is a plain JSON file under src/fixtures/ask-eval/ so the regression
// cases are reviewable outside test code, per the spec's Definition of Done
// (§14): one file per category, no inline transcripts.

export interface FixtureEntry {
  speaker: string;
  text: string;
  offset: number;
}

/** Generates filler turns (a long meeting's routine open/close) so a long
 *  fixture does not have to spell out hundreds of lines by hand. */
export interface FixtureFiller {
  count: number;
  template: string; // "{i}" is replaced with the turn index
  startOffset: number;
  step: number;
  speaker: string;
}

export interface AskFixture {
  id: string;
  entries: FixtureEntry[];
  fillerBefore?: FixtureFiller;
  fillerAfter?: FixtureFiller;
  entries_raw?: FixtureEntry[];
  entries_cleaned?: FixtureEntry[];
  history?: { role: 'user' | 'assistant'; content: string }[];
  question: string;
  expected: {
    answerability: 'explicit' | 'partial' | 'inferred' | 'not_found';
    mustMention: string[];
    forbidden: string[];
    notes?: string;
  };
}

const T0 = Date.parse('2026-08-24T07:00:00Z');
const at = (sec: number): string => new Date(T0 + sec * 1000).toISOString();

function fillerEntries(f: FixtureFiller): Entry[] {
  return Array.from({ length: f.count }, (_, i) => ({
    speaker: f.speaker,
    text: f.template.replace('{i}', String(i)),
    time: at(f.startOffset + i * f.step),
  }));
}

/** Converts a plain fixture entry list to Entry[], anchored at the fixture epoch. */
export function entriesFromList(list: FixtureEntry[]): Entry[] {
  return list.map((e) => ({ speaker: e.speaker, text: e.text, time: at(e.offset) }));
}

/** Expands a fixture into the flat Entry[] a real transcript would produce. */
export function fixtureEntries(fx: AskFixture): Entry[] {
  const before = fx.fillerBefore ? fillerEntries(fx.fillerBefore) : [];
  const after = fx.fillerAfter ? fillerEntries(fx.fillerAfter) : [];
  const real = entriesFromList(fx.entries);
  return [...before, ...real, ...after];
}
