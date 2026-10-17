# Validation

Measured on 17 October 2026, after refining the original light design. Website validation, browser tests and external links were rechecked on 18 October after correcting the Chrome Web Store installation path and adding the GitHub brand mark and Discord links. Lighthouse measurements below remain from 17 October.

## Executed checks

| Check                                                                           | Result                                                                                        |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `make -C web install` and subsequent lockfile update through `make -C web deps` | Installed successfully; npm reported 0 vulnerabilities for the website dependencies           |
| `SITE_URL=http://127.0.0.1:4321 make -C web verify`                             | Astro/TypeScript: 0 errors, warnings or hints; ESLint, Prettier and static build passed       |
| `make -C web test`                                                              | 10 passed; axe found no WCAG A/AA violations in the six viewport/theme combinations           |
| `make -C web links`                                                             | All 13 unique external destinations returned HTTP 200, including Chrome Web Store and Discord |
| `make -C web audit`                                                             | Passed the 95-point thresholds for mobile and desktop                                         |
| `make lint` at repository root                                                  | Passed, with 15 existing warnings in application/package source; no errors                    |
| `git diff --check`                                                              | Passed                                                                                        |

ForgeGuard also passed its configured root build, typecheck, lint and tests: **0 errors, 0 failed checks, 3 nonblocking warnings**. The script warnings were reviewed: external links are checked sequentially with a 30-second timeout; preview readiness is intentionally polled at most 80 times; Lighthouse iterates two fixed profiles and four fixed categories. Dependency metadata duplication is expected for independent lockfiles. Its structural CSS parser does not understand the Tailwind stylesheet; the real Tailwind build and browser checks pass.

The browser suite checks 375px, 768px and 1440px layouts in both themes, plus 667 × 320 landscape navigation; navigation anchors, mobile disclosure/Escape/focus behavior, persisted theme selection, native FAQ keyboard behavior, arrow-key provider tabs, lazy image loading, no horizontal overflow, static content without JavaScript, metadata and static assets. Browser page errors are asserted absent. Full-page screenshots were inspected along with focused desktop/mobile captures and the actual reference site.

The Chrome installation correction adds assertions for the exact official store URL, removal of the pending notice, and access to the optional manual ZIP release link. All 10 browser tests passed. The live store listing was inspected, but extension installation itself was not exercised.

Community-link checks assert the GitHub brand SVG in all three former code-icon locations, no remaining code glyph, and the supplied Discord URL in mobile navigation, the open-source section and footer. Both themes and all responsive checks passed. Discord returned HTTP 200; joining the server was not exercised.

Desktop positioning was checked against the editor, media, whiteboard and vault-agent source and the v1.19.0 changelog. The section, illustration, downloads and FAQ now explain its standalone notes and knowledge workflow, with meeting delivery optional. All 10 tests passed again, including no-JavaScript assertions for standalone use, whiteboards, the optional bridge and the new Desktop FAQ.

Full review found and fixed one additional issue: on a 667 × 320 landscape phone, the expanded menu extended to 410px and hid its last link. The menu now uses the available viewport height and scrolls internally. A regression test failed before the fix and passed afterward, including keyboard access to the last link and Escape/focus return. Unused icon imports and obsolete hero styles from the design iterations were also removed.

## Lighthouse results

| Profile | Performance | Accessibility | Best Practices | SEO |
| ------- | ----------: | ------------: | -------------: | --: |
| Mobile  |         100 |           100 |            100 | 100 |
| Desktop |         100 |           100 |            100 | 100 |

Lighthouse **13.5.0**, headless Chrome **155.0.0.0**, macOS on ARM64. These are local **production-preview** measurements at `http://127.0.0.1:4321`, using a fresh browser profile and simulated throttling. They are not field measurements or a guarantee for a future host.

- Mobile: Lighthouse default profile; 412 × 823 viewport, DPR 1.75; simulated 150ms RTT, 1638.4 Kbps throughput and 4× CPU slowdown. FCP 0.8s, LCP 1.5s, TBT 0ms, CLS 0.
- Desktop: Lighthouse's official `desktop-config` preset; 1350 × 940, DPR 1; simulated 40ms RTT, 10240 Kbps throughput and 1× CPU slowdown. FCP 0.3s, LCP 0.4s, TBT 0ms, CLS 0.001.

Ignored local evidence is available in `reports/lighthouse-{mobile,desktop}.{html,json}`, `reports/lighthouse-scores.json`, `reports/links.json` and six `reports/site-*.png` captures. Scripts regenerate these rather than checking large machine-specific reports into source control.

## Scope and limits

All product changes are in `web/`. One line in the root ESLint configuration excludes Astro's generated `web/.astro/` declarations, so the new site does not break the existing repository lint command. It does not skip website source. Extension, desktop and shared package source, root dependency files, and npm workspace membership are unchanged.

The site's desktop composition is explicitly labeled as an interface illustration. Extension images use the current application's existing sample data. No real meeting data, private vault content, fabricated usage metrics, or testimonials were added.

Set `SITE_URL` to the actual production origin before deployment; the local origin above was used only for validation. No deployment was published. Actual provider requests, meeting capture on live platforms, and desktop installer execution were outside this website task. External link checks prove HTTP reachability, not artifact integrity or future store approval. Browser automation and axe are useful evidence, but do not replace manual assistive-technology or real-device review.
