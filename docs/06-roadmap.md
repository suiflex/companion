# Product roadmap

This is the single roadmap for product sequencing and execution status. Product scope comes
from [01-product-requirements.md](01-product-requirements.md); architecture constraints come
from documents 02–05 and accepted ADRs. Reviews, probes, and the two long-form architecture
plans are evidence and background, not active backlogs.

## Product destination

Companion grows from a meeting-capture extension into a local-first knowledge product with
two independently useful surfaces:

1. **Extension:** captures Meet/Teams, preserves transcripts, produces grounded AI notes, and
   remains fully usable without another app.
2. **Companion Desktop:** becomes the owned workspace for meetings, notes, search, backlinks,
   and local files. It replaces the need to use Obsidian as the working interface; it is not an
   Obsidian clone.

The Obsidian-friendly export remains an interoperability feature and the current demand probe.
It validates that users want a file-based knowledge workflow before Companion owns that workflow
in its desktop app. Obsidian is never a runtime dependency.

## Execution status

| Stage | Status | Outcome | Start rule | Done when |
|---|---|---|---|---|
| 0 — Extension foundation | **Now** | Ask v2; Obsidian export probe; stable IDs/DTOs; migration bundle; installer spike | Current product | Existing tests and smokes pass; archive round-trip preserves IDs/counts/hashes; probe instrumentation ships; installer spike records a verdict |
| G — Desktop scope gate | **Next decision** | Choose full desktop or a smaller meeting reader | Phase 0 evidence available | G1 or G3 passes → full scope; neither passes after 6 weeks → reader + light annotation, with G1′ as supporting evidence |
| 1 — Desktop workspace | **Not started** | Offline vault, Markdown editing/preview, meetings, native SQLite/FTS, search/backlinks, file watcher, trash/restore, import/export | Gate G decides scope; native-messaging protocol has a GO verdict; identity ADRs are accepted | Offline end-to-end flow passes; crash tests leave no partial files; integrity scanner passes |
| 2 — Extension ↔ desktop | **After desktop** | Captured meetings arrive once in Desktop through native messaging | Phase 1 vault and migration contract are stable | Meet/Teams fixtures survive bridge downtime and retry without duplicates; extension still works alone |
| 3 — Optional encrypted sync | **Later** | Multi-device sync without server plaintext | Local vault and operation identity are proven | Retry/reorder/conflict/recovery suite converges; server plaintext-negative tests pass |
| 4 — Unified AI | **Later** | Grounded search and Ask across meetings and notes | Stable local query and provenance contracts | Retrieval evals and citation checks pass; mutation tools remain off |
| 5 — Live MCP | **Later** | Desktop-backed read-only tools with snapshot compatibility | Desktop query service, lock state, and audit are stable | Permission-negative tests and MCP smokes pass |
| 6 — Evidence-backed additions | **Unscheduled** | Graph, optional embeddings, AI mutations, history, mobile reader | A separate measured need exists | Each feature has its own baseline, target, privacy test, and removable derived state |

Only the stage marked **Now** is an implementation commitment. A later stage may be designed just
enough to close a one-way-door decision, but its feature backlog does not start early.

## Current release train — Stage 0

Repository snapshot verified on 1 September 2026:

| Work item | Evidence-backed state | Next executable action |
|---|---|---|
| Ask v2 | **In progress:** six eval groups are coded; the 15 standalone JSON fixtures required by the spec are absent | Add the missing fixtures and finish the spec DoD |
| Obsidian export | **Implemented, release unverified:** UI/background handlers and `export.obsidian` audit events exist | Fix the gate clock below, then release and record T0 |
| G1/G2 clock | **Blocking probe release:** `gateSummary` still anchors to the oldest surviving audit event; no persisted release T0 exists | Persist one release T0 and make the tested gate calculation use it |
| G3 measurement | **Partially implemented:** `ask.global` records `meetingsCited`; no weekly trend rollup exists | Add the smallest local four-week rollup and regression test |
| Native messaging spike | **GO with conditions:** protocol passed on macOS/Linux; clean-VM timing, Windows execution, uninstall/update, and signing remain unverified or pending | Complete the recorded conditions before desktop distribution |
| Companion Desktop | **Not started:** no desktop/Tauri workspace or dependency exists | Wait for Stage G, then create only the selected Desktop scope |

Stage 0 has parallel workstreams; only the arrows below are hard dependencies:

- **Ask:** finish Ask v2 against its canonical [specification](ask-v2-spec.md) and regression criteria.
- **Demand probe:** correct the G1/G2 release clock and add the G3 weekly rollup → release the
  implemented Obsidian-friendly export and declare T0 once → collect the gate evidence.
- **Shared foundation:** complete the portable DTO/identity/migration round-trip needed by export
  and future desktop import.
- **Distribution:** complete the native-messaging verdict conditions before supported desktop
  distribution.
- **Desktop decision:** read the demand evidence and record Stage G before desktop implementation.

### Demand signals

| Signal | Definition | Threshold | Measurement |
|---|---|---|---|
| G1 — export adoption | Active users exporting within 14 days of T0 | ≥30% | Local audit logs aggregated for the review |
| G2 — export retention | G1 exporters exporting again in week 2 after first export | ≥50% | Local audit logs |
| G3 — cross-meeting Ask | Weekly global Ask queries citing at least two meetings | Upward trend over 4 consecutive weeks | Verified `AskResult.evidence_refs` |
| G1′ — single-user fallback | Real sessions opening exported files in Obsidian | ≥2 sessions/week for 3 weeks | Manual log |

T0 is the export-probe release date. Thresholds may be tuned once before release, never after
results arrive. The planned 24 September 2026 review is valid only if its measurement windows
have elapsed; otherwise it records a new decision date rather than inventing a result.

## Desktop MVP boundary — Stage 1

The first desktop release owns the local workspace, not every Obsidian feature.

**Must ship:** vault create/open, Markdown CRUD and preview, meeting import, native SQLite/FTS,
search, links/backlinks, file watching, atomic writes, trash/restore, and recovery export.

**Must stay outside this stage:** cloud requirement, team workspaces, CRDT collaboration,
mandatory embeddings, graph visualization, plugin marketplace, full Obsidian compatibility,
and write-enabled MCP.

If the gate selects the smaller scope, Stage 1 keeps meeting import, reading, search, and light
annotation; the general-purpose Markdown editor waits for new evidence.

## Execution rules

- Work only from this roadmap plus the linked specification for the active stage.
- Accepted ADRs override implementation detail, but do not silently add roadmap scope.
- A review or probe contributes evidence; its findings become a roadmap change, ADR, or issue
  before they become work.
- The extension, desktop, and optional server remain independently operable.
- Preserve raw transcript provenance, local-first behavior, and the canonical identity model
  through every stage.

## Supporting documents

- Product scope and acceptance: [01-product-requirements.md](01-product-requirements.md)
- System and data boundaries: [02-system-architecture.md](02-system-architecture.md),
  [03-data-and-identity.md](03-data-and-identity.md)
- AI scope: [04-ai-ask-engine.md](04-ai-ask-engine.md)
- Packaging and bridge constraints: [05-distribution-and-installer.md](05-distribution-and-installer.md)
- Operations: [08-operations.md](08-operations.md) · Dated risk evidence: [07-risk-register.md](07-risk-register.md)
- Historical decisions: [ADR/](ADR/)
- Historical reviews and executable probes: [reviews/](reviews/)
