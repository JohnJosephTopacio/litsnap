# LitSnap — Milestones (v1)

Each milestone ends with something working and deployed. See [spec.md](spec.md) for the full product spec.

## M0 — Scaffold & pipeline ✅

> Done 2026-10-21 (#1, #2).

- pnpm monorepo: `apps/web`, `apps/worker`, `packages/shared`; TypeScript strict, ESLint, Prettier, Vitest.
- "Hello" page on Cloudflare Pages, "hello" Worker on Cloudflare Workers.
- GitHub Actions: typecheck + lint + test on PRs; deploy on merge to `main`.
- Repo hygiene: branch protection, secret scanning + push protection, Dependabot, `SECURITY.md`, `.gitignore` (incl. `.dev.vars`).
- **Owner prerequisites:** install `gh` (`winget install GitHub.cli`) and run `gh auth login`; create a Cloudflare account and an API token for CI.

## M1 — EPUB reader ✅

> Done 2026-10-24 (#3–#16), plus fixes #18 (fixed-layout books open) and #20 (books that position `<body>` no longer render blank). Follow-up: proper fixed-layout support, #19.

- Open an EPUB (foliate-js), table of contents, remember position, font size, theme, paginated/scrolled.
- Store books and progress in IndexedDB.
- DRM detection and message.
- Content Security Policy that blocks scripts in books, plus Playwright end-to-end tests.
- Terms page (moved up from M6, since the reader goes public when M1 merges), third-party licence notices, and a CI licence check.
- Specs: [drm-detection](features/drm-detection.md), [book-storage](features/book-storage.md), [epub-reader](features/epub-reader.md), [terms-page](features/terms-page.md).

## M2 — Selection menu & lookup modal (mock data) ✅

> Done 2026-10-26 (#22–#25). Specs: [lookup-term](features/lookup-term.md), [selection-menu](features/selection-menu.md), [lookup-modal](features/lookup-modal.md).

- 1–6 word selection → vertical menu (Definition / Image / Both), `D`/`I`/`B` shortcuts.
- Centred modal over dimmed page, S/M/L sizes, `Esc`/click-away, focus trap, source sentence.
- Normalisation logic (TDD).
- **Until M3** (replaced by real definitions in #31): the deployed modal showed the term, the source sentence and the real _Search Google ↗_ link, plus _"Definitions and images are coming soon."_. Mock definitions are only used in `pnpm dev` and tests, so nobody sees made-up content.
- Follow-ups, not started: lookups in fixed-layout books (#19); our own highlight under the modal, if the browser's greyed selection proves hard to see (lookup-modal "Out of scope"); Shift + arrow keys still turn pages instead of extending a selection (selection-menu "Out of scope").

## M3 — Worker + definitions ✅

> Done 2026-10-27 (#27–#31). Specs: [definition-providers](features/definition-providers.md), [lookup-api](features/lookup-api.md), [lookup-client](features/lookup-client.md). Decisions: [0003](decisions/0003-lookup-api-origin.md) (the CSP allows the Worker), [0004](decisions/0004-lookup-cache-and-rate-limit.md) (cache, rate limit).

- Hono Worker with `GET /lookup` and a provider interface: Wiktionary → dictionaryapi.dev → Wikipedia summary for the exact title. A Wiktionary entry whose only senses point elsewhere (_"Synonym of hip roof"_) is followed once.
- Cache API, per section: found 30 days, not found 1 day, failures never.
- 30 lookups a minute per IP, counted by a Durable Object. Cloudflare's rate limiting binding deploys on the Free plan but isn't enforced (probed, decision 0004).
- The modal asks the Worker in production. The CSP allows exactly the Worker's origin in `connect-src`, and only the normalised term leaves the browser.
- The weekly `live-check` workflow asks the real sources through our providers, so a source changing its API (e.g. Wiktionary's RESTBase endpoint retiring) shows up within a week, despite the cache.
- Follow-ups, not started: make `fakeWorker` an automatic Playwright fixture, so a new e2e test can't call the real Worker by accident (#31 "Look closely"); if the rate limiting binding is ever enforced on Free, it could replace the Durable Object (decision 0004).

## M4 — Images

> Ready for M4:
>
> - **The type:** `ImageSection`/`LookupImage` in `packages/shared/src/lookup.ts` are still a draft. The Worker answers `images: { status: 'not-found' }` (API-4), and the modal says _"No good image found."_ (MODAL-9).
> - **The Worker:** image sources can follow the definition providers' shape (`ProviderContext`, found / not-found / failed, never throw), with their own cache section, `v1/images/<term>` (API-10). The Wikipedia summary response already has `thumbnail` and `originalimage`.
> - **The CSP decision to make first:** `img-src` only allows `'self' blob: data:`, so thumbnails from `upload.wikimedia.org` need either a new decision record or images proxied through the Worker. Book iframes inherit `img-src`, so allowing Wikimedia would also let books load images from there.
> - **The live check** (`apps/worker/live/`) should cover the image sources too.

- The Wikipedia article's gallery images → its Commons category; up to 6 freely licensed thumbnails, enlarge, attribution, alt text. Spec: [image-providers](features/image-providers.md).
- "No good image found" empty state; "Search Google" fallback link.

## M5 — PDF

- pdf.js with text layer, zoom, inverted dark mode.
- Scanned-PDF detection and message.

## M6 — Library, history & polish

- Library page, per-book lookup history.
- Privacy page, Cloudflare Web Analytics.
- Accessibility and visual polish pass; README with architecture diagram.
