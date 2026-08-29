# Companion documentation index

Status: documentation set complete, 2026-08-28. Evidence baseline: branch `develop`, commit `3bfe1449`, per [COMPANION_UNIFIED_ARCHITECTURE.md](COMPANION_UNIFIED_ARCHITECTURE.md). Start with [vision](00-vision.md). Where documents conflict, COMPANION_UNIFIED_ARCHITECTURE.md governs; superseded sections of the 2026-08-24 roadmap are listed in its staleness banner and must not be used.

| Area | Documents |
|---|---|
| Product | [00 vision](00-vision.md), [01 product requirements](01-product-requirements.md), [09 glossary](09-glossary.md) |
| Architecture | [02 system architecture](02-system-architecture.md), [03 data and identity](03-data-and-identity.md), [04 AI ask engine](04-ai-ask-engine.md) |
| Roadmap and operations | [05 distribution and installer](05-distribution-and-installer.md), [06 roadmap](06-roadmap.md), [07 risk register](07-risk-register.md), [08 operations](08-operations.md), [gate G1' log](gate-g1-prime-log.md) |
| ADR | [ADR process](ADR/README.md), [0001 identity model — UUIDv7](ADR/0001-identity-model-uuidv7.md), [0014 Phase 1 demand gate — NO-DECISION](ADR/0014-phase1-demand-gate-nodecision.md), [0015 identity core stays capture-native; Phase 1 schema gates](ADR/0015-identity-core-capture-native-and-phase1-schema-gates.md) |

Document status: 00-09 and ADR/0001 complete (2026-08-28); 01 passed PM review (docs/reviews/prd-review-01-product-requirements.md). G1' weekly self-audit log live since 2026-08-28 ([gate-g1-prime-log.md](gate-g1-prime-log.md)), filling weekly until the 24 Sep gate review. Authoritative detail not yet restated here lives in COMPANION_UNIFIED_ARCHITECTURE.md (§9, §32.1, §36–§37).

## Global invariants

Synthesized from the owner-approved decision log D1–D8 (COMPANION_UNIFIED_ARCHITECTURE.md §37):

1. User pain ships first: Ask Engine v2 and Phase 0 run in parallel and outrank any desktop code (D1).
2. A new surface must be paid for by measured demand — Phase 1 starts only on the §32.1 gate (G1 or G3), never on engineering readiness alone (D2, D5).
3. No dual canonical truth: UUIDv7 identity, `session_key` uniqueness and provenance locators are finalized and machine-checked by an integrity scanner before any vault schema ships (D6, D8).
4. Identity is a one-way door: no vault on mutable or ambiguous IDs; legacy IDs are mapped, never reused as canonical (D8).
5. The Rust/TypeScript boundary is limited to sync operations and IPC commands; AI and retrieval logic stay TypeScript-only (D4).
6. Risky platform friction is spike-gated with dated go/no-go artifacts before dependent phases commit (D3).
7. The Obsidian-friendly export is both a demand probe and a forcing function: it must exercise stable IDs and the canonical map, and its metrics feed the §32.1 gate (D2).
8. One documentation authority: on conflict, COMPANION_UNIFIED_ARCHITECTURE.md wins and superseded roadmap sections are ignored (D7).
