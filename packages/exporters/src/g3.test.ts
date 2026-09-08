import { describe, expect, it } from 'vitest';
import type { AuditEvent } from '@meetcc/shared';
import { G3_EVENT, g3Rollup, describeG3 } from './g3';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const NOW = Date.parse('2026-09-08T00:00:00Z');

const ev = (offsetMs: number, meetingsCited: number, event = G3_EVENT): AuditEvent => ({
  time: new Date(NOW + offsetMs).toISOString(),
  event,
  detail: `question=x; meetingsCited=${meetingsCited}; answerability=explicit`,
});

describe('g3Rollup', () => {
  it('buckets 4 empty weeks and reports no trend for an empty log', () => {
    const r = g3Rollup([], NOW);
    expect(r.weeks).toHaveLength(4);
    expect(r.weeks.every((w) => w.qualifying === 0 && w.total === 0)).toBe(true);
    expect(r.trendingUp).toBe(false);
  });

  it('counts a query as qualifying only when it cited >= 2 meetings', () => {
    const events = [ev(-1 * DAY_MS, 1), ev(-2 * DAY_MS, 2), ev(-3 * DAY_MS, 3)];
    const r = g3Rollup(events, NOW);
    const lastWeek = r.weeks[3];
    expect(lastWeek.total).toBe(3);
    expect(lastWeek.qualifying).toBe(2); // the 1-meeting query doesn't count
  });

  it('ignores events of the wrong type', () => {
    const events = [ev(-1 * DAY_MS, 5, 'ask')];
    const r = g3Rollup(events, NOW);
    expect(r.weeks.every((w) => w.total === 0)).toBe(true);
  });

  it('drops events older than the 4-week window', () => {
    const events = [ev(-5 * WEEK_MS, 5)];
    const r = g3Rollup(events, NOW);
    expect(r.weeks.every((w) => w.total === 0)).toBe(true);
  });

  it('detects an upward trend across 4 consecutive weeks', () => {
    const events = [
      ev(-3.5 * WEEK_MS, 2), // week 1: 1 qualifying
      ev(-2.5 * WEEK_MS, 2), // week 2: 1
      ev(-2.4 * WEEK_MS, 2), // week 2: 2
      ev(-1.5 * WEEK_MS, 2), // week 3: 1
      ev(-1.4 * WEEK_MS, 2), // week 3: 2
      ev(-1.3 * WEEK_MS, 2), // week 3: 3
      ev(-0.5 * WEEK_MS, 2), // week 4: 1
      ev(-0.4 * WEEK_MS, 2), // week 4: 2
      ev(-0.3 * WEEK_MS, 2), // week 4: 3
      ev(-0.2 * WEEK_MS, 2), // week 4: 4
    ];
    const r = g3Rollup(events, NOW);
    expect(r.weeks.map((w) => w.qualifying)).toEqual([1, 2, 3, 4]);
    expect(r.trendingUp).toBe(true);
  });

  it('is not a trend when a later week dips below an earlier one', () => {
    const events = [
      ev(-3.5 * WEEK_MS, 2),
      ev(-3.4 * WEEK_MS, 2),
      ev(-3.3 * WEEK_MS, 2), // week 1: 3
      ev(-0.5 * WEEK_MS, 2), // week 4: 1
    ];
    const r = g3Rollup(events, NOW);
    expect(r.weeks[0].qualifying).toBe(3);
    expect(r.weeks[3].qualifying).toBe(1);
    expect(r.trendingUp).toBe(false);
  });

  it('is not a trend when every week is flat, even at zero', () => {
    const r = g3Rollup([], NOW);
    expect(r.trendingUp).toBe(false);
  });
});

describe('describeG3', () => {
  it('summarizes the four weekly counts in order', () => {
    const events = [ev(-3.5 * WEEK_MS, 2), ev(-0.5 * WEEK_MS, 2), ev(-0.4 * WEEK_MS, 2)];
    const s = describeG3(g3Rollup(events, NOW));
    expect(s).toContain('1, 0, 0, 2');
  });
});
