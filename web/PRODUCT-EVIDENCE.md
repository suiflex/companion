# Product claim evidence

Inspected 2026-10-17. Source checkout and public latest release **v1.19.0** (2026-10-06). No roadmap-only capabilities or fabricated adoption figures are advertised.

| Website claim                                                           | Evidence                                                                                                                            |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Live captions on Meet, Teams, Zoom Web                                  | `apps/extension/public/content.js`, platform branches; `manifest.json` matching hosts; Zoom release notes preceding/current v1.19.0 |
| Reads captions, no meeting bot or microphone recording                  | Content script DOM capture and manifest permissions                                                                                 |
| Structured summary, decisions, action items, timeline, risks, questions | `packages/ai` prompts and parsers; `packages/shared` analysis types; extension `SummaryView.tsx`                                    |
| Finished meetings may be analyzed automatically                         | `apps/extension/src/background.ts` sweep and `packages/meeting` pipeline; README How it works                                       |
| Local archive, lexical search, cross-meeting Ask and continuity         | `packages/store` SQLite/FTS5; `packages/meeting` Ask/continuity; README Local knowledge base                                        |
| Markdown and PDF exports                                                | `packages/exporters`, extension export controls, README; desktop exports released in v1.19.0                                        |
| Independent desktop vault and optional bridge                           | `apps/desktop`, `packages/vault`, `background.ts`, `spool.ts`, INSTALL; bridge off by default                                       |
| Markdown files, folder organization and full-text index                 | `packages/vault/src/note.ts`, desktop `NoteTree.tsx`, `tree.ts`, `NoteEditor.tsx`, `App.tsx`                                        |
| Cloud/local provider choices                                            | `packages/ai/src/client.ts` PROVIDER_PRESETS and `providers.ts` adapters                                                            |
| Account sign-in caveat                                                  | INSTALL Connecting an AI provider: undocumented CLI backends; no general subscription entitlement guarantee                         |
| Built-in Chrome AI caveat                                               | Built-in provider adapter; browser/device/model availability is conditional                                                         |
| Local-first privacy with explicit remote processing                     | PRIVACY, actual sweep/pipeline behavior and provider transport; optional integrations and GitHub version checks                     |
| No author-operated meeting server or telemetry                          | PRIVACY; optional user-hosted sync is separate and not marketed as desktop multi-device synchronization                             |
| Apache 2.0 and Suiflex attribution                                      | LICENSE, README and public repository                                                                                               |
| macOS/Windows/Linux distribution, unsigned builds                       | INSTALL and `.github/workflows/release-desktop.yml`; ARM Linux/Windows legs are experimental                                        |
| Browser distribution                                                    | Public Chrome Web Store listing (verified 2026-10-18), official AMO listing, INSTALL and public GitHub latest release               |

## Documentation drift handled in the website

Desktop is presented as a standalone notes and knowledge workspace. Formatted notes, checklists and attachments are implemented in `NoteEditor.tsx`, `editor/extensions.ts` and `editor/media.ts`. Whiteboards are implemented in `Whiteboard.tsx`; vault-aware AI drafts and reviewed changes are implemented in `AIComposer.tsx`, `agent/tools.ts` and `agent/changes.ts`. These capabilities shipped in the desktop v1.19.0 release, as recorded in CHANGELOG. The browser bridge remains optional. This positioning does not claim feature parity with another notes product.

- PRIVACY and some docs predate Zoom Web live capture. Current manifest/code and released v1.19.0 support it. The website links the real policy without rewriting it or repeating its outdated platform list.
- PRIVACY says transfer happens only on request. The configured automatic finished-meeting pipeline also calls the provider. The website explicitly discloses automatic analysis.
- Roadmap stage/status text predates the current desktop release. The website promotes implemented, released desktop capabilities; future sync, graph, mobile, or live MCP plans are not advertised as shipped.
- The README's Chrome Web Store verification note is outdated. The public listing was verified on 2026-10-18: Meet Companion by suiflex, version 1.19.0, updated 2026-10-08. The website links directly to the store, with the GitHub ZIP retained as an optional manual installation path.
- AMO's description still mentions Zoom import, while its v1.19.0 permissions include Zoom. Users are told how Web caption capture works, with caption and speaker limitations.
- No multi-device desktop sync, certifications, ratings, universal offline processing, unverified store availability or future provider/model entitlements are claimed.

## Public destinations checked

- [Latest release](https://github.com/suiflex/companion/releases/latest)
- [Official Chrome listing](https://chromewebstore.google.com/detail/meet-companion/neeapigpheabagekbdfjdekgdicfckpn)
- [Official Firefox listing](https://addons.mozilla.org/en-US/firefox/addon/meet-companion/)
- [Repository](https://github.com/suiflex/companion)

`make -C web links` checks all external href destinations in the built page. It checks HTTP availability, not download integrity, installer execution, or future store approval.
