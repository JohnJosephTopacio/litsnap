# LitSnap

A web reader for EPUB and PDF files. Highlight an unfamiliar word or phrase — like _"hipped roof"_ — and see its definition and pictures in an overlay, without leaving the book.

Your books never leave your device: files, reading progress and lookup history are stored only in your browser.

**Live:** https://litsnap.pages.dev

## Status

| Milestone                          | State                                                                                                                                                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 — Scaffold & pipeline           | ✅ Done                                                                                                                                                                                                    |
| M1 — EPUB reader                   | ✅ Done: open (picker or drag-and-drop), DRM and invalid-file checks, table of contents, page navigation, progress, reopen where you left off, text size, light/dark theme, paginated/scrolled, Terms page |
| M2 — Selection menu & lookup modal | Next                                                                                                                                                                                                       |

Word lookups (M2–M4) and PDF (M5) aren't built yet. See [docs/milestones.md](docs/milestones.md) for the roadmap and [docs/spec.md](docs/spec.md) for the product spec.

## How it fits together

```
 Browser (Cloudflare Pages serves the files + CSP header)      Cloudflare Worker (apps/worker)
┌──────────────────────────────────────────────────────┐      ┌───────────────────────────────┐
│ React app (apps/web)                                 │      │ Today: /health only           │
│  ├─ foliate-js (vendored) renders the EPUB in a      │ M3:  │ Later: /lookup → dictionaries,│
│  │  sandboxed iframe, under a strict CSP             │ ───▶ │ Wikipedia, Commons; cache;    │
│  └─ IndexedDB: books, positions, settings            │ word │ rate limit                    │
│     (never uploaded)                                 │ only └───────────────────────────────┘
└──────────────────────────────────────────────────────┘
```

- **Books are untrusted content.** A Content Security Policy stops scripts inside books from running and stops books from loading anything from the internet ([decision 0002](docs/decisions/0002-csp-for-book-content.md)). Book text is always rendered as text, never as HTML.
- **foliate-js is vendored**, byte-identical to upstream, EPUB code path only ([decision 0001](docs/decisions/0001-vendor-foliate-js.md), [VENDORED.md](apps/web/vendor/foliate-js/VENDORED.md)).

## Repository layout

| Path                          | What's there                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/reader/`        | The reader UI: `App` → `ReaderScreen` (chrome, panels) → `ReaderView` (foliate wrapper); settings, TOC, file checks |
| `apps/web/src/storage/`       | IndexedDB: books, progress, settings (`bookStore`), debounced position saving                                       |
| `apps/web/src/epub/`          | `inspectEpub` (DRM / invalid detection) and the in-memory EPUB builder used by tests                                |
| `apps/web/config/`            | Build-time code: the CSP, third-party licence notices, the licence check, the HTML-injection lint rule              |
| `apps/web/e2e/`               | Playwright tests and fixtures                                                                                       |
| `apps/web/vendor/foliate-js/` | Vendored foliate-js                                                                                                 |
| `apps/worker/`                | Cloudflare Worker (Hono)                                                                                            |
| `packages/shared/`            | Types shared by web and Worker                                                                                      |
| `docs/`                       | Product spec, milestones, feature specs with acceptance criteria, decision records                                  |

## Development

Requires Node 24 (see `.nvmrc`) and pnpm.

```sh
pnpm install
pnpm --filter @litsnap/web exec playwright install chromium   # once, for e2e tests

pnpm dev              # web (Vite) + worker (wrangler dev)
pnpm check            # format, lint, typecheck, unit tests (what CI runs)
pnpm check:licenses   # fails on non-permissive production dependencies
pnpm test:e2e         # Playwright against the built app, with the production CSP
```

> ⚠️ **Only open books you trust in `pnpm dev`.** EPUBs can contain scripts. In production, a strict Content Security Policy stops them from running ([decision 0002](docs/decisions/0002-csp-for-book-content.md)). The Vite dev server runs **without** that policy, because hot reloading needs an inline script. To try untrusted books locally, use `pnpm --filter @litsnap/web build && pnpm --filter @litsnap/web preview`, which serves the production CSP.

Every PR runs the checks above in GitHub Actions; merging to `main` deploys the Worker and the web app to Cloudflare. If a Playwright test fails in CI, its HTML report (with traces) is attached to the run as an artifact.

## License

Copyright © 2026 John Joseph Topacio. All rights reserved.

The source is public for reading and review; no licence is granted to copy, modify or redistribute it. Third-party software included in LitSnap is listed, with its licences, at [/third-party-licenses.txt](https://litsnap.pages.dev/third-party-licenses.txt).
