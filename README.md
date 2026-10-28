# LitSnap

A web reader for EPUB and PDF files. Highlight an unfamiliar word or phrase — like _"hipped roof"_ — and see its definition and pictures in an overlay, without leaving the book.

Your books never leave your device: files, reading progress and lookup history are stored only in your browser.

**Live:** https://litsnap.pages.dev

## Status

| Milestone                          | State                                                                                                                                                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 — Scaffold & pipeline           | ✅ Done                                                                                                                                                                                                    |
| M1 — EPUB reader                   | ✅ Done: open (picker or drag-and-drop), DRM and invalid-file checks, table of contents, page navigation, progress, reopen where you left off, text size, light/dark theme, paginated/scrolled, Terms page |
| M2 — Selection menu & lookup modal | ✅ Done: select 1–6 words → Definition / Image / Both menu (or `D`/`I`/`B`) → a modal with the term, the sentence it came from, S/M/L sizes and a Search Google link                                       |
| M3 — Worker + definitions          | ✅ Done: definitions from Wiktionary, then dictionaryapi.dev, then the Wikipedia summary, through the Worker (cached, 30 lookups a minute per IP)                                                          |
| M4 — Images                        | ✅ Done: up to 6 freely licensed images from the Wikipedia article and its Commons category, each credited, enlarged inside the modal                                                                      |

PDF (M5) isn't built yet. See [docs/milestones.md](docs/milestones.md) for the roadmap and [docs/spec.md](docs/spec.md) for the product spec.

## How it fits together

```
 Browser (Cloudflare Pages serves the files + CSP header)      Cloudflare Worker (apps/worker)
┌──────────────────────────────────────────────────────┐      ┌───────────────────────────────┐
│ React app (apps/web)                                 │      │ GET /lookup?term&kind         │
│  ├─ foliate-js (vendored) renders the EPUB in a      │ term │  1. rate limit (Durable Obj.) │
│  │  sandboxed iframe, under a strict CSP             │ ───▶ │  2. cache (Cache API, 30 d)   │
│  ├─ IndexedDB: books, positions, settings            │ only │  3. Wiktionary → dictionary-  │
│  │  (never uploaded)                                 │ ◀─── │     api.dev → Wikipedia, and  │
│  └─ lookup images: fetched as blob: URLs ──────┐     │ JSON │     Wikipedia → Commons images│
└────────────────────────────────────────────────│─────┘      └───────────────────────────────┘
                                                 ▼
                                    upload.wikimedia.org (no cookies, no referrer)
```

- **Books are untrusted content.** A Content Security Policy stops scripts inside books from running and stops books from loading anything from the internet ([decision 0002](docs/decisions/0002-csp-for-book-content.md)). Book text is always rendered as text, never as HTML.
- **Only the looked-up term leaves the browser.** The CSP lets our code `fetch` two remote origins: the Worker ([decision 0003](docs/decisions/0003-lookup-api-origin.md)) and Wikimedia's image host. The Worker caches answers and limits each IP to 30 lookups a minute ([decision 0004](docs/decisions/0004-lookup-cache-and-rate-limit.md)).
- **The Worker reads Wikimedia's API as LitSnap's own account.** Wikimedia throttles anonymous requests per IP, and Cloudflare's IPs are shared, so the Worker sends an owner-only, read-only OAuth 2 token (the `WIKIMEDIA_TOKEN` secret) and Wikimedia's cookies ([decision 0006](docs/decisions/0006-wikimedia-identity.md)). A budget of 50 uncached image lookups a minute, for everyone together, keeps that account well-behaved whatever any reader does.
- **What's logged:** one line per lookup with the term, kept 3 days, never the IP (Cloudflare's per-request logs are off). The Terms say so.
- **Lookup images are fetched, not embedded.** Books inherit our CSP, so Wikimedia isn't allowed in `img-src`. Our code downloads each image and shows it as a `blob:` URL ([decision 0005](docs/decisions/0005-images-fetched-not-embedded.md)). Wikimedia sees the reader's IP, and the Terms say so.
- **foliate-js is vendored**, byte-identical to upstream, EPUB code path only ([decision 0001](docs/decisions/0001-vendor-foliate-js.md), [VENDORED.md](apps/web/vendor/foliate-js/VENDORED.md)).

## Repository layout

| Path                          | What's there                                                                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/reader/`        | The reader UI: `App` → `ReaderScreen` (chrome, panels) → `ReaderView` (foliate wrapper); settings, TOC, file checks                                                                                 |
| `apps/web/src/lookup/`        | Lookups: normalising the selection and finding its sentence, the selection menu and its placement, the lookup modal and its `LookupClient`, the image grid and viewer                               |
| `apps/web/src/storage/`       | IndexedDB: books, progress, settings (`bookStore`), debounced position saving                                                                                                                       |
| `apps/web/src/epub/`          | `inspectEpub` (DRM / invalid detection) and the in-memory EPUB builder used by tests                                                                                                                |
| `apps/web/config/`            | Build-time code: the CSP, third-party licence notices, the licence check, the HTML-injection lint rule                                                                                              |
| `apps/web/e2e/`               | Playwright tests and fixtures                                                                                                                                                                       |
| `apps/web/vendor/foliate-js/` | Vendored foliate-js                                                                                                                                                                                 |
| `apps/worker/`                | Cloudflare Worker (Hono): `/lookup` (`app.ts`), cache, the `RateLimiter` Durable Object, definition providers (`definitions/`), image sources (`images/`); `live/`: checks against the real sources |
| `packages/shared/`            | Code shared by web and Worker: term normalisation (so both normalise alike) and lookup types                                                                                                        |
| `docs/`                       | Product spec, milestones, feature specs with acceptance criteria, decision records                                                                                                                  |

## Development

Requires Node 24 (see `.nvmrc`) and pnpm.

```sh
pnpm install
pnpm --filter @litsnap/web exec playwright install chromium   # once, for e2e tests

pnpm dev              # web (Vite) + worker (wrangler dev, :8787); lookups use the local Worker and the real sources
                      # VITE_LOOKUP_URL=<worker url> pnpm dev  uses another Worker, e.g. the deployed one
pnpm check            # format, lint, typecheck, unit tests (what CI runs)
pnpm check:licenses   # fails on non-permissive production dependencies
pnpm test:e2e         # Playwright against the built app, with the production CSP
pnpm --filter @litsnap/worker test:live   # the real dictionary sources (uses the network; also weekly in CI)
```

> ⚠️ **Only open books you trust in `pnpm dev`.** EPUBs can contain scripts. In production, a strict Content Security Policy stops them from running ([decision 0002](docs/decisions/0002-csp-for-book-content.md)). The Vite dev server runs **without** that policy, because hot reloading needs an inline script. To try untrusted books locally, use `pnpm --filter @litsnap/web build && pnpm --filter @litsnap/web preview`, which serves the production CSP.

Every PR runs the checks above in GitHub Actions; merging to `main` deploys the Worker and the web app to Cloudflare. If a Playwright test fails in CI, its HTML report (with traces) is attached to the run as an artifact.

## License

Copyright © 2026 John Joseph Topacio. All rights reserved.

The source is public for reading and review; no licence is granted to copy, modify or redistribute it. Third-party software included in LitSnap is listed, with its licences, at [/third-party-licenses.txt](https://litsnap.pages.dev/third-party-licenses.txt).
