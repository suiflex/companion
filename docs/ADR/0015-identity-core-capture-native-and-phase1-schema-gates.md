# ADR-0015: Identity amendment — core tables stay capture-native, `session_key` UNIQUE is the canonicalization channel; `session_key`/`external_refs` schema gates bind to the Phase 1 vault, not the sync-server

- Status: Accepted
- Date: 2026-08-28
- Amends: ADR-0001 (§6 in particular); ADR-0001 remains Accepted with this amendment
- Decision owner: pak-arsitekno; approved under owner delegation (Pak Bos)
- Inputs: QA verdict t_5c12b5cd + fresh sync probe t_6a2a8a74 (finding: `session_key` UNIQUE and `external_refs` absent from sync-server schema; UUIDv7 PARTIAL — present only in the exporter layer), gate t_460fd635 open issues #3 (Major) and #4 (Minor)

## Context

Two findings came out of the Phase 1 gate evidence review. Neither is a code defect today; both are target-state conformance questions that were being checked against the wrong artifact.

**Finding A (Major, target-state).** The probe reports the sync-server schema lacks a UNIQUE `session_key` column and an `external_refs` table, which D8/ADR-0001 require. Verified directly against `packages/sync-server/src/store.ts`: the finding is factually true but category-wrong. The sync-server has **no SQL schema at all** — it is a file-per-meeting store of passphrase-sealed opaque bundles (`SyncStore` writes `<sessionId>.json`, P2.6/P2.7); the server cannot see `session_key` inside ciphertext and must never grow canonical-table columns, or ADR-007 (server lacks plaintext) breaks. The UNIQUE `session_key` and `external_refs(entity_id, system, external_key, url)` are **canonical vault schema** artifacts — the SQLite database of the Phase 1 desktop vault (the only place, per D6/D8, where canonical IDs are written). The requirement is real; the artifact that must satisfy it does not exist yet, by design, because Phase 1 is demand-gated (D5/D10: NO-DECISION until 24 Sep).

**Finding B (Minor, decision).** UUIDv7 is PARTIAL: satisfied at the exporter layer (`companionIdFor` in `packages/exporters/src/obsidian.ts` — derived UUIDv7 layout, never stored), while core tables (`packages/store/src/schema.ts`) still key sessions on the capture-native `makeSessionId(room, ms)` = `<room>#<start-ms>`. ADR-0001 §6 explicitly permits this status quo "until this ADR formally revisits it". That revisit must now happen explicitly — either migrate core identity to UUIDv7 in the next phase, or keep capture-native with `session_key` UNIQUE as the canonical channel.

## Decision

**B — core identity stays capture-native; no UUIDv7 migration of core tables.**

1. `meeting_sessions.id` (and the store schema generally) **keeps** `<room>#<start-ms>` as primary key through the capture/local-analysis era. The exporter's stored `companion_id` remains the only UUIDv7 that reaches user-visible artifacts (Obsidian frontmatter), and it stays derived, never stored — zero storage, zero migration.
2. The canonical UUIDv7 `meeting_id` is introduced **once, at the canonical boundary**: the Phase 1 import/vault layer assigns `meeting_id` (UUIDv7) and stores the capture ID as `session_key` (UNIQUE), per ADR-0001. Capture/import resolves by `session_key` first — re-capture and re-import stay idempotent.
3. Rationale: a core-table migration would rewrite keys in `meeting_sessions`, `transcript_entries`, `analyses`, `decisions`, `action_items`, `open_questions`, `risks`, `evidence_refs` plus every `chrome.storage`-persisted reference — a one-way-door rewrite of shipped user data whose only yield inside the extension is cosmetic (opaque IDs are the rule *outside* the storage layer per ADR-0001; inside the capture store, `<room>#<start-ms>` is already unique, human-debuggable, and never exposed as a link key — the exporter already keys exports on the derived companion_id, not the raw session id). Cost is real, benefit is zero until the canonical vault exists, and ADR-0001 §6 sanctions exactly this. The capture-native ID is demoted to `session_key` at import — the one cheap, clean seam where identity translation belongs.
4. **This closes ADR-0001 §6's revisit clause with the opposite outcome of a migration:** the status quo is confirmed as the steady state until the canonical vault ships, at which point the translation happens at import time, not in place.

**A — the conformance gates bind to the Phase 1 canonical vault; sync-server is explicitly out of scope; both checks enter the Phase 1 DoD via the D6 scanner.**

1. `session_key TEXT NOT NULL UNIQUE` (with index) and `external_refs(entity_id, system, external_key, url)` are **mandatory tables of the canonical vault schema**, drafted now as migration steps **M+1/M+2** of the Phase 1 vault DB (append-only, per the store migration rule — never edit a shipped step):
   - `M+1 — canonical identity bridge`: `meeting_id TEXT PRIMARY KEY` (UUIDv7), `session_key TEXT NOT NULL UNIQUE`, `legacy_id(entity_id, legacy_id UNIQUE)` for chrome.storage import provenance.
   - `M+2 — external references`: `external_refs(id PK, entity_id NOT NULL, system NOT NULL, external_key NOT NULL, url, UNIQUE(entity_id, system, external_key))` — the only tracker linkage (Jira/Linear/Notion); no tracker column ever lands on an entity table.
2. **Sync-server schema change: rejected and recorded.** The probe's implied remediation ("add the columns to sync-server") is refused: the server stores only ciphertext bundles by contract (ADR-005/ADR-007), and the sync v2 operation protocol (immutable ops + `(vault_id, operation_id)` uniqueness) carries identity opaquely. No migration of the sync-server is planned or required.
3. **Phase 1 DoD (via D6 scanner) gains two exact checks**, shipped with the desktop vault scanner:
   - `SC-SESSION-KEY`: every canonical meeting row has a non-null `session_key`, UNIQUE across the vault, matching the single combined pattern `^([A-Za-z0-9._-]{1,64}#\d{13}|tms-\d{13})$` — the room form per `sanitizeRoomId`/`makeSessionId` in `packages/shared/src/session.ts`, or the no-room `tms-<ms>` fallback (unambiguous: `tms-…` is in the room charset but the fallback form carries no `#`, and a room literally named `tms-…` synthesizes `tms-…#<ms>` with the separator). Legacy separator-less ids never enter `session_key` directly; they map through `legacy_id` and their `session_key` is synthesized at import from the recorded start time.
   - `SC-EXT-REFS`: the `external_refs` table exists and is the only path from any entity to a tracker key — no `external_ref`-style column on entity tables.
   - A violation is data corruption, not a recoverable bug (D6 stance); the vault does not ship with either check failing.
4. Nothing here blocks gate instrumentation **W1–W4** or any other Phase 0 work: they touch `apps/extension/src` and `packages/exporters` only, never the sync schema, and the canonical vault DB does not exist until Phase 1 passes its gate.

## Consequences

- Cheap now: no core-table key rewrite, no sync-server migration, no schema churn while Phase 1 is demand-gated; the identity seam (`session_key` translation at import) is defined before any canonical row is ever written, so the one-way door closes on paper, not in production.
- Deferred cost, made explicit: the vault import layer must implement and test the `session_key` → `meeting_id` resolution and the M+1/M+2 migrations before the first canonical vault ships — tracked as Phase 1 DoD items, enforced by `SC-SESSION-KEY`/`SC-EXT-REFS`.
- The dual-truth window (capture store vs canonical vault) stays guarded by the D6 scanner rather than by hope; §11.2 risk unchanged.
- If a future requirement forces core UUIDv7 (e.g. multi-writer merge inside the extension store itself), that is a new ADR — this one records why it was refused at this layer today.

## Alternatives considered

- **Migrate core tables to UUIDv7 next phase.** Rejected: rewrites shipped keys across every store table and `chrome.storage` references for zero in-extension benefit; IDs are opaque outside the storage layer, and the canonical boundary already provides UUIDv7 where it matters.
- **Add `session_key`/`external_refs` to the sync-server now.** Rejected: category error — the server holds only sealed opaque bundles (ADR-007); a server-side canonical schema would either break E2EE or duplicate truth (§11.2) on the wrong side of the trust boundary.
- **Drop `session_key` and resolve by `meeting_id` alone.** Rejected: re-capture and re-import lose idempotency, violating ADR-0001's binding constraint 5; recurring-room semantics (`<room>#<start-ms>`, never merged) have no cheaper carrier than `session_key`.

## Invariant

Canonical identity is assigned exactly once, at the canonical boundary: capture IDs (`<room>#<start-ms>`) never become primary keys of the canonical vault, and UUIDv7 `meeting_id`s are never generated inside the capture store or the sync-server.
