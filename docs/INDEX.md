# Companion documentation

Start with [00-vision.md](00-vision.md), then use
[06-roadmap.md](06-roadmap.md) as the single product roadmap before implementation.

## Documents used for execution

| Need | Source of truth |
|---|---|
| Product direction | [00 vision](00-vision.md) |
| Scope and acceptance criteria | [01 product requirements](01-product-requirements.md) |
| Product sequence and current stage | [06 product roadmap](06-roadmap.md) |
| System boundaries | [02 system architecture](02-system-architecture.md) |
| Data and identity | [03 data and identity](03-data-and-identity.md) plus accepted [ADRs](ADR/) |
| Ask implementation | [04 AI Ask Engine](04-ai-ask-engine.md) and [Ask v2 spec](ask-v2-spec.md) |
| Packaging and native bridge | [05 distribution and installer](05-distribution-and-installer.md), [Firefox signing](firefox-signing.md) |
| Operations | [08 operations](08-operations.md) |
| Shared terms | [09 glossary](09-glossary.md) |

For sequencing or status conflicts, `06-roadmap.md` wins. For an implementation decision,
an accepted ADR wins. Update the relevant source of truth instead of copying the same decision
into another document.

## Evidence and background

These files explain how a decision was reached; they are not implementation backlogs:

- [`reviews/`](reviews/) contains dated audits, review verdicts, and reproducible probe scripts.
  Keep them immutable so old evidence is not rewritten after the product changes.
- [COMPANION_UNIFIED_ARCHITECTURE.md](COMPANION_UNIFIED_ARCHITECTURE.md) is the detailed target-
  architecture study. Its phase ordering is summarized and governed by `06-roadmap.md`.
- [companion-product-architecture-roadmap.md](companion-product-architecture-roadmap.md) is the
  earlier product/architecture plan and remains historical background only.
- [demand-gate-audit-32-1.md](demand-gate-audit-32-1.md),
  [gate-g1-prime-log.md](gate-g1-prime-log.md), and
  [spike-native-messaging-installer.md](spike-native-messaging-installer.md) are gate evidence.
- [07-risk-register.md](07-risk-register.md) is a dated risk snapshot; current blockers are in
  the active roadmap.
- [`mockup/`](mockup/) is a design artifact, not a committed feature list.

When a review finds work, promote that finding into the active roadmap, an accepted ADR, or the
issue tracker. Do not execute directly from a dated review.

## Product shape

- The extension remains a complete meeting-capture product.
- Companion Desktop becomes the owned local knowledge workspace and removes dependence on
  Obsidian as the working UI.
- Obsidian-friendly export remains supported for interoperability and demand validation.
- Optional encrypted sync and live MCP follow only after the local desktop vault is proven.
