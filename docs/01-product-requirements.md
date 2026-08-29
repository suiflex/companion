# Product requirements

Companion is a local-first AI meeting assistant and personal knowledge system: a Chrome MV3 extension captures Google Meet/Teams knowledge today; a desktop vault and optional E2EE sync extend it only behind measured demand (unified architecture §4, §32, §36).

## Users and jobs

- Individual knowledge worker (single user, multi-device): capture meetings, get trustworthy AI notes, ask questions across history without sending the archive anywhere.
- Extension-only user: capture, analysis, search, and export must work with no desktop, no account, and no server.
- Desktop user (gated): organize notes, meetings, and documents in one local vault of files they own.
- Agent operator: read the meeting archive from coding agents through read-only MCP with verified evidence, not generated prose.
- Self-hosting operator: run the sync endpoint themselves; the server must never be able to read meeting content.
- Product owner: needs demand evidence before funding the second application surface.

## Functional requirements

| Priority | Requirement | Path (phase / gate) |
|---|---|---|
| P0 | Existing extension surface: Meet/Teams capture, immutable raw transcript + cleanup provenance, validated AI analysis, FTS5 search, evidence-linked structured memory, providers (API key / OAuth subscription / Gemini Nano), Markdown/PDF/ICS exports | Shipped; regression-protected by the Phase 0 DoD (§32) |
| P0 | Ask Engine v2: multi-pass lexical retrieval + conversation window, verified entry-ID evidence, 4-grade answerability, regression eval suite | D1: parallel with Phase 0, zero desktop dependency; sized 1–2 sprints, reviewed each sprint boundary against AC5 (proposed default; ask-v2-spec.md is canonical) |
| P0 | Obsidian-friendly export probe (wiki-links, tags, folders) — demand probe and canonical-ID forcing function | D2: Phase 0, ±1 sprint on packages/exporters |
| P1 | Stable operation IDs, durable capture queue, shared-package portability split, ADR-013 identity (UUIDv7, session_key) | Phase 0 deliverables — prerequisites for Phases 1–2 |
| P1 | Desktop local vault (Tauri 2): Markdown CRUD + preview, native SQLite/FTS5, watcher, atomic write journal, search/backlinks, trash/restore, non-destructive import | Phase 1 — gated by §32.1 (G1 or G3), preceded by the 5-day installer spike (D9) |
| P1 | Extension ↔ desktop bridge: native messaging, idempotent operation batches, extension fully functional when desktop is absent | Phase 2 — after Phase 1 (gated) and installer-spike go (A1–A5 pass on all 3 OS) |
| P2 | E2EE sync v2: op IDs, cursors, devices, tombstones, attachments, key recovery/enrollment, conflict policies (3-way Markdown merge, optimistic versions) | Phase 3 — after the local vault is proven |
| P2 | Live read-only MCP over desktop IPC (snapshot mode stays), context manifests, privacy modes | Phases 4–5 |
| P3 | Evidence-backed additions only: graph visualization, optional embeddings, controlled AI mutations, version history, mobile read client | Phase 6 — each needs a predeclared metric |

## Non-functional requirements

- Local-first: capture, analysis, search, and export complete with no network and no account; provider failure degrades to local search, never blocks vault work.
- Privacy: synced payloads are client-side E2EE; the server stores opaque ciphertext and sees only routing metadata; host permissions are per-integration opt-in.
- Provenance: every AI claim traces to a verified transcript entry ID or document locator; unverified citations are rejected before display.
- No telemetry: product measurement uses the local audit log and user-reported signals only.
- Recoverability: the capture queue survives service-worker restarts; the SQLite index rebuilds from canonical state; migration never deletes Chrome storage.
- Demand discipline: the desktop (a second application surface) is funded by measured demand, not architectural elegance.

## Acceptance criteria

T0 = the export-probe release date; every gate window below is measured from T0. An **active user** is a user with ≥1 capture or export event in the prior 30 days (local audit log).

1. G1 export adoption: ≥30% of active users run the Obsidian-friendly export within 14 days of T0 (export audit log; owner: product owner). Gate for Phase 1.
2. G2 export retention: ≥50% of the G1 cohort export again in week 2 since their first export (audit log; owner: product owner).
3. G3 cross-meeting Ask: weekly global-Ask queries citing ≥2 distinct meetings trend upward over 4 consecutive weeks (AskResult.evidence_refs, local; owner: product owner). Second gate for Phase 1.
4. G1' single-user fallback: ≥2 documented Obsidian sessions/week sustained over a 3-week self-audit (manual log; owner: business owner).
5. Ask v2 regression: the documented failing question ("gimana caranya solusi dari beberapa aplikasi yang terdampak?") returns a grounded answer citing ≥1 verified entry ID, never "not mentioned in the meeting" (eval suite, packages/ai; owner: AI engineer).
6. Raw-transcript guarantee: AI cleanup never overwrites raw lines; 100% of corrections keep the original retrievable and restorable (automated tests; owner: extension engineer).
7. Gate hygiene: thresholds are tuned at most once, before the probe ships; the gate verdict lands within 6 weeks of T0 (owner: product owner).
8. Bridge durability: a fixture meeting appears exactly once on desktop after bridge downtime + retry; disabling desktop leaves the extension fully functional (Phase 2 DoD; owner: desktop engineer).
9. Phase 0 refactor: the exported archive round-trips with equal IDs/counts/hashes and the full extension test suite passes unchanged (§32 Phase 0 DoD; automated tests; owner: extension engineer).

Sequencing is dependency-driven (§32), anchored to T0: P0 is now; if G1 and G3 both fail at week 6, Phase 1 proceeds shrunk (meeting-knowledge reader + light annotation) with sustained G1' as supporting evidence for that shrunk path; otherwise P1 starts after the gate, P2 after Phase 1, P3 per evidence.

## Exclusions for the first credible releases

CRDT/live collaborative editing, a vector database or mandatory embeddings, a cloud-primary application, WebSocket, team workspaces/ACLs, mobile clients, microservices, and MCP write access are NOT NOW. Each enters only after measured need and a separate architecture decision.
