# Glossary

Shared vocabulary for the Companion architecture documents. The
[unified architecture](./COMPANION_UNIFIED_ARCHITECTURE.md) is authoritative; documents 00–08
define subsystem detail and must stay consistent with the terms below.

| Term | Definition |
|---|---|
| Companion | Local-first AI knowledge workspace + meeting companion: capture meetings, keep structured knowledge in a local vault, answer with evidence. |
| Three surfaces | Extension (MV3), Desktop (Tauri 2), Server (self-host HTTP) — independently useful, loosely coupled, contract-only seams (§36). |
| Extension | The existing MV3 Chrome extension: Meet/Teams capture, transcript archive, AI analysis, Ask v2, exports; stays fully functional offline. |
| Desktop | Phase 1+ Tauri app (Rust core + React UI) that owns the vault; green-lit only by the §32.1 gate. |
| Server | Phase 3+, deploy-optional E2EE sync relay: opaque ops/blobs, cursors, quotas; never sees plaintext knowledge. |
| Vault | The local store the desktop owns: Markdown documents + SQLite structured records + content-addressed attachments (§13). |
| companion_id | Stable internal entity ID: UUIDv7 (RFC 9562) per ADR-013; UUIDv4 + `created_at_ms` is the only pre-approved fallback. |
| session_key | UNIQUE capture identity `<room>#<start-ms>` stored on the canonical meeting; bridges extension capture to `meeting_id` and keeps re-capture/re-import idempotent. |
| operation_id | Stable ID of one capture operation; the dedupe key when the same op arrives via native messaging and E2EE cloud sync. |
| legacy_id | Pre-existing meeting session ID preserved on import and mapped to a stable internal `meeting_id`. |
| Canonical map | §11.2 table naming the single source of truth per data type: SQLite for stateful entities, Markdown for human notes, nothing synced for derived indexes. |
| Dual canonical store | The chosen model (§11.1 Option B): SQLite canonical for meetings/transcripts/structured records, Markdown canonical for human-written notes. |
| Derived data | FTS, backlinks, previews, embeddings — rebuildable locally, never synced. |
| Tombstone | Synced deletion marker for a canonical record. |
| Cursor | Monotonic per-device sync position against the server; offline is the default state, not an error. |
| Capture queue | Durable `chrome.storage.local` recovery copy of capture ops pending delivery (extension outbox). |
| Native messaging | Browser-hosted local bridge Extension → Desktop: extension-ID allowlist, no listening port (ADR-008). |
| Native host | Signed OS-level binary that receives native messages; installer feasibility is validated by the spike (`spike-native-messaging-installer.md`). |
| E2EE sync | Optional HTTPS sync of encrypted ops/blobs carrying the same operation IDs; the server stores ciphertext and metadata only. |
| Locator (provenance) | `(meeting_id, line_id)` reference grounding AI answers to verbatim evidence. |
| Correction variant | Versioned transcript correction referencing immutable raw `transcript_lines`. |
| Ask v2 | Evidence-citing retrieval/reasoning engine over a local scope (`ask-v2-spec.md`; roadmap §9–§18). |
| MVP | The MUST scope per surface in §36.1; excludes realtime push, write-MCP, hosted AI, and mandatory cloud paths. |
| Phase 0 | Current phase: extension + Ask v2 + the Obsidian-friendly export probe; no desktop code. |
| Phase 1 | Desktop vault phase; starts only after the §32.1 gate passes. |
| Gate §32.1 | Demand gate: G1 or G3 satisfied within 6 weeks; failure shrinks Phase 1 to a meeting-knowledge reader + light annotation. |
| Probe G1 | Export adoption: ≥ 30% of active users run the Obsidian-friendly export ≥ 1× within 14 days of release. |
| Probe G2 | Export retention: ≥ 50% of G1 exporters export again in week 2. |
| Probe G3 | Cross-meeting Ask: weekly global Ask queries citing ≥ 2 distinct meetings, trending up over 4 weeks. |
| Probe G1′ | Single-user fallback: structured 3-week self-audit, ≥ 2 sessions/week opening exported files in Obsidian. |
| D1–D9 | Architecture decision log in §37 (Ask-first sequencing, export as forcing function, native-messaging spike, Rust/TS boundary, gate, identity scanner, doc authority, ADR-013, spike plan). |
| ADR-008 | Decision making capture operations durable and idempotent across the native-messaging and cloud paths. |
| ADR-013 | Identity model: UUIDv7 IDs, `session_key` UNIQUE, provenance locators, `legacy_id` mapping, `external_refs` for trackers. |
