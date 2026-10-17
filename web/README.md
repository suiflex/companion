# Companion website

An independent, static product site. Nothing in `apps/`, `packages/`, or the root npm workspace is needed to build or deploy it.

## Stack and structure

Astro 7, Tailwind CSS 4 through its Vite plugin, strict TypeScript, self-hosted Manrope, Lucide, and one React island using the official shadcn/Radix Tabs component. TypeScript 6 is intentional: Astro Check and typescript-eslint currently reject TypeScript 7. No analytics, remote fonts, backend, or runtime product API calls.

```
src/pages/                 Landing page, static robots.txt and sitemap.xml
src/layouts/              Metadata, structured data, theme initialization
src/components/sections/  Product content and page compositions
src/components/ui/        Owned shadcn component source
src/components/           Header, footer, desktop illustration, provider island
src/data/site.ts          Links, navigation, FAQ, workflow copy
src/styles/global.css     Tailwind, shared tokens, responsive styles and motion
src/assets/               Local product captures optimized by Astro Image
public/                   Existing brand assets and social preview artwork
scripts/                  Asset generation, screenshot capture and audits
tests/                    Production browser and accessibility checks
```

## Local development

Use Node **22.22+** (or a compatible newer Node release), npm, and Make. Run commands from the repository root:

```sh
make -C web install
make -C web dev
```

Open the URL printed by Astro. This directory has its own `package-lock.json`; use `make -C web install` for reproducible installs and `make -C web deps` after editing dependencies. Do not add it to the root workspaces or use the root lockfile. The only repository integration is one ESLint ignore for generated `web/.astro/` declarations; source files remain checked.

```sh
make -C web check          # Astro and TypeScript validation
make -C web lint           # ESLint, including Astro and TypeScript
make -C web format         # Apply Prettier
make -C web format-check   # Check formatting
make -C web build          # Static output in web/dist/
make -C web preview        # Serve the production build
make -C web verify         # check + lint + format-check + build
make -C web test           # Production Playwright + axe accessibility suite
make -C web audit          # Lighthouse mobile and desktop, fails below 95
make -C web links          # Verify external destinations in the built HTML
```

Browser tests and audits use an installed **Google Chrome**. Tests cover 375, 768 and 1440px widths, both themes, 667 × 320 landscape navigation, horizontal overflow, native FAQ behavior, mobile menu focus/Escape, persisted theme choice, arrow-key provider tabs, no-JavaScript content, images, anchors and static SEO routes. Reports and full-page captures go to ignored `web/reports/`. Run tests and Lighthouse separately, as each starts a production preview on port 4321.

## Production and static deployment

Set `SITE_URL` to your **actual public origin**, without a path, query or fragment:

```sh
SITE_URL=https://your-domain.example make -C web verify
make -C web preview
```

The example domain is documentation only. No production domain is assumed. `SITE_URL` supplies canonical, Open Graph URL, absolute social image URL, structured-data URL, and sitemap location. Local builds work without it, but omit canonical/site URLs and emit an empty sitemap; **set it before deploying**. Invalid origins fail configuration validation.

Deploy only `web/dist/`. No Node server is required after building. Hosting must serve the generated `robots.txt` and `sitemap.xml` unchanged.

### Cloudflare Workers Builds

The site uses Workers Static Assets through `web/wrangler.jsonc`. No Cloudflare Astro adapter or Worker script is needed for this static build. The Wrangler CLI is pinned in the website's own lockfile.

After correcting the root directory, confirm the next build log shows `companion-web` as the package being built.

In **Workers & Pages → your Worker → Settings → Build**, use:

| Setting                   | Value                                                      |
| ------------------------- | ---------------------------------------------------------- |
| Root directory            | `web`                                                      |
| Build command             | `make build`                                               |
| Deploy command            | `make deploy`                                              |
| Build variable `SITE_URL` | Your actual public origin                                  |
| Node version              | 22.22+; Node 24 is also compatible with the package engine |

Cloudflare installs dependencies from `web/package-lock.json` once the root is set to `web`. The configuration's `name` is `companion-web`; **match it to the existing Worker name in the dashboard before deploying**, or name the dashboard Worker `companion-web`. Changing this name does not change `SITE_URL`; set that separately to the public domain you use. The asset directory is `dist`, relative to the configuration file.

Before publishing, validate locally from the repository root:

```sh
make -C web install
SITE_URL=https://your-domain.example make -C web verify
make -C web deploy-check
```

`deploy-check` runs Wrangler with `--dry-run` and validates the static deployment configuration; it does not upload or publish. Wrangler's temporary state under `.wrangler/` is ignored. `make -C web deploy` publishes and requires Cloudflare authentication. Run it only when ready to publish.

If logs show `meet-cc-monorepo` or `@meetcc/extension` during the website build, the root directory is still wrong. Root `npm run build` builds the extension and backend tools; it does not build this website. Running `npx wrangler deploy` there triggers workspace auto-detection instead of using the website configuration. After correcting the root, clear the old build cache and retry. See Cloudflare's [monorepo setup](https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/#monorepos) and [static assets documentation](https://developers.cloudflare.com/workers/static-assets/).

### Cloudflare Pages, Netlify or Vercel

For static hosting, set the project root to `web`, install command to `make install` where configurable, build command to `make build`, output directory to `dist`, and build variable `SITE_URL` to the public origin. Cloudflare **Pages** publishes that output directly and does not use the Workers `make deploy` command. Use Node 22.22+ and the committed website lockfile.

## Content and download maintenance

Edit shared links, FAQ and workflow in `src/data/site.ts`; other copy lives in the corresponding section. Check each claim against source and released changes, rather than assuming a roadmap item ships. Current evidence and exceptions are recorded in [PRODUCT-EVIDENCE.md](PRODUCT-EVIDENCE.md).

The Discord invite in `links.discord` is supplied by the maintainer and appears in mobile navigation, the open-source section and the footer. Update that single value if the invite changes.

The Chrome & Chromium button opens the official **Chrome Web Store** listing; Firefox opens the official AMO listing. Desktop buttons and the optional manual Chromium ZIP guide open the verified GitHub **latest release page**. Users choose the artifact for their OS/architecture; no brittle version-specific URLs are constructed. Recheck the live Chrome Web Store and AMO listings, README, INSTALL and actual release assets before updating these links; repository documentation can lag behind store availability. Preserve unsigned-desktop warnings, experimental ARM caveats, browser backup/update guidance, remote-AI disclosure and optional bridge language.

The site uses the original light, product-focused direction, with a restrained green palette, readable typography and actual application imagery. A serif accent appears only in the hero. The optional theme control saves a light or dark choice locally.

Present Desktop as a standalone notes and knowledge workspace: personal notes, research, project documents, folders, full-text search, media, whiteboards and configured AI assistance. Meeting delivery is an optional connection. Keep these claims tied to released capabilities in `PRODUCT-EVIDENCE.md`; do not imply feature parity with other note-taking products.

The provider comparison is an informational demonstration, not an AI settings form. It hydrates only when visible. FAQ uses native `details`; navigation and theme use small Astro scripts. Motion uses CSS and IntersectionObserver and respects reduced motion. All content remains visible without JavaScript; the FAQ and desktop navigation/downloads remain usable.

## Assets

Brand SVGs in `public/brand/` are copies of `../assets/brand/`; refresh them if the product mark changes. `export-cover.png` comes from the repository's real `assets/sample/MoM.png`. The supplied old dashboard screenshot is an empty state with a previous identity, so the site uses new captures of the existing extension demo instead.

`src/assets/github.svg` is GitHub's [Primer Octicons mark-github-24](https://github.com/primer/octicons/blob/main/icons/mark-github-24.svg), rendered inline with the current text color. Its MIT license is retained in `src/assets/github.LICENSE.txt`; it adds no runtime request or dependency.

To refresh the extension images, start `make dev-extension` from the root, then run:

```sh
PRODUCT_URL=http://localhost:5173 make -C web capture
```

Use the actual port printed by Vite. The capture script opens the existing built-in localhost demo with sample data. It makes no source changes and never connects to a provider. Keep screenshot text labeled as sample content; review the capture coordinates when product layout changes. The desktop scene is a responsive HTML illustration based on `App.tsx`, `NoteTree.tsx`, `NoteEditor.tsx` and the app's theme tokens, explicitly labeled as an illustration. It contains no fake controls.

Astro generates responsive WebP variants with explicit dimensions. The hero loads eagerly; lower images load lazily. Social artwork is maintained as `public/social.svg` and rendered to PNG with `make -C web assets`. This is a separate shareable asset, not a product screenshot.

## Validation evidence

See [VALIDATION.md](VALIDATION.md) for actual completed checks, audit conditions and remaining deployment work. Re-run validation after changing source, dependencies or assets; stored scores describe only the measured build.
