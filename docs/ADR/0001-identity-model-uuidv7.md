# ADR-0001: Identity model — UUIDv7 internal IDs

- Status: Accepted (amended 2026-08-28 by ADR-0015 — §6 revisit closed: core capture tables stay `<room>#<start-ms>` until the canonical vault; `meeting_id` UUIDv7 is assigned only at the import/canonical boundary)
- Date: 2026-08-27
- Carries: ADR-013 from `docs/COMPANION_UNIFIED_ARCHITECTURE.md`, unchanged in meaning
- Amendment: [ADR-0015](0015-identity-core-capture-native-and-phase1-schema-gates.md) (2026-08-28)

## Context

Identity is the only one-way door in this architecture: Tauri, parsers, and embeddings are replaceable, but IDs baked into a user vault are not retroactively changeable. Conflict resolution, backlinks, provenance, and dual-path dedupe all key off identity, so a wrong model corrupts silently and permanently. Six binding constraints came out of the 2026-08-27 product review:

1. IDs survive renames; display names are derived, never the key.
2. `operation_id` dedupe must close the bridge + cloud double-delivery case: the same capture operation arriving through native messaging and E2EE sync applies exactly once.
3. Line-level provenance survives transcript cleanup and correction versions; a corrected view can never orphan raw evidence.
4. External tracker IDs (Jira/Linear/Notion) are references, never primary keys.
5. Legacy `chrome.storage` import is idempotent; re-import produces zero duplicate entities.
6. Session identity stays as implemented (`<room>#<start-ms>`) until this ADR formally revisits it; recurring rooms must not merge. *(Revisited and closed 2026-08-28 by [ADR-0015](0015-identity-core-capture-native-and-phase1-schema-gates.md): the status quo is confirmed — capture-native session IDs in core tables, UUIDv7 `meeting_id` + UNIQUE `session_key` assigned at the canonical boundary only.)*

## Decision

All canonical entities use **UUIDv7 (RFC 9562)** internal IDs, generated locally at entity creation.

- `document_id`, `meeting_id`, `transcript_line_id`, `decision_id`, `action_id`, `attachment_id`, `vault_id`, `device_id`, `ai_conversation_id` are UUIDv7. Time-ordered IDs keep SQLite B-tree inserts append-only, give chronological ordering for free, and make merge order debuggable. IDs are opaque strings outside the storage layer (typed wrappers).
- The extension keeps `<room>#<start-ms>` as capture-level session identity; the canonical meeting stores it as `session_key` (UNIQUE) beside the UUIDv7 `meeting_id`. Capture/import resolves by `session_key` first, so re-capture and re-import stay idempotent. Different `start_ms` is a different meeting — recurring rooms never merge.
- Identity never derives from title or path. Meeting notes carry their own `document_id` in frontmatter and link to `meeting_id`; `[[Title]]` links resolve display names through the ID.
- `operation_id` is UUIDv7, generated once at capture time and immutable across bridge and cloud paths; the `(vault_id, operation_id)` unique constraint makes double delivery apply exactly once. Idempotency relies on uniqueness, never ordering.
- Evidence locators are `(meeting_id, line_id)` plus correction version — never line numbers, never timestamps. Raw `transcript_line_id` is append-only; corrections are version records referencing raw line IDs.
- Tracker references live in `external_refs(entity_id, system, external_key, url)` — never entity columns, never entity keys.
- Pre-existing chrome.storage entities map through a `legacy_id` table; import upserts by legacy ID and preserves the original ID as provenance.
- Transport pseudonymity (raw vs per-vault pseudonymous `operation_id`/`object_id` on the wire) is deferred to the Phase 3 crypto review — a reversible, transport-layer decision that does not touch vault-local IDs.

Platform validation (executed 2026-08-27; every required target produces valid UUIDv7):

| Target | Result |
|---|---|
| Rust, Tauri/desktop (cargo 1.95, `uuid` crate `v7` feature) | PASS — RFC 9562 version/variant bits verified |
| TypeScript/Node (`uuid@14.0.1`, already in the dependency tree) | PASS — 999/999 lexically sorted in a same-millisecond batch |
| Extension runtime (MV3, no build step) | PASS — buildless `Date.now()` + `crypto.getRandomValues()`, 10,000/10,000 |

Pre-approved fallback (dormant): if a future platform target cannot produce UUIDv7, fall back to UUIDv4 with an explicit `created_at_ms` column for ordering. This is the only sanctioned deviation.

## Consequences

Every entity table and sync operation inherits these invariants; violation is data corruption, not a recoverable bug. Index locality on `transcript_lines` materially improves capture and import performance, and chronological sort is free. The dual-canonical integrity scanner gains an exact schema to enforce: UUIDv7 pattern per entity, unique frontmatter `document_id`, `session_key` uniqueness, `external_refs` as the only tracker linkage. Risks: premature format freeze — mitigated by opaque IDs outside the storage layer plus the UUIDv4 fallback; UUIDv7 ordering is monotonic only to millisecond granularity — the ordering authority remains the server cursor and local sequence, never the ID itself.

## Alternatives

UUIDv4 needs a companion `created_at_ms` everywhere ordering matters and scatters B-tree inserts. Auto-increment integers leak volume, break multi-writer merge, and cannot be generated offline per device. Content hashes change when content is corrected, which breaks provenance. Tracker IDs (Jira/Linear) violate constraint 4 — an unavailable tracker must never orphan local entities.

## Invariant

Identity never derives from display names, file paths, line numbers, timestamps, or external tracker keys.
