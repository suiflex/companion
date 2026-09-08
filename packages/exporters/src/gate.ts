import type { AuditEvent } from '@meetcc/shared'

// §32.1 product gate, measured locally — no telemetry. The fleet metrics G1
// (≥30% of active users export within 14 days) and G2 (≥50% of G1 exporters
// export again in week 2) are aggregates the desktop gate review has to build
// from per-device numbers; this module produces exactly that per-device input
// from the capped audit ring (chrome.storage, AUDIT_RING_MAX = 5.000 events,
// never uploaded).
//
// Anchor: a release T0 persisted once per device (packages/shared/src/storage.ts
// `ensureReleaseT0`), stamped the first time this build runs — not guessed from
// whatever the audit ring happens to still hold. The caller passes it in so
// this module stays a pure function of its inputs.

export const GATE_EVENT = 'export.obsidian'
export const PROBE_WINDOW_DAYS = 14
export const DAY_MS = 86_400_000

const isExport = (e: AuditEvent) => e.event === GATE_EVENT

/** Epoch-ms times of every Obsidian export inside the 14-day probe window. */
function exportTimes(events: AuditEvent[], anchor: number): number[] {
  const end = anchor + PROBE_WINDOW_DAYS * DAY_MS
  return events
    .filter(isExport)
    .map((e) => Date.parse(e.time))
    .filter((t) => Number.isFinite(t) && t >= anchor && t < end)
    .sort((a, b) => a - b)
}

export interface GateSummary {
  /** Epoch ms of the device anchor (the persisted release T0). */
  anchor: number;
  /** ≥1 export inside the window — this device's G1 contribution. */
  g1Adopted: boolean;
  /** Exports in days 0–7 / 7–14 of the window. */
  week1Exports: number;
  week2Exports: number;
  /** Whether this device belongs in the G2 denominator (any G1 export). */
  g2Eligible: boolean;
  /** Exported in week 1 and again in week 2, or twice within week 2. */
  g2Retained: boolean;
  /** First export in the window, null when none. */
  firstExportAt: number | null;
}

/**
 * Per-device probe numbers for §32.1. `releaseT0` is the persisted anchor;
 * `now` is injected (not Date.now()) so the calculation is reproducible and
 * also caps the anchor — a clock-skewed or corrupted future T0 can never
 * push the window ahead of the current time.
 */
export function gateSummary(events: AuditEvent[], now: number, releaseT0: number): GateSummary {
  const anchor = Math.min(releaseT0, now)
  const times = exportTimes(events, anchor)
  const boundary = anchor + 7 * DAY_MS
  const week1 = times.filter((t) => t < boundary).length
  const week2 = times.length - week1
  return {
    anchor,
    g1Adopted: times.length > 0,
    week1Exports: week1,
    week2Exports: week2,
    g2Eligible: times.length > 0,
    g2Retained: (week1 > 0 && week2 > 0) || week2 >= 2,
    firstExportAt: times[0] ?? null,
  }
}

/** One-line human summary for logs/UI — never sent anywhere. */
export function describeGate(g: GateSummary): string {
  if (!g.g1Adopted) return 'no Obsidian export in the 14-day window'
  return `ekspor pertama ${new Date(g.firstExportAt!).toISOString()}, minggu-1: ${g.week1Exports}×, minggu-2: ${g.week2Exports}×`
}
