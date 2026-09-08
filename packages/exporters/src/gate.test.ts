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

// the persisted release T0 for these fixtures
const T0 = Date.parse('2026-08-14T00:00:00Z');

describe('gateSummary', () => {
  it('returns a non-adopted summary for an empty log', () => {
    const g = gateSummary([], NOW, T0);
    expect(g.g1Adopted).toBe(false);
    expect(g.g2Eligible).toBe(false);
    expect(g.g2Retained).toBe(false);
    expect(g.firstExportAt).toBeNull();
    expect(g.anchor).toBe(T0);
  });

  it('counts one export in the window as G1 adoption', () => {
    const g = gateSummary([ev(new Date(T0 + 1 * DAY_MS).toISOString())], NOW, T0);
    expect(g.g1Adopted).toBe(true);
    expect(g.g2Eligible).toBe(true);
    expect(g.g2Retained).toBe(false);
    expect(g.week1Exports + g.week2Exports).toBe(1);
  });

  it('ignores exports of the wrong event type', () => {
    const g = gateSummary([ev(new Date(T0 + 1 * DAY_MS).toISOString(), 'export.pdf')], NOW, T0);
    expect(g.g1Adopted).toBe(false);
  });

  it('splits weeks at anchor+7d and detects week-2 retention (G2)', () => {
    const events = [
      ev(new Date(T0 + 1 * DAY_MS).toISOString()), // week 1
      ev(new Date(T0 + 9 * DAY_MS).toISOString()), // week 2
    ];
    const g = gateSummary(events, NOW, T0);
    expect(g.week1Exports).toBe(1);
    expect(g.week2Exports).toBe(1);
    expect(g.g2Retained).toBe(true);
  });

  it('counts two exports inside week 2 as retained', () => {
    const events = [
      ev(new Date(T0 + 8 * DAY_MS).toISOString()),
      ev(new Date(T0 + 10 * DAY_MS).toISOString()),
    ];
    const g = gateSummary(events, NOW, T0);
    expect(g.week1Exports).toBe(0);
    expect(g.week2Exports).toBe(2);
    expect(g.g2Retained).toBe(true);
  });

  it('ignores exports before the anchor, even the earliest surviving one', () => {
    const events = [
      ev(new Date(T0 - 2 * DAY_MS).toISOString()), // before release, out of window
      ev(new Date(T0 + 1 * DAY_MS).toISOString()),
    ];
    const g = gateSummary(events, NOW, T0);
    expect(g.anchor).toBe(T0);
    expect(g.week1Exports).toBe(1);
  });

  it('is not retained when everything happened in week 1', () => {
    const events = [
      ev(new Date(T0 + 1 * DAY_MS).toISOString()),
      ev(new Date(T0 + 2 * DAY_MS).toISOString()),
    ];
    expect(gateSummary(events, NOW, T0).g2Retained).toBe(false);
  });

  it('never lets a future or corrupted T0 push the window past now', () => {
    const future = NOW + 30 * DAY_MS;
    const g = gateSummary([ev(new Date(NOW + 1 * DAY_MS).toISOString())], NOW, future);
    expect(g.anchor).toBe(NOW);
  });

  it('is deterministic for the same input (reproducible metric)', () => {
    const events = [
      ev(new Date(T0 + 1 * DAY_MS).toISOString()),
      ev(new Date(T0 + 3 * DAY_MS).toISOString()),
    ];
    const a = gateSummary(events, NOW, T0);
    const b = gateSummary([...events].reverse(), NOW, T0);
    expect(a).toEqual(b);
  });
});

describe('describeGate', () => {
  it('summarizes the window in one line', () => {
    const g = gateSummary([ev(new Date(T0 + 1 * DAY_MS).toISOString())], NOW, T0);
    const s = describeGate(g);
    expect(s).toContain('minggu-1');
  });

  it('says nothing exported when empty', () => {
    expect(describeGate(gateSummary([], NOW, T0))).toContain('no Obsidian export');
  });
});
