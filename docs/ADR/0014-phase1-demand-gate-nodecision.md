# ADR-0014: Phase 1 demand gate §32.1 — NO-DECISION recorded, with dated conditions to decide

- Status: Accepted (decision recorded; supersedes no prior ADR)
- Date: 2026-08-28
- Decision owner: pak-deadlineo (gate execution); final owner calls reserved to Pak Bos
- Inputs: QA verdict t_5c12b5cd (mbak-laras, evidence-verified), demand-gate audit `docs/demand-gate-audit-32-1.md` (pak-prdono, t_0e585af1), decision log D10

## Context

The Phase 1 green light is gated on demand signal §32.1 (G1/G2/G3, D5), with the gate review set for **2026-09-24** (`docs/06-roadmap.md`). On 2026-08-28 QA verified the evidence directly (not card counts):

- **Demand window never started.** The export probe (G1/G2 source) has no UI trigger — `packages/exporters` code exists and passes 11/11 tests, but nothing in `apps/extension/src` calls it, so **T0 is undefined**. G1/G2 need T0+14d; G3 needs `ask.global` to record `meetingsCited` (it does not) plus 4 weekly buckets; the 200-entry audit ring evicts before any 4-week window. All gate metrics read zero-day "not measured" — not "failed".
- **Technical readiness = PASS WITH RISKS.** Fresh sync-server probe P95 ≤ 16.5 ms / 0% errors (606 ops), UI gate 19/19, bundle 81.23 KB gzip, exporters 11/11 re-run by QA. Findings queued with owners: DocGen double-submit (Major, `background.ts:246`), D8 GAP `session_key` UNIQUE / `external_refs` (Major, target-state), malformed probe JSON artifacts ×2, partial UUIDv7 in core tables.
- Instrumentation work is small: W1–W5 ≈ 2–3 engineer-days (audit §3): wire export UI + `export.obsidian` event, structured `ask.global` detail (`meetingsCited=<n>; answerability=<x>`), audit ring 200→5000, audit export command, G1' manual log template.
- Three owner decisions are pending (audit §5): T0 = 5 Sep, one-time threshold tuning BEFORE results exist (G1 ≥20% → shrunk-scope fast path; G2 ≥35%), start G1' now.

## Decision

1. The 24 Sep gate is recorded as **NO-DECISION (not yet decidable)** on 2026-08-28. Per §32.1, engineering readiness is not a launch reason; a gate that has never had a measurement window cannot yield GO/NO-GO honestly.
2. The gate re-opens for a real decision when ALL of:
   - **T0 locked ≤ 2026-09-05** (recommended ≤ 09-01; hard floor **2026-09-10** — beyond it, the 14-day G1 window passes the review date);
   - **Instrumentation P0 landed ≤ T0**: I1 (ship export probe: gate.ts, obsidian.ts, UI wiring) and I2 (`sessions.length`/`meetingsCited` in `ask.global` + weekly kv rollup);
   - **Threshold tuning done once, BEFORE the probe ships** (one-time right under §32.1);
   - **G1' manual log starts immediately** (fallback single-user signal; needs no engineer).
3. Reading calendar (assuming T0 = 2026-09-05): G1 first read 19 Sep; **24 Sep review = G1 full + G2 partial + G3 3-week trend** → outcome must be GO full scope / GO shrunk / NO-GO. G3 full read T0+28 = 2026-10-03 (or earlier if the owner accepts the partial trend). Fallback scope-shrink read (G1'-based, T0+42): by 2026-10-17 at the latest. If T0 slips past 10 Sep, the honest 24 Sep output is again NO-DECISION with the next concrete date.

## Consequences

- No Phase 1 desktop commitment on engineering greenness alone; D5 stays binding.
- W1–W5 become the critical path to a decidable gate (±2–3 engineer-days); the cheapest action that opens the whole measurement window is shipping the export probe.
- DocGen double-submit and D8 GAP proceed on their own queues (engineering DoD), independent of this gate.
- This ADR and decision-log D10 are the audit trail: at the 24 Sep review, "no data" is no longer an available excuse — only locked-T0-slip produces a legitimate second NO-DECISION.
