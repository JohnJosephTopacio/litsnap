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

## M4 — Images ✅

> Done 2026-10-28 (#33–#39). Specs: [image-providers](features/image-providers.md), [image-grid](features/image-grid.md), [image-viewer](features/image-viewer.md); M4 sections of [lookup-api](features/lookup-api.md) (API-17…22) and [lookup-modal](features/lookup-modal.md) (MODAL-19/20). Decision: [0005](decisions/0005-images-fetched-not-embedded.md) (images are fetched by our code, not embedded).

- The Worker finds up to 6 freely licensed images: the gallery of the Wikipedia article whose title is exactly the term, then that article's Commons category (through Wikidata). No free-text Commons search, which returns unrelated files. Licences are an allow-list (CC0, public domain, CC BY, CC BY-SA); fair-use files and files without a credit are skipped.
- `/lookup` runs the definition and image chains at the same time. One section can fail on its own (`{ status: 'failed' }`, a 200 that the browser mustn't keep), and the modal retries just that section.
- The modal shows a credited grid (2 or 3 columns by size), and enlarges an image in place, with its full credit, Previous/Next and `←`/`→`. `Esc` goes back to the grid first.
- The browser downloads images itself from `upload.wikimedia.org` and shows them as `blob:` URLs. The CSP's `connect-src` allows that host and `img-src` doesn't, so books still can't load remote images (RD-22 tests it). Downloads send no cookies or referrer. Spec §7 and the Terms page (new section 4) say Wikimedia sees the reader's IP.
- The weekly live check covers the image sources and that `upload.wikimedia.org` still sends CORS headers.
- **The PR plan grew from 7 to 8**: the modal learned to show a failed section (#36) before the Worker started sending one (#37), so no reader saw a failure as "not found".
- After M4 (2026-10-28), image lookups failed in production. #41 gave Wikimedia's slow licence metadata 10 s, asked about 10 files instead of 20, and showed partial results. Wikimedia's API still answers the Worker with `503`, which #42 logs in more detail (IMG-16). The reasons showed a per-minute throttle shared by everyone on the same IP, so #43 gives the Worker a Wikimedia identity: an owner-only OAuth 2 token and Wikimedia's cookies ([decision 0006](decisions/0006-wikimedia-identity.md)).
- After #43, a budget protects LitSnap's Wikimedia account: 50 uncached image lookups a minute for everyone (API-24), and IPv6 clients are limited per `/64` (API-23), in #44–#45.
- **Open privacy question:** Cloudflare attaches each request's URL, term included, to the Worker's log lines, kept for 3 days (lookup-api.md, "Cloudflare's own request logs"). #42 turns off the invocation logs, which also held IPs and locations.
- Follow-ups, not started: a flaky local run of `apps/web/config/eslint-no-html-injection.test.ts` under load (#34 "Look closely"); `Restrictions` (trademarks, personality rights) on Commons files isn't used (image-providers "Notes").

## M5 — PDF

> Ready for M5:
>
> - **The CSP decides the setup again.** pdf.js runs its parser in a Web Worker: `worker-src` isn't in the CSP yet, and a bundled worker file needs `'self'` (decision 0002 expected this for zip.js). pdf.js must run with `isEvalSupported: false`, because `script-src 'self'` blocks `eval`. A new decision record is needed if anything else has to be loosened.
> - **PDFs are untrusted too.** A PDF can carry JavaScript and links. pdf.js doesn't run PDF JavaScript by default, which must stay so; RD-21's idea ("scripts in books never run") needs a PDF version.
> - **Lookups:** the selection watcher (`createSelectionWatcher`) gets its events from foliate's documents today. pdf.js's text layer is a normal DOM in our own page, not an iframe, so the "another realm" rules (CLAUDE.md) don't apply there. Its coordinates don't need the iframe offset either.
> - **Licence:** pdf.js is Apache-2.0, on the allow-list (TERMS-6).
> - **Fixtures:** text and scanned PDFs, generated in `e2e/fixtures.ts`, like the EPUBs (spec §10).

- pdf.js with text layer, zoom, inverted dark mode.
- Scanned-PDF detection and message.

## M6 — Library, history & polish

- Library page, per-book lookup history.
- Privacy page, Cloudflare Web Analytics.
- Accessibility and visual polish pass; README with architecture diagram.
