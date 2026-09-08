import type { AuditEvent } from '@meetcc/shared'

// §32.1 G3 — cross-meeting Ask adoption: weekly count of global Ask queries
// that cited at least two meetings, over the most recent 4 weeks. Same shape
// as gate.ts's G1/G2 rollup: a pure function over the local audit log, no
// telemetry, `now` injected for reproducibility.
//
// `ask.global` audit events (apps/extension/src/background.ts
// handleGlobalAsk) carry `meetingsCited=<n>` in their detail string; this
// module is the only place that parses it back out.

export const G3_EVENT = 'ask.global'
export const G3_WEEKS = 4
export const G3_MIN_MEETINGS = 2
const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS

function meetingsCited(detail: string): number {
  const m = /meetingsCited=(\d+)/.exec(detail)
  return m ? Number(m[1]) : 0
}

export interface G3Week {
  /** Epoch ms of the week's start (inclusive). */
  start: number;
  /** ask.global queries this week that cited >= G3_MIN_MEETINGS meetings. */
  qualifying: number;
  /** All ask.global queries this week, qualifying or not. */
  total: number;
}

export interface G3Rollup {
  /** Oldest week first, always length G3_WEEKS. */
  weeks: G3Week[];
  /** Non-decreasing week over week, with strictly more in the last week than
   *  the first — a flat all-zero run is not a trend. */
  trendingUp: boolean;
}

/**
 * Buckets the G3_WEEKS whole weeks ending at `now`. A week with no events is
 * still a 0-count bucket, not skipped, so a gap breaks the trend instead of
 * silently vanishing from it.
 */
export function g3Rollup(events: AuditEvent[], now: number): G3Rollup {
  const weeks: G3Week[] = Array.from({ length: G3_WEEKS }, (_, i) => ({
    start: now - (G3_WEEKS - i) * WEEK_MS,
    qualifying: 0,
    total: 0,
  }))
  for (const e of events) {
    if (e.event !== G3_EVENT) continue
    const t = Date.parse(e.time)
    if (!Number.isFinite(t)) continue
    const week = weeks.find((w) => t >= w.start && t < w.start + WEEK_MS)
    if (!week) continue
    week.total++
    if (meetingsCited(e.detail) >= G3_MIN_MEETINGS) week.qualifying++
  }
  const nonDecreasing = weeks.every((w, i) => i === 0 || w.qualifying >= weeks[i - 1].qualifying)
  const trendingUp = nonDecreasing && weeks[weeks.length - 1].qualifying > weeks[0].qualifying
  return { weeks, trendingUp }
}

/** One-line human summary for logs/UI — never sent anywhere. */
export function describeG3(r: G3Rollup): string {
  const counts = r.weeks.map((w) => w.qualifying).join(', ')
  return `mingguan (lama->baru): ${counts} — ${r.trendingUp ? 'trending up' : 'belum trending up'}`
}
