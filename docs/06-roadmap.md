# Implementation roadmap

Authority: `COMPANION_UNIFIED_ARCHITECTURE.md` (§32, §32.1, §36, §37 D1–D9). `companion-product-architecture-roadmap.md` is partially superseded (see its banner) — only §9–§18, §31, and the P0 list remain usable there. Sequencing is dependency-driven; the only dated items are the probe windows and the 24 Sep 2026 gate review. Surface scopes and the only legal seams live in §36; this page tracks sequence and gates, not design.

## Sequencing

| Phase | Deliverable | Priority | Exit gate (measured) |
|---|---|---|---|
| 0 — Architecture refactor (running) | Ask v2 in `packages/{ai,meeting,store}` (`ask-v2-spec.md`); Obsidian-friendly export = demand probe + canonical-map forcing function (D2); versioned DTOs, portable `shared` exports, migration bundle v1; ADR-013 identity final-draft (D8); native-messaging installer spike, 5-day hard timebox (D9) | P0 | extension tests + smokes green; export archive round-trips with equal IDs/counts/hashes; probe shipped with audit-log instrumentation; dated spike verdict appended to `spike-native-messaging-installer.md` |
| G — Product gate (§32.1) | demand-probe review on 24 Sep 2026 | gate | signals below; G1 or G3 satisfied → Phase 1 full scope; neither → Phase 1 shrinks to meeting-knowledge reader + light annotation |
| 1 — Desktop local vault (gated) | Tauri 2 vault: Markdown CRUD/preview, native SQLite/FTS, watcher, atomic journal, trash/restore, tags/links, export; no cloud | P1 | scripted offline E2E (create/edit/external edit/rename/move/trash/restore/search/backlink/export) passes; crash injection never leaves partial Markdown; dual-canonical integrity scanner + UUIDv7/`session_key` ID checks green (D6) |
| 2 — Extension ↔ desktop knowledge | native bridge pairing, stable capture ops with `operationId` batches, extension queue, non-destructive import, native meetings/history/search | P1 | Meet and Teams fixture meetings appear exactly once in desktop after bridge downtime/retry; legacy field/count/hash checks pass; disabling desktop leaves the extension fully functional |
| 3 — Sync | v2 op/cursor protocol, outbox/inbox, conflict policies, devices, E2EE enrollment/recovery, snapshots, attachments, v1 compatibility | P1 | fault suite (retry, duplicate, reorder, clock skew, interruption, revocation, server restore) converges or emits explicit conflicts; tests prove the server stores no plaintext |
| 4 — AI knowledge engine | cross-note/meeting retrieval, context manifests, model capability router, read tools, privacy modes | P2 | eval set measures relevance, faithfulness, citation validity, answerability, latency, cloud context scope; mutation tools remain off |
| 5 — MCP | live desktop read-only MCP + snapshot compatibility, per-client controls | P2 | stdio smoke, permission-negative tests, locked-vault failure, pagination/limits, audit evidence pass with supported clients |
| 6 — Advanced features | evidence-backed only: graph visualization, optional embeddings, controlled AI mutations, version history, mobile read | P3 | per feature: predeclared metric/baseline/target + privacy/security test + removable derived state |

## Gate signals (review 24 Sep 2026)

| Signal | Definition | Threshold | Measurement (no telemetry) |
|---|---|---|---|
| G1 — export adoption | active users running the Obsidian-friendly export ≥1× within 14 days of release | ≥30% | export audit-log count / active users |
| G2 — export retention | first-time exporters who export again in week 2 | ≥50% of G1 exporters | audit log |
| G3 — cross-meeting Ask | weekly global-Ask queries citing ≥2 distinct meetings in `AskResult.evidence_refs` | upward trend over 4 consecutive weeks | local `AskResult` evidence |
| G1' — single-user fallback | structured 3-week self-audit: real sessions opening exported files in Obsidian | ≥2 sessions/week sustained | manual log |

Interpretation:

- G1 or G3 satisfied → Phase 1 proceeds at full scope.
- Neither satisfied after 6 weeks → Phase 1 shrinks to a meeting-knowledge reader with light annotation; a full Markdown editor is re-evaluated only on new evidence. A failed probe is a product result, not a team failure — effort redirects to Ask v2 quality.
- Thresholds may be tuned once by the owner before the probe ships, never after results arrive.
- The 24 Sep review reads G1 (14-day window) plus the G3 trend-to-date; the 6-week cap is the hard fallback.

## Dependency logic

Phase 0 and Ask v2 run in parallel before any desktop code (D1): the Ask pain is the documented day-to-day problem, and Ask v2 touches only `packages/{ai,meeting,store}`. The export probe is simultaneously a Phase 0 forcing function (D2) — `[[wiki-links]]`, tags, and folder structure make stable IDs and the canonical map real and tested. Phase 1 is demand-gated, not readiness-gated (D5); the installer spike must pass first (D3/D9), and ADR-013 identity closes before any Phase 1 schema is written (D6/D8) because identity is the one-way door. The Rust/TS contract stays limited to sync operations + IPC commands (D4); AI and retrieval never cross the language boundary. Persistence precedes the bridge; the bridge precedes sync; the AI engine needs stable search and provenance; MCP needs the query service, lock state, and audit — AI and routing come late because they amplify both good and bad behavior. The server stays deploy-optional: self-host single binary first, hosted only after Open Question #2 is decided.

## First implementation slice

One release train on the current extension: the Obsidian-friendly export with audit-log instrumentation (probe), the Ask v2 pipeline (intent → answerability → query planner → multi-pass lexical retrieval → conversation-window expansion → verified `AskResult` evidence), versioned shared DTOs + migration bundle v1, ADR-013 final-draft, and the 5-day installer spike on clean machines. No desktop, bridge, or sync-protocol code starts before the 24 Sep gate verdict and the spike go/no-go.

## Explicitly not scheduled

CRDT/collaborative editing, WebSocket, vector-database server, cloud-primary app, full web editor, team ACL workspace, mobile client, microservices/queues (§35.2 NOT NOW). Phase 6 additions require measured evidence, not enthusiasm.
