import { describe, expect, it } from 'vitest';
import type { AuditEvent } from '@meetcc/shared';
import {
  DAY_MS,
  GATE_EVENT,
  gateSummary,
  describeGate,
} from './gate';

const NOW = Date.parse('2026-08-28T00:00:00Z');
const ev = (time: string, event = GATE_EVENT): AuditEvent => ({
  time,
  event,
  detail: '',
});

// anchor = oldest surviving event in the log
const T0 = Date.parse('2026-08-14T00:00:00Z');

describe('gateSummary', () => {
  it('returns a non-adopted summary for an empty log', () => {
    const g = gateSummary([], NOW);
    expect(g.g1Adopted).toBe(false);
    expect(g.g2Eligible).toBe(false);
    expect(g.g2Retained).toBe(false);
    expect(g.firstExportAt).toBeNull();
    expect(g.anchor).toBe(NOW); // Math.min(...[], now) = now
  });

  it('counts one export in the window as G1 adoption', () => {
    const g = gateSummary([ev('2026-08-20T10:00:00Z')], NOW);
    expect(g.g1Adopted).toBe(true);
    expect(g.g2Eligible).toBe(true);
    expect(g.g2Retained).toBe(false);
    expect(g.week1Exports + g.week2Exports).toBe(1);
  });

  it('ignores exports of the wrong event type', () => {
    const g = gateSummary([ev('2026-08-20T10:00:00Z', 'export.pdf')], NOW);
    expect(g.g1Adopted).toBe(false);
  });

  it('splits weeks at anchor+7d and detects week-2 retention (G2)', () => {
    const events = [
      ev(new Date(T0 + 1 * DAY_MS).toISOString()), // week 1
      ev(new Date(T0 + 9 * DAY_MS).toISOString()), // week 2
    ];
    const g = gateSummary(events, NOW);
    expect(g.week1Exports).toBe(1);
    expect(g.week2Exports).toBe(1);
    expect(g.g2Retained).toBe(true);
  });

  it('counts two exports inside week 2 as retained when the anchor is pinned', () => {
    // anchor = oldest surviving event, so pin it with an earlier non-export
    const events = [
      ev(new Date(T0).toISOString(), 'app.open'),
      ev(new Date(T0 + 8 * DAY_MS).toISOString()),
      ev(new Date(T0 + 10 * DAY_MS).toISOString()),
    ];
    const g = gateSummary(events, NOW);
    expect(g.week1Exports).toBe(0);
    expect(g.week2Exports).toBe(2);
    expect(g.g2Retained).toBe(true);
  });

  it('treats the first export as the anchor when nothing older survives', () => {
    const events = [
      ev(new Date(T0 + 8 * DAY_MS).toISOString()),
      ev(new Date(T0 + 10 * DAY_MS).toISOString()),
    ];
    const g = gateSummary(events, NOW);
    expect(g.anchor).toBe(T0 + 8 * DAY_MS);
    expect(g.week1Exports).toBe(2);
    expect(g.week2Exports).toBe(0);
    expect(g.g2Retained).toBe(false);
  });

  it('is not retained when everything happened in week 1', () => {
    const events = [
      ev(new Date(T0 + 1 * DAY_MS).toISOString()),
      ev(new Date(T0 + 2 * DAY_MS).toISOString()),
    ];
    expect(gateSummary(events, NOW).g2Retained).toBe(false);
  });

  it('uses the oldest surviving event as anchor and ignores exports before it', () => {
    // a non-export event older than the export sets the anchor earlier
    const events = [
      ev('2026-08-10T00:00:00Z', 'app.open'),
      ev('2026-08-16T00:00:00Z'), // inside window
    ];
    const g = gateSummary(events, NOW);
    expect(g.anchor).toBe(Date.parse('2026-08-10T00:00:00Z'));
    expect(g.g1Adopted).toBe(true);
  });

  it('is deterministic for the same input (reproducible metric)', () => {
    const events = [ev('2026-08-20T10:00:00Z'), ev('2026-08-25T10:00:00Z')];
    const a = gateSummary(events, NOW);
    const b = gateSummary([...events].reverse(), NOW);
    expect(a).toEqual(b);
  });
});

describe('describeGate', () => {
  it('summarizes the window in one line', () => {
    const g = gateSummary([ev('2026-08-20T10:00:00Z')], NOW);
    const s = describeGate(g);
    expect(s).toContain('minggu-1');
    expect(s).toContain('2026-08-20');
  });

  it('says nothing exported when empty', () => {
    expect(describeGate(gateSummary([], NOW))).toContain('no Obsidian export');
  });
});
