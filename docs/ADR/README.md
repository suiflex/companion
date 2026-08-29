# Architecture decision process

Architecture decision records (ADRs) document decisions that affect public contracts, trust or process boundaries, persistence, compatibility, or multiple subsystems.

## When an ADR is required

- Public contracts: extension message protocols, sync v2 operation/cursor protocol, MCP tool surfaces, export formats.
- Identity and data model: entity ID schemes, canonical vs derived state, migration/legacy mapping (e.g. ADR-0001).
- Sync and conflict semantics: idempotency keys, outbox/inbox, E2EE key handling.
- Security: capture permissions, native messaging host policy, tenant/device trust.

## Propose

Copy the structure of an existing numbered ADR, choose the next unused four-digit number, set `Status: Proposed`, and open a pull request. The proposal must state context, decision, consequences, alternatives, and an invariant or verification gate.

## Decide

`@suiflex/maintainers`, the repository's CODEOWNERS, decide ADRs through pull-request review. An ADR becomes `Accepted` only when a maintainer approves and merges it. Material changes require a new review.

## Supersede

Accepted ADRs are historical records and are not rewritten to hide an earlier decision. A replacement ADR names the records it supersedes; after it is accepted, update each replaced record to `Status: Superseded by ADR-NNNN` and link both directions.

Lifecycle: `Proposed` → `Accepted` → `Superseded by ADR-NNNN`. A rejected proposal is closed without merging and does not join the accepted set.
