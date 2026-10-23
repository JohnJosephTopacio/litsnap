# LitSnap

A web reader for EPUB and PDF files. Highlight an unfamiliar word or phrase — like _"hipped roof"_ — and see its definition and pictures in an overlay, without leaving the book.

Your books never leave your device: files, reading progress and lookup history are stored only in your browser.

> 🚧 Early development. See [docs/spec.md](docs/spec.md) for the product spec and [docs/milestones.md](docs/milestones.md) for the roadmap.

## Development

```sh
pnpm install
pnpm dev        # web (Vite) + worker (wrangler dev)
pnpm check      # format, lint, typecheck, unit tests (what CI runs)
pnpm test:e2e   # Playwright against the built app, with the production CSP
```

> ⚠️ **Only open books you trust in `pnpm dev`.** EPUBs can contain scripts. In production, a strict Content Security Policy stops them from running ([decision 0002](docs/decisions/0002-csp-for-book-content.md)). The Vite dev server runs **without** that policy, because hot reloading needs an inline script. To try untrusted books locally, use `pnpm --filter @litsnap/web build && pnpm --filter @litsnap/web preview`, which serves the production CSP.

## License

Copyright © 2026 John Joseph Topacio. All rights reserved.

The source is public for reading and review; no licence is granted to copy, modify or redistribute it.
