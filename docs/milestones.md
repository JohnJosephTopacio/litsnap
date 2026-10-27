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
- **Until M3:** the deployed modal shows the term, the source sentence and the real _Search Google ↗_ link, plus _"Definitions and images are coming soon."_. Mock definitions are only used in `pnpm dev` and tests, so nobody sees made-up content.
- Follow-ups, not started: lookups in fixed-layout books (#19); our own highlight under the modal, if the browser's greyed selection proves hard to see (lookup-modal "Out of scope"); Shift + arrow keys still turn pages instead of extending a selection (selection-menu "Out of scope").

## M3 — Worker + definitions

> Ready for M3: the modal gets its content from a `LookupClient` (`apps/web/src/lookup/client.ts`). Today `defaultLookupClient` is `undefined` in production ("coming soon") and a mock in `pnpm dev`; M3 replaces it with a client for the Worker. The Worker should re-normalise with `normalise()` from `packages/shared`, and return the draft `LookupResult` there (changing it if needed). The modal's definition section, loading, "not found", error and Retry states are already built and tested against the mock.

- Hono Worker with `/lookup`, provider interface, Wiktionary → dictionaryapi.dev → Wikipedia summary.
- Specs: [definition-providers](features/definition-providers.md), [lookup-api](features/lookup-api.md), [lookup-client](features/lookup-client.md). Decisions: [0003](decisions/0003-lookup-api-origin.md), [0004](decisions/0004-lookup-cache-and-rate-limit.md).
- Cache (30 days) and rate limit (~30/min/IP).
- Wire the modal to real definitions.

## M4 — Images

- Wikipedia lead images → Commons search; up to 6 thumbnails, enlarge, attribution, alt text.
- "No good image found" empty state; "Search Google" fallback link.

## M5 — PDF

- pdf.js with text layer, zoom, inverted dark mode.
- Scanned-PDF detection and message.

## M6 — Library, history & polish

- Library page, per-book lookup history.
- Privacy page, Cloudflare Web Analytics.
- Accessibility and visual polish pass; README with architecture diagram.
