import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadDashboard,
  loadSettings,
  matchesPrefixes,
  parseAnalyses,
  parseMeetings,
  parseTitles,
  saveTitle,
  watchStorage,
  ANALYSIS_PREFIX,
  META_PREFIX,
  TITLE_PREFIX,
  TRANSCRIPT_PREFIX,
  WATCH_DEBOUNCE_MS,
} from './storage';

const entry = (text: string, time: string) => ({ speaker: 'A', text, time });

const RAW: Record<string, unknown> = {
  [TRANSCRIPT_PREFIX + 'old']: [entry('x', '2026-01-01T01:00:00Z')],
  [META_PREFIX + 'old']: { id: 'old', startedAt: '2026-01-01T01:00:00Z', lastSeenAt: '2026-01-01T02:00:00Z' },
  [TRANSCRIPT_PREFIX + 'new']: [entry('y', '2026-07-01T01:00:00Z')],
  [META_PREFIX + 'new']: { id: 'new', startedAt: '2026-07-01T01:00:00Z', lastSeenAt: '2026-07-01T02:00:00Z' },
  [ANALYSIS_PREFIX + 'new']: {
    status: 'done',
    provider: 'openai',
    generatedAt: '2026-07-01T03:00:00Z',
    analysis: { executiveSummary: 'ok' },
  },
  [TITLE_PREFIX + 'new']: 'Sprint planning',
  [TITLE_PREFIX + 'blank']: '',
  settings: { provider: 'openai', apiKey: '', baseUrl: '', model: 'gpt-4o-mini' },
};

// in-memory chrome stub; `get(null)` returns everything, like the real API
let store: Record<string, unknown>;
let getCalls: number;
let listeners: Array<(changes: Record<string, unknown>) => void>;

beforeEach(() => {
  vi.useFakeTimers();
  store = { ...RAW };
  getCalls = 0;
  listeners = [];
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string | null) => {
          getCalls++;
          return key === null ? { ...store } : { [key]: store[key] };
        },
        set: async (obj: Record<string, unknown>) => void Object.assign(store, obj),
        remove: async (key: string | string[]) => {
          for (const k of [key].flat()) delete store[k];
        },
      },
      onChanged: {
        addListener: (fn: (c: Record<string, unknown>) => void) => void listeners.push(fn),
        removeListener: (fn: (c: Record<string, unknown>) => void) => {
          listeners = listeners.filter((l) => l !== fn);
        },
      },
    },
  });
});

const emit = (...keys: string[]) => {
  const changes = Object.fromEntries(keys.map((k) => [k, { newValue: 1 }]));
  for (const l of [...listeners]) l(changes);
};

describe('parsers', () => {
  it('groups transcript + meta into meetings, newest start first', () => {
    const meetings = parseMeetings(RAW);
    expect(meetings.map((m) => m.id)).toEqual(['new', 'old']);
    expect(meetings[0].entries).toHaveLength(1);
    expect(meetings[0].meta?.startedAt).toBe('2026-07-01T01:00:00Z');
  });

  it('reads analyses and titles, skipping blank titles', () => {
    expect(Object.keys(parseAnalyses(RAW))).toEqual(['new']);
    expect(parseTitles(RAW)).toEqual({ new: 'Sprint planning' });
  });
});

describe('loadDashboard', () => {
  it('builds every view from a single full-storage read', async () => {
    const d = await loadDashboard();
    expect(getCalls).toBe(1);
    expect(d.meetings.map((m) => m.id)).toEqual(['new', 'old']);
    expect(d.records.new.status).toBe('done');
    expect(d.titles).toEqual({ new: 'Sprint planning' });
  });
});

describe('matchesPrefixes', () => {
  it('matches everything when no prefixes are given', () => {
    expect(matchesPrefixes(['anything'])).toBe(true);
    expect(matchesPrefixes(['anything'], [])).toBe(true);
  });

  it('matches only the requested prefixes', () => {
    expect(matchesPrefixes([TRANSCRIPT_PREFIX + 'a'], [TRANSCRIPT_PREFIX])).toBe(true);
    expect(matchesPrefixes(['docs:a', TRANSCRIPT_PREFIX + 'a'], [TRANSCRIPT_PREFIX])).toBe(true);
    expect(matchesPrefixes(['docs:a'], [TRANSCRIPT_PREFIX, META_PREFIX])).toBe(false);
  });
});

describe('watchStorage', () => {
  it('coalesces a burst of writes into one callback', () => {
    const onChange = vi.fn();
    watchStorage(onChange);
    for (let i = 0; i < 20; i++) emit(TRANSCRIPT_PREFIX + 'new');
    expect(onChange).not.toHaveBeenCalled(); // nothing fires synchronously
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('ignores changes outside the watched prefixes', () => {
    const onChange = vi.fn();
    watchStorage(onChange, [ANALYSIS_PREFIX]);
    emit(TRANSCRIPT_PREFIX + 'new');
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS * 2);
    expect(onChange).not.toHaveBeenCalled();
    emit(ANALYSIS_PREFIX + 'new');
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('stops firing and drops a pending callback after unsubscribe', () => {
    const onChange = vi.fn();
    const stop = watchStorage(onChange);
    emit(TRANSCRIPT_PREFIX + 'new');
    stop();
    vi.advanceTimersByTime(WATCH_DEBOUNCE_MS * 2);
    expect(onChange).not.toHaveBeenCalled();
    expect(listeners).toHaveLength(0);
  });
});

describe('saveTitle', () => {
  it('stores a trimmed title and removes the override when blanked', async () => {
    await saveTitle('new', '  Retro Q3  ');
    expect(store[TITLE_PREFIX + 'new']).toBe('Retro Q3');
    await saveTitle('new', '   ');
    expect(store[TITLE_PREFIX + 'new']).toBeUndefined();
  });
});

describe('loadSettings retention', () => {
  it('defaults to keeping data forever', async () => {
    expect((await loadSettings()).retentionDays).toBe(0);
  });

  it('falls back to 0 for values that are not a positive number', async () => {
    for (const bad of ['90', -5, Number.NaN, Infinity, null]) {
      store.settings = { ...(RAW.settings as object), retentionDays: bad };
      expect((await loadSettings()).retentionDays).toBe(0);
    }
  });

  it('keeps a valid window, floored to whole days', async () => {
    store.settings = { ...(RAW.settings as object), retentionDays: 90.7 };
    expect((await loadSettings()).retentionDays).toBe(90);
  });
});
